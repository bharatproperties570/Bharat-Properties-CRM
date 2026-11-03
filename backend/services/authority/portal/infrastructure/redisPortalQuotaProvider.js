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
        this._hourCounts = new Map();
        this._dailyCounts = new Map();
    }

    /**
     * Reserves quota for a single physical request.
     * Enforces rate policy authority-wide across all tenants, with IST day/hour rollover.
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
        const maxPerHour = Number(pol.maxRequestsPerHour);
        const maxPerDay = Number(pol.maxRequestsPerDay);

        const hasValidPolicy = (Number.isFinite(minIntervalMs) && minIntervalMs > 0) &&
            ((Number.isFinite(maxPerMin) && maxPerMin > 0) || (Number.isFinite(maxPerHour) && maxPerHour > 0) || (Number.isFinite(maxPerDay) && maxPerDay > 0));

        if (!hasValidPolicy) {
            return Object.freeze({
                allowed: false,
                reason: 'QUOTA_POLICY_MISSING'
            });
        }

        // Authority-wide quota reservation: shared globally across all tenants for this authority code
        const scopeKey = code;
        const reservationId = `res_${code.toLowerCase()}_${crypto.randomUUID()}`;

        // Compute Indian Standard Time (Asia/Kolkata) day and hour windows
        const istString = new Date(nowMs).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' });
        const dayKey = istString.slice(0, 10); // 'YYYY-MM-DD'
        const hourKey = istString.slice(0, 13).replace(' ', 'T'); // 'YYYY-MM-DDTHH'
        const minuteKey = Math.floor(nowMs / 60000);

        // Production path: Redis atomic reservation with Lua script
        if (this.redisClient) {
            const isReady = this.redisClient.status === 'ready' || (typeof this.redisClient.ping === 'function');
            if (isReady && typeof this.redisClient.eval === 'function') {
                try {
                    const lastKey = `quota:last:${scopeKey}`;
                    const minKey = `quota:min:${scopeKey}:${minuteKey}`;
                    const hrKey = `quota:hour:${scopeKey}:${hourKey}`;
                    const dyKey = `quota:day:${scopeKey}:${dayKey}`;

                    const luaScript = `
                        local lastReq = redis.call('get', KEYS[1])
                        local nowMs = tonumber(ARGV[1])
                        local minIntervalMs = tonumber(ARGV[2])
                        local maxPerMin = tonumber(ARGV[3])
                        local maxPerHour = tonumber(ARGV[4])
                        local maxPerDay = tonumber(ARGV[5])

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

                        if maxPerHour > 0 then
                            local curHour = tonumber(redis.call('get', KEYS[3]) or '0')
                            if curHour >= maxPerHour then
                                return {0, 'PER_HOUR_LIMIT_EXCEEDED', '0'}
                            end
                        end

                        if maxPerDay > 0 then
                            local curDay = tonumber(redis.call('get', KEYS[4]) or '0')
                            if curDay >= maxPerDay then
                                return {0, 'DAILY_LIMIT_EXCEEDED', '0'}
                            end
                        end

                        redis.call('set', KEYS[1], tostring(nowMs), 'PX', minIntervalMs * 2)
                        if maxPerMin > 0 then
                            redis.call('incr', KEYS[2])
                            redis.call('expire', KEYS[2], 90)
                        end
                        if maxPerHour > 0 then
                            redis.call('incr', KEYS[3])
                            redis.call('expire', KEYS[3], 7200)
                        end
                        if maxPerDay > 0 then
                            redis.call('incr', KEYS[4])
                            redis.call('expire', KEYS[4], 90000)
                        end

                        return {1, 'OK', '0'}
                    `;

                    const res = await this.redisClient.eval(
                        luaScript,
                        4,
                        lastKey,
                        minKey,
                        hrKey,
                        dyKey,
                        String(nowMs),
                        String(minIntervalMs),
                        String(maxPerMin || 0),
                        String(maxPerHour || 0),
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

        const memMinKey = `${scopeKey}:${minuteKey}`;
        const currentMinuteCount = this._minuteCounts.get(memMinKey) || 0;
        if (Number.isFinite(maxPerMin) && maxPerMin > 0 && currentMinuteCount >= maxPerMin) {
            return Object.freeze({
                allowed: false,
                reason: 'PER_MINUTE_LIMIT_EXCEEDED'
            });
        }

        const memHourKey = `${scopeKey}:${hourKey}`;
        const currentHourCount = this._hourCounts.get(memHourKey) || 0;
        if (Number.isFinite(maxPerHour) && maxPerHour > 0 && currentHourCount >= maxPerHour) {
            return Object.freeze({
                allowed: false,
                reason: 'PER_HOUR_LIMIT_EXCEEDED'
            });
        }

        const memDayKey = `${scopeKey}:${dayKey}`;
        const currentDayCount = this._dailyCounts.get(memDayKey) || 0;
        if (Number.isFinite(maxPerDay) && maxPerDay > 0 && currentDayCount >= maxPerDay) {
            return Object.freeze({
                allowed: false,
                reason: 'DAILY_LIMIT_EXCEEDED'
            });
        }

        this._lastRequestAt.set(scopeKey, nowMs);
        this._minuteCounts.set(memMinKey, currentMinuteCount + 1);
        this._hourCounts.set(memHourKey, currentHourCount + 1);
        this._dailyCounts.set(memDayKey, currentDayCount + 1);

        return Object.freeze({
            allowed: true,
            reservationId
        });
    }

    /** Reset state (for tests) */
    reset() {
        this._lastRequestAt.clear();
        this._minuteCounts.clear();
        this._hourCounts.clear();
        this._dailyCounts.clear();
    }
}

export const defaultPortalQuotaProvider = new RedisPortalQuotaProvider();
export default defaultPortalQuotaProvider;
