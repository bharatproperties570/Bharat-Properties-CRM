import crypto from 'crypto';
import redisClient, { isRedisOnline } from '../src/config/redis.js';

class RedisUnavailableError extends Error {
    constructor(message = 'Redis is unavailable for locking') {
        super(message);
        this.name = 'RedisUnavailableError';
    }
}

class LockAcquisitionError extends Error {
    constructor(key, message = 'Failed to acquire lock') {
        super(`${message} for key: ${key}`);
        this.name = 'LockAcquisitionError';
        this.key = key;
    }
}

class LockReleaseError extends Error {
    constructor(key, message = 'Failed to release lock (ownership mismatch or expired)') {
        super(`${message} for key: ${key}`);
        this.name = 'LockReleaseError';
        this.key = key;
    }
}

const DEFAULT_TTL_MS = 10000;
const MIN_TTL_MS = 1000;
const MAX_TTL_MS = 60000;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
`;

// In-memory lock store for mock mode fallback
const mockLocks = new Map();

/**
 * Acquire a distributed lock.
 * @param {string} key - The lock key.
 * @param {Object} options - { ttl: number (ms) }
 * @returns {Promise<{ key: string, token: string }>} - The lock handle
 */
export const acquireLock = async (key, options = {}) => {
    if (!isRedisOnline && !redisClient.isMock) {
        throw new RedisUnavailableError();
    }

    let ttl = options.ttl || DEFAULT_TTL_MS;
    if (ttl < MIN_TTL_MS) ttl = MIN_TTL_MS;
    if (ttl > MAX_TTL_MS) ttl = MAX_TTL_MS;

    const token = crypto.randomBytes(16).toString('hex');

    if (redisClient.isMock) {
        const existing = mockLocks.get(key);
        if (existing && existing.expiresAt > Date.now()) {
            throw new LockAcquisitionError(key, 'Lock is currently held by another owner');
        }
        const timeoutId = setTimeout(() => {
            mockLocks.delete(key);
        }, ttl);
        mockLocks.set(key, { token, expiresAt: Date.now() + ttl, timeoutId });
        return { key, token };
    }

    try {
        const result = await redisClient.set(key, token, 'NX', 'PX', ttl);
        if (result !== 'OK') {
            throw new LockAcquisitionError(key, 'Lock is currently held by another owner');
        }
        return { key, token };
    } catch (error) {
        if (error instanceof LockAcquisitionError) throw error;
        throw new RedisUnavailableError(`Redis connection failed while acquiring lock: ${error.message}`);
    }
};

/**
 * Safely release a distributed lock using its ownership token.
 * @param {Object} lockHandle - { key: string, token: string }
 * @returns {Promise<boolean>}
 */
export const releaseLock = async (lockHandle) => {
    if (!lockHandle || !lockHandle.key || !lockHandle.token) {
        throw new Error('Invalid lock handle provided to releaseLock');
    }

    if (redisClient.isMock) {
        const existing = mockLocks.get(lockHandle.key);
        if (!existing || existing.token !== lockHandle.token) {
            throw new LockReleaseError(lockHandle.key);
        }
        clearTimeout(existing.timeoutId);
        mockLocks.delete(lockHandle.key);
        return true;
    }

    if (!isRedisOnline) {
        console.warn(`[RedisLock] Cannot release lock ${lockHandle.key}, Redis is offline.`);
        return false;
    }

    try {
        const result = await redisClient.eval(RELEASE_SCRIPT, 1, lockHandle.key, lockHandle.token);
        if (result === 0) {
            throw new LockReleaseError(lockHandle.key);
        }
        return true;
    } catch (error) {
        if (error instanceof LockReleaseError) throw error;
        console.error(`[RedisLock] Error executing release script for ${lockHandle.key}:`, error);
        return false;
    }
};

/**
 * Safely execute a callback within a distributed lock.
 * @param {string} key 
 * @param {Object} options 
 * @param {Function} fn 
 */
export const withLock = async (key, options, fn) => {
    let lock = null;
    try {
        lock = await acquireLock(key, options);
        return await fn(lock);
    } finally {
        if (lock) {
            try {
                await releaseLock(lock);
            } catch (err) {
                if (err instanceof LockReleaseError) {
                    console.warn(`[RedisLock] Ownership mismatch during release of ${key}. Lock may have expired.`);
                }
            }
        }
    }
};

export { RedisUnavailableError, LockAcquisitionError, LockReleaseError };
