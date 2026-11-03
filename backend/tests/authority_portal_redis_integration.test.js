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
import { RedisPortalDistributedLock } from '../services/authority/portal/infrastructure/redisPortalDistributedLock.js';
import { RedisPortalQuotaProvider } from '../services/authority/portal/infrastructure/redisPortalQuotaProvider.js';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

test('--- AUTHORITY PORTAL REAL REDIS INTEGRATION SUITE ---', async (t) => {
    let redisClient = null;
    let redisClient2 = null;
    let isRedisAvailable = false;

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

    await t.test('5. Atomic Redis Semaphore: Exactly N Permits, Reject N+1 Under Contention', async (t5) => {
        if (!isRedisAvailable) {
            t5.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const lockProvider = new RedisPortalDistributedLock(redisClient, { testMode: false });
        await redisClient.del('portal_sem:SEMAPHORE_TEST', 'portal_fence_seq:SEMAPHORE_TEST');

        const N = 3;
        // Acquire N permits in parallel
        const leases = await Promise.all([
            lockProvider.acquire({ authorityCode: 'SEMAPHORE_TEST', maxConcurrent: N, ttlMs: 10000 }),
            lockProvider.acquire({ authorityCode: 'SEMAPHORE_TEST', maxConcurrent: N, ttlMs: 10000 }),
            lockProvider.acquire({ authorityCode: 'SEMAPHORE_TEST', maxConcurrent: N, ttlMs: 10000 })
        ]);

        assert.equal(leases[0].acquired, true);
        assert.equal(leases[1].acquired, true);
        assert.equal(leases[2].acquired, true);

        // (N+1)th request MUST be rejected
        const leaseNPlusOne = await lockProvider.acquire({ authorityCode: 'SEMAPHORE_TEST', maxConcurrent: N, ttlMs: 10000 });
        assert.equal(leaseNPlusOne.acquired, false, 'N+1 request must be rejected under parallel semaphore contention');

        // Release one permit
        await leases[0].release();

        // Now an acquisition succeeds
        const leaseAfterRelease = await lockProvider.acquire({ authorityCode: 'SEMAPHORE_TEST', maxConcurrent: N, ttlMs: 10000 });
        assert.equal(leaseAfterRelease.acquired, true);

        // Clean up
        await Promise.all([leases[1].release(), leases[2].release(), leaseAfterRelease.release()]);
        await redisClient.del('portal_sem:SEMAPHORE_TEST');
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

    await t.test('7. Asia/Kolkata Hour & Midnight/Day Rollover with TTL Verification', async (t7) => {
        if (!isRedisAvailable) {
            t7.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const quotaProvider = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        const policy = {
            maxRequestsPerMinute: 10,
            maxRequestsPerHour: 2,
            maxRequestsPerDay: 2,
            minimumIntervalMs: 10,
            policyReference: 'POL_IST_ROLLOVER'
        };

        // 23:59:50 IST on Nov 3, 2026 => 2026-11-03T18:29:50Z UTC
        const beforeMidnight = new Date('2026-11-03T18:29:50.000Z');
        // 00:00:10 IST on Nov 4, 2026 => 2026-11-03T18:30:10Z UTC
        const afterMidnight = new Date('2026-11-03T18:30:10.000Z');

        await redisClient.del(
            'quota:last:IST_TEST',
            'quota:canonical:IST_TEST',
            'quota:day:IST_TEST:2026-11-03',
            'quota:day:IST_TEST:2026-11-04',
            'quota:hour:IST_TEST:2026-11-03T23',
            'quota:hour:IST_TEST:2026-11-04T00'
        );

        // Exhaust daily quota before midnight (2 requests)
        const r1 = await quotaProvider.reserve({ authorityCode: 'IST_TEST', policy, at: beforeMidnight });
        assert.equal(r1.allowed, true);
        const r2 = await quotaProvider.reserve({ authorityCode: 'IST_TEST', policy, at: new Date(beforeMidnight.getTime() + 20) });
        assert.equal(r2.allowed, true);

        const r3 = await quotaProvider.reserve({ authorityCode: 'IST_TEST', policy, at: new Date(beforeMidnight.getTime() + 40) });
        assert.equal(r3.allowed, false);
        assert.equal(r3.reason, 'DAILY_LIMIT_EXCEEDED');

        // Check key TTL of day key in Redis
        const dayTtl = await redisClient.ttl('quota:day:IST_TEST:2026-11-03');
        assert.ok(dayTtl > 0 && dayTtl <= 172800, `Day key TTL (${dayTtl}) must be <= 48h`);

        // Check hour key TTL
        const hourTtl = await redisClient.ttl('quota:hour:IST_TEST:2026-11-03T23');
        assert.ok(hourTtl > 0 && hourTtl <= 7200, `Hour key TTL (${hourTtl}) must be <= 2h`);

        // Now simulate request at 00:00:10 IST: Rollover resets daily counter to 0, request SUCCEEDS!
        const rRollover = await quotaProvider.reserve({ authorityCode: 'IST_TEST', policy, at: afterMidnight });
        assert.equal(rRollover.allowed, true, 'Request after Asia/Kolkata midnight rollover must succeed');
    });

    await t.test('8. Canonical Authority Quota Policy: Reject Ceiling Elevation & Mismatched Versions (P1)', async (t8) => {
        if (!isRedisAvailable) {
            t8.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const quotaProvider = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        await redisClient.del('quota:last:CANON_TEST', 'quota:canonical:CANON_TEST');

        const tenantAPolicy = {
            maxRequestsPerMinute: 1, // 1 per minute approved
            maxRequestsPerDay: 50,
            minimumIntervalMs: 500,
            policyReference: 'OFFICIAL_HSVP_POLICY_V1'
        };

        const at = new Date();
        // Tenant A initializes canonical policy
        const rA = await quotaProvider.reserve({
            authorityCode: 'CANON_TEST',
            tenantId: 'tenant-a',
            policy: tenantAPolicy,
            at
        });
        assert.equal(rA.allowed, true);

        // Tenant B attempts to use a MORE PERMISSIVE rate (5/min): MUST BE REJECTED
        const tenantBElevatedPolicy = {
            maxRequestsPerMinute: 5, // Tries to elevate limit
            maxRequestsPerDay: 50,
            minimumIntervalMs: 500,
            policyReference: 'OFFICIAL_HSVP_POLICY_V1'
        };

        const rB = await quotaProvider.reserve({
            authorityCode: 'CANON_TEST',
            tenantId: 'tenant-b',
            policy: tenantBElevatedPolicy,
            at: new Date(at.getTime() + 600)
        });
        assert.equal(rB.allowed, false);
        assert.equal(rB.reason, 'RATE_LIMIT_ELEVATION_REJECTED');

        // Tenant C attempts to use MISMATCHED policy reference: MUST BE REJECTED
        const tenantCMismatchedPolicy = {
            maxRequestsPerMinute: 1,
            maxRequestsPerDay: 50,
            minimumIntervalMs: 500,
            policyReference: 'UNAPPROVED_ALTERNATIVE_POLICY'
        };

        const rC = await quotaProvider.reserve({
            authorityCode: 'CANON_TEST',
            tenantId: 'tenant-c',
            policy: tenantCMismatchedPolicy,
            at: new Date(at.getTime() + 600)
        });
        assert.equal(rC.allowed, false);
        assert.equal(rC.reason, 'POLICY_VERSION_MISMATCH');
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
                policy: { maxRequestsPerMinute: 1, minimumIntervalMs: 1000 }
            }),
            (err) => err.code === 'PORTAL_QUOTA_REDIS_UNAVAILABLE'
        );
    });
});
