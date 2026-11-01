/**
 * WhatsAppCircuitBreaker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration-scoped Circuit Breaker for WhatsApp Baileys & Meta integrations.
 * Protects WhatsApp accounts and background queues from cascading failures.
 *
 * States:
 *   - CLOSED: Normal operation. All messages allowed.
 *   - OPEN: Tripped. Dispatches are rejected or held; sessions remain logged in.
 *   - HALF_OPEN: Probe mode. Single probe request allowed to verify recovery.
 */

import redisProxy from '../src/config/redis.js';

const IN_MEMORY_BREAKERS = new Map();

const TRIP_THRESHOLDS = {
    CONSECUTIVE_ACK_TIMEOUTS: 3,
    CONSECUTIVE_AUTH_FAILURES: 2,
    CONSECUTIVE_DISCONNECTS: 5,
    COOLOFF_PERIOD_MS: 5 * 60 * 1000 // 5 minutes cooloff before transitioning to HALF_OPEN
};

export class WhatsAppCircuitBreaker {
    static _getMemoryBreaker(integrationId) {
        const id = String(integrationId || 'default');
        if (!IN_MEMORY_BREAKERS.has(id)) {
            IN_MEMORY_BREAKERS.set(id, {
                state: 'CLOSED',
                consecutiveTimeouts: 0,
                consecutiveAuthFailures: 0,
                consecutiveDisconnects: 0,
                trippedAt: null,
                tripReason: null,
                lastFailureAt: null
            });
        }
        return IN_MEMORY_BREAKERS.get(id);
    }

    /**
     * Checks if the circuit breaker is currently TRIPPED (OPEN) for the given integration.
     */
    static async isTripped(integrationId) {
        const id = String(integrationId || 'default');
        const breaker = this._getMemoryBreaker(id);

        // Check if cool-off period has expired to allow HALF_OPEN probe
        if (breaker.state === 'OPEN' && breaker.trippedAt) {
            const elapsed = Date.now() - breaker.trippedAt;
            if (elapsed > TRIP_THRESHOLDS.COOLOFF_PERIOD_MS) {
                breaker.state = 'HALF_OPEN';
                console.log(`[WhatsAppCircuitBreaker] Breaker for ${id} transitioning from OPEN to HALF_OPEN probe mode after cool-off.`);
                return { tripped: false, state: 'HALF_OPEN', reason: null };
            }
            return {
                tripped: true,
                state: 'OPEN',
                reason: breaker.tripReason || 'Circuit breaker tripped due to consecutive WhatsApp failures',
                trippedAt: breaker.trippedAt,
                remainingCooloffSec: Math.max(0, Math.round((TRIP_THRESHOLDS.COOLOFF_PERIOD_MS - elapsed) / 1000))
            };
        }

        return { tripped: false, state: breaker.state, reason: null };
    }

    /**
     * Records a successful dispatch or ACK, clearing consecutive failure counters.
     */
    static async recordSuccess(integrationId) {
        const id = String(integrationId || 'default');
        const breaker = this._getMemoryBreaker(id);
        breaker.consecutiveTimeouts = 0;
        breaker.consecutiveAuthFailures = 0;
        breaker.consecutiveDisconnects = 0;
        if (breaker.state === 'HALF_OPEN') {
            console.log(`[WhatsAppCircuitBreaker] Probe succeeded for ${id}. Resetting circuit breaker to CLOSED.`);
            breaker.state = 'CLOSED';
            breaker.trippedAt = null;
            breaker.tripReason = null;
        }
    }

    /**
     * Records an ACK timeout. Trips breaker if threshold exceeded.
     */
    static async recordAckTimeout(integrationId, detail = {}) {
        const id = String(integrationId || 'default');
        const breaker = this._getMemoryBreaker(id);
        breaker.consecutiveTimeouts += 1;
        breaker.lastFailureAt = Date.now();

        console.warn(`[WhatsAppCircuitBreaker] ACK timeout recorded for ${id} (count: ${breaker.consecutiveTimeouts}/${TRIP_THRESHOLDS.CONSECUTIVE_ACK_TIMEOUTS})`);

        if (breaker.consecutiveTimeouts >= TRIP_THRESHOLDS.CONSECUTIVE_ACK_TIMEOUTS) {
            breaker.state = 'OPEN';
            breaker.trippedAt = Date.now();
            breaker.tripReason = `Tripped after ${breaker.consecutiveTimeouts} consecutive ACK timeouts on WhatsApp line.`;
            console.error(`[WhatsAppCircuitBreaker] 🚨 CIRCUIT BREAKER TRIPPED for integration ${id}: ${breaker.tripReason}`);
            return { tripped: true, reason: breaker.tripReason };
        }
        return { tripped: false };
    }

    /**
     * Records an authentication state persistence failure.
     */
    static async recordAuthFailure(integrationId, err) {
        const id = String(integrationId || 'default');
        const breaker = this._getMemoryBreaker(id);
        breaker.consecutiveAuthFailures += 1;
        breaker.lastFailureAt = Date.now();

        console.warn(`[WhatsAppCircuitBreaker] Auth persistence failure for ${id} (count: ${breaker.consecutiveAuthFailures}/${TRIP_THRESHOLDS.CONSECUTIVE_AUTH_FAILURES}):`, err?.message);

        if (breaker.consecutiveAuthFailures >= TRIP_THRESHOLDS.CONSECUTIVE_AUTH_FAILURES) {
            breaker.state = 'OPEN';
            breaker.trippedAt = Date.now();
            breaker.tripReason = `Tripped after ${breaker.consecutiveAuthFailures} consecutive authentication persistence failures.`;
            console.error(`[WhatsAppCircuitBreaker] 🚨 CIRCUIT BREAKER TRIPPED for integration ${id}: ${breaker.tripReason}`);
            return { tripped: true, reason: breaker.tripReason };
        }
        return { tripped: false };
    }

    /**
     * Records a socket disconnect event.
     */
    static async recordDisconnect(integrationId, statusCode) {
        const id = String(integrationId || 'default');
        const breaker = this._getMemoryBreaker(id);
        breaker.consecutiveDisconnects += 1;
        breaker.lastFailureAt = Date.now();

        if (breaker.consecutiveDisconnects >= TRIP_THRESHOLDS.CONSECUTIVE_DISCONNECTS) {
            breaker.state = 'OPEN';
            breaker.trippedAt = Date.now();
            breaker.tripReason = `Tripped after ${breaker.consecutiveDisconnects} repeated socket disconnects (last code: ${statusCode}).`;
            console.error(`[WhatsAppCircuitBreaker] 🚨 CIRCUIT BREAKER TRIPPED for integration ${id}: ${breaker.tripReason}`);
            return { tripped: true, reason: breaker.tripReason };
        }
        return { tripped: false };
    }

    /**
     * Manual or health-check reset of the circuit breaker.
     */
    static async reset(integrationId, operator = 'SYSTEM') {
        const id = String(integrationId || 'default');
        const breaker = this._getMemoryBreaker(id);
        breaker.state = 'CLOSED';
        breaker.consecutiveTimeouts = 0;
        breaker.consecutiveAuthFailures = 0;
        breaker.consecutiveDisconnects = 0;
        breaker.trippedAt = null;
        breaker.tripReason = null;
        console.log(`[WhatsAppCircuitBreaker] Circuit breaker for ${id} manually reset to CLOSED by ${operator}.`);
        return { success: true, state: 'CLOSED' };
    }

    /**
     * Returns full status metrics for observability.
     */
    static async getHealth(integrationId) {
        const id = String(integrationId || 'default');
        const breaker = this._getMemoryBreaker(id);
        return {
            integrationId: id,
            state: breaker.state,
            consecutiveTimeouts: breaker.consecutiveTimeouts,
            consecutiveAuthFailures: breaker.consecutiveAuthFailures,
            consecutiveDisconnects: breaker.consecutiveDisconnects,
            trippedAt: breaker.trippedAt,
            tripReason: breaker.tripReason,
            lastFailureAt: breaker.lastFailureAt
        };
    }
}

export default WhatsAppCircuitBreaker;
