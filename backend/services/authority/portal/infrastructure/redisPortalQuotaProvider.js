/**
 * Redis / In-Memory Portal Quota Provider
 *
 * Enforces authority-defined rate policies and daily quotas.
 * Ensures minimum physical request spacing and per-minute / per-day limits.
 */

import crypto from 'node:crypto';

export class RedisPortalQuotaProvider {
    constructor(redisClient = null) {
        this.redisClient = redisClient;
        this._lastRequestAt = new Map();
        this._minuteCounts = new Map();
        this._dailyCounts = new Map();
    }

    /**
     * Reserves quota for a single physical request.
     * @param {object} args
     * @param {string} args.authorityCode
     * @param {string} args.searchKey
     * @param {object} args.policy
     * @param {Date} [args.at]
     * @returns {Promise<{ allowed: boolean, reason?: string, reservationId?: string }>}
     */
    async reserve({ authorityCode, searchKey, policy = {}, at = new Date() } = {}) {
        const code = String(authorityCode || '').trim().toUpperCase();
        const nowMs = at instanceof Date ? at.getTime() : Date.now();

        const minIntervalMs = Number(policy.minimumIntervalMs) || 15000;
        const maxPerMin = Number(policy.maxRequestsPerMinute) || 2;
        const maxPerDay = Number(policy.maxRequestsPerDay) || 500;

        // 1. Check minimum interval spacing
        const lastReq = this._lastRequestAt.get(code) || 0;
        if (nowMs - lastReq < minIntervalMs) {
            return Object.freeze({
                allowed: false,
                reason: 'MINIMUM_INTERVAL_VIOLATED',
                retryAfterMs: minIntervalMs - (nowMs - lastReq)
            });
        }

        // 2. Check minute window limit
        const minuteKey = `${code}:${Math.floor(nowMs / 60000)}`;
        const currentMinuteCount = this._minuteCounts.get(minuteKey) || 0;
        if (currentMinuteCount >= maxPerMin) {
            return Object.freeze({
                allowed: false,
                reason: 'PER_MINUTE_LIMIT_EXCEEDED'
            });
        }

        // 3. Check daily window limit
        const dayKey = `${code}:${new Date(nowMs).toISOString().slice(0, 10)}`;
        const currentDayCount = this._dailyCounts.get(dayKey) || 0;
        if (currentDayCount >= maxPerDay) {
            return Object.freeze({
                allowed: false,
                reason: 'DAILY_LIMIT_EXCEEDED'
            });
        }

        // 4. Reserve and increment counters
        this._lastRequestAt.set(code, nowMs);
        this._minuteCounts.set(minuteKey, currentMinuteCount + 1);
        this._dailyCounts.set(dayKey, currentDayCount + 1);

        const reservationId = `res_${code.toLowerCase()}_${crypto.randomUUID()}`;

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
