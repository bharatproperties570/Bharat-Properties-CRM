/**
 * Redis / In-Memory Portal Distributed Lock Provider
 *
 * Ensures mutually exclusive access to an authority portal resource or search key.
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
     * Acquire a distributed lock.
     * @param {object} args
     * @param {string} args.key
     * @param {string} [args.searchKey]
     * @param {string} [args.tenantId]
     * @param {string} [args.authorityCode]
     * @param {number} [args.ttlMs=30000]
     * @returns {Promise<{ acquired: boolean, release: Function, token: string, fenceToken: number, ttlMs: number }>}
     */
    async acquire({ key, searchKey, tenantId, authorityCode, ttlMs = 30000 } = {}) {
        if (!key) {
            throw new Error('PORTAL_LOCK_KEY_REQUIRED: Key is required to acquire distributed lock.');
        }

        const lockToken = crypto.randomUUID();
        let lockKey = key;
        // Authority-wide lock: rate limits and concurrency are global per authority, not partitioned per tenantId
        if (searchKey) lockKey = `${lockKey}:${searchKey}`;

        const code = authorityCode || key.split(':').pop();
        const seqKey = `portal_fence_seq:${code}`;

        // Production path: Redis distributed lock
        if (this.redisClient) {
            const isReady = this.redisClient.status === 'ready' || (typeof this.redisClient.ping === 'function');
            if (isReady) {
                try {
                    // Redis SET key token NX PX ttlMs
                    const res = await this.redisClient.set(lockKey, lockToken, 'PX', ttlMs, 'NX');
                    if (res !== 'OK') {
                        return Object.freeze({
                            acquired: false,
                            token: null,
                            fenceToken: null,
                            ttlMs: Number(ttlMs) || 30000,
                            release: async () => {}
                        });
                    }

                    let fenceToken = 1;
                    if (typeof this.redisClient.incr === 'function') {
                        fenceToken = await this.redisClient.incr(seqKey);
                    } else {
                        fenceToken = this._nextSequence(seqKey);
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
        const existing = this._localLocks.get(lockKey);
        if (existing && existing.expiresAt > now) {
            return Object.freeze({
                acquired: false,
                token: null,
                fenceToken: null,
                ttlMs: Number(ttlMs) || 30000,
                release: async () => {}
            });
        }

        this._localLocks.set(lockKey, {
            token: lockToken,
            expiresAt: now + ttlMs
        });

        const fenceToken = this._nextSequence(seqKey);

        return Object.freeze({
            acquired: true,
            token: lockToken,
            fenceToken: Number(fenceToken),
            ttlMs: Number(ttlMs) || 30000,
            renew: async (additionalTtlMs = ttlMs) => {
                const current = this._localLocks.get(lockKey);
                if (current && current.token === lockToken && current.expiresAt > Date.now()) {
                    current.expiresAt = Date.now() + additionalTtlMs;
                    return true;
                }
                return false;
            },
            release: async () => {
                const current = this._localLocks.get(lockKey);
                if (current && current.token === lockToken) {
                    this._localLocks.delete(lockKey);
                }
            }
        });
    }

    /** Clear in-memory state (for tests) */
    reset() {
        this._localLocks.clear();
        this._localSequences.clear();
    }
}

export const defaultPortalDistributedLock = new RedisPortalDistributedLock();
export default defaultPortalDistributedLock;
