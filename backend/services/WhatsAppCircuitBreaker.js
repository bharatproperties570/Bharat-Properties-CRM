/**
 * WhatsAppCircuitBreaker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise Durable Circuit Breaker for WhatsApp integrations.
 * Backed by Redis across all workers/PM2 instances with fail-closed semantics.
 *
 * States:
 *   - CLOSED: Normal operation. All messages allowed.
 *   - OPEN: Tripped. Dispatches are rejected or held; sessions remain logged in.
 *   - HALF_OPEN: Controlled probe mode. EXACTLY ONE worker is granted a probe reservation.
 */

import redisProxy from '../src/config/redis.js';

const TRIP_THRESHOLDS = {
    CONSECUTIVE_ACK_TIMEOUTS: 3,
    CONSECUTIVE_AUTH_FAILURES: 2,
    CONSECUTIVE_DISCONNECTS: 5,
    COOLOFF_PERIOD_MS: 5 * 60 * 1000, // 5 minutes cooloff before transitioning to HALF_OPEN
    PROBE_LOCK_TTL_SEC: 60 // 60 seconds lock for single probe execution
};

export class WhatsAppCircuitBreaker {
    static _key(id, suffix) {
        return `cb:wa:${String(id || 'default')}:${suffix}`;
    }

    static _getRedis() {
        if (!redisProxy) {
            throw new Error('CIRCUIT_BREAKER_STORAGE_UNAVAILABLE: Redis proxy is not initialized. Outbound dispatch blocked.');
        }
        return redisProxy;
    }

    /**
     * Checks if the circuit breaker is currently TRIPPED (OPEN) for the given integration.
     * FAIL-CLOSED: If Redis is unavailable, throws CIRCUIT_BREAKER_STORAGE_UNAVAILABLE.
     */
    static async isTripped(integrationId, options = {}) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');

            const currentState = (await redis.get(stateKey)) || 'CLOSED';

            if (currentState === 'OPEN') {
                const trippedAtRaw = await redis.get(trippedAtKey);
                const trippedAt = trippedAtRaw ? parseInt(trippedAtRaw, 10) : Date.now();
                const elapsed = Date.now() - trippedAt;

                // Check if cool-off period has expired to allow controlled HALF_OPEN probe
                if (elapsed >= TRIP_THRESHOLDS.COOLOFF_PERIOD_MS) {
                    // 🔒 Genuinely Controlled HALF_OPEN Probe:
                    // Only ONE worker across all instances may acquire the probe token.
                    const probeLockKey = this._key(id, 'probe_lock');
                    const workerToken = options.workerToken || `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    const lockAcquired = await redis.set(probeLockKey, workerToken, 'NX', 'EX', TRIP_THRESHOLDS.PROBE_LOCK_TTL_SEC);

                    if (lockAcquired === 'OK' || lockAcquired === true) {
                        await redis.set(stateKey, 'HALF_OPEN');
                        console.log(`[WhatsAppCircuitBreaker] Breaker for ${id} transitioning to HALF_OPEN probe mode. Probe reserved by token ${workerToken}.`);
                        return {
                            tripped: false,
                            state: 'HALF_OPEN',
                            isProbe: true,
                            probeToken: workerToken,
                            reason: null
                        };
                    } else {
                        // Another worker is actively executing the single probe
                        return {
                            tripped: true,
                            state: 'OPEN',
                            reason: 'Controlled probe already in flight by another worker. Holding dispatch.',
                            probeInFlight: true,
                            trippedAt
                        };
                    }
                }

                const reason = (await redis.get(reasonKey)) || 'Circuit breaker tripped due to consecutive WhatsApp line failures';
                return {
                    tripped: true,
                    state: 'OPEN',
                    reason,
                    trippedAt,
                    remainingCooloffSec: Math.max(0, Math.round((TRIP_THRESHOLDS.COOLOFF_PERIOD_MS - elapsed) / 1000))
                };
            }

            if (currentState === 'HALF_OPEN') {
                // If caller is NOT the designated probe worker, block dispatch until probe completes
                const probeLockKey = this._key(id, 'probe_lock');
                const activeToken = await redis.get(probeLockKey);
                if (options.probeToken && options.probeToken === activeToken) {
                    return { tripped: false, state: 'HALF_OPEN', isProbe: true, reason: null };
                }
                return {
                    tripped: true,
                    state: 'HALF_OPEN',
                    reason: 'Circuit breaker is in HALF_OPEN probe mode. Awaiting single test dispatch verification.',
                    probeInFlight: true
                };
            }

            return { tripped: false, state: 'CLOSED', reason: null };
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Durable storage read failure for ${id}:`, err.message);
            throw new Error(`CIRCUIT_BREAKER_STORAGE_UNAVAILABLE: Circuit breaker storage failure (${err.message}). Outbound dispatch blocked for safety.`);
        }
    }

    /**
     * Records a successful dispatch or ACK, clearing consecutive failure counters.
     * If currently HALF_OPEN, transitions breaker back to CLOSED.
     */
    static async recordSuccess(integrationId) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const timeoutsKey = this._key(id, 'timeouts');
            const authFailuresKey = this._key(id, 'auth_failures');
            const disconnectsKey = this._key(id, 'disconnects');
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');
            const probeLockKey = this._key(id, 'probe_lock');

            await redis.del(timeoutsKey);
            await redis.del(authFailuresKey);
            await redis.del(disconnectsKey);

            const currentState = await redis.get(stateKey);
            if (currentState === 'HALF_OPEN' || currentState === 'OPEN') {
                console.log(`[WhatsAppCircuitBreaker] Probe succeeded for ${id}. Resetting circuit breaker to CLOSED.`);
                await redis.set(stateKey, 'CLOSED');
                await redis.del(reasonKey);
                await redis.del(trippedAtKey);
                await redis.del(probeLockKey);
            }
        } catch (err) {
            console.warn(`[WhatsAppCircuitBreaker] Error clearing counters for ${id}:`, err.message);
        }
    }

    /**
     * Records an ACK timeout. Trips breaker if threshold (3) is reached.
     */
    static async recordAckTimeout(integrationId, detail = {}) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const timeoutsKey = this._key(id, 'timeouts');
            const count = await redis.incr(timeoutsKey);

            console.warn(`[WhatsAppCircuitBreaker] ACK timeout recorded for ${id} (count: ${count}/${TRIP_THRESHOLDS.CONSECUTIVE_ACK_TIMEOUTS})`);

            if (count >= TRIP_THRESHOLDS.CONSECUTIVE_ACK_TIMEOUTS) {
                const stateKey = this._key(id, 'state');
                const reasonKey = this._key(id, 'reason');
                const trippedAtKey = this._key(id, 'tripped_at');
                const reason = `Tripped after ${count} consecutive ACK timeouts on WhatsApp line.`;

                await redis.set(stateKey, 'OPEN');
                await redis.set(trippedAtKey, String(Date.now()));
                await redis.set(reasonKey, reason);

                console.error(`[WhatsAppCircuitBreaker] 🚨 CIRCUIT BREAKER TRIPPED for integration ${id}: ${reason}`);
                return { tripped: true, reason };
            }

            return { tripped: false, count };
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error recording ACK timeout for ${id}:`, err.message);
            throw err;
        }
    }

    /**
     * Records an authentication state persistence failure. Trips breaker if threshold (2) is reached.
     */
    static async recordAuthFailure(integrationId, err) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const authFailuresKey = this._key(id, 'auth_failures');
            const count = await redis.incr(authFailuresKey);

            console.warn(`[WhatsAppCircuitBreaker] Auth persistence failure for ${id} (count: ${count}/${TRIP_THRESHOLDS.CONSECUTIVE_AUTH_FAILURES}):`, err?.message);

            if (count >= TRIP_THRESHOLDS.CONSECUTIVE_AUTH_FAILURES) {
                const stateKey = this._key(id, 'state');
                const reasonKey = this._key(id, 'reason');
                const trippedAtKey = this._key(id, 'tripped_at');
                const reason = `Tripped after ${count} consecutive authentication persistence failures: ${err?.message || 'DB Error'}`;

                await redis.set(stateKey, 'OPEN');
                await redis.set(trippedAtKey, String(Date.now()));
                await redis.set(reasonKey, reason);

                console.error(`[WhatsAppCircuitBreaker] 🚨 CIRCUIT BREAKER TRIPPED for integration ${id}: ${reason}`);
                return { tripped: true, reason };
            }

            return { tripped: false, count };
        } catch (rErr) {
            console.error(`[WhatsAppCircuitBreaker] Error recording auth failure for ${id}:`, rErr.message);
            throw rErr;
        }
    }

    /**
     * Records a socket disconnect event. Trips breaker if threshold (5) is reached.
     */
    static async recordDisconnect(integrationId, statusCode) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const disconnectsKey = this._key(id, 'disconnects');
            const count = await redis.incr(disconnectsKey);

            if (count >= TRIP_THRESHOLDS.CONSECUTIVE_DISCONNECTS) {
                const stateKey = this._key(id, 'state');
                const reasonKey = this._key(id, 'reason');
                const trippedAtKey = this._key(id, 'tripped_at');
                const reason = `Tripped after ${count} repeated socket disconnects (last code: ${statusCode}).`;

                await redis.set(stateKey, 'OPEN');
                await redis.set(trippedAtKey, String(Date.now()));
                await redis.set(reasonKey, reason);

                console.error(`[WhatsAppCircuitBreaker] 🚨 CIRCUIT BREAKER TRIPPED for integration ${id}: ${reason}`);
                return { tripped: true, reason };
            }

            return { tripped: false, count };
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error recording disconnect for ${id}:`, err.message);
            throw err;
        }
    }

    /**
     * Manual or health-check reset of the circuit breaker. Must be authorized and audited.
     */
    static async reset(integrationId, operator = 'SYSTEM', auditReason = 'Manual operator reset') {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');
            const timeoutsKey = this._key(id, 'timeouts');
            const authFailuresKey = this._key(id, 'auth_failures');
            const disconnectsKey = this._key(id, 'disconnects');
            const probeLockKey = this._key(id, 'probe_lock');

            await redis.set(stateKey, 'CLOSED');
            await redis.del(reasonKey);
            await redis.del(trippedAtKey);
            await redis.del(timeoutsKey);
            await redis.del(authFailuresKey);
            await redis.del(disconnectsKey);
            await redis.del(probeLockKey);

            console.log(`[WhatsAppCircuitBreaker] [AUDIT] Circuit breaker for ${id} manually reset to CLOSED by operator '${operator}'. Reason: ${auditReason}`);
            return { success: true, state: 'CLOSED', operator, auditReason };
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error resetting breaker for ${id}:`, err.message);
            throw err;
        }
    }

    /**
     * Returns full status metrics for observability.
     */
    static async getHealth(integrationId) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');
            const timeoutsKey = this._key(id, 'timeouts');
            const authFailuresKey = this._key(id, 'auth_failures');
            const disconnectsKey = this._key(id, 'disconnects');

            const state = (await redis.get(stateKey)) || 'CLOSED';
            const tripReason = await redis.get(reasonKey);
            const trippedAtRaw = await redis.get(trippedAtKey);
            const timeoutsRaw = await redis.get(timeoutsKey);
            const authFailuresRaw = await redis.get(authFailuresKey);
            const disconnectsRaw = await redis.get(disconnectsKey);

            return {
                integrationId: id,
                state,
                tripReason,
                trippedAt: trippedAtRaw ? parseInt(trippedAtRaw, 10) : null,
                consecutiveTimeouts: timeoutsRaw ? parseInt(timeoutsRaw, 10) : 0,
                consecutiveAuthFailures: authFailuresRaw ? parseInt(authFailuresRaw, 10) : 0,
                consecutiveDisconnects: disconnectsRaw ? parseInt(disconnectsRaw, 10) : 0
            };
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error getting health for ${id}:`, err.message);
            throw err;
        }
    }
}

export default WhatsAppCircuitBreaker;
