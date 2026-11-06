import crypto from 'crypto';
import redisProxy from '../src/config/redis.js';

/**
 * Enterprise Contact Distributed Lock & Idempotency Service
 * Phase 4.7 Concurrency Hardening
 *
 * Prevents race conditions, TOCTOU vulnerabilities, and concurrent merge mutations
 * across any duplicate/master contact records.
 */

const LUA_RELEASE_LOCK = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

const LUA_RENEW_LOCK = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("expire", KEYS[1], tonumber(ARGV[2]))
else
    return 0
end
`;

export class ContactLockService {
    /**
     * Acquire distributed locks on an array of contact IDs in deterministic sorted order.
     *
     * @param {Array<string|mongoose.Types.ObjectId>} contactIds - Contacts to lock
     * @param {Object} [options]
     * @param {number} [options.ttlMs=30000] - Lock TTL in milliseconds
     * @param {string} [options.ownershipToken] - Custom token or generated UUID
     * @returns {Promise<{ success: boolean, token: string, acquiredKeys: Array<string> }>}
     */
    static async acquireMergeLocks(contactIds, options = {}) {
        const ttlMs = options.ttlMs || 30000;
        const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
        const token = options.ownershipToken || `token_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

        // Deterministic sorting to prevent deadlocks when concurrent processes lock intersecting sets
        const sortedUniqueIds = [...new Set(contactIds.map(id => id.toString()))].sort();
        const acquiredKeys = [];

        for (const cId of sortedUniqueIds) {
            const lockKey = `lock:contact_merge:${cId}`;
            try {
                // SET NX PX ms
                const res = await redisProxy.set(lockKey, token, 'NX', 'PX', ttlMs);
                if (res === 'OK') {
                    acquiredKeys.push(lockKey);
                } else {
                    // Contention detected: rollback partially acquired locks
                    console.warn(`[ContactLock] Contention on ${lockKey}. Rolling back ${acquiredKeys.length} acquired locks.`);
                    await this.releaseMergeLocks(acquiredKeys, token, true);
                    const error = new Error(`Contact ${cId} is currently locked by an active merge operation.`);
                    error.code = 'CONTACT_LOCKED_CONFLICT';
                    error.statusCode = 409;
                    error.conflictingContactId = cId;
                    throw error;
                }
            } catch (err) {
                if (acquiredKeys.length > 0) {
                    await this.releaseMergeLocks(acquiredKeys, token, true);
                }
                throw err;
            }
        }

        return { success: true, token, acquiredKeys, sortedContactIds: sortedUniqueIds };
    }

    /**
     * Release distributed merge locks with verified ownership token.
     *
     * @param {Array<string>} lockKeysOrContactIds - Array of keys or contact IDs
     * @param {string} token - The ownership token used to acquire
     * @param {boolean} [areFullKeys=false] - If true, arguments are already `lock:contact_merge:...`
     */
    static async releaseMergeLocks(lockKeysOrContactIds, token, areFullKeys = false) {
        if (!lockKeysOrContactIds || lockKeysOrContactIds.length === 0 || !token) return;

        for (const item of lockKeysOrContactIds) {
            const lockKey = areFullKeys ? item : `lock:contact_merge:${item.toString()}`;
            try {
                if (typeof redisProxy.eval === 'function') {
                    await redisProxy.eval(LUA_RELEASE_LOCK, 1, lockKey, token);
                } else {
                    const currentVal = await redisProxy.get(lockKey);
                    if (currentVal === token) {
                        await redisProxy.del(lockKey);
                    }
                }
            } catch (err) {
                console.warn(`[ContactLock] Error releasing lock ${lockKey}:`, err.message);
            }
        }
    }

    /**
     * Check if an operation has already been executed via idempotency key.
     *
     * @param {string} idempotencyKey
     * @returns {Promise<{ isDuplicate: boolean, cachedResult?: any }>}
     */
    static async checkIdempotency(idempotencyKey) {
        if (!idempotencyKey) return { isDuplicate: false };
        const key = `idempotency:reconciliation:${idempotencyKey}`;
        try {
            const raw = await redisProxy.get(key);
            if (raw) {
                return { isDuplicate: true, cachedResult: JSON.parse(raw) };
            }
        } catch (_) {}
        return { isDuplicate: false };
    }

    /**
     * Save successful operation result under idempotency key with TTL.
     *
     * @param {string} idempotencyKey
     * @param {any} result
     * @param {number} [ttlSeconds=86400] - 24 hour default
     */
    static async recordIdempotency(idempotencyKey, result, ttlSeconds = 86400) {
        if (!idempotencyKey) return;
        const key = `idempotency:reconciliation:${idempotencyKey}`;
        try {
            await redisProxy.set(key, JSON.stringify(result), 'EX', ttlSeconds);
        } catch (_) {}
    }
}

export default ContactLockService;
