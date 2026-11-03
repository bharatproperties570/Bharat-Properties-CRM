/**
 * Authority Portal Real Redis Integration Test Suite
 *
 * Dedicated integration tests against real Redis (redis:7-alpine in CI service container).
 * Exercises:
 * 1. Real Redis SET NX PX lock acquire & release
 * 2. Monotonic sequence fence tokens (INCR)
 * 3. Lease renewal via Lua script and ownership fencing
 * 4. Atomic multi-window Lua quota reservation (minInterval, minute, hour, day) with IST rollover
 * 5. Multi-tenant quota contention against shared authority quota
 * 6. Fail-closed error handling when Redis disconnects
 *
 * When Redis 6379 is not running locally (e.g. dev machine without Docker),
 * tests gracefully skip while running completely in CI.
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
    let isRedisAvailable = false;

    t.before(async () => {
        try {
            redisClient = new Redis({
                host: REDIS_HOST,
                port: REDIS_PORT,
                connectTimeout: 1000,
                maxRetriesPerRequest: 1,
                retryStrategy: () => null, // Do not reconnect on failure
                lazyConnect: true
            });
            redisClient.on('error', () => {}); // Suppress unhandled error log when Redis is offline
            await redisClient.connect();
            const pong = await redisClient.ping();
            if (pong === 'PONG') {
                isRedisAvailable = true;
            }
        } catch {
            isRedisAvailable = false;
        }
    });

    t.after(async () => {
        if (redisClient && redisClient.status !== 'end') {
            try {
                // Clean up test keys
                const keys = await redisClient.keys('*portal*');
                if (keys.length > 0) {
                    await redisClient.del(...keys);
                }
                const quotaKeys = await redisClient.keys('quota:*');
                if (quotaKeys.length > 0) {
                    await redisClient.del(...quotaKeys);
                }
                await redisClient.quit();
            } catch {
                redisClient.disconnect();
            }
        }
    });

    await t.test('1. Real Redis SET NX PX Lock Acquire and Release', async (t1) => {
        if (!isRedisAvailable) {
            t1.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const lockProvider = new RedisPortalDistributedLock(redisClient, { testMode: false });
        const key = 'authority-portal:HSVP:integration-test-1';

        // 1.1 First worker acquires lock
        const lease1 = await lockProvider.acquire({ key, ttlMs: 10000 });
        assert.equal(lease1.acquired, true);
        assert.ok(lease1.token);
        assert.equal(typeof lease1.fenceToken, 'number');

        // Verify key exists in real Redis with PX TTL
        const rawToken = await redisClient.get(key);
        assert.equal(rawToken, lease1.token);
        const pttl = await redisClient.pttl(key);
        assert.ok(pttl > 0 && pttl <= 10000, `TTL must be within range: ${pttl}`);

        // 1.2 Second worker fails to acquire while locked
        const lease2 = await lockProvider.acquire({ key, ttlMs: 10000 });
        assert.equal(lease2.acquired, false);
        assert.equal(lease2.token, null);

        // 1.3 First worker releases lock
        await lease1.release();

        // Key should be deleted from real Redis
        const postRelease = await redisClient.get(key);
        assert.equal(postRelease, null);

        // 1.4 Second worker can now acquire
        const lease3 = await lockProvider.acquire({ key, ttlMs: 10000 });
        assert.equal(lease3.acquired, true);
        await lease3.release();
    });

    await t.test('2. Monotonic Sequence Fence Token (INCR)', async (t2) => {
        if (!isRedisAvailable) {
            t2.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const lockProvider = new RedisPortalDistributedLock(redisClient, { testMode: false });
        const key = 'authority-portal:GMADA:fence-test';
        await redisClient.del('portal_fence_seq:GMADA');

        const lease1 = await lockProvider.acquire({ key, authorityCode: 'GMADA', ttlMs: 5000 });
        assert.equal(lease1.acquired, true);
        const fence1 = lease1.fenceToken;
        await lease1.release();

        const lease2 = await lockProvider.acquire({ key, authorityCode: 'GMADA', ttlMs: 5000 });
        assert.equal(lease2.acquired, true);
        const fence2 = lease2.fenceToken;
        await lease2.release();

        const lease3 = await lockProvider.acquire({ key, authorityCode: 'GMADA', ttlMs: 5000 });
        assert.equal(lease3.acquired, true);
        const fence3 = lease3.fenceToken;
        await lease3.release();

        assert.ok(fence1 < fence2, `fence1 (${fence1}) < fence2 (${fence2})`);
        assert.ok(fence2 < fence3, `fence2 (${fence2}) < fence3 (${fence3})`);
    });

    await t.test('3. Lease Renewal via Lua Script & Ownership Fencing', async (t3) => {
        if (!isRedisAvailable) {
            t3.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const lockProvider = new RedisPortalDistributedLock(redisClient, { testMode: false });
        const key = 'authority-portal:CHD:renew-test';

        const lease = await lockProvider.acquire({ key, ttlMs: 2000 });
        assert.equal(lease.acquired, true);

        // Renew while owned
        const renewed = await lease.renew(8000);
        assert.equal(renewed, true);
        const pttl = await redisClient.pttl(key);
        assert.ok(pttl > 2000, `PTTL was extended: ${pttl}`);

        // Simulate lock pre-emption / ownership loss: overwrite key with another token
        await redisClient.set(key, 'hijacked-token-by-another-worker');

        // Renew must now fail closed
        const renewedAfterLoss = await lease.renew(8000);
        assert.equal(renewedAfterLoss, false, 'Renew must return false when ownership token is lost');

        // Release must not delete the new owner's key
        await lease.release();
        const currentToken = await redisClient.get(key);
        assert.equal(currentToken, 'hijacked-token-by-another-worker', 'Stale worker release must not delete new owner key');

        // Clean up
        await redisClient.del(key);
    });

    await t.test('4. Atomic Multi-Window Lua Quota Reservation', async (t4) => {
        if (!isRedisAvailable) {
            t4.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const quotaProvider = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        const policy = {
            maxRequestsPerMinute: 2,
            maxRequestsPerHour: 5,
            maxRequestsPerDay: 10,
            minimumIntervalMs: 500
        };

        const now = new Date();
        const res1 = await quotaProvider.reserve({ authorityCode: 'HSVP', policy, at: now });
        assert.equal(res1.allowed, true);
        assert.ok(res1.reservationId);

        // Immediate subsequent request violates minimum interval
        const res2 = await quotaProvider.reserve({ authorityCode: 'HSVP', policy, at: new Date(now.getTime() + 100) });
        assert.equal(res2.allowed, false);
        assert.equal(res2.reason, 'MINIMUM_INTERVAL_VIOLATED');

        // After interval (600ms), 2nd request succeeds
        const res3 = await quotaProvider.reserve({ authorityCode: 'HSVP', policy, at: new Date(now.getTime() + 600) });
        assert.equal(res3.allowed, true);

        // 3rd request in same minute exceeds per-minute limit (max = 2)
        const res4 = await quotaProvider.reserve({ authorityCode: 'HSVP', policy, at: new Date(now.getTime() + 1200) });
        assert.equal(res4.allowed, false);
        assert.equal(res4.reason, 'PER_MINUTE_LIMIT_EXCEEDED');
    });

    await t.test('5. Multi-Tenant Quota Contention Against Shared Authority Pool', async (t5) => {
        if (!isRedisAvailable) {
            t5.skip('Redis 6379 not reachable in local environment; runs in CI service container.');
            return;
        }

        const quotaProvider = new RedisPortalQuotaProvider(redisClient, { testMode: false });
        const policy = {
            maxRequestsPerMinute: 1, // Only 1 request allowed per minute authority-wide
            maxRequestsPerDay: 50,
            minimumIntervalMs: 1000
        };

        const at = new Date();
        // Tenant A takes the 1 allowed slot
        const resTenantA = await quotaProvider.reserve({
            authorityCode: 'GMADA',
            tenantId: 'tenant-a-111',
            policy,
            at
        });
        assert.equal(resTenantA.allowed, true);

        // Tenant B requests 200ms later: blocked by authority-wide minimum interval
        const resTenantB1 = await quotaProvider.reserve({
            authorityCode: 'GMADA',
            tenantId: 'tenant-b-222',
            policy,
            at: new Date(at.getTime() + 200)
        });
        assert.equal(resTenantB1.allowed, false);
        assert.equal(resTenantB1.reason, 'MINIMUM_INTERVAL_VIOLATED');

        // Tenant B requests 1500ms later: blocked by authority-wide per-minute ceiling
        const resTenantB2 = await quotaProvider.reserve({
            authorityCode: 'GMADA',
            tenantId: 'tenant-b-222',
            policy,
            at: new Date(at.getTime() + 1500)
        });
        assert.equal(resTenantB2.allowed, false);
        assert.equal(resTenantB2.reason, 'PER_MINUTE_LIMIT_EXCEEDED');
    });

    await t.test('6. Redis Disconnect Handling Fails Closed in Production Mode', async (t6) => {
        // Disconnected client in production mode must fail closed without in-memory fallback
        const disconnectedClient = new Redis({
            host: '127.0.0.1',
            port: 6399, // Unused port
            lazyConnect: true,
            maxRetriesPerRequest: 0,
            retryStrategy: () => null
        });
        disconnectedClient.on('error', () => {});

        const prodLock = new RedisPortalDistributedLock(disconnectedClient, { testMode: false });
        const prodQuota = new RedisPortalQuotaProvider(disconnectedClient, { testMode: false });

        await assert.rejects(
            prodLock.acquire({ key: 'test:key' }),
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
