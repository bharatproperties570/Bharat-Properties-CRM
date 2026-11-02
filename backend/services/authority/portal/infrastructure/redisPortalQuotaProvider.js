/**
 * Redis / In-Memory Portal Quota Provider
 *
 * Enforces authority-defined rate policies and daily quotas.
 * In production mode, strictly uses atomic Redis reservation (fail-closed).
 * Eliminates invented defaults; requires an explicit approved policy.
 */

import crypto from 'node:crypto';

export class RedisPortalQuotaProvider {
    constructor(redisClient = null, options = {}) {
        this.redisClient = redisClient;
        const isRunningInTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || process.argv.some(arg => String(arg).includes('test'));
        this.testMode = options.testMode ?? isRunningInTest;
        this.allowInMemoryFallback = Boolean(options.allowInMemoryFallback ?? this.testMode);
        if (process.env.NODE_ENV === 'production') {
            this.allowInMemoryFallback = false;
        }
        this._lastRequestAt = new Map();
        this._minuteCounts = new Map();
        this._dailyCounts = new Map();
    }

    /**
     * Reserves quota for a single physical request.
     * @param {object} args
     * @param {string} args.authorityCode
     * @param {string} [args.searchKey]
     * @param {string} [args.tenantId]
     * @param {object} args.policy Authority-defined rate policy
     * @param {Date} [args.at]
     * @returns {Promise<{ allowed: boolean, reason?: string, reservationId?: string, retryAfterMs?: number }>}
     */
    async reserve({ authorityCode, searchKey, tenantId, policy = {}, at = new Date() } = {}) {
        const code = String(authorityCode || '').trim().toUpperCase();
        const nowMs = at instanceof Date ? at.getTime() : Date.now();

        // Strict: policy must be explicitly configured without invented defaults
        const pol = (policy && typeof policy === 'object') ? policy : {};
        const minIntervalMs = Number(pol.minimumIntervalMs || pol.minIntervalMs);
        const maxPerMin = Number(pol.maxRequestsPerMinute);
        const maxPerDay = Number(pol.maxRequestsPerDay);

        const hasValidPolicy = (Number.isFinite(minIntervalMs) && minIntervalMs > 0) &&
            ((Number.isFinite(maxPerMin) && maxPerMin > 0) || (Number.isFinite(maxPerDay) && maxPerDay > 0));

        if (!hasValidPolicy) {
            return Object.freeze({
                allowed: false,
                reason: 'QUOTA_POLICY_MISSING'
            });
        }

        const scopeKey = tenantId ? `${code}:${tenantId}` : code;
        const reservationId = `res_${code.toLowerCase()}_${crypto.randomUUID()}`;

        // Production path: Redis atomic reservation with Lua script
        if (this.redisClient) {
            const isReady = this.redisClient.status === 'ready' || (typeof this.redisClient.ping === 'function');
            if (isReady && typeof this.redisClient.eval === 'function') {
                try {
                    const lastKey = `quota:last:${scopeKey}`;
                    const minKey = `quota:min:${scopeKey}:${Math.floor(nowMs / 60000)}`;
                    const dayKey = `quota:day:${scopeKey}:${new Date(nowMs).toISOString().slice(0, 10)}`;

                    const luaScript = `
                        local lastReq = redis.call('get', KEYS[1])
                        local nowMs = tonumber(ARGV[1])
                        local minIntervalMs = tonumber(ARGV[2])
                        local maxPerMin = tonumber(ARGV[3])
                        local maxPerDay = tonumber(ARGV[4])

                        if lastReq then
                            local diff = nowMs - tonumber(lastReq)
                            if diff < minIntervalMs then
                                return {0, 'MINIMUM_INTERVAL_VIOLATED', tostring(minIntervalMs - diff)}
                            end
                        end

                        if maxPerMin > 0 then
                            local curMin = tonumber(redis.call('get', KEYS[2]) or '0')
                            if curMin >= maxPerMin then
                                return {0, 'PER_MINUTE_LIMIT_EXCEEDED', '0'}
                            end
                        end

                        if maxPerDay > 0 then
                            local curDay = tonumber(redis.call('get', KEYS[3]) or '0')
                            if curDay >= maxPerDay then
                                return {0, 'DAILY_LIMIT_EXCEEDED', '0'}
                            end
                        end

                        redis.call('set', KEYS[1], tostring(nowMs), 'PX', minIntervalMs * 2)
                        if maxPerMin > 0 then
                            redis.call('incr', KEYS[2])
                            redis.call('expire', KEYS[2], 90)
                        end
                        if maxPerDay > 0 then
                            redis.call('incr', KEYS[3])
                            redis.call('expire', KEYS[3], 90000)
                        end

                        return {1, 'OK', '0'}
                    `;

                    const res = await this.redisClient.eval(
                        luaScript,
                        3,
                        lastKey,
                        minKey,
                        dayKey,
                        String(nowMs),
                        String(minIntervalMs),
                        String(maxPerMin || 0),
                        String(maxPerDay || 0)
                    );

                    if (Array.isArray(res) && res[0] === 1) {
                        return Object.freeze({
                            allowed: true,
                            reservationId
                        });
                    }

                    const reason = (Array.isArray(res) && res[1]) ? res[1] : 'QUOTA_DENIED';
                    const retryAfterMs = (Array.isArray(res) && res[2]) ? Number(res[2]) : 0;
                    return Object.freeze({
                        allowed: false,
                        reason,
                        retryAfterMs
                    });
                } catch (redisErr) {
                    if (!this.allowInMemoryFallback) {
                        const err = new Error(`PORTAL_QUOTA_REDIS_UNAVAILABLE: Redis quota reservation failed: ${redisErr.message}`);
                        err.code = 'PORTAL_QUOTA_REDIS_UNAVAILABLE';
                        err.cause = redisErr;
                        throw err;
                    }
                }
            } else if (!this.allowInMemoryFallback) {
                const err = new Error('PORTAL_QUOTA_REDIS_UNAVAILABLE: Redis client is not connected and in-memory fallback is disabled in production.');
                err.code = 'PORTAL_QUOTA_REDIS_UNAVAILABLE';
                throw err;
            }
        } else if (!this.allowInMemoryFallback) {
            const err = new Error('PORTAL_QUOTA_REDIS_UNAVAILABLE: No Redis client configured and in-memory fallback is disabled in production.');
            err.code = 'PORTAL_QUOTA_REDIS_UNAVAILABLE';
            throw err;
        }

        // Local In-Memory Fallback (for unit tests only)
        const lastReq = this._lastRequestAt.get(scopeKey) || 0;
        if (nowMs - lastReq < minIntervalMs) {
            return Object.freeze({
                allowed: false,
                reason: 'MINIMUM_INTERVAL_VIOLATED',
                retryAfterMs: minIntervalMs - (nowMs - lastReq)
            });
        }

        const minuteKey = `${scopeKey}:${Math.floor(nowMs / 60000)}`;
        const currentMinuteCount = this._minuteCounts.get(minuteKey) || 0;
        if (Number.isFinite(maxPerMin) && maxPerMin > 0 && currentMinuteCount >= maxPerMin) {
            return Object.freeze({
                allowed: false,
                reason: 'PER_MINUTE_LIMIT_EXCEEDED'
            });
        }

        const dayKey = `${scopeKey}:${new Date(nowMs).toISOString().slice(0, 10)}`;
        const currentDayCount = this._dailyCounts.get(dayKey) || 0;
        if (Number.isFinite(maxPerDay) && maxPerDay > 0 && currentDayCount >= maxPerDay) {
            return Object.freeze({
                allowed: false,
                reason: 'DAILY_LIMIT_EXCEEDED'
            });
        }

        this._lastRequestAt.set(scopeKey, nowMs);
        this._minuteCounts.set(minuteKey, currentMinuteCount + 1);
        this._dailyCounts.set(dayKey, currentDayCount + 1);

        return Object.freeze({
            allowed: true,
            reservationId
        });
    }

    /** Reset state (for tests) */
    reset() {
        this._lastRequestAt.clear();
        this._minuteCounts.clear();
        this._dailyCounts.clear();
    }
}

export const defaultPortalQuotaProvider = new RedisPortalQuotaProvider();
export default defaultPortalQuotaProvider;
