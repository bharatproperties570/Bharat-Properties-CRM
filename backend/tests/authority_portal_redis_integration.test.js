/**
 * Authority Portal Real Redis Integration Test Suite
 *
 * Dedicated integration tests against real Redis (redis:7-alpine in CI service container).
 * Exercises:
 * 1. Real Redis SET NX PX lock acquire & release across multiple client instances
 * 2. Authority-wide concurrency cap: 2 different searchKeys blocked when maxConcurrent=1
 * 3. Monotonic sequence fence tokens: atomic with successful acquisition, no phantoms on fail
 * 4. Lease renewal via Lua script, stale release protection, ownership fencing
 * 5. Dynamic Redis semaphore mode: proves exactly N permits, rejects N+1
 * 6. Atomic multi-window Lua quota: minInterval, minute, hour, day exhaustion
 * 7. Multi-tenant quota contention against shared authority quota
 * 8. Asia/Kolkata hour & midnight/day rollover with deterministic timestamps and key TTL verification
 * 9. Canonical authority-global quota policy: elevation prevention and version mismatch rejection
 * 10. Fail-closed error handling when Redis disconnects
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { RedisPortalDistributedLock } from '../services/authority/portal/infrastructure/redisPortalDistributedLock.js';
import { RedisPortalQuotaProvider } from '../services/authority/portal/infrastructure/redisPortalQuotaProvider.js';
import { createConfiguredPortalRuntime } from '../services/authority/portal/portalRuntimeFactory.js';
import {
    registerOrRotateCanonicalPolicy,
    publishCanonicalPolicyToRedis,
    markCanonicalPolicyAudited,
    getCanonicalPolicy
} from '../services/authority/portal/canonicalPolicyService.js';
import AuthorityCanonicalPolicy from '../models/AuthorityCanonicalPolicy.js';
import AuthorityGlobalFenceWatermark from '../models/AuthorityGlobalFenceWatermark.js';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import { AuthorityBulkProcessor } from '../services/authority/AuthorityBulkProcessor.js';
import {
    rotateCanonicalPolicy,
    syncCanonicalPolicy,
    setTestQuotaProvider
} from '../controllers/authorityVerification.controller.js';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

test('--- AUTHORITY PORTAL REAL REDIS INTEGRATION SUITE ---', async (t) => {
    let redisClient = null;
    let redisClient2 = null;
    let isRedisAvailable = false;
    let mongoServer = null;

    t.before(async () => {
        try {
            redisClient = new Redis({
                host: REDIS_HOST,
                port: REDIS_PORT,
                connectTimeout: 1000,
                maxRetriesPerRequest: 1,
                retryStrategy: () => null,
                lazyConnect: true
            });
            redisClient.on('error', () => {});
            await redisClient.connect();
            const pong = await redisClient.ping();
            if (pong === 'PONG') {
                isRedisAvailable = true;
                redisClient2 = new Redis({
                    host: REDIS_HOST,
                    port: REDIS_PORT,
                    connectTimeout: 1000,
                    maxRetriesPerRequest: 1,
                    retryStrategy: () => null,
                    lazyConnect: true
                });
                redisClient2.on('error', () => {});
                await redisClient2.connect();

                // Clean up any stale keys from previous runs
                const initialKeys = await redisClient.keys('*portal*');
                if (initialKeys.length > 0) await redisClient.del(...initialKeys);
                const initialQuotaKeys = await redisClient.keys('quota:*');
                if (initialQuotaKeys.length > 0) await redisClient.del(...initialQuotaKeys);
            }
        } catch {
            isRedisAvailable = false;
        }

        if (process.env.CI && !isRedisAvailable) {
            throw new Error('REDIS_SERVICE_UNAVAILABLE_IN_CI: Redis service container must be running in CI on 6379.');
        }
    });

    t.after(async () => {
        if (redisClient && redisClient.status !== 'end') {
            try {
                const keys = await redisClient.keys('*portal*');
                if (keys.length > 0) await redisClient.del(...keys);
                const quotaKeys = await redisClient.keys('quota:*');
                if (quotaKeys.length > 0) await redisClient.del(...quotaKeys);
                await redisClient.quit();
            } catch {
                redisClient.disconnect();
            }
        }
        if (redisClient2 && redisClient2.status !== 'end') {
            try {
                await redisClient2.quit();
            } catch {
                redisClient2.disconnect();
            }
        }
        if (mongoServer) {
            try {
                await mongoose.disconnect();
                await mongoServer.stop();
            } catch {}
        }
    });

    await t.test('1. Real Redis SET NX PX Lock Across Separate Client Instances', async (t1) => {
        if (!isRedisAvailable) {
            t1.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const lockProvider1 = new RedisPortalDistributedLock(redisClient, { testMode: false });
        const lockProvider2 = new RedisPortalDistributedLock(redisClient2, { testMode: false });
        const key = 'portal_lock:HSVP_INSTANCE_TEST';
        await redisClient.del(key);

        // Instance 1 acquires
        const lease1 = await lockProvider1.acquire({ key, authorityCode: 'HSVP', ttlMs: 10000 });
        assert.equal(lease1.acquired, true);
        assert.ok(lease1.token);

        // Instance 2 attempts to acquire same key: rejected
        const lease2 = await lockProvider2.acquire({ key, authorityCode: 'HSVP', ttlMs: 10000 });
        assert.equal(lease2.acquired, false);
        assert.equal(lease2.token, null);

        // Instance 1 releases
        await lease1.release();

        // Instance 2 can now acquire
        const lease3 = await lockProvider2.acquire({ key, authorityCode: 'HSVP', ttlMs: 10000 });
        assert.equal(lease3.acquired, true);
        await lease3.release();
    });

    await t.test('2. Authority-Wide Concurrency Cap: Different searchKeys Blocked for Same Authority (P0)', async (t2) => {
        if (!isRedisAvailable) {
            t2.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const lockProvider = new RedisPortalDistributedLock(redisClient, { testMode: false });
        await redisClient.del('portal_lock:HSVP');

        // Tenant A acquires for property 1
        const leaseProp1 = await lockProvider.acquire({
            authorityCode: 'HSVP',
            searchKey: 'hsvp:gurugram:sec14:plot101',
            tenantId: 'tenant-alpha',
            maxConcurrent: 1,
            ttlMs: 10000
        });
        assert.equal(leaseProp1.acquired, true);

        // Tenant B requests DIFFERENT property on SAME authority: MUST BE BLOCKED
        const leaseProp2 = await lockProvider.acquire({
            authorityCode: 'HSVP',
            searchKey: 'hsvp:panchkula:sec2:plot505',
            tenantId: 'tenant-beta',
            maxConcurrent: 1,
            ttlMs: 10000
        });
        assert.equal(leaseProp2.acquired, false, 'Second property on same authority must be blocked when maxConcurrent=1');

        await leaseProp1.release();
    });

    await t.test('3. Monotonic Sequence Fence Token: Atomic Increment and No Phantoms on Fail', async (t3) => {
        if (!isRedisAvailable) {
            t3.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const lockProvider = new RedisPortalDistributedLock(redisClient, { testMode: false });
        const key = 'portal_lock:GMADA_FENCE';
        await redisClient.del(key, 'portal_fence_seq:GMADA');

        // First successful acquire increments sequence to 1
        const lease1 = await lockProvider.acquire({ key, authorityCode: 'GMADA', ttlMs: 5000 });
        assert.equal(lease1.acquired, true);
        assert.equal(lease1.fenceToken, 1);

        // Failed concurrent acquire MUST NOT increment sequence
        const leaseFail = await lockProvider.acquire({ key, authorityCode: 'GMADA', ttlMs: 5000 });
        assert.equal(leaseFail.acquired, false);
        const seqAfterFail = Number(await redisClient.get('portal_fence_seq:GMADA'));
        assert.equal(seqAfterFail, 1, 'Failed lock attempt must not increment sequence');

        // Check isCurrentFenceToken
        const isCurrent = await lockProvider.isCurrentFenceToken('GMADA', 1);
        assert.equal(isCurrent, true);

        await lease1.release();

        // Second successful acquire increments sequence to 2
        const lease2 = await lockProvider.acquire({ key, authorityCode: 'GMADA', ttlMs: 5000 });
        assert.equal(lease2.acquired, true);
        assert.equal(lease2.fenceToken, 2);

        // Token 1 is now stale
        const isStale = await lockProvider.isCurrentFenceToken('GMADA', 1);
        assert.equal(isStale, false, 'Fence token 1 must be marked stale after fence token 2 is issued');

        await lease2.release();
    });

    await t.test('4. Lock Expiry, Owner Loss, Stale Release & Reacquisition', async (t4) => {
        if (!isRedisAvailable) {
            t4.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const lockProvider = new RedisPortalDistributedLock(redisClient, { testMode: false });
        const key = 'portal_lock:CHD_STALE_TEST';
        await redisClient.del(key);

        const lease = await lockProvider.acquire({ key, authorityCode: 'CHD', ttlMs: 2000 });
        assert.equal(lease.acquired, true);

        // Simulate lock pre-emption / ownership loss: overwrite key with another token
        await redisClient.set(key, 'preempted-worker-token');

        // Stale worker tries to renew: fails
        const renewed = await lease.renew(5000);
        assert.equal(renewed, false);

        // Stale worker tries to release: must not delete the new owner's key
        await lease.release();
        const current = await redisClient.get(key);
        assert.equal(current, 'preempted-worker-token', 'Stale worker release must not delete new owner key');

        await redisClient.del(key);
    });

    await t.test('5. Option A Concurrency: Serial Execution (maxConcurrent=1) & Monotonic Fencing Fail-Closed', async (t5) => {
        if (!isRedisAvailable) {
            t5.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const lockProvider = new RedisPortalDistributedLock(redisClient, { testMode: false });
        await redisClient.del('portal_lock:CONCURRENCY_TEST', 'portal_fence_seq:CONCURRENCY_TEST');

        // 5.1 Calling with maxConcurrent !== 1 strictly throws PORTAL_CONCURRENCY_UNSUPPORTED
        await assert.rejects(
            lockProvider.acquire({ authorityCode: 'CONCURRENCY_TEST', maxConcurrent: 2 }),
            (err) => err.message.includes('PORTAL_CONCURRENCY_UNSUPPORTED')
        );

        // 5.2 Single worker acquires lock
        const lease1 = await lockProvider.acquire({ authorityCode: 'CONCURRENCY_TEST', maxConcurrent: 1, ttlMs: 10000 });
        assert.equal(lease1.acquired, true);
        assert.ok(lease1.fenceToken >= 1);

        // 5.3 Second concurrent worker is rejected
        const lease2 = await lockProvider.acquire({ authorityCode: 'CONCURRENCY_TEST', maxConcurrent: 1, ttlMs: 10000 });
        assert.equal(lease2.acquired, false, 'Second worker must be rejected under serial concurrency policy');

        // 5.4 Release first worker allows new worker to acquire
        await lease1.release();
        const lease3 = await lockProvider.acquire({ authorityCode: 'CONCURRENCY_TEST', maxConcurrent: 1, ttlMs: 10000 });
        assert.equal(lease3.acquired, true);
        assert.ok(lease3.fenceToken > lease1.fenceToken);

        // 5.5 isCurrentFenceToken fail-closed evaluation
        const currentToken = lease3.fenceToken;
        // Equal to current -> true
        assert.equal(await lockProvider.isCurrentFenceToken('CONCURRENCY_TEST', currentToken), true);
        // Stale/older token -> false
        assert.equal(await lockProvider.isCurrentFenceToken('CONCURRENCY_TEST', lease1.fenceToken), false);
        // Future/invalid token -> false
        assert.equal(await lockProvider.isCurrentFenceToken('CONCURRENCY_TEST', currentToken + 10), false);
        // Malformed token -> false
        assert.equal(await lockProvider.isCurrentFenceToken('CONCURRENCY_TEST', null), false);
        assert.equal(await lockProvider.isCurrentFenceToken('CONCURRENCY_TEST', 'invalid'), false);

        await lease3.release();
        await redisClient.del('portal_lock:CONCURRENCY_TEST');

        // Sequence key missing in Redis -> fails closed (false)
        await redisClient.del('portal_fence_seq:CONCURRENCY_TEST');
        assert.equal(await lockProvider.isCurrentFenceToken('CONCURRENCY_TEST', currentToken), false);
    });

    await t.test('6. Quota Reservation & Multi-Window Exhaustion (Min, Hour, Day)', async (t6) => {
        if (!isRedisAvailable) {
            t6.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const quotaProvider = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        const policy = {
            maxRequestsPerMinute: 3,
            maxRequestsPerHour: 4,
            maxRequestsPerDay: 5,
            minimumIntervalMs: 50,
            policyReference: 'POL_WINDOW_TEST'
        };

        const baseTime = new Date('2026-11-03T10:00:00Z');
        await redisClient.del(
            'quota:last:WINDOW_TEST',
            'quota:canonical:WINDOW_TEST',
            `quota:min:WINDOW_TEST:${Math.floor(baseTime.getTime() / 60000)}`,
            'quota:hour:WINDOW_TEST:2026-11-03T15',
            'quota:day:WINDOW_TEST:2026-11-03'
        );

        // Explicitly set approved canonical policy first
        await quotaProvider.setCanonicalPolicy({
            authorityCode: 'WINDOW_TEST',
            policy,
            approvedBy: 'admin',
            policyVersion: 1
        });

        // 1. Min interval violated
        const r1 = await quotaProvider.reserve({ authorityCode: 'WINDOW_TEST', policy, at: baseTime });
        assert.equal(r1.allowed, true);

        const r2 = await quotaProvider.reserve({ authorityCode: 'WINDOW_TEST', policy, at: new Date(baseTime.getTime() + 10) });
        assert.equal(r2.allowed, false);
        assert.equal(r2.reason, 'MINIMUM_INTERVAL_VIOLATED');

        // 2. Per-minute exhaustion (max = 3)
        const r3 = await quotaProvider.reserve({ authorityCode: 'WINDOW_TEST', policy, at: new Date(baseTime.getTime() + 100) });
        assert.equal(r3.allowed, true);
        const r4 = await quotaProvider.reserve({ authorityCode: 'WINDOW_TEST', policy, at: new Date(baseTime.getTime() + 200) });
        assert.equal(r4.allowed, true);

        const r5 = await quotaProvider.reserve({ authorityCode: 'WINDOW_TEST', policy, at: new Date(baseTime.getTime() + 300) });
        assert.equal(r5.allowed, false);
        assert.equal(r5.reason, 'PER_MINUTE_LIMIT_EXCEEDED');

        // 3. Move to next minute in same hour: 4th request succeeds, 5th hits PER_HOUR_LIMIT_EXCEEDED (max = 4)
        const nextMin = new Date(baseTime.getTime() + 61000);
        const r6 = await quotaProvider.reserve({ authorityCode: 'WINDOW_TEST', policy, at: nextMin });
        assert.equal(r6.allowed, true);

        const r7 = await quotaProvider.reserve({ authorityCode: 'WINDOW_TEST', policy, at: new Date(nextMin.getTime() + 100) });
        assert.equal(r7.allowed, false);
        assert.equal(r7.reason, 'PER_HOUR_LIMIT_EXCEEDED');

        // 4. Move to next hour in same day: 5th request succeeds, 6th hits DAILY_LIMIT_EXCEEDED (max = 5)
        const nextHour = new Date(baseTime.getTime() + 3601000);
        const r8 = await quotaProvider.reserve({ authorityCode: 'WINDOW_TEST', policy, at: nextHour });
        assert.equal(r8.allowed, true);

        const r9 = await quotaProvider.reserve({ authorityCode: 'WINDOW_TEST', policy, at: new Date(nextHour.getTime() + 100) });
        assert.equal(r9.allowed, false);
        assert.equal(r9.reason, 'DAILY_LIMIT_EXCEEDED');
    });

    await t.test('7. Asia/Kolkata Hour & Midnight/Day Rollover with TTL Verification (Phase 2)', async (t7) => {
        if (!isRedisAvailable) {
            t7.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const quotaProvider = new RedisPortalQuotaProvider(redisClient, { testMode: false });

        // 23:59:50 IST on Nov 3, 2026 => 2026-11-03T18:29:50Z UTC
        const beforeMidnight = new Date('2026-11-03T18:29:50.000Z');
        // 00:00:10 IST on Nov 4, 2026 => 2026-11-03T18:30:10Z UTC
        const afterMidnight = new Date('2026-11-03T18:30:10.000Z');

        // Part 1: Isolate Hourly Cap Exhaustion
        const hourlyPolicy = {
            maxRequestsPerMinute: 100, // High enough not to breach minute
            maxRequestsPerHour: 2,     // Isolate hourly cap to 2
            maxRequestsPerDay: 100,    // High enough not to breach day
            minimumIntervalMs: 10,
            policyReference: 'POL_IST_HOURLY'
        };
        await redisClient.del(
            'quota:last:IST_HR_TEST',
            'quota:canonical:IST_HR_TEST',
            'quota:hour:IST_HR_TEST:2026-11-03T23'
        );
        await quotaProvider.setCanonicalPolicy({
            authorityCode: 'IST_HR_TEST',
            policy: hourlyPolicy,
            approvedBy: 'admin',
            policyVersion: 1
        });

        const hr1 = await quotaProvider.reserve({ authorityCode: 'IST_HR_TEST', policy: hourlyPolicy, at: beforeMidnight });
        assert.equal(hr1.allowed, true);
        const hr2 = await quotaProvider.reserve({ authorityCode: 'IST_HR_TEST', policy: hourlyPolicy, at: new Date(beforeMidnight.getTime() + 20) });
        assert.equal(hr2.allowed, true);
        const hr3 = await quotaProvider.reserve({ authorityCode: 'IST_HR_TEST', policy: hourlyPolicy, at: new Date(beforeMidnight.getTime() + 40) });
        assert.equal(hr3.allowed, false);
        assert.equal(hr3.reason, 'PER_HOUR_LIMIT_EXCEEDED', 'Must isolate and assert PER_HOUR_LIMIT_EXCEEDED');

        // Part 2: Isolate Daily Cap Exhaustion and Midnight Rollover
        const dailyPolicy = {
            maxRequestsPerMinute: 100, // High enough not to breach minute
            maxRequestsPerHour: 100,   // High enough not to breach hour
            maxRequestsPerDay: 2,      // Isolate daily threshold to 2
            minimumIntervalMs: 10,
            policyReference: 'POL_IST_DAILY'
        };

        await redisClient.del(
            'quota:last:IST_TEST',
            'quota:canonical:IST_TEST',
            'quota:day:IST_TEST:2026-11-03',
            'quota:day:IST_TEST:2026-11-04',
            'quota:hour:IST_TEST:2026-11-03T23',
            'quota:hour:IST_TEST:2026-11-04T00'
        );

        await quotaProvider.setCanonicalPolicy({
            authorityCode: 'IST_TEST',
            policy: dailyPolicy,
            approvedBy: 'admin',
            policyVersion: 1
        });

        // Exhaust daily quota before midnight (2 requests)
        const r1 = await quotaProvider.reserve({ authorityCode: 'IST_TEST', policy: dailyPolicy, at: beforeMidnight });
        assert.equal(r1.allowed, true);
        const r2 = await quotaProvider.reserve({ authorityCode: 'IST_TEST', policy: dailyPolicy, at: new Date(beforeMidnight.getTime() + 20) });
        assert.equal(r2.allowed, true);

        // Third request breaches daily limit
        const r3 = await quotaProvider.reserve({ authorityCode: 'IST_TEST', policy: dailyPolicy, at: new Date(beforeMidnight.getTime() + 40) });
        assert.equal(r3.allowed, false);
        assert.equal(r3.reason, 'DAILY_LIMIT_EXCEEDED', 'Must isolate and assert DAILY_LIMIT_EXCEEDED');

        // Check key TTL of day key in Redis
        const dayTtl = await redisClient.ttl('quota:day:IST_TEST:2026-11-03');
        assert.ok(dayTtl > 0 && dayTtl <= 172800, `Day key TTL (${dayTtl}) must be <= 48h`);

        // Check hour key TTL
        const hourTtl = await redisClient.ttl('quota:hour:IST_TEST:2026-11-03T23');
        assert.ok(hourTtl > 0 && hourTtl <= 7200, `Hour key TTL (${hourTtl}) must be <= 2h`);

        // Now simulate request at 00:00:10 IST: Rollover resets daily counter to 0, request SUCCEEDS!
        const rRollover = await quotaProvider.reserve({ authorityCode: 'IST_TEST', policy: dailyPolicy, at: afterMidnight });
        assert.equal(rRollover.allowed, true, 'Request after Asia/Kolkata midnight rollover must succeed');
    });

    await t.test('8. Canonical Authority Quota Policy: Trust Anchor, Versioning & Cross-Tenant Bounds (Phase 4)', async (t8) => {
        if (!isRedisAvailable) {
            t8.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const quotaProvider = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        await redisClient.del('quota:last:CANON_TEST', 'quota:canonical:CANON_TEST');

        const canonicalPolicyV1 = {
            maxRequestsPerMinute: 2,
            maxRequestsPerHour: 10,
            maxRequestsPerDay: 50,
            minimumIntervalMs: 200,
            policyReference: 'OFFICIAL_HSVP_POLICY_V1'
        };

        // 8.1 Absent canonical policy fails closed
        const rMissing = await quotaProvider.reserve({
            authorityCode: 'CANON_TEST',
            tenantId: 'tenant-a',
            policy: canonicalPolicyV1
        });
        assert.equal(rMissing.allowed, false);
        assert.equal(rMissing.reason, 'CANONICAL_POLICY_MISSING', 'Must fail closed when canonical policy is uninitialized');

        // 8.2 Explicit approved canonical policy initialization without TTL
        await quotaProvider.setCanonicalPolicy({
            authorityCode: 'CANON_TEST',
            policy: canonicalPolicyV1,
            approvedBy: 'audit-reviewer-1',
            policyVersion: 1
        });
        const canTtl = await redisClient.ttl('quota:canonical:CANON_TEST');
        assert.equal(canTtl, -1, 'Canonical policy trust anchor must have NO TTL (persist)');

        // 8.3 Valid tenant request matching canonical policy succeeds
        const at = new Date();
        const rValid = await quotaProvider.reserve({
            authorityCode: 'CANON_TEST',
            tenantId: 'tenant-a',
            policy: canonicalPolicyV1,
            at
        });
        assert.equal(rValid.allowed, true);

        // 8.4 Permissive tenant attempts to raise ceiling (e.g. 10/min): MUST BE REJECTED
        const elevatedPolicy = {
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 10,
            maxRequestsPerDay: 50,
            minimumIntervalMs: 200,
            policyReference: 'OFFICIAL_HSVP_POLICY_V1'
        };
        const rElevated = await quotaProvider.reserve({
            authorityCode: 'CANON_TEST',
            tenantId: 'tenant-b',
            policy: elevatedPolicy,
            at: new Date(at.getTime() + 300)
        });
        assert.equal(rElevated.allowed, false);
        assert.equal(rElevated.reason, 'RATE_LIMIT_ELEVATION_REJECTED');

        // 8.5 Mismatched policyReference is rejected
        const mismatchedRefPolicy = {
            ...canonicalPolicyV1,
            policyReference: 'ROGUE_UNAPPROVED_REF'
        };
        const rMismatch = await quotaProvider.reserve({
            authorityCode: 'CANON_TEST',
            tenantId: 'tenant-c',
            policy: mismatchedRefPolicy,
            at: new Date(at.getTime() + 300)
        });
        assert.equal(rMismatch.allowed, false);
        assert.equal(rMismatch.reason, 'POLICY_VERSION_MISMATCH');

        // 8.6 Mismatched content hash is rejected
        const tamperedHashPolicy = {
            ...canonicalPolicyV1,
            contentHash: 'badf00d_tampered_hash_value'
        };
        const rTampered = await quotaProvider.reserve({
            authorityCode: 'CANON_TEST',
            tenantId: 'tenant-d',
            policy: tamperedHashPolicy,
            at: new Date(at.getTime() + 300)
        });
        assert.equal(rTampered.allowed, false);
        assert.equal(rTampered.reason, 'POLICY_HASH_MISMATCH');

        // 8.7 Cross-tenant shared bucket: Tenant B request within minimumInterval is blocked by Tenant A request
        const rFast = await quotaProvider.reserve({
            authorityCode: 'CANON_TEST',
            tenantId: 'tenant-b',
            policy: canonicalPolicyV1,
            at: new Date(at.getTime() + 50) // only 50ms later (violates 200ms)
        });
        assert.equal(rFast.allowed, false);
        assert.equal(rFast.reason, 'MINIMUM_INTERVAL_VIOLATED');

        // 8.8 Explicit approved version rotation to V2
        const canonicalPolicyV2 = {
            maxRequestsPerMinute: 5,
            maxRequestsPerHour: 20,
            maxRequestsPerDay: 100,
            minimumIntervalMs: 100,
            policyReference: 'OFFICIAL_HSVP_POLICY_V2'
        };
        await quotaProvider.setCanonicalPolicy({
            authorityCode: 'CANON_TEST',
            policy: canonicalPolicyV2,
            approvedBy: 'audit-reviewer-2',
            policyVersion: 2
        });

        const rV2 = await quotaProvider.reserve({
            authorityCode: 'CANON_TEST',
            tenantId: 'tenant-a',
            policy: canonicalPolicyV2,
            at: new Date(at.getTime() + 500)
        });
        assert.equal(rV2.allowed, true, 'Approved rotated V2 policy must be accepted');
    });

    await t.test('9. Redis Disconnect Handling Fails Closed in Production Mode', async (t9) => {
        const disconnectedClient = new Redis({
            host: '127.0.0.1',
            port: 6399,
            lazyConnect: true,
            maxRetriesPerRequest: 0,
            retryStrategy: () => null
        });
        disconnectedClient.on('error', () => {});

        const prodLock = new RedisPortalDistributedLock(disconnectedClient, { testMode: false });
        const prodQuota = new RedisPortalQuotaProvider(disconnectedClient, { testMode: false });

        await assert.rejects(
            prodLock.acquire({ key: 'test:key', authorityCode: 'HSVP' }),
            (err) => err.code === 'PORTAL_LOCK_REDIS_UNAVAILABLE'
        );

        await assert.rejects(
            prodQuota.reserve({
                authorityCode: 'HSVP',
                policy: { maxRequestsPerMinute: 1, minimumIntervalMs: 1000, policyReference: 'POL_DISCONNECT' }
            }),
            (err) => err.code === 'PORTAL_QUOTA_REDIS_UNAVAILABLE'
        );
    });

    await t.test('10. Configured Portal Runtime Factory + Canonical Quota Trust Anchor + Redis Hash Persistence (Finding A & B)', async (t10) => {
        if (!isRedisAvailable) {
            t10.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const runtime = createConfiguredPortalRuntime({
            redisClient,
            testMode: false
        });

        assert.ok(runtime.lockProvider, 'runtime must expose lockProvider');
        assert.ok(runtime.quotaProvider, 'runtime must expose quotaProvider');
        assert.equal(typeof runtime.initializeCanonicalPolicy, 'function', 'runtime must expose initializeCanonicalPolicy helper');

        // Prime canonical policy through configured runtime
        await redisClient.del('quota:canonical:HSVP');
        const canonicalRef = 'HSVP_CANONICAL_CONFIGURED_TEST';
        const contentHash = AuthorityCanonicalPolicy.computeContentHash({
            policyReference: canonicalRef,
            minIntervalMs: 250,
            maxRequestsPerMinute: 4,
            maxRequestsPerHour: 40,
            maxRequestsPerDay: 200
        });

        await runtime.initializeCanonicalPolicy({
            authorityCode: 'HSVP',
            policy: {
                policyReference: canonicalRef,
                minIntervalMs: 250,
                maxRequestsPerMinute: 4,
                maxRequestsPerHour: 40,
                maxRequestsPerDay: 200,
                contentHash
            },
            approvedBy: 'audit-officer-pr42',
            policyVersion: 1
        });

        // Inspect Redis hash directly
        const redisHash = await redisClient.hgetall('quota:canonical:HSVP');
        assert.equal(redisHash.ref, canonicalRef);
        assert.equal(redisHash.minIntervalMs, '250');
        assert.equal(redisHash.maxPerMin, '4');
        assert.equal(redisHash.maxPerHour, '40');
        assert.equal(redisHash.maxPerDay, '200');
        assert.equal(redisHash.approvedBy, 'audit-officer-pr42');
        assert.equal(redisHash.version, '1');
        assert.equal(redisHash.contentHash, contentHash);

        const keyTtl = await redisClient.ttl('quota:canonical:HSVP');
        assert.equal(keyTtl, -1, 'Canonical policy trust anchor in Redis must not expire');

        // Cleanup
        await redisClient.del('quota:canonical:HSVP');
    });

    await t.test('11. Real Redis Cross-Tenant Quota Isolation + Elevation Tamper Defense via Configured Runtime (Finding B)', async (t11) => {
        if (!isRedisAvailable) {
            t11.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const runtime = createConfiguredPortalRuntime({
            redisClient,
            testMode: false
        });

        const authorityCode = 'CHD';
        await redisClient.del(`quota:canonical:${authorityCode}`);
        const canonicalRef = 'CHD_OFFICIAL_INTEGRATION_2026';
        const contentHash = AuthorityCanonicalPolicy.computeContentHash({
            policyReference: canonicalRef,
            minIntervalMs: 100,
            maxRequestsPerMinute: 2,
            maxRequestsPerHour: 20,
            maxRequestsPerDay: 50
        });

        await runtime.initializeCanonicalPolicy({
            authorityCode,
            policy: {
                policyReference: canonicalRef,
                minIntervalMs: 100,
                maxRequestsPerMinute: 2,
                maxRequestsPerHour: 20,
                maxRequestsPerDay: 50,
                contentHash
            },
            approvedBy: 'chd-governance-officer',
            policyVersion: 1
        });

        const at = new Date(Math.floor(Date.now() / 60000) * 60000 + 5000);

        // Valid Tenant Alpha reservation succeeds
        const resAlpha = await runtime.quotaProvider.reserve({
            authorityCode,
            tenantId: 'tenant-chd-alpha',
            policy: {
                policyReference: canonicalRef,
                minIntervalMs: 100,
                maxRequestsPerMinute: 2,
                maxRequestsPerHour: 20,
                maxRequestsPerDay: 50,
                contentHash
            },
            at
        });
        assert.equal(resAlpha.allowed, true);

        // Tenant Beta attempts to elevate rate limit over canonical ceiling
        const resBetaElevated = await runtime.quotaProvider.reserve({
            authorityCode,
            tenantId: 'tenant-chd-beta',
            policy: {
                policyReference: canonicalRef,
                minIntervalMs: 100,
                maxRequestsPerMinute: 10, // ELEVATED! Canonical is 2
                maxRequestsPerHour: 20,
                maxRequestsPerDay: 50,
                contentHash
            },
            at: new Date(at.getTime() + 150)
        });
        assert.equal(resBetaElevated.allowed, false);
        assert.equal(resBetaElevated.reason, 'RATE_LIMIT_ELEVATION_REJECTED');

        // Tenant Alpha violates minimumIntervalMs: 100
        const resAlphaFast = await runtime.quotaProvider.reserve({
            authorityCode,
            tenantId: 'tenant-chd-alpha',
            policy: {
                policyReference: canonicalRef,
                minIntervalMs: 100,
                maxRequestsPerMinute: 2,
                maxRequestsPerHour: 20,
                maxRequestsPerDay: 50,
                contentHash
            },
            at: new Date(at.getTime() + 50) // only 50ms later
        });
        assert.equal(resAlphaFast.allowed, false);
        assert.equal(resAlphaFast.reason, 'MINIMUM_INTERVAL_VIOLATED');

        // Cleanup
        const keys = await redisClient.keys(`*${authorityCode}*`);
        if (keys.length > 0) await redisClient.del(...keys);
    });

    await t.test('12. Real Redis Distributed Lock + executeWithinLease + Cross-Tenant AuthorityGlobalFenceWatermark Race (Finding C & D)', async (t12) => {
        if (!isRedisAvailable) {
            t12.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        if (!mongoServer) {
            mongoServer = await MongoMemoryServer.create();
            const uri = mongoServer.getUri();
            if (mongoose.connection.readyState !== 0) {
                await mongoose.disconnect();
            }
            await mongoose.connect(uri);
        }

        const tenantAlpha = new mongoose.Types.ObjectId();
        const tenantBeta = new mongoose.Types.ObjectId();
        const authorityCode = 'GMADA';

        // 12.1 Register authority-global canonical policy in Mongo and Redis
        const submitterId = new mongoose.Types.ObjectId().toString();
        const reviewerId = new mongoose.Types.ObjectId().toString();
        const approverId = new mongoose.Types.ObjectId().toString();

        const canonicalPolicyDoc = await registerOrRotateCanonicalPolicy({
            authorityCode,
            policy: {
                policyReference: 'GMADA_CANONICAL_REAL_REDIS',
                minIntervalMs: 100,
                maxRequestsPerMinute: 10,
                maxRequestsPerHour: 100,
                maxRequestsPerDay: 500,
                maxConcurrent: 1,
                expiresAt: new Date(Date.now() + 86400000)
            },
            reviewedBy: reviewerId,
            approvedBy: approverId
        });
        const auditLog12 = await AuditLog.create({
            eventType: 'canonical_policy_rotated',
            targetType: 'authority_canonical_policy',
            targetId: canonicalPolicyDoc._id,
            description: 'Rotated canonical policy for GMADA Test 12',
            status: 'success'
        });
        await markCanonicalPolicyAudited({ policyId: canonicalPolicyDoc._id, auditLogId: auditLog12._id });
        canonicalPolicyDoc.isAudited = true;
        canonicalPolicyDoc.auditStatus = 'AUDITED';
        canonicalPolicyDoc.isActive = true;
        canonicalPolicyDoc.auditLogId = auditLog12._id;
        const qp12 = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        await publishCanonicalPolicyToRedis({ authorityCode, quotaProvider: qp12, policyDoc: canonicalPolicyDoc });

        // 12.2 Setup AuthoritySourceSettings for Tenant Alpha
        await AuthoritySourceSettings.deleteMany({ authorityCode });
        await AuthoritySourceSettings.create({
            tenantId: tenantAlpha,
            authorityCode,
            permissionStatus: 'GRANTED',
            approvedAccessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
            approvalReference: 'GMADA/AUTH/REDIS/2026',
            commercialUseAuthorized: true,
            readOnlySearchAuthorized: true,
            termsReviewed: true,
            termsReference: 'https://gmada.gov.in/terms',
            submittedBy: submitterId,
            approvedBy: approverId,
            reviewedBy: reviewerId,
            permittedFields: ['propertyId', 'sectorNumber'],
            reviewStatus: 'APPROVED',
            isEnabled: true,
            contractVerificationStatus: 'VERIFIED_CONTRACT',
            contractEvidenceReference: 'GMADA/CONTRACT/REDIS',
            identityRequirements: { verified: true },
            ratePolicy: {
                maxConcurrent: 1,
                maxRequestsPerMinute: 5,
                maxRequestsPerDay: 200,
                minIntervalMs: 100,
                minimumIntervalMs: 100,
                policySource: 'GMADA_CANONICAL_REAL_REDIS'
            }
        });

        const inventory = await Inventory.create({
            tenantId: tenantAlpha,
            title: 'Real Redis Plot GMADA',
            propertyId: 'PLT-REDIS-1',
            sector: '66',
            urbanEstate: 'Mohali',
            price: 5000000,
            status: 'AVAILABLE'
        });

        const link = await PropertyAuthorityLink.create({
            tenantId: tenantAlpha,
            inventoryId: inventory._id,
            authorityCode,
            propertyId: 'PLT-REDIS-1',
            sectorNumber: '66',
            urbanEstate: 'Mohali',
            compositeKey: 'GMADA:66:PLT-REDIS-1',
            identityVerified: true,
            matchEligibility: 'ELIGIBLE',
            createdBy: new mongoose.Types.ObjectId()
        });

        const runItem1 = await PropertyVerificationRunItem.create({
            tenantId: tenantAlpha,
            runId: new mongoose.Types.ObjectId(),
            inventoryId: inventory._id,
            linkId: link._id,
            authorityCode,
            status: 'PROCESSING',
            claimedBy: 'worker-redis-1',
            workerClaimToken: 'claim-token-redis-1',
            leaseExpiresAt: new Date(Date.now() + 60000)
        });

        // 12.3 Setup configured runtime with real Redis lock provider and real Redis quota provider
        const runtime = createConfiguredPortalRuntime({
            redisClient,
            testMode: false
        });

        // Mock search that exercises executeWithinLease with genuine Redis lock acquisition
        let executeWithinLeaseRan = false;
        const mockSearchRuntime = {
            async search(args) {
                // Acquire genuine Redis lock to obtain real monotonic fence token
                const lockKey = `portal_lock:${authorityCode}`;
                const lease = await runtime.lockProvider.acquire({
                    key: lockKey,
                    authorityCode,
                    ttlMs: 10000
                });
                assert.ok(lease.acquired, 'Real Redis lock must be acquired');
                assert.ok(lease.fenceToken > 0, 'Real Redis lock must issue positive monotonic fence token');

                try {
                    if (typeof args.executeWithinLease === 'function') {
                        executeWithinLeaseRan = true;
                        const cbRes = await args.executeWithinLease({
                            fenceToken: lease.fenceToken,
                            isCurrentFence: async () => runtime.lockProvider.isCurrentFenceToken(authorityCode, lease.fenceToken),
                            recordCount: 1,
                            records: [{
                                propertyId: 'PLT-REDIS-1',
                                sectorNumber: '66',
                                urbanEstate: 'Mohali',
                                status: 'ALLOTTED'
                            }],
                            contentHash: 'content-hash-redis-01',
                            sourceHost: 'gmada.gov.in'
                        });
                        return { callbackResult: cbRes };
                    }
                    return {};
                } finally {
                    await lease.release();
                }
            }
        };

        const res1 = await AuthorityBulkProcessor.processItem(runItem1, {
            tenantId: tenantAlpha,
            workerId: 'worker-redis-1',
            claimToken: 'claim-token-redis-1',
            isFixtureMode: false,
            portalRuntime: mockSearchRuntime,
            canonicalPolicy: canonicalPolicyDoc
        });

        assert.equal(executeWithinLeaseRan, true, 'executeWithinLease must execute within Redis lock');
        assert.equal(res1.success, true, 'First live item processing must succeed under real Redis lock');

        // Verify watermark committed in AuthorityGlobalFenceWatermark
        const wmDoc = await AuthorityGlobalFenceWatermark.findOne({ authorityCode });
        assert.ok(wmDoc, 'AuthorityGlobalFenceWatermark must be created in Mongo');
        assert.ok(wmDoc.lastCommittedFenceToken >= 1);
        const committedFenceToken = wmDoc.lastCommittedFenceToken;

        // 12.4 Concurrent / Stale Worker Race from Tenant Beta:
        // Advance global watermark further to simulate newer committed worker
        await AuthorityBulkProcessor._updateAuthorityGlobalFenceWatermark({
            authorityCode,
            fenceToken: committedFenceToken + 5,
            tenantId: tenantBeta,
            workerId: 'worker-redis-newer'
        });

        const runItem2 = await PropertyVerificationRunItem.create({
            tenantId: tenantAlpha,
            runId: new mongoose.Types.ObjectId(),
            inventoryId: inventory._id,
            linkId: link._id,
            authorityCode,
            status: 'PROCESSING',
            claimedBy: 'worker-redis-stale',
            workerClaimToken: 'claim-token-redis-stale',
            leaseExpiresAt: new Date(Date.now() + 60000)
        });

        // Stale search runtime passes earlier fence token (committedFenceToken)
        const mockStaleRuntime = {
            async search(args) {
                if (typeof args.executeWithinLease === 'function') {
                    const cbRes = await args.executeWithinLease({
                        fenceToken: committedFenceToken, // STALE! Watermark is committedFenceToken + 5
                        isCurrentFence: async () => true,
                        recordCount: 1,
                        records: [{
                            propertyId: 'PLT-REDIS-1',
                            sectorNumber: '66',
                            urbanEstate: 'Mohali',
                            status: 'ALLOTTED'
                        }],
                        contentHash: 'content-hash-redis-02',
                        sourceHost: 'gmada.gov.in'
                    });
                    return { callbackResult: cbRes };
                }
                return {};
            }
        };

        const res2 = await AuthorityBulkProcessor.processItem(runItem2, {
            tenantId: tenantAlpha,
            workerId: 'worker-redis-stale',
            claimToken: 'claim-token-redis-stale',
            isFixtureMode: false,
            portalRuntime: mockStaleRuntime,
            canonicalPolicy: canonicalPolicyDoc
        });

        assert.equal(res2.success, false);
        assert.equal(res2.reason, 'PORTAL_LOCK_OWNERSHIP_LOST');
        assert.equal(res2.ownershipLost, true);

        const updatedRunItem2 = await PropertyVerificationRunItem.findById(runItem2._id);
        assert.equal(updatedRunItem2.status, 'FAILED');

        const snap2 = await PropertyVerificationSnapshot.findOne({ runItemId: runItem2._id });
        assert.equal(snap2, null, 'Stale fence token must abort snapshot persistence fail-closed');

        // Cleanup Redis keys
        const lockKeys = await redisClient.keys(`*${authorityCode}*`);
        if (lockKeys.length > 0) await redisClient.del(...lockKeys);
    });

    await t.test('13. Atomic Monotonic Canonical Policy Lua CAS in Real Redis (Remediation 2)', async (t13) => {
        if (!isRedisAvailable) {
            t13.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const quotaProvider = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        const authorityCode = 'HSVP';

        // Clean up previous keys
        const preKeys = await redisClient.keys(`*canonical:${authorityCode}*`);
        if (preKeys.length > 0) await redisClient.del(...preKeys);

        const hashV1 = AuthorityCanonicalPolicy.computeContentHash({
            policyReference: 'HSVP_CANONICAL_CAS_V1',
            minIntervalMs: 500,
            maxRequestsPerMinute: 6,
            maxRequestsPerHour: 60,
            maxRequestsPerDay: 300
        });

        // 13.1 Worker A sets canonical policy version 1 into real Redis
        await quotaProvider.setCanonicalPolicy({
            authorityCode,
            policy: {
                policyReference: 'HSVP_CANONICAL_CAS_V1',
                minIntervalMs: 500,
                maxRequestsPerMinute: 6,
                maxRequestsPerHour: 60,
                maxRequestsPerDay: 300,
                contentHash: hashV1
            },
            approvedBy: 'audit-officer-cas1',
            policyVersion: 1
        });

        const canKey = `quota:canonical:${authorityCode}`;
        const ttlV1 = await redisClient.ttl(canKey);
        assert.equal(ttlV1, -1, 'Canonical policy key must be persistent without TTL');
        const storedV1 = await redisClient.hgetall(canKey);
        assert.equal(storedV1.version, '1');
        assert.equal(storedV1.contentHash, hashV1);

        // 13.2 Admin rotates to version 2 with maker-checker and syncs to Redis
        const hashV2 = AuthorityCanonicalPolicy.computeContentHash({
            policyReference: 'HSVP_CANONICAL_CAS_V2',
            minIntervalMs: 500,
            maxRequestsPerMinute: 6,
            maxRequestsPerHour: 60,
            maxRequestsPerDay: 300
        });

        await quotaProvider.setCanonicalPolicy({
            authorityCode,
            policy: {
                policyReference: 'HSVP_CANONICAL_CAS_V2',
                minIntervalMs: 500,
                maxRequestsPerMinute: 6,
                maxRequestsPerHour: 60,
                maxRequestsPerDay: 300,
                contentHash: hashV2
            },
            approvedBy: 'audit-officer-cas2',
            policyVersion: 2
        });

        const storedV2 = await redisClient.hgetall(canKey);
        assert.equal(storedV2.version, '2');
        assert.equal(storedV2.contentHash, hashV2);

        // 13.3 Worker A attempts delayed priming of Redis with stale v1 -> rejected with STALE_POLICY_VERSION
        await assert.rejects(
            async () => {
                await quotaProvider.setCanonicalPolicy({
                    authorityCode,
                    policy: {
                        policyReference: 'HSVP_CANONICAL_CAS_V1',
                        minIntervalMs: 500,
                        maxRequestsPerMinute: 6,
                        maxRequestsPerHour: 60,
                        maxRequestsPerDay: 300,
                        contentHash: hashV1
                    },
                    approvedBy: 'audit-officer-cas1',
                    policyVersion: 1
                });
            },
            (err) => err.code === 'STALE_POLICY_VERSION'
        );

        // Verify Redis canonical policy remains at v2
        const storedAfterStale = await redisClient.hgetall(canKey);
        assert.equal(storedAfterStale.version, '2');

        // 13.4 Competing worker attempts same-version different hash -> rejected with POLICY_HASH_MISMATCH
        await assert.rejects(
            async () => {
                await quotaProvider.setCanonicalPolicy({
                    authorityCode,
                    policy: {
                        policyReference: 'HSVP_CANONICAL_CAS_V2',
                        minIntervalMs: 500,
                        maxRequestsPerMinute: 6,
                        maxRequestsPerHour: 60,
                        maxRequestsPerDay: 300,
                        contentHash: 'hash-v2-tampered'
                    },
                    approvedBy: 'audit-officer-cas2',
                    policyVersion: 2
                });
            },
            (err) => err.code === 'POLICY_HASH_MISMATCH'
        );

        // 13.5 Idempotent re-assertion of v2 with matching hash succeeds without error
        const idempRes = await quotaProvider.setCanonicalPolicy({
            authorityCode,
            policy: {
                policyReference: 'HSVP_CANONICAL_CAS_V2',
                minIntervalMs: 500,
                maxRequestsPerMinute: 6,
                maxRequestsPerHour: 60,
                maxRequestsPerDay: 300,
                contentHash: hashV2
            },
            approvedBy: 'audit-officer-cas2',
            policyVersion: 2
        });
        assert.ok(idempRes);
        assert.equal(String(idempRes.version), '2');

        // 13.6 Subsequent reservation attempted with v1 policy is rejected with POLICY_VERSION_MISMATCH
        const resStale = await quotaProvider.reserve({
            authorityCode,
            policy: {
                policyReference: 'HSVP_CANONICAL_CAS_V2',
                minIntervalMs: 500,
                maxRequestsPerMinute: 6,
                maxRequestsPerHour: 60,
                maxRequestsPerDay: 300,
                contentHash: hashV2,
                version: 1
            }
        });
        assert.equal(resStale.allowed, false);
        assert.equal(resStale.reason, 'POLICY_VERSION_MISMATCH');

        // 13.7 Subsequent reservation with matching v2 policy succeeds
        const resV2 = await quotaProvider.reserve({
            authorityCode,
            policy: {
                policyReference: 'HSVP_CANONICAL_CAS_V2',
                minIntervalMs: 500,
                maxRequestsPerMinute: 6,
                maxRequestsPerHour: 60,
                maxRequestsPerDay: 300,
                contentHash: hashV2,
                version: 2
            }
        });
        assert.equal(resV2.allowed, true);

        // Cleanup
        await redisClient.del(canKey);
    });

    await t.test('14. Offline E2E Configured Portal Runtime + Renewal Interval & Lease-Loss Persistence Abort (Remediation 5)', async (t14) => {
        if (!isRedisAvailable) {
            t14.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        if (!mongoServer) {
            mongoServer = await MongoMemoryServer.create();
            const uri = mongoServer.getUri();
            if (mongoose.connection.readyState !== 0) {
                await mongoose.disconnect();
            }
            await mongoose.connect(uri);
        }

        const tenantId = new mongoose.Types.ObjectId();
        const authorityCode = 'HSVP';

        // Clean up previous Redis keys for HSVP and clear Mongo state
        const prevKeys = await redisClient.keys(`*${authorityCode}*`);
        if (prevKeys.length > 0) await redisClient.del(...prevKeys);
        await AuthorityCanonicalPolicy.deleteMany({ authorityCode });
        await AuthorityGlobalFenceWatermark.deleteMany({ authorityCode });

        // 14.1 Canonical policy setup
        const canonicalRef = 'HSVP_CANONICAL_OFFLINE_E2E';
        const contentHash = AuthorityCanonicalPolicy.computeContentHash({
            policyReference: canonicalRef,
            minIntervalMs: 50,
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 100,
            maxRequestsPerDay: 500
        });

        const reviewerId = new mongoose.Types.ObjectId().toString();
        const approverId = new mongoose.Types.ObjectId().toString();

        const canonicalPolicyDoc = await registerOrRotateCanonicalPolicy({
            authorityCode,
            policy: {
                policyReference: canonicalRef,
                minIntervalMs: 50,
                maxRequestsPerMinute: 10,
                maxRequestsPerHour: 100,
                maxRequestsPerDay: 500,
                maxConcurrent: 1,
                expiresAt: new Date(Date.now() + 86400000)
            },
            reviewedBy: reviewerId,
            approvedBy: approverId
        });
        const auditLog14 = await AuditLog.create({
            eventType: 'canonical_policy_rotated',
            targetType: 'authority_canonical_policy',
            targetId: canonicalPolicyDoc._id,
            description: 'Rotated canonical policy for HSVP Test 14',
            status: 'success'
        });
        await markCanonicalPolicyAudited({ policyId: canonicalPolicyDoc._id, auditLogId: auditLog14._id });
        canonicalPolicyDoc.isAudited = true;
        canonicalPolicyDoc.auditStatus = 'AUDITED';
        canonicalPolicyDoc.isActive = true;
        canonicalPolicyDoc.auditLogId = auditLog14._id;
        const qp14 = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        await publishCanonicalPolicyToRedis({ authorityCode, quotaProvider: qp14, policyDoc: canonicalPolicyDoc });

        // 14.2 Settings for Tenant
        await AuthoritySourceSettings.deleteMany({ tenantId, authorityCode });
        await AuthoritySourceSettings.create({
            tenantId,
            authorityCode,
            permissionStatus: 'GRANTED',
            approvedAccessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
            approvalReference: 'HSVP/AUTH/OFFLINE/2026',
            approvalExpiryDate: new Date(Date.now() + 86400000),
            commercialUseAuthorized: true,
            readOnlySearchAuthorized: true,
            termsReviewed: true,
            termsReference: 'https://hsvphry.org.in/terms',
            submittedBy: new mongoose.Types.ObjectId(),
            approvedBy: approverId,
            reviewedBy: reviewerId,
            permittedFields: [
                'propertyId', 'sectorNumber', 'urbanEstate', 'propertyCategory',
                'propertyType', 'area', 'authorityStatus', 'allotmentDate',
                'allotmentPrice', 'totalPaid', 'currentDues', 'possessionDate',
                'litigationStatus', 'buildingPlanApproved', 'occupancyCertificate'
            ],
            reviewStatus: 'APPROVED',
            isEnabled: true,
            contractVerificationStatus: 'VERIFIED_CONTRACT',
            contractEvidenceReference: 'HSVP/CONTRACT/E2E',
            identityRequirements: { verified: true },
            ratePolicy: {
                maxConcurrent: 1,
                maxRequestsPerMinute: 10,
                maxRequestsPerDay: 500,
                minIntervalMs: 50,
                minimumIntervalMs: 50,
                policySource: canonicalRef
            }
        });

        const inv = await Inventory.create({
            tenantId,
            title: 'HSVP Offline E2E Plot',
            propertyId: '1234',
            unitNo: '1234',
            sector: '14',
            city: 'UE001-Faridabad',
            urbanEstate: 'UE001-Faridabad',
            status: 'AVAILABLE'
        });

        const link = await PropertyAuthorityLink.create({
            tenantId,
            inventoryId: inv._id,
            authorityCode,
            propertyId: '1234',
            sectorNumber: '14',
            urbanEstate: 'UE001-Faridabad',
            compositeKey: 'HSVP:UE001-FARIDABAD:14:1234',
            identityVerified: true,
            matchEligibility: 'ELIGIBLE',
            createdBy: new mongoose.Types.ObjectId()
        });

        const runItem = await PropertyVerificationRunItem.create({
            tenantId,
            runId: new mongoose.Types.ObjectId(),
            inventoryId: inv._id,
            linkId: link._id,
            authorityCode,
            status: 'PROCESSING',
            claimedBy: 'worker-offline-e2e-A',
            workerClaimToken: 'claim-token-offline-e2e-A',
            leaseExpiresAt: new Date(Date.now() + 60000)
        });

        // 14.3 Strictly Offline Fake Transport returning deterministic HTML
        let liveNetworkCalls = 0;
        const fakeOfflineTransport = {
            async search() {
                liveNetworkCalls++;
                // Deterministic offline HTML response matching HSVP Plot Status Enquiry
                const mockHtml = `<!DOCTYPE html>
<html>
<head><title>HSVP - Plot Status Enquiry Details</title></head>
<body>
    <form id="enquiryForm" action="/Home/PlotStatusEnquiry" method="post"></form>
    <div id="detailsPanel">
        <h3>Plot Status Details</h3>
        <table class="table table-bordered">
            <tr><th>Plot No</th><td>1234</td></tr>
            <tr><th>Sector</th><td>Sector 14</td></tr>
            <tr><th>Urban Estate</th><td>UE001-Faridabad</td></tr>
            <tr><th>Category</th><td>Residential</td></tr>
            <tr><th>Sub Category</th><td>14 Marla</td></tr>
            <tr><th>Area</th><td>350 Sq.Yds</td></tr>
            <tr><th>Plot Status</th><td>Allotted</td></tr>
            <tr><th>Allotment Date</th><td>15/08/2012</td></tr>
            <tr><th>Allotment Price</th><td>2500000</td></tr>
            <tr><th>Total Amount Paid</th><td>2500000</td></tr>
            <tr><th>Current Dues</th><td>0</td></tr>
            <tr><th>Physical Possession Date</th><td>20/12/2014</td></tr>
            <tr><th>Litigation Status</th><td>Clear / No Case</td></tr>
            <tr><th>Building Plan Approved</th><td>Yes (2016)</td></tr>
            <tr><th>Occupancy Certificate</th><td>Issued (2018)</td></tr>
            <tr><th>Allottee Name</th><td>[REDACTED CITIZEN NAME]</td></tr>
        </table>
    </div>
</body>
</html>`;
                return {
                    status: 200,
                    headers: { 'content-type': 'text/html' },
                    finalUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry',
                    redirected: false,
                    location: '',
                    body: mockHtml
                };
            }
        };

        // P2-E Natural Expiry Scenario: Configured portal runtime with disableHeartbeat: true and short lock TTL (300ms).
        // Worker A delays beyond TTL without deleting the key manually, allowing natural Redis expiry.
        const configuredRuntimeA = createConfiguredPortalRuntime({
            redisClient,
            transport: fakeOfflineTransport,
            testMode: false,
            lockTtlMs: 300,
            disableHeartbeat: true
        });

        let persistenceHookFired = false;
        let leaseStolen = false;
        let workerBLease = null;

        const resA = await AuthorityBulkProcessor.processItem(runItem, {
            tenantId,
            workerId: 'worker-offline-e2e-A',
            claimToken: 'claim-token-offline-e2e-A',
            isFixtureMode: false,
            portalRuntime: configuredRuntimeA,
            canonicalPolicy: canonicalPolicyDoc,
            beforeTransactionCommit: async ({ candidate }) => {
                persistenceHookFired = true;
                // Wait beyond the 300ms TTL (450ms) WITHOUT deleting the key manually.
                // Because heartbeat was disabled, Redis naturally expires the lock.
                await new Promise((r) => setTimeout(r, 450));

                // Worker B acquires the exact same authority distributed lock naturally in real Redis
                const lockProviderB = new RedisPortalDistributedLock(redisClient, { testMode: false });
                const leaseB = await lockProviderB.acquire({
                    authorityCode,
                    maxConcurrent: 1,
                    ttlMs: 30000
                });
                assert.equal(leaseB.acquired, true, 'Worker B must acquire lock after Worker A lease naturally expires');
                assert.ok(leaseB.fenceToken > (candidate.fenceToken || 1), 'Worker B must produce a higher real Redis fence sequence');

                // Worker B records its issued fence token into AuthorityGlobalFenceWatermark
                await AuthorityGlobalFenceWatermark.recordIssuedFenceToken({
                    authorityCode,
                    fenceToken: leaseB.fenceToken
                });

                leaseStolen = true;
                workerBLease = leaseB;
            }
        });

        assert.equal(persistenceHookFired, true, 'Persistence hook must have executed');
        assert.equal(leaseStolen, true, 'Lease must have been stolen by worker B after natural expiry');
        assert.equal(liveNetworkCalls, 1, 'Worker A fake offline transport must have been called');

        // Verify fail-closed abortion for Worker A: no snapshot in MongoDB, runItem marked FAILED
        assert.equal(resA.success, false, 'Stale worker A must fail closed');
        assert.equal(resA.reason, 'PORTAL_LOCK_OWNERSHIP_LOST');
        assert.equal(resA.ownershipLost, true);

        const finalItemA = await PropertyVerificationRunItem.findById(runItem._id);
        assert.equal(finalItemA.status, 'FAILED');

        const snapCountA = await PropertyVerificationSnapshot.countDocuments({ runItemId: runItem._id });
        assert.equal(snapCountA, 0, 'No snapshot must survive when lease is stolen during persistence');

        // Worker B now completes its item under the new token and commits successfully
        if (workerBLease) {
            await workerBLease.release();
        }

        const runItemB = await PropertyVerificationRunItem.create({
            tenantId,
            runId: new mongoose.Types.ObjectId(),
            inventoryId: inv._id,
            linkId: link._id,
            authorityCode,
            status: 'PROCESSING',
            claimedBy: 'worker-offline-e2e-B',
            workerClaimToken: 'claim-token-offline-e2e-B',
            leaseExpiresAt: new Date(Date.now() + 60000)
        });

        const configuredRuntimeB = createConfiguredPortalRuntime({
            redisClient,
            transport: fakeOfflineTransport,
            testMode: false
        });

        const resB = await AuthorityBulkProcessor.processItem(runItemB, {
            tenantId,
            workerId: 'worker-offline-e2e-B',
            claimToken: 'claim-token-offline-e2e-B',
            isFixtureMode: false,
            portalRuntime: configuredRuntimeB,
            canonicalPolicy: canonicalPolicyDoc
        });

        assert.equal(resB.success, true, 'Worker B must succeed under valid new lease token');
        const finalItemB = await PropertyVerificationRunItem.findById(runItemB._id);
        assert.equal(finalItemB.status, 'SUCCEEDED');

        const snapCountB = await PropertyVerificationSnapshot.countDocuments({ runItemId: runItemB._id });
        assert.equal(snapCountB, 1, 'Worker B must commit exactly 1 snapshot');

        // Cleanup
        const cleanupKeys = await redisClient.keys(`*${authorityCode}*`);
        if (cleanupKeys.length > 0) await redisClient.del(...cleanupKeys);
    });

    await t.test('15. Legitimate heartbeat renewal keeps lock alive across intervals and blocks competing worker', async (t15) => {
        if (!isRedisAvailable) {
            t15.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const authorityCode = 'HSVP';
        const tenantId = new mongoose.Types.ObjectId();
        const cleanupKeys = await redisClient.keys(`*${authorityCode}*`);
        if (cleanupKeys.length > 0) await redisClient.del(...cleanupKeys);

        // Ensure active canonical policy exists and clear authority-global MongoDB collections for HSVP
        await AuthorityCanonicalPolicy.deleteMany({ authorityCode });
        await AuthorityGlobalFenceWatermark.deleteMany({ authorityCode });
        const policyId15 = new mongoose.Types.ObjectId();
        const auditLog15 = await AuditLog.create({
            eventType: 'canonical_policy_rotated',
            targetType: 'authority_canonical_policy',
            targetId: policyId15,
            description: 'Rotated canonical policy for HSVP Test 15',
            status: 'success'
        });
        const canonicalPolicyDoc = await AuthorityCanonicalPolicy.create({
            _id: policyId15,
            authorityCode,
            policyReference: 'HSVP/CANONICAL/RENEWAL/01',
            version: 1,
            contentHash: AuthorityCanonicalPolicy.computeContentHash({
                policyReference: 'HSVP/CANONICAL/RENEWAL/01',
                version: 1,
                minIntervalMs: 50,
                maxRequestsPerMinute: 20,
                maxRequestsPerHour: 100,
                maxRequestsPerDay: 500,
                maxConcurrent: 1
            }),
            minIntervalMs: 50,
            maxRequestsPerMinute: 20,
            maxRequestsPerHour: 100,
            maxRequestsPerDay: 500,
            maxConcurrent: 1,
            effectiveFrom: new Date(Date.now() - 60000),
            expiresAt: new Date(Date.now() + 86400000),
            reviewedBy: 'reviewer-user-renew',
            approvedBy: 'approver-user-renew',
            isAudited: true,
            auditStatus: 'AUDITED',
            isActive: true,
            auditLogId: auditLog15._id,
            redisSyncStatus: 'SYNCED'
        });
        const qp15 = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        await publishCanonicalPolicyToRedis({ authorityCode, quotaProvider: qp15, policyDoc: canonicalPolicyDoc });

        // Ensure authority source settings are approved
        await AuthoritySourceSettings.deleteMany({ authorityCode });
        await AuthoritySourceSettings.create({
            tenantId,
            authorityCode,
            permissionStatus: 'GRANTED',
            approvedAccessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
            approvalReference: 'HSVP-WRITTEN-RENEW-01',
            approvalExpiryDate: new Date(Date.now() + 86400000),
            commercialUseAuthorized: true,
            readOnlySearchAuthorized: true,
            termsReviewed: true,
            termsReference: 'https://hsvphry.org.in/terms',
            submittedBy: new mongoose.Types.ObjectId(),
            approvedBy: new mongoose.Types.ObjectId(),
            reviewedBy: new mongoose.Types.ObjectId(),
            permittedFields: [
                'propertyId', 'sectorNumber', 'urbanEstate', 'propertyCategory',
                'propertyType', 'area', 'authorityStatus', 'allotmentDate',
                'allotmentPrice', 'totalPaid', 'currentDues', 'possessionDate',
                'litigationStatus', 'buildingPlanApproved', 'occupancyCertificate'
            ],
            reviewStatus: 'APPROVED',
            isEnabled: true,
            contractVerificationStatus: 'VERIFIED_CONTRACT',
            contractEvidenceReference: 'HSVP/CONTRACT/RENEW',
            identityRequirements: { verified: true },
            ratePolicy: {
                minIntervalMs: 50,
                minimumIntervalMs: 50,
                maxRequestsPerMinute: 20,
                maxRequestsPerHour: 100,
                maxRequestsPerDay: 500,
                maxConcurrent: 1,
                policySource: 'HSVP/CANONICAL/RENEWAL/01'
            }
        });

        const inv = await Inventory.create({
            tenantId,
            title: 'Plot 777 Sector 14 Panchkula',
            propertyId: '777',
            unitNo: '777',
            sector: '14',
            city: 'UE001-Panchkula',
            urbanEstate: 'UE001-Panchkula',
            status: 'AVAILABLE'
        });

        const link = await PropertyAuthorityLink.create({
            tenantId,
            inventoryId: inv._id,
            authorityCode,
            propertyId: '777',
            sectorNumber: '14',
            urbanEstate: 'UE001-Panchkula',
            compositeKey: 'HSVP:UE001-PANCHKULA:14:777',
            identityVerified: true,
            matchEligibility: 'ELIGIBLE',
            status: 'ACTIVE',
            authorityReference: 'HSVP-LINK-RENEW-777',
            extractedFields: {},
            createdBy: new mongoose.Types.ObjectId()
        });

        const fakeOfflineTransport15 = {
            async search() {
                const mockHtml = `<!DOCTYPE html>
<html>
<head><title>HSVP - Plot Status Enquiry Details</title></head>
<body>
    <form id="enquiryForm" action="/Home/PlotStatusEnquiry" method="post"></form>
    <div id="detailsPanel">
        <h3>Plot Status Details</h3>
        <table class="table table-bordered">
            <tr><th>Plot No</th><td>777</td></tr>
            <tr><th>Sector</th><td>Sector 14</td></tr>
            <tr><th>Urban Estate</th><td>UE001-Panchkula</td></tr>
            <tr><th>Category</th><td>Residential</td></tr>
            <tr><th>Sub Category</th><td>14 Marla</td></tr>
            <tr><th>Area</th><td>350 Sq.Yds</td></tr>
            <tr><th>Plot Status</th><td>Allotted</td></tr>
            <tr><th>Allotment Date</th><td>15/08/2012</td></tr>
            <tr><th>Allotment Price</th><td>2500000</td></tr>
            <tr><th>Total Amount Paid</th><td>2500000</td></tr>
            <tr><th>Current Dues</th><td>0</td></tr>
            <tr><th>Physical Possession Date</th><td>20/12/2014</td></tr>
            <tr><th>Litigation Status</th><td>Clear / No Case</td></tr>
            <tr><th>Building Plan Approved</th><td>Yes (2016)</td></tr>
            <tr><th>Occupancy Certificate</th><td>Issued (2018)</td></tr>
            <tr><th>Allottee Name</th><td>[REDACTED CITIZEN NAME]</td></tr>
        </table>
    </div>
</body>
</html>`;
                return {
                    status: 200,
                    headers: { 'content-type': 'text/html' },
                    finalUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry',
                    redirected: false,
                    location: '',
                    body: mockHtml
                };
            }
        };

        const runItem = await PropertyVerificationRunItem.create({
            tenantId,
            runId: new mongoose.Types.ObjectId(),
            inventoryId: inv._id,
            linkId: link._id,
            authorityCode,
            status: 'PROCESSING',
            claimedBy: 'worker-offline-heartbeat-A',
            workerClaimToken: 'claim-token-heartbeat-A',
            leaseExpiresAt: new Date(Date.now() + 60000)
        });

        let renewalTicksObserved = 0;
        let workerBBlockedDuringHeartbeat = false;
        let observedLeaseFromRuntime = null;

        // P2-E 1 & 3: Configured runtime with real Redis, short TTL (400ms), renewalInterval (100ms)
        const configuredRuntimeA = createConfiguredPortalRuntime({
            redisClient,
            transport: fakeOfflineTransport15,
            testMode: false,
            lockTtlMs: 400,
            renewalIntervalMs: 100,
            onRenewTick: (lease) => {
                renewalTicksObserved++;
                observedLeaseFromRuntime = lease;
            }
        });

        // Worker A processes item with delayed persistence spanning at least two TTL windows (850ms > 2 * 400ms)
        const resA = await AuthorityBulkProcessor.processItem(runItem, {
            tenantId,
            workerId: 'worker-offline-heartbeat-A',
            claimToken: 'claim-token-heartbeat-A',
            isFixtureMode: false,
            portalRuntime: configuredRuntimeA,
            canonicalPolicy: canonicalPolicyDoc,
            beforeTransactionCommit: async () => {
                // At 500ms (> 400ms initial TTL), verify Worker B is blocked by A's active heartbeat lease
                await new Promise((r) => setTimeout(r, 500));
                const lockProviderB = new RedisPortalDistributedLock(redisClient, { testMode: false });
                const leaseBAttempt = await lockProviderB.acquire({
                    authorityCode,
                    maxConcurrent: 1,
                    ttlMs: 400
                });
                workerBBlockedDuringHeartbeat = (leaseBAttempt.acquired === false);

                // Delay another 350ms to cross more renewal intervals (total 850ms)
                await new Promise((r) => setTimeout(r, 350));
            }
        });

        assert.equal(resA.success, true, 'Worker A must commit successfully under active heartbeat renewal');
        assert.equal(workerBBlockedDuringHeartbeat, true, 'Worker B must remain blocked across TTL windows by Worker A heartbeat');

        // P2-E 3: Assert renewalTicks >= 2 from runtime-owned heartbeat
        const ticks = observedLeaseFromRuntime?.renewalTicks || renewalTicksObserved;
        assert.ok(ticks >= 2, `Heartbeat must have executed at least 2 runtime-owned renewal ticks (observed: ${ticks})`);

        const finalItemA = await PropertyVerificationRunItem.findById(runItem._id);
        assert.equal(finalItemA.status, 'SUCCEEDED');

        const snapCountA = await PropertyVerificationSnapshot.countDocuments({ runItemId: runItem._id });
        assert.equal(snapCountA, 1, 'Worker A must commit exactly 1 snapshot under active renewal');

        // Worker B can now acquire cleanly after Worker A releases
        const lockProviderB = new RedisPortalDistributedLock(redisClient, { testMode: false });
        const leaseB = await lockProviderB.acquire({
            authorityCode,
            maxConcurrent: 1,
            ttlMs: 400
        });
        assert.equal(leaseB.acquired, true, 'Worker B acquires successfully after Worker A releases');
        await leaseB.release();

        // Final cleanup
        const remainingKeys = await redisClient.keys(`*${authorityCode}*`);
        if (remainingKeys.length > 0) await redisClient.del(...remainingKeys);
    });

    await t.test('16. Real Redis Canonical Policy Publication Ordering & Audit Failure Rollback (Objective C)', async (t) => {
        if (!isRedisAvailable) {
            t.skip('Redis service container not available; skipping real Redis publication ordering test.');
            return;
        }

        if (!mongoServer) {
            mongoServer = await MongoMemoryServer.create();
            const uri = mongoServer.getUri();
            if (mongoose.connection.readyState !== 0) {
                await mongoose.disconnect();
            }
            await mongoose.connect(uri);
        }

        const authorityCode = 'HSVP';
        const redisKey = `quota:canonical:${authorityCode}`;

        // Ensure cleanly reset state
        await redisClient.del(redisKey);
        await AuthorityCanonicalPolicy.deleteMany({ authorityCode });
        await AuthorityGlobalFenceWatermark.deleteMany({ authorityCode });

        // Setup authorized approver and reviewer users
        const approverRole = await Role.create({
            name: `Approver Role Real Redis ${Date.now()}`,
            department: 'inventory',
            approvalRights: { manageAuthoritySettings: true }
        });
        const reviewerRole = await Role.create({
            name: `Reviewer Role Real Redis ${Date.now()}`,
            department: 'inventory',
            approvalRights: { approveAuthorityChanges: true }
        });

        const approverUser = await User.create({
            fullName: 'Admin Approver Real Redis',
            email: `approver-redis-${Date.now()}@test.internal`,
            password: 'hashed-password-123',
            role: approverRole._id,
            department: 'inventory',
            isActive: true
        });
        const reviewerUser = await User.create({
            fullName: 'Reviewer Real Redis',
            email: `reviewer-redis-${Date.now()}@test.internal`,
            password: 'hashed-password-123',
            role: reviewerRole._id,
            department: 'inventory',
            isActive: true
        });

        const realQuotaProvider = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        setTestQuotaProvider(realQuotaProvider);

        try {
            // 16.1: Seed V1 in MongoDB and publish to Real Redis
            const v1Doc = await registerOrRotateCanonicalPolicy({
                authorityCode,
                policy: {
                    policyReference: 'HSVP/OFFICIAL/V1',
                    minIntervalMs: 100,
                    maxRequestsPerMinute: 10,
                    maxRequestsPerHour: 100,
                    maxRequestsPerDay: 500,
                    maxConcurrent: 1,
                    expiresAt: new Date(Date.now() + 86400000)
                },
                reviewedBy: reviewerUser._id.toString(),
                approvedBy: approverUser._id.toString()
            });

            const auditLogV1 = await AuditLog.create({
                eventType: 'canonical_policy_rotated',
                targetType: 'authority_canonical_policy',
                targetId: v1Doc._id,
                description: 'Initial V1 Canonical Policy Rotation',
                status: 'success'
            });

            await markCanonicalPolicyAudited({ policyId: v1Doc._id, auditLogId: auditLogV1._id });
            const pubV1 = await publishCanonicalPolicyToRedis({
                authorityCode,
                quotaProvider: realQuotaProvider,
                policyDoc: await getCanonicalPolicy(authorityCode)
            });
            assert.equal(pubV1.success, true);

            // Capture actual V1 hash from real Redis
            const v1Hash = await redisClient.hgetall(redisKey);
            assert.ok(v1Hash && v1Hash.version === '1', 'Redis hash must be initialized at version 1');
            const v1HashJson = JSON.stringify(v1Hash);

            // 16.2: Force AuditLog.create to throw during V2 rotation
            const origAuditCreate = AuditLog.create;
            AuditLog.create = async () => {
                throw new Error('SIMULATED_AUDIT_LOG_DATABASE_CRASH');
            };

            try {
                let statusCode = null;
                let jsonBody = null;
                const req = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get(h) { return h === 'user-agent' ? 'test-agent' : null; },
                    body: {
                        reviewerId: reviewerUser._id.toString(),
                        policyVersion: 2,
                        policy: {
                            policyReference: 'HSVP/OFFICIAL/V2_FAILED',
                            minIntervalMs: 50,
                            maxRequestsPerMinute: 20,
                            maxRequestsPerHour: 200,
                            maxRequestsPerDay: 1000,
                            expiresAt: new Date(Date.now() + 86400000)
                        }
                    }
                };
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(payload) { jsonBody = payload; return this; }
                };

                await rotateCanonicalPolicy(req, res);
                assert.equal(statusCode, 500, 'Must return HTTP 500 when mandatory audit fails');
                assert.equal(jsonBody.code, 'AUDIT_PERSISTENCE_FAILED');

                // Assert MongoDB remains at V1
                const mongoDoc = await AuthorityCanonicalPolicy.findOne({ authorityCode });
                assert.equal(mongoDoc.version, 1, 'MongoDB must remain at V1 after audit failure');

                // Assert real Redis hash is byte-for-byte identical to V1
                const hashAfterFail = await redisClient.hgetall(redisKey);
                assert.equal(JSON.stringify(hashAfterFail), v1HashJson, 'Real Redis hash must remain byte-for-byte unchanged at V1');
            } finally {
                AuditLog.create = origAuditCreate;
            }

            // 16.3: Successful V2 rotation with paused Mongo audit transaction
            let unpauseAudit = null;
            const auditPausedPromise = new Promise((resolve) => {
                AuditLog.create = async (...args) => {
                    resolve();
                    await new Promise((r) => { unpauseAudit = r; });
                    return origAuditCreate.apply(AuditLog, args);
                };
            });

            try {
                let statusCode2 = null;
                let jsonBody2 = null;
                const req2 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get(h) { return h === 'user-agent' ? 'test-agent' : null; },
                    body: {
                        reviewerId: reviewerUser._id.toString(),
                        policyVersion: 2,
                        policy: {
                            policyReference: 'HSVP/OFFICIAL/V2_SUCCESS',
                            minIntervalMs: 50,
                            maxRequestsPerMinute: 20,
                            maxRequestsPerHour: 200,
                            maxRequestsPerDay: 1000,
                            expiresAt: new Date(Date.now() + 86400000)
                        }
                    }
                };
                const res2 = {
                    status(code) { statusCode2 = code; return this; },
                    json(payload) { jsonBody2 = payload; return this; }
                };

                const rotatePromise = rotateCanonicalPolicy(req2, res2);

                // Wait until AuditLog creation is in-flight / paused
                await auditPausedPromise;

                // While audit/transaction is paused, check real Redis hash: MUST still be V1!
                const hashDuringPause = await redisClient.hgetall(redisKey);
                assert.equal(hashDuringPause.version, '1', 'Real Redis hash must remain V1 while audit is uncommitted');

                // Unpause audit and await completion
                unpauseAudit();
                await rotatePromise;

                assert.ok(statusCode2 === 200 || statusCode2 === 202);
                assert.equal(jsonBody2.success, true);
                assert.equal(jsonBody2.data.version, 2);

                // Now verify real Redis hash has transitioned to V2
                const hashAfterCommit = await redisClient.hgetall(redisKey);
                assert.equal(hashAfterCommit.version, '2', 'Real Redis hash must transition to V2 after durable commit');
                assert.equal(hashAfterCommit.ref, 'HSVP/OFFICIAL/V2_SUCCESS');
            } finally {
                AuditLog.create = origAuditCreate;
            }

            // 16.4: Standalone fallback behavior (without replica-set transactions)
            const origClient = mongoose.connection.client;
            try {
                // Temporarily stub topology description to simulate standalone MongoDB
                mongoose.connection.client = {
                    topology: { description: { type: 'Single' } }
                };

                // Simulate audit failure in standalone mode
                AuditLog.create = async () => {
                    throw new Error('STANDALONE_AUDIT_LOG_FAILURE');
                };

                let statusCode3 = null;
                let jsonBody3 = null;
                const req3 = {
                    params: { authorityCode },
                    user: approverUser,
                    ip: '127.0.0.1',
                    get(h) { return h === 'user-agent' ? 'test-agent' : null; },
                    body: {
                        reviewerId: reviewerUser._id.toString(),
                        policyVersion: 3,
                        policy: {
                            policyReference: 'HSVP/OFFICIAL/V3_STANDALONE_FAIL',
                            minIntervalMs: 50,
                            maxRequestsPerMinute: 20,
                            maxRequestsPerHour: 200,
                            maxRequestsPerDay: 1000,
                            expiresAt: new Date(Date.now() + 86400000)
                        }
                    }
                };
                const res3 = {
                    status(code) { statusCode3 = code; return this; },
                    json(payload) { jsonBody3 = payload; return this; }
                };

                await rotateCanonicalPolicy(req3, res3);
                assert.equal(statusCode3, 500);

                // Verify MongoDB policy was rolled back to previous (version 2)
                const docAfterFail = await AuthorityCanonicalPolicy.findOne({ authorityCode });
                assert.equal(docAfterFail.version, 2, 'Standalone mode must roll back to previous doc on audit failure');

                // Verify Redis hash remains at version 2
                const hashAfterStandaloneFail = await redisClient.hgetall(redisKey);
                assert.equal(hashAfterStandaloneFail.version, '2', 'Redis hash must remain at V2 on standalone audit failure');
            } finally {
                mongoose.connection.client = origClient;
                AuditLog.create = origAuditCreate;
            }
        } finally {
            setTestQuotaProvider(null);
            await redisClient.del(redisKey);
            await AuthorityCanonicalPolicy.deleteMany({ authorityCode });
        }
    });
});
