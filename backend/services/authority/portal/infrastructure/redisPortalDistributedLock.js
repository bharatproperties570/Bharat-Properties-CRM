/**
 * Redis / In-Memory Portal Distributed Lock Provider
 *
 * Ensures mutually exclusive access to an authority portal resource or search key.
 * Uses Redis distributed locking when available, with safe failover for tests.
 */

import crypto from 'node:crypto';

export class RedisPortalDistributedLock {
    constructor(redisClient = null) {
        this.redisClient = redisClient;
        this._localLocks = new Map();
    }

    /**
     * Acquire a distributed lock.
     * @param {object} args
     * @param {string} args.key
     * @param {string} [args.searchKey]
     * @param {number} [args.ttlMs=30000]
     * @returns {Promise<{ acquired: boolean, release: Function }>}
     */
    async acquire({ key, searchKey, ttlMs = 30000 } = {}) {
        if (!key) {
            throw new Error('PORTAL_LOCK_KEY_REQUIRED: Key is required to acquire distributed lock.');
        }

        const lockToken = crypto.randomUUID();
        const lockKey = searchKey ? `${key}:${searchKey}` : key;

        if (this.redisClient && this.redisClient.status === 'ready') {
            try {
                // Redis SET key token NX PX ttlMs
                const res = await this.redisClient.set(lockKey, lockToken, 'PX', ttlMs, 'NX');
                if (res !== 'OK') {
                    return Object.freeze({
                        acquired: false,
                        release: async () => {}
                    });
                }

                return Object.freeze({
                    acquired: true,
                    release: async () => {
                        try {
                            // Lua script for safe unlock
                            const script = `
                                if redis.call("get", KEYS[1]) == ARGV[1] then
                                    return redis.call("del", KEYS[1])
                                else
                                    return 0
                                end
                            `;
                            await this.redisClient.eval(script, 1, lockKey, lockToken);
                        } catch {
                            // Suppress errors during release
                        }
                    }
                });
            } catch {
                // Fall back to local locks if Redis errors
            }
        }

        // Local In-Memory Lock (for tests or single-instance without Redis)
        const now = Date.now();
        const existing = this._localLocks.get(lockKey);
        if (existing && existing.expiresAt > now) {
            return Object.freeze({
                acquired: false,
                release: async () => {}
            });
        }

        this._localLocks.set(lockKey, {
            token: lockToken,
            expiresAt: now + ttlMs
        });

        return Object.freeze({
            acquired: true,
            release: async () => {
                const current = this._localLocks.get(lockKey);
                if (current && current.token === lockToken) {
                    this._localLocks.delete(lockKey);
                }
            }
        });
    }
}

export const defaultPortalDistributedLock = new RedisPortalDistributedLock();
export default defaultPortalDistributedLock;
