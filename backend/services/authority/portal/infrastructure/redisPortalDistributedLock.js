/**
 * Redis / In-Memory Portal Distributed Lock Provider
 *
 * Ensures mutually exclusive access to an authority portal resource or search key.
 * Enforces authority-wide concurrency cap (maxConcurrent: default 1).
 * In production mode, strictly requires connected Redis (fail-closed).
 * In-memory fallback is restricted exclusively to explicit test mode.
 */

import crypto from 'node:crypto';

export class RedisPortalDistributedLock {
    constructor(redisClient = null, options = {}) {
        this.redisClient = redisClient;
        const isRunningInTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || process.argv.some(arg => String(arg).includes('test'));
        this.testMode = options.testMode ?? isRunningInTest;
        this.allowInMemoryFallback = Boolean(options.allowInMemoryFallback ?? this.testMode);
        if (process.env.NODE_ENV === 'production') {
            this.allowInMemoryFallback = false;
        }
        this._localLocks = new Map();
        this._localSequences = new Map();
    }

    _nextSequence(seqKey) {
        const nextVal = (this._localSequences.get(seqKey) || 0) + 1;
        this._localSequences.set(seqKey, nextVal);
        return nextVal;
    }

    /**
     * Check if a given fenceToken is still the latest issued fence token for an authority.
     * @param {string} authorityCode
     * @param {number} fenceToken
     * @returns {Promise<boolean>}
     */
    async isCurrentFenceToken(authorityCode, fenceToken) {
        const code = String(authorityCode || '').trim().toUpperCase();
        const seqKey = `portal_fence_seq:${code}`;
        let currentSeq = null;

        if (this.redisClient) {
            const isReady = this.redisClient.status === 'ready' || (typeof this.redisClient.ping === 'function');
            if (isReady) {
                try {
                    const val = await this.redisClient.get(seqKey);
                    currentSeq = val !== null ? Number(val) : null;
                } catch (redisErr) {
                    if (!this.allowInMemoryFallback) {
                        const err = new Error(`PORTAL_LOCK_REDIS_UNAVAILABLE: Redis fence verification failed: ${redisErr.message}`);
                        err.code = 'PORTAL_LOCK_REDIS_UNAVAILABLE';
                        err.cause = redisErr;
                        throw err;
                    }
                }
            } else if (!this.allowInMemoryFallback) {
                const err = new Error('PORTAL_LOCK_REDIS_UNAVAILABLE: Redis is not connected for fence verification.');
                err.code = 'PORTAL_LOCK_REDIS_UNAVAILABLE';
                throw err;
            }
        } else if (!this.allowInMemoryFallback) {
            const err = new Error('PORTAL_LOCK_REDIS_UNAVAILABLE: No Redis client configured for fence verification.');
            err.code = 'PORTAL_LOCK_REDIS_UNAVAILABLE';
            throw err;
        }

        if (currentSeq === null && this.allowInMemoryFallback) {
            currentSeq = this._localSequences.get(seqKey) ?? null;
        }

        if (currentSeq !== null && Number(fenceToken) < currentSeq) {
            return false;
        }
        return true;
    }

    /**
     * Acquire an authority-wide distributed lock or semaphore lease.
     * Lock key is stable for the entire authority (portal_lock:{authorityCode}),
     * independent of tenant and searchKey.
     *
     * @param {object} args
     * @param {string} [args.key]
     * @param {string} [args.searchKey] Ignored for lock scoping; rate limits are authority-global
     * @param {string} [args.tenantId]
     * @param {string} [args.authorityCode]
     * @param {number} [args.maxConcurrent=1] Maximum concurrent requests approved for authority
     * @param {number} [args.ttlMs=30000]
     * @returns {Promise<{ acquired: boolean, release: Function, renew: Function, token: string, fenceToken: number, ttlMs: number }>}
     */
    async acquire({ key, searchKey, tenantId, authorityCode, maxConcurrent = 1, ttlMs = 30000 } = {}) {
        const code = String(authorityCode || (key ? key.split(':').pop() : '')).trim().toUpperCase();
        if (!code && !key) {
            throw new Error('PORTAL_LOCK_KEY_REQUIRED: Key or authorityCode is required to acquire distributed lock.');
        }

        const lockToken = crypto.randomUUID();
        const concurrentLimit = Number.isInteger(Number(maxConcurrent)) && Number(maxConcurrent) >= 1 ? Number(maxConcurrent) : 1;
        const isMutex = concurrentLimit === 1;

        // Authority-wide lock key: stable per authority code, NEVER partitioned by searchKey or tenantId
        const lockKey = key || `portal_lock:${code}`;
        const semKey = `portal_sem:${code}`;
        const seqKey = `portal_fence_seq:${code}`;

        // Production path: Redis distributed lock / semaphore with atomic sequence fencing
        if (this.redisClient) {
            const isReady = this.redisClient.status === 'ready' || (typeof this.redisClient.ping === 'function');
            if (isReady) {
                try {
                    if (isMutex) {
                        // Mutex path: Atomic acquire and sequence increment
                        const acquireScript = `
                            if redis.call("set", KEYS[1], ARGV[1], "NX", "PX", tonumber(ARGV[2])) then
                                local seq = redis.call("incr", KEYS[2])
                                return {1, tostring(seq)}
                            else
                                return {0, "0"}
                            end
                        `;
                        let acquired = false;
                        let fenceToken = 0;

                        if (typeof this.redisClient.eval === 'function') {
                            const res = await this.redisClient.eval(acquireScript, 2, lockKey, seqKey, lockToken, ttlMs);
                            acquired = Array.isArray(res) && Number(res[0]) === 1;
                            fenceToken = acquired ? Number(res[1]) : 0;
                        } else {
                            const res = await this.redisClient.set(lockKey, lockToken, 'PX', ttlMs, 'NX');
                            if (res === 'OK') {
                                acquired = true;
                                fenceToken = typeof this.redisClient.incr === 'function'
                                    ? await this.redisClient.incr(seqKey)
                                    : this._nextSequence(seqKey);
                            }
                        }

                        if (!acquired) {
                            return Object.freeze({
                                acquired: false,
                                token: null,
                                fenceToken: null,
                                ttlMs: Number(ttlMs) || 30000,
                                renew: async () => false,
                                release: async () => {}
                            });
                        }

                        return Object.freeze({
                            acquired: true,
                            token: lockToken,
                            fenceToken: Number(fenceToken),
                            ttlMs: Number(ttlMs) || 30000,
                            renew: async (additionalTtlMs = ttlMs) => {
                                try {
                                    const renewScript = `
                                        if redis.call("get", KEYS[1]) == ARGV[1] then
                                            return redis.call("pexpire", KEYS[1], tonumber(ARGV[2]))
                                        else
                                            return 0
                                        end
                                    `;
                                    if (typeof this.redisClient.eval === 'function') {
                                        const res = await this.redisClient.eval(renewScript, 1, lockKey, lockToken, additionalTtlMs);
                                        return Number(res) === 1;
                                    } else {
                                        const current = await this.redisClient.get(lockKey);
                                        if (current === lockToken) {
                                            await this.redisClient.set(lockKey, lockToken, 'PX', additionalTtlMs);
                                            return true;
                                        }
                                        return false;
                                    }
                                } catch {
                                    return false;
                                }
                            },
                            release: async () => {
                                try {
                                    const script = `
                                        if redis.call("get", KEYS[1]) == ARGV[1] then
                                            return redis.call("del", KEYS[1])
                                        else
                                            return 0
                                        end
                                    `;
                                    if (typeof this.redisClient.eval === 'function') {
                                        await this.redisClient.eval(script, 1, lockKey, lockToken);
                                    } else {
                                        const current = await this.redisClient.get(lockKey);
                                        if (current === lockToken) {
                                            await this.redisClient.del(lockKey);
                                        }
                                    }
                                } catch {
                                    // Suppress release error
                                }
                            }
                        });
                    } else {
                        // Dynamic semaphore path: exactly concurrentLimit permits, atomic lease tokens & expiry
                        const nowMs = Date.now();
                        const semScript = `
                            redis.call('zremrangebyscore', KEYS[1], '-inf', tonumber(ARGV[2]))
                            local count = redis.call('zcard', KEYS[1])
                            if count < tonumber(ARGV[4]) then
                                local expiry = tonumber(ARGV[2]) + tonumber(ARGV[3])
                                redis.call('zadd', KEYS[1], expiry, ARGV[1])
                                local seq = redis.call('incr', KEYS[2])
                                return {1, tostring(seq)}
                            else
                                return {0, "0"}
                            end
                        `;
                        let acquired = false;
                        let fenceToken = 0;

                        if (typeof this.redisClient.eval === 'function') {
                            const res = await this.redisClient.eval(semScript, 2, semKey, seqKey, lockToken, nowMs, ttlMs, concurrentLimit);
                            acquired = Array.isArray(res) && Number(res[0]) === 1;
                            fenceToken = acquired ? Number(res[1]) : 0;
                        }

                        if (!acquired) {
                            return Object.freeze({
                                acquired: false,
                                token: null,
                                fenceToken: null,
                                ttlMs: Number(ttlMs) || 30000,
                                renew: async () => false,
                                release: async () => {}
                            });
                        }

                        return Object.freeze({
                            acquired: true,
                            token: lockToken,
                            fenceToken: Number(fenceToken),
                            ttlMs: Number(ttlMs) || 30000,
                            renew: async (additionalTtlMs = ttlMs) => {
                                try {
                                    const renewSemScript = `
                                        local curNow = tonumber(ARGV[2])
                                        local score = redis.call('zscore', KEYS[1], ARGV[1])
                                        if score and tonumber(score) > curNow then
                                            local newExp = curNow + tonumber(ARGV[3])
                                            redis.call('zadd', KEYS[1], newExp, ARGV[1])
                                            return 1
                                        else
                                            return 0
                                        end
                                    `;
                                    if (typeof this.redisClient.eval === 'function') {
                                        const res = await this.redisClient.eval(renewSemScript, 1, semKey, lockToken, Date.now(), additionalTtlMs);
                                        return Number(res) === 1;
                                    }
                                    return false;
                                } catch {
                                    return false;
                                }
                            },
                            release: async () => {
                                try {
                                    const releaseSemScript = `
                                        return redis.call('zrem', KEYS[1], ARGV[1])
                                    `;
                                    if (typeof this.redisClient.eval === 'function') {
                                        await this.redisClient.eval(releaseSemScript, 1, semKey, lockToken);
                                    }
                                } catch {
                                    // Suppress release error
                                }
                            }
                        });
                    }
                } catch (redisErr) {
                    if (!this.allowInMemoryFallback) {
                        const err = new Error(`PORTAL_LOCK_REDIS_UNAVAILABLE: Redis distributed lock failed: ${redisErr.message}`);
                        err.code = 'PORTAL_LOCK_REDIS_UNAVAILABLE';
                        err.cause = redisErr;
                        throw err;
                    }
                }
            } else if (!this.allowInMemoryFallback) {
                const err = new Error('PORTAL_LOCK_REDIS_UNAVAILABLE: Redis client is not connected and in-memory fallback is disabled in production.');
                err.code = 'PORTAL_LOCK_REDIS_UNAVAILABLE';
                throw err;
            }
        } else if (!this.allowInMemoryFallback) {
            const err = new Error('PORTAL_LOCK_REDIS_UNAVAILABLE: No Redis client configured and in-memory fallback is disabled in production.');
            err.code = 'PORTAL_LOCK_REDIS_UNAVAILABLE';
            throw err;
        }

        // Local In-Memory Lock (for unit tests only)
        const now = Date.now();
        const activeKey = isMutex ? lockKey : semKey;
        const existingEntries = this._localLocks.get(activeKey) || [];
        const activeEntries = existingEntries.filter(e => e.expiresAt > now);

        if (activeEntries.length >= concurrentLimit) {
            return Object.freeze({
                acquired: false,
                token: null,
                fenceToken: null,
                ttlMs: Number(ttlMs) || 30000,
                renew: async () => false,
                release: async () => {}
            });
        }

        const newEntry = {
            token: lockToken,
            expiresAt: now + ttlMs
        };
        activeEntries.push(newEntry);
        this._localLocks.set(activeKey, activeEntries);

        const fenceToken = this._nextSequence(seqKey);

        return Object.freeze({
            acquired: true,
            token: lockToken,
            fenceToken: Number(fenceToken),
            ttlMs: Number(ttlMs) || 30000,
            renew: async (additionalTtlMs = ttlMs) => {
                const entries = this._localLocks.get(activeKey) || [];
                const target = entries.find(e => e.token === lockToken && e.expiresAt > Date.now());
                if (target) {
                    target.expiresAt = Date.now() + additionalTtlMs;
                    return true;
                }
                return false;
            },
            release: async () => {
                const entries = this._localLocks.get(activeKey) || [];
                const remaining = entries.filter(e => e.token !== lockToken);
                if (remaining.length > 0) {
                    this._localLocks.set(activeKey, remaining);
                } else {
                    this._localLocks.delete(activeKey);
                }
            }
        });
    }
}

export const defaultPortalDistributedLock = new RedisPortalDistributedLock();
export default defaultPortalDistributedLock;
