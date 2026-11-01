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

export const TRIP_THRESHOLDS = {
    CONSECUTIVE_ACK_TIMEOUTS: 3,
    CONSECUTIVE_AUTH_FAILURES: 2,
    CONSECUTIVE_DISCONNECTS: 5,
    COOLOFF_PERIOD_MS: 5 * 60 * 1000, // 5 minutes cooloff before transitioning to HALF_OPEN
    PROBE_LOCK_TTL_SEC: 60, // 60 seconds lock for single probe execution
    COUNTER_TTL_SEC: 15 * 60 // 15 minutes rolling window for consecutive failure counters
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
            const probeLockKey = this._key(id, 'probe_lock');

            const currentState = (await redis.get(stateKey)) || 'CLOSED';

            if (currentState === 'OPEN') {
                const trippedAtRaw = await redis.get(trippedAtKey);
                const trippedAt = trippedAtRaw ? parseInt(trippedAtRaw, 10) : Date.now();
                const elapsed = Date.now() - trippedAt;

                // Check if cool-off period has expired to allow controlled HALF_OPEN probe
                if (elapsed >= TRIP_THRESHOLDS.COOLOFF_PERIOD_MS) {
                    // 🔒 Genuinely Controlled HALF_OPEN Probe:
                    // Only ONE worker across all instances may acquire the probe token.
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
                const activeToken = await redis.get(probeLockKey);

                // 🔒 P0 Deadlock Prevention: If probe lock expired (worker crash or timeout), reset to OPEN with new cooloff
                if (!activeToken) {
                    console.warn(`[WhatsAppCircuitBreaker] Breaker for ${id} was HALF_OPEN but probe lease expired without completion. Transitioning back to OPEN with new cool-off period.`);
                    const now = Date.now();
                    const reason = 'Probe lease expired or worker crashed. Resetting cooloff.';
                    await redis.set(stateKey, 'OPEN');
                    await redis.set(trippedAtKey, String(now));
                    await redis.set(reasonKey, reason);

                    return {
                        tripped: true,
                        state: 'OPEN',
                        reason,
                        trippedAt: now,
                        remainingCooloffSec: Math.round(TRIP_THRESHOLDS.COOLOFF_PERIOD_MS / 1000)
                    };
                }

                // If caller is the designated probe worker holding activeToken, allow dispatch
                if (options.probeToken && options.probeToken === activeToken) {
                    return { tripped: false, state: 'HALF_OPEN', isProbe: true, probeToken: activeToken, reason: null };
                }

                // Concurrent workers must not independently initiate probes while probe is in flight
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
     * Records probe success. Atomically transitions HALF_OPEN to CLOSED if probeToken matches active lease.
     * Prevents a stale probe owner from resetting another worker's breaker state.
     */
    static async recordProbeSuccess(integrationId, probeToken) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');
            const probeLockKey = this._key(id, 'probe_lock');
            const timeoutsKey = this._key(id, 'timeouts');
            const authFailuresKey = this._key(id, 'auth_failures');
            const disconnectsKey = this._key(id, 'disconnects');

            const currentState = await redis.get(stateKey);
            if (currentState === 'HALF_OPEN') {
                const activeToken = await redis.get(probeLockKey);
                if (probeToken && activeToken !== probeToken) {
                    console.warn(`[WhatsAppCircuitBreaker] Stale probe success rejected for ${id}: token '${probeToken}' != active '${activeToken}'. Lease expired or reassigned.`);
                    return { success: false, state: currentState, error: 'STALE_PROBE_OWNER' };
                }

                console.log(`[WhatsAppCircuitBreaker] Probe succeeded for ${id} (token ${probeToken}). Resetting circuit breaker to CLOSED.`);
                await redis.set(stateKey, 'CLOSED');
                await redis.del(reasonKey);
                await redis.del(trippedAtKey);
                await redis.del(probeLockKey);
                await redis.del(timeoutsKey);
                await redis.del(authFailuresKey);
                await redis.del(disconnectsKey);
                return { success: true, state: 'CLOSED' };
            }

            if (currentState === 'CLOSED') {
                await redis.del(timeoutsKey);
                await redis.del(authFailuresKey);
                await redis.del(disconnectsKey);
                return { success: true, state: 'CLOSED' };
            }

            return { success: false, state: currentState, error: 'BREAKER_NOT_HALF_OPEN' };
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error recording probe success for ${id}:`, err.message);
            throw err;
        }
    }

    /**
     * Records probe failure. Transitions HALF_OPEN back to OPEN with a fresh cool-off period.
     */
    static async recordProbeFailure(integrationId, probeToken, reason = 'Probe dispatch failed') {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');
            const probeLockKey = this._key(id, 'probe_lock');

            const currentState = await redis.get(stateKey);
            if (currentState === 'HALF_OPEN') {
                const activeToken = await redis.get(probeLockKey);
                if (probeToken && activeToken && activeToken !== probeToken) {
                    console.warn(`[WhatsAppCircuitBreaker] Stale probe failure ignored for ${id}: token '${probeToken}' != active '${activeToken}'.`);
                    return { success: false, error: 'STALE_PROBE_OWNER' };
                }

                const now = Date.now();
                const tripReason = `Probe failed: ${reason}. Resetting cooloff.`;
                await redis.set(stateKey, 'OPEN');
                await redis.set(trippedAtKey, String(now));
                await redis.set(reasonKey, tripReason);
                await redis.del(probeLockKey);

                console.warn(`[WhatsAppCircuitBreaker] 🚨 Probe failed for ${id}. Breaker returned to OPEN.`);
                return { tripped: true, state: 'OPEN', reason: tripReason };
            }

            return { success: false, state: currentState };
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error recording probe failure for ${id}:`, err.message);
            throw err;
        }
    }

    /**
     * Records a successful dispatch or ACK, clearing consecutive failure counters.
     * If currently HALF_OPEN and probeToken is provided, safely transitions breaker to CLOSED.
     * P0 Rule: Redis errors must be observable and must NOT be silently swallowed.
     */
    static async recordSuccess(integrationId, probeToken = null) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const stateKey = this._key(id, 'state');
            const currentState = await redis.get(stateKey);

            if (currentState === 'HALF_OPEN' && probeToken) {
                return await this.recordProbeSuccess(id, probeToken);
            }

            const timeoutsKey = this._key(id, 'timeouts');
            const authFailuresKey = this._key(id, 'auth_failures');
            const disconnectsKey = this._key(id, 'disconnects');

            await redis.del(timeoutsKey);
            await redis.del(authFailuresKey);
            await redis.del(disconnectsKey);

            if (currentState === 'HALF_OPEN' && !probeToken) {
                console.warn(`[WhatsAppCircuitBreaker] recordSuccess called without probeToken while HALF_OPEN for ${id}. Cleared counters but preserving probe reservation.`);
            }

            return { success: true, state: currentState || 'CLOSED' };
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error recording success for ${id}:`, err.message);
            throw err;
        }
    }

    /**
     * Records an ACK timeout. Trips breaker if threshold (3) is reached.
     * Consecutive failure window is bounded by COUNTER_TTL_SEC to avoid indefinite accumulation.
     */
    static async recordAckTimeout(integrationId, detail = {}) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const timeoutsKey = this._key(id, 'timeouts');
            const count = await redis.incr(timeoutsKey);
            if (count === 1) {
                await redis.expire(timeoutsKey, TRIP_THRESHOLDS.COUNTER_TTL_SEC);
            }

            console.warn(`[WhatsAppCircuitBreaker] ACK timeout recorded for ${id} (count: ${count}/${TRIP_THRESHOLDS.CONSECUTIVE_ACK_TIMEOUTS})`);

            if (count >= TRIP_THRESHOLDS.CONSECUTIVE_ACK_TIMEOUTS) {
                const stateKey = this._key(id, 'state');
                const reasonKey = this._key(id, 'reason');
                const trippedAtKey = this._key(id, 'tripped_at');
                const probeLockKey = this._key(id, 'probe_lock');
                const reason = `Tripped after ${count} consecutive ACK timeouts on WhatsApp line.`;

                await redis.set(stateKey, 'OPEN');
                await redis.set(trippedAtKey, String(Date.now()));
                await redis.set(reasonKey, reason);
                await redis.del(probeLockKey);

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
     * Window is bounded by COUNTER_TTL_SEC.
     */
    static async recordAuthFailure(integrationId, err) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const authFailuresKey = this._key(id, 'auth_failures');
            const count = await redis.incr(authFailuresKey);
            if (count === 1) {
                await redis.expire(authFailuresKey, TRIP_THRESHOLDS.COUNTER_TTL_SEC);
            }

            console.warn(`[WhatsAppCircuitBreaker] Auth persistence failure for ${id} (count: ${count}/${TRIP_THRESHOLDS.CONSECUTIVE_AUTH_FAILURES}):`, err?.message);

            if (count >= TRIP_THRESHOLDS.CONSECUTIVE_AUTH_FAILURES) {
                const stateKey = this._key(id, 'state');
                const reasonKey = this._key(id, 'reason');
                const trippedAtKey = this._key(id, 'tripped_at');
                const probeLockKey = this._key(id, 'probe_lock');
                const reason = `Tripped after ${count} consecutive authentication persistence failures: ${err?.message || 'DB Error'}`;

                await redis.set(stateKey, 'OPEN');
                await redis.set(trippedAtKey, String(Date.now()));
                await redis.set(reasonKey, reason);
                await redis.del(probeLockKey);

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
     * Window is bounded by COUNTER_TTL_SEC.
     */
    static async recordDisconnect(integrationId, statusCode) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const disconnectsKey = this._key(id, 'disconnects');
            const count = await redis.incr(disconnectsKey);
            if (count === 1) {
                await redis.expire(disconnectsKey, TRIP_THRESHOLDS.COUNTER_TTL_SEC);
            }

            if (count >= TRIP_THRESHOLDS.CONSECUTIVE_DISCONNECTS) {
                const stateKey = this._key(id, 'state');
                const reasonKey = this._key(id, 'reason');
                const trippedAtKey = this._key(id, 'tripped_at');
                const probeLockKey = this._key(id, 'probe_lock');
                const reason = `Tripped after ${count} repeated socket disconnects (last code: ${statusCode}).`;

                await redis.set(stateKey, 'OPEN');
                await redis.set(trippedAtKey, String(Date.now()));
                await redis.set(reasonKey, reason);
                await redis.del(probeLockKey);

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
            const probeLockKey = this._key(id, 'probe_lock');

            const state = (await redis.get(stateKey)) || 'CLOSED';
            const tripReason = await redis.get(reasonKey);
            const trippedAtRaw = await redis.get(trippedAtKey);
            const timeoutsRaw = await redis.get(timeoutsKey);
            const authFailuresRaw = await redis.get(authFailuresKey);
            const disconnectsRaw = await redis.get(disconnectsKey);
            const activeProbeToken = await redis.get(probeLockKey);

            return {
                integrationId: id,
                state,
                tripReason,
                trippedAt: trippedAtRaw ? parseInt(trippedAtRaw, 10) : null,
                consecutiveTimeouts: timeoutsRaw ? parseInt(timeoutsRaw, 10) : 0,
                consecutiveAuthFailures: authFailuresRaw ? parseInt(authFailuresRaw, 10) : 0,
                consecutiveDisconnects: disconnectsRaw ? parseInt(disconnectsRaw, 10) : 0,
                activeProbeToken: activeProbeToken || null
            };
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error getting health for ${id}:`, err.message);
            throw err;
        }
    }
}

export default WhatsAppCircuitBreaker;
