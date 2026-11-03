/**
 * Redis / In-Memory Portal Quota Provider
 *
 * Enforces authority-defined rate policies and daily quotas.
 * In production mode, strictly uses atomic Redis reservation (fail-closed).
 * Enforces authority-wide limits, Asia/Kolkata day/hour rollover, and canonical policy pinning.
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
        this._canonicalPolicies = new Map();
    }

    /**
     * Explicitly set or rotate the authority-global canonical rate policy.
     * This is the trusted anchor independently reviewed/approved by admin.
     * Stored in Redis hash without TTL, and in memory.
     *
     * @param {object} args
     * @param {string} args.authorityCode
     * @param {object} args.policy
     * @param {string} [args.approvedBy]
     * @param {number|string} [args.policyVersion=1]
     */
    async setCanonicalPolicy({ authorityCode, policy, approvedBy = 'system', policyVersion = 1 } = {}) {
        const code = String(authorityCode || '').trim().toUpperCase();
        if (!code) throw new Error('CANONICAL_POLICY_CODE_REQUIRED: Authority code is required.');
        const pol = (policy && typeof policy === 'object') ? policy : {};
        const ref = String(pol.policyReference || pol.policySource || '').trim();
        if (!ref) throw new Error('CANONICAL_POLICY_REF_REQUIRED: policyReference or policySource is required.');

        const minIntervalMs = Number(pol.minimumIntervalMs || pol.minIntervalMs || 0);
        const maxPerMin = Number(pol.maxRequestsPerMinute || 0);
        const maxPerHour = Number(pol.maxRequestsPerHour || 0);
        const maxPerDay = Number(pol.maxRequestsPerDay || 0);
        const version = String(policyVersion || 1);

        const contentHash = crypto.createHash('sha256')
            .update(JSON.stringify({ ref, minIntervalMs, maxPerMin, maxPerHour, maxPerDay }))
            .digest('hex');

        const canonicalRecord = {
            ref,
            version,
            contentHash,
            minIntervalMs,
            maxPerMin,
            maxPerHour,
            maxPerDay,
            approvedBy: String(approvedBy),
            updatedAt: Date.now()
        };

        this._canonicalPolicies.set(code, canonicalRecord);

        if (this.redisClient) {
            const isReady = this.redisClient.status === 'ready' || (typeof this.redisClient.ping === 'function');
            if (isReady && typeof this.redisClient.hset === 'function') {
                const canKey = `quota:canonical:${code}`;
                await this.redisClient.hset(
                    canKey,
                    'ref', ref,
                    'version', version,
                    'contentHash', contentHash,
                    'minIntervalMs', String(minIntervalMs),
                    'maxPerMin', String(maxPerMin),
                    'maxPerHour', String(maxPerHour),
                    'maxPerDay', String(maxPerDay),
                    'approvedBy', String(approvedBy),
                    'updatedAt', String(canonicalRecord.updatedAt)
                );
                if (typeof this.redisClient.persist === 'function') {
                    await this.redisClient.persist(canKey);
                }
            }
        }

        return canonicalRecord;
    }

    /**
     * Reserves quota for a single physical request.
     * Enforces rate policy authority-wide across all tenants, with IST day/hour rollover
     * and canonical policy enforcement.
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
        const minIntervalMs = Number(pol.minimumIntervalMs || pol.minIntervalMs || 0);
        const maxPerMin = Number(pol.maxRequestsPerMinute || 0);
        const maxPerHour = Number(pol.maxRequestsPerHour || 0);
        const maxPerDay = Number(pol.maxRequestsPerDay || 0);
        const policyRef = String(pol.policyReference || pol.policySource || '').trim();
        const clientVersion = pol.version !== undefined && pol.version !== null && pol.version !== '' ? String(pol.version) : '';
        const clientHash = pol.contentHash ? String(pol.contentHash) : '';

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
                    const canKey = `quota:canonical:${scopeKey}`;

                    const luaScript = `
                        local lastReq = redis.call('get', KEYS[1])
                        local nowMs = tonumber(ARGV[1])
                        local minIntervalMs = tonumber(ARGV[2])
                        local maxPerMin = tonumber(ARGV[3])
                        local maxPerHour = tonumber(ARGV[4])
                        local maxPerDay = tonumber(ARGV[5])
                        local policyRef = ARGV[6]
                        local clientHash = ARGV[7]
                        local clientVersion = ARGV[8]

                        -- Canonical authority-global policy verification (Phase 4)
                        local canRef = redis.call('hget', KEYS[5], 'ref')
                        if not canRef or canRef == '' then
                            return {0, 'CANONICAL_POLICY_MISSING', '0'}
                        end

                        local canMin = tonumber(redis.call('hget', KEYS[5], 'maxPerMin') or '-1')
                        local canHour = tonumber(redis.call('hget', KEYS[5], 'maxPerHour') or '-1')
                        local canDay = tonumber(redis.call('hget', KEYS[5], 'maxPerDay') or '-1')
                        local canInterval = tonumber(redis.call('hget', KEYS[5], 'minIntervalMs') or '-1')

                        if canInterval < 0 or (canMin < 0 and canHour < 0 and canDay < 0) then
                            return {0, 'CANONICAL_POLICY_MALFORMED', '0'}
                        end

                        if canRef ~= policyRef then
                            return {0, 'POLICY_VERSION_MISMATCH', '0'}
                        end

                        local canHash = redis.call('hget', KEYS[5], 'contentHash')
                        if canHash and canHash ~= '' and clientHash and clientHash ~= '' and canHash ~= clientHash then
                            return {0, 'POLICY_HASH_MISMATCH', '0'}
                        end

                        local canVersion = redis.call('hget', KEYS[5], 'version')
                        if canVersion and canVersion ~= '' and clientVersion and clientVersion ~= '' and canVersion ~= clientVersion then
                            return {0, 'POLICY_VERSION_MISMATCH', '0'}
                        end

                        if canMin > 0 and maxPerMin > canMin then
                            return {0, 'RATE_LIMIT_ELEVATION_REJECTED', '0'}
                        end
                        if canHour > 0 and maxPerHour > canHour then
                            return {0, 'RATE_LIMIT_ELEVATION_REJECTED', '0'}
                        end
                        if canDay > 0 and maxPerDay > canDay then
                            return {0, 'RATE_LIMIT_ELEVATION_REJECTED', '0'}
                        end
                        if canInterval > 0 and minIntervalMs < canInterval then
                            return {0, 'RATE_LIMIT_ELEVATION_REJECTED', '0'}
                        end

                        local effInterval = canInterval > 0 and canInterval or minIntervalMs
                        local effMin = canMin > 0 and canMin or maxPerMin
                        local effHour = canHour > 0 and canHour or maxPerHour
                        local effDay = canDay > 0 and canDay or maxPerDay

                        if lastReq then
                            local diff = nowMs - tonumber(lastReq)
                            if diff < effInterval then
                                return {0, 'MINIMUM_INTERVAL_VIOLATED', tostring(effInterval - diff)}
                            end
                        end

                        if effMin > 0 then
                            local curMin = tonumber(redis.call('get', KEYS[2]) or '0')
                            if curMin >= effMin then
                                return {0, 'PER_MINUTE_LIMIT_EXCEEDED', '0'}
                            end
                        end

                        if effHour > 0 then
                            local curHour = tonumber(redis.call('get', KEYS[3]) or '0')
                            if curHour >= effHour then
                                return {0, 'PER_HOUR_LIMIT_EXCEEDED', '0'}
                            end
                        end

                        if effDay > 0 then
                            local curDay = tonumber(redis.call('get', KEYS[4]) or '0')
                            if curDay >= effDay then
                                return {0, 'DAILY_LIMIT_EXCEEDED', '0'}
                            end
                        end

                        redis.call('set', KEYS[1], tostring(nowMs), 'PX', effInterval * 2)
                        if effMin > 0 then
                            redis.call('incr', KEYS[2])
                            redis.call('expire', KEYS[2], 90)
                        end
                        if effHour > 0 then
                            redis.call('incr', KEYS[3])
                            redis.call('expire', KEYS[3], 7200)
                        end
                        if effDay > 0 then
                            redis.call('incr', KEYS[4])
                            redis.call('expire', KEYS[4], 172800)
                        end

                        return {1, 'OK', '0'}
                    `;

                    const res = await this.redisClient.eval(
                        luaScript,
                        5,
                        lastKey,
                        minKey,
                        hrKey,
                        dyKey,
                        canKey,
                        String(nowMs),
                        String(minIntervalMs),
                        String(maxPerMin || 0),
                        String(maxPerHour || 0),
                        String(maxPerDay || 0),
                        policyRef,
                        clientHash,
                        clientVersion
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
        const canonical = this._canonicalPolicies.get(scopeKey);
        if (!canonical) {
            return Object.freeze({
                allowed: false,
                reason: 'CANONICAL_POLICY_MISSING'
            });
        }
        if (!canonical.ref || canonical.minIntervalMs < 0 || (canonical.maxPerMin < 0 && canonical.maxPerHour < 0 && canonical.maxPerDay < 0)) {
            return Object.freeze({
                allowed: false,
                reason: 'CANONICAL_POLICY_MALFORMED'
            });
        }
        if (canonical.ref !== policyRef) {
            return Object.freeze({
                allowed: false,
                reason: 'POLICY_VERSION_MISMATCH'
            });
        }
        if (canonical.contentHash && clientHash && canonical.contentHash !== clientHash) {
            return Object.freeze({
                allowed: false,
                reason: 'POLICY_HASH_MISMATCH'
            });
        }
        if (clientVersion && canonical.version && clientVersion !== String(canonical.version)) {
            return Object.freeze({
                allowed: false,
                reason: 'POLICY_VERSION_MISMATCH'
            });
        }
        if (canonical.maxPerMin > 0 && maxPerMin > canonical.maxPerMin) {
            return Object.freeze({
                allowed: false,
                reason: 'RATE_LIMIT_ELEVATION_REJECTED'
            });
        }
        if (canonical.maxPerHour > 0 && maxPerHour > canonical.maxPerHour) {
            return Object.freeze({
                allowed: false,
                reason: 'RATE_LIMIT_ELEVATION_REJECTED'
            });
        }
        if (canonical.maxPerDay > 0 && maxPerDay > canonical.maxPerDay) {
            return Object.freeze({
                allowed: false,
                reason: 'RATE_LIMIT_ELEVATION_REJECTED'
            });
        }
        if (canonical.minIntervalMs > 0 && minIntervalMs < canonical.minIntervalMs) {
            return Object.freeze({
                allowed: false,
                reason: 'RATE_LIMIT_ELEVATION_REJECTED'
            });
        }

        const effMin = canonical.maxPerMin > 0 ? canonical.maxPerMin : maxPerMin;
        const effHour = canonical.maxPerHour > 0 ? canonical.maxPerHour : maxPerHour;
        const effDay = canonical.maxPerDay > 0 ? canonical.maxPerDay : maxPerDay;
        const effInterval = canonical.minIntervalMs > 0 ? canonical.minIntervalMs : minIntervalMs;

        const lastReq = this._lastRequestAt.get(scopeKey);
        if (lastReq && (nowMs - lastReq) < effInterval) {
            return Object.freeze({
                allowed: false,
                reason: 'MINIMUM_INTERVAL_VIOLATED',
                retryAfterMs: effInterval - (nowMs - lastReq)
            });
        }

        const memMinKey = `${scopeKey}:${minuteKey}`;
        const currentMinCount = this._minuteCounts.get(memMinKey) || 0;
        if (Number.isFinite(effMin) && effMin > 0 && currentMinCount >= effMin) {
            return Object.freeze({
                allowed: false,
                reason: 'PER_MINUTE_LIMIT_EXCEEDED'
            });
        }

        const memHourKey = `${scopeKey}:${hourKey}`;
        const currentHourCount = this._hourCounts.get(memHourKey) || 0;
        if (Number.isFinite(effHour) && effHour > 0 && currentHourCount >= effHour) {
            return Object.freeze({
                allowed: false,
                reason: 'PER_HOUR_LIMIT_EXCEEDED'
            });
        }

        const memDayKey = `${scopeKey}:${dayKey}`;
        const currentDayCount = this._dailyCounts.get(memDayKey) || 0;
        if (Number.isFinite(effDay) && effDay > 0 && currentDayCount >= effDay) {
            return Object.freeze({
                allowed: false,
                reason: 'DAILY_LIMIT_EXCEEDED'
            });
        }

        this._lastRequestAt.set(scopeKey, nowMs);
        if (effMin > 0) this._minuteCounts.set(memMinKey, currentMinCount + 1);
        if (effHour > 0) this._hourCounts.set(memHourKey, currentHourCount + 1);
        if (effDay > 0) this._dailyCounts.set(memDayKey, currentDayCount + 1);

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
        this._canonicalPolicies.clear();
    }
}

export const defaultPortalQuotaProvider = new RedisPortalQuotaProvider();
export default defaultPortalQuotaProvider;
