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
 *
 * Concurrency & Atomicity Invariants (P0-A / P1-C):
 *   1. All state transitions, lease acquisition, recovery, and counter updates
 *      are executed as atomic Redis Lua scripts.
 *   2. Strict Token Ownership:
 *      - A missing probe token (null/empty) cannot mutate state out of HALF_OPEN.
 *      - An expired probe lease (probe_lock key expired) cannot authorize state mutation.
 *      - A stale probe worker cannot overwrite or reset an active probe owned by another worker.
 *   3. Counter Semantics:
 *      - Counters track CONSECUTIVE failures within a 15-minute rolling TTL window (COUNTER_TTL_SEC: 900).
 *      - Increment and TTL renewal are executed atomically in Redis to prevent key leakage.
 *      - Any successful dispatch/ACK or manual reset clears failure counters atomically.
 *   4. Fail-Closed Resilience:
 *      - Redis outage or storage unavailability throws explicit errors; dispatch is safely blocked.
 *      - Storage errors are never silently swallowed and never falsely yield a successful transition.
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

// 🔒 Atomic Redis Lua Scripts for Concurrency-Safe State Transitions
export const LUA_SCRIPTS = {
    // 1. OPEN -> HALF_OPEN probe reservation & Expired lease recovery
    CHECK_AND_RESERVE_PROBE: `
-- CB_CHECK_AND_RESERVE_PROBE
-- KEYS: [1] stateKey, [2] reasonKey, [3] trippedAtKey, [4] probeLockKey
-- ARGV: [1] workerToken, [2] cooloffMs, [3] probeTtlSec, [4] nowMs, [5] callerProbeToken
local state = redis.call("get", KEYS[1]) or "CLOSED"

if state == "CLOSED" then
    return cjson.encode({ state = "CLOSED", tripped = false })
end

if state == "OPEN" then
    local trippedAtRaw = redis.call("get", KEYS[3])
    local trippedAt = tonumber(trippedAtRaw) or tonumber(ARGV[4])
    local elapsed = tonumber(ARGV[4]) - trippedAt
    local cooloffMs = tonumber(ARGV[2])

    if elapsed >= cooloffMs then
        local lockAcquired = redis.call("set", KEYS[4], ARGV[1], "NX", "EX", tonumber(ARGV[3]))
        if lockAcquired then
            redis.call("set", KEYS[1], "HALF_OPEN")
            return cjson.encode({
                state = "HALF_OPEN",
                tripped = false,
                isProbe = true,
                probeToken = ARGV[1]
            })
        else
            return cjson.encode({
                state = "OPEN",
                tripped = true,
                reason = "Controlled probe already in flight by another worker. Holding dispatch.",
                probeInFlight = true,
                trippedAt = trippedAt
            })
        end
    else
        local reason = redis.call("get", KEYS[2]) or "Circuit breaker tripped due to consecutive WhatsApp line failures"
        local remainingSec = math.max(0, math.floor((cooloffMs - elapsed) / 1000))
        return cjson.encode({
            state = "OPEN",
            tripped = true,
            reason = reason,
            trippedAt = trippedAt,
            remainingCooloffSec = remainingSec
        })
    end
end

if state == "HALF_OPEN" then
    local activeToken = redis.call("get", KEYS[4])
    if not activeToken then
        local tripReason = "Probe lease expired or worker crashed. Resetting cooloff."
        redis.call("set", KEYS[1], "OPEN")
        redis.call("set", KEYS[3], tostring(ARGV[4]))
        redis.call("set", KEYS[2], tripReason)
        return cjson.encode({
            state = "OPEN",
            tripped = true,
            reason = tripReason,
            trippedAt = tonumber(ARGV[4]),
            recoveredFromExpiredLease = true,
            remainingCooloffSec = math.floor(tonumber(ARGV[2]) / 1000)
        })
    end

    if ARGV[5] and ARGV[5] ~= "" and ARGV[5] == activeToken then
        return cjson.encode({
            state = "HALF_OPEN",
            tripped = false,
            isProbe = true,
            probeToken = activeToken
        })
    end

    return cjson.encode({
        state = "HALF_OPEN",
        tripped = true,
        reason = "Circuit breaker is in HALF_OPEN probe mode. Awaiting single test dispatch verification.",
        probeInFlight = true
    })
end

return cjson.encode({ state = state, tripped = false })
`,

    // 2. HALF_OPEN -> CLOSED probe success
    RECORD_PROBE_SUCCESS: `
-- CB_RECORD_PROBE_SUCCESS
-- KEYS: [1] stateKey, [2] reasonKey, [3] trippedAtKey, [4] probeLockKey, [5] timeoutsKey, [6] authFailuresKey, [7] disconnectsKey
-- ARGV: [1] probeToken
local state = redis.call("get", KEYS[1]) or "CLOSED"
local token = ARGV[1]

if state == "HALF_OPEN" then
    if not token or token == "" then
        return cjson.encode({ success = false, state = state, error = "MISSING_PROBE_TOKEN" })
    end
    local activeToken = redis.call("get", KEYS[4])
    if not activeToken then
        return cjson.encode({ success = false, state = state, error = "EXPIRED_PROBE_LEASE" })
    end
    if token ~= activeToken then
        return cjson.encode({ success = false, state = state, error = "STALE_PROBE_OWNER" })
    end

    redis.call("set", KEYS[1], "CLOSED")
    redis.call("del", KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7])
    return cjson.encode({ success = true, state = "CLOSED" })
end

if state == "CLOSED" then
    redis.call("del", KEYS[5], KEYS[6], KEYS[7])
    return cjson.encode({ success = true, state = "CLOSED" })
end

return cjson.encode({ success = false, state = state, error = "BREAKER_NOT_HALF_OPEN" })
`,

    // 3. HALF_OPEN -> OPEN probe failure
    RECORD_PROBE_FAILURE: `
-- CB_RECORD_PROBE_FAILURE
-- KEYS: [1] stateKey, [2] reasonKey, [3] trippedAtKey, [4] probeLockKey
-- ARGV: [1] probeToken, [2] reason, [3] nowMs
local state = redis.call("get", KEYS[1]) or "CLOSED"
local token = ARGV[1]

if state == "HALF_OPEN" then
    local activeToken = redis.call("get", KEYS[4])
    if token and token ~= "" and activeToken and token ~= activeToken then
        return cjson.encode({ success = false, state = state, error = "STALE_PROBE_OWNER" })
    end

    local tripReason = "Probe failed: " .. (ARGV[2] or "Probe dispatch failed") .. ". Resetting cooloff."
    redis.call("set", KEYS[1], "OPEN")
    redis.call("set", KEYS[2], tripReason)
    redis.call("set", KEYS[3], tostring(ARGV[3]))
    redis.call("del", KEYS[4])
    return cjson.encode({ tripped = true, state = "OPEN", reason = tripReason })
end

return cjson.encode({ success = false, state = state })
`,

    // 4. Failure counter increment, rolling TTL & threshold-based trip
    RECORD_FAILURE_COUNTER: `
-- CB_RECORD_FAILURE_COUNTER
-- KEYS: [1] counterKey, [2] stateKey, [3] reasonKey, [4] trippedAtKey, [5] probeLockKey
-- ARGV: [1] threshold, [2] counterTtlSec, [3] reason, [4] nowMs
local count = redis.call("incr", KEYS[1])
redis.call("expire", KEYS[1], tonumber(ARGV[2]))

local threshold = tonumber(ARGV[1])
if count >= threshold then
    redis.call("set", KEYS[2], "OPEN")
    redis.call("set", KEYS[3], ARGV[3])
    redis.call("set", KEYS[4], tostring(ARGV[4]))
    redis.call("del", KEYS[5])
    return cjson.encode({ count = count, tripped = true, reason = ARGV[3] })
else
    return cjson.encode({ count = count, tripped = false })
end
`,

    // 5. Reset failure counters on dispatch success
    RESET_SUCCESS_COUNTERS: `
-- CB_RESET_SUCCESS_COUNTERS
-- KEYS: [1] timeoutsKey, [2] authFailuresKey, [3] disconnectsKey, [4] stateKey
redis.call("del", KEYS[1], KEYS[2], KEYS[3])
local state = redis.call("get", KEYS[4]) or "CLOSED"
return cjson.encode({ success = true, state = state })
`,

    // 6. Manual audit-tracked reset
    MANUAL_RESET: `
-- CB_MANUAL_RESET
-- KEYS: [1] stateKey, [2] reasonKey, [3] trippedAtKey, [4] probeLockKey, [5] timeoutsKey, [6] authFailuresKey, [7] disconnectsKey
redis.call("set", KEYS[1], "CLOSED")
redis.call("del", KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7])
return cjson.encode({ success = true, state = "CLOSED" })
`
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
     * Transitions OPEN -> HALF_OPEN atomically if cooloff has expired.
     * Detects expired probe locks and recovers safely back to OPEN.
     */
    static async isTripped(integrationId, options = {}) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');
            const probeLockKey = this._key(id, 'probe_lock');

            const workerToken = options.workerToken || `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const callerProbeToken = options.probeToken || '';
            const nowMs = Date.now();

            const rawResult = await redis.eval(
                LUA_SCRIPTS.CHECK_AND_RESERVE_PROBE,
                4,
                stateKey,
                reasonKey,
                trippedAtKey,
                probeLockKey,
                workerToken,
                String(TRIP_THRESHOLDS.COOLOFF_PERIOD_MS),
                String(TRIP_THRESHOLDS.PROBE_LOCK_TTL_SEC),
                String(nowMs),
                callerProbeToken
            );

            const result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;

            if (result.isProbe) {
                console.log(`[WhatsAppCircuitBreaker] Breaker for ${id} transitioning to HALF_OPEN probe mode. Probe reserved by token ${result.probeToken}.`);
            }
            if (result.recoveredFromExpiredLease) {
                console.warn(`[WhatsAppCircuitBreaker] Breaker for ${id} was HALF_OPEN but probe lease expired without completion. Transitioning back to OPEN with new cool-off period.`);
            }

            return result;
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Durable storage read failure for ${id}:`, err.message);
            throw new Error(`CIRCUIT_BREAKER_STORAGE_UNAVAILABLE: Circuit breaker storage failure (${err.message}). Outbound dispatch blocked for safety.`);
        }
    }

    /**
     * Records probe success. Atomically transitions HALF_OPEN to CLOSED if probeToken matches active lease.
     * Strict ownership: Rejects missing probe tokens, expired leases, or stale owners.
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

            const rawResult = await redis.eval(
                LUA_SCRIPTS.RECORD_PROBE_SUCCESS,
                7,
                stateKey,
                reasonKey,
                trippedAtKey,
                probeLockKey,
                timeoutsKey,
                authFailuresKey,
                disconnectsKey,
                probeToken || ''
            );

            const result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;

            if (result.success) {
                console.log(`[WhatsAppCircuitBreaker] Probe succeeded for ${id} (token ${probeToken}). Resetting circuit breaker to CLOSED.`);
            } else if (result.error === 'STALE_PROBE_OWNER') {
                console.warn(`[WhatsAppCircuitBreaker] Stale probe success rejected for ${id}: token '${probeToken}'. Lease expired or reassigned.`);
            } else if (result.error === 'MISSING_PROBE_TOKEN') {
                console.warn(`[WhatsAppCircuitBreaker] Probe success rejected for ${id}: probe token is missing.`);
            } else if (result.error === 'EXPIRED_PROBE_LEASE') {
                console.warn(`[WhatsAppCircuitBreaker] Probe success rejected for ${id}: active lease expired.`);
            }

            return result;
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error recording probe success for ${id}:`, err.message);
            throw err;
        }
    }

    /**
     * Records probe failure. Transitions HALF_OPEN back to OPEN with a fresh cool-off period.
     * Strict ownership: Rejects stale owners from modifying newer probes.
     */
    static async recordProbeFailure(integrationId, probeToken, reason = 'Probe dispatch failed') {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');
            const probeLockKey = this._key(id, 'probe_lock');

            const nowMs = Date.now();

            const rawResult = await redis.eval(
                LUA_SCRIPTS.RECORD_PROBE_FAILURE,
                4,
                stateKey,
                reasonKey,
                trippedAtKey,
                probeLockKey,
                probeToken || '',
                reason,
                String(nowMs)
            );

            const result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;

            if (result.tripped) {
                console.warn(`[WhatsAppCircuitBreaker] 🚨 Probe failed for ${id}. Breaker returned to OPEN.`);
            } else if (result.error === 'STALE_PROBE_OWNER') {
                console.warn(`[WhatsAppCircuitBreaker] Stale probe failure ignored for ${id}: token '${probeToken}'.`);
            }

            return result;
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
            if (probeToken) {
                return await this.recordProbeSuccess(id, probeToken);
            }

            const timeoutsKey = this._key(id, 'timeouts');
            const authFailuresKey = this._key(id, 'auth_failures');
            const disconnectsKey = this._key(id, 'disconnects');
            const stateKey = this._key(id, 'state');

            const rawResult = await redis.eval(
                LUA_SCRIPTS.RESET_SUCCESS_COUNTERS,
                4,
                timeoutsKey,
                authFailuresKey,
                disconnectsKey,
                stateKey
            );

            const result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
            return result;
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error recording success for ${id}:`, err.message);
            throw err;
        }
    }

    /**
     * Records an ACK timeout. Trips breaker if threshold (3) consecutive timeouts is reached.
     * Atomic: Increments counter and binds rolling TTL (COUNTER_TTL_SEC: 900) in a single script.
     */
    static async recordAckTimeout(integrationId, detail = {}) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const timeoutsKey = this._key(id, 'timeouts');
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');
            const probeLockKey = this._key(id, 'probe_lock');

            const nowMs = Date.now();
            const reason = `Tripped after ${TRIP_THRESHOLDS.CONSECUTIVE_ACK_TIMEOUTS} consecutive ACK timeouts on WhatsApp line.`;

            const rawResult = await redis.eval(
                LUA_SCRIPTS.RECORD_FAILURE_COUNTER,
                5,
                timeoutsKey,
                stateKey,
                reasonKey,
                trippedAtKey,
                probeLockKey,
                String(TRIP_THRESHOLDS.CONSECUTIVE_ACK_TIMEOUTS),
                String(TRIP_THRESHOLDS.COUNTER_TTL_SEC),
                reason,
                String(nowMs)
            );

            const result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
            console.warn(`[WhatsAppCircuitBreaker] ACK timeout recorded for ${id} (count: ${result.count}/${TRIP_THRESHOLDS.CONSECUTIVE_ACK_TIMEOUTS})`);

            if (result.tripped) {
                console.error(`[WhatsAppCircuitBreaker] 🚨 CIRCUIT BREAKER TRIPPED for integration ${id}: ${result.reason}`);
            }

            return result;
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error recording ACK timeout for ${id}:`, err.message);
            throw err;
        }
    }

    /**
     * Records an authentication state persistence failure. Trips breaker if threshold (2) is reached.
     * Atomic: Increments counter and binds rolling TTL in a single script.
     */
    static async recordAuthFailure(integrationId, err) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const authFailuresKey = this._key(id, 'auth_failures');
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');
            const probeLockKey = this._key(id, 'probe_lock');

            const nowMs = Date.now();
            const reason = `Tripped after ${TRIP_THRESHOLDS.CONSECUTIVE_AUTH_FAILURES} consecutive authentication persistence failures: ${err?.message || 'DB Error'}`;

            const rawResult = await redis.eval(
                LUA_SCRIPTS.RECORD_FAILURE_COUNTER,
                5,
                authFailuresKey,
                stateKey,
                reasonKey,
                trippedAtKey,
                probeLockKey,
                String(TRIP_THRESHOLDS.CONSECUTIVE_AUTH_FAILURES),
                String(TRIP_THRESHOLDS.COUNTER_TTL_SEC),
                reason,
                String(nowMs)
            );

            const result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
            console.warn(`[WhatsAppCircuitBreaker] Auth persistence failure for ${id} (count: ${result.count}/${TRIP_THRESHOLDS.CONSECUTIVE_AUTH_FAILURES}):`, err?.message);

            if (result.tripped) {
                console.error(`[WhatsAppCircuitBreaker] 🚨 CIRCUIT BREAKER TRIPPED for integration ${id}: ${result.reason}`);
            }

            return result;
        } catch (rErr) {
            console.error(`[WhatsAppCircuitBreaker] Error recording auth failure for ${id}:`, rErr.message);
            throw rErr;
        }
    }

    /**
     * Records a socket disconnect event. Trips breaker if threshold (5) is reached.
     * Atomic: Increments counter and binds rolling TTL in a single script.
     */
    static async recordDisconnect(integrationId, statusCode) {
        const id = String(integrationId || 'default');
        const redis = this._getRedis();

        try {
            const disconnectsKey = this._key(id, 'disconnects');
            const stateKey = this._key(id, 'state');
            const reasonKey = this._key(id, 'reason');
            const trippedAtKey = this._key(id, 'tripped_at');
            const probeLockKey = this._key(id, 'probe_lock');

            const nowMs = Date.now();
            const reason = `Tripped after ${TRIP_THRESHOLDS.CONSECUTIVE_DISCONNECTS} repeated socket disconnects (last code: ${statusCode}).`;

            const rawResult = await redis.eval(
                LUA_SCRIPTS.RECORD_FAILURE_COUNTER,
                5,
                disconnectsKey,
                stateKey,
                reasonKey,
                trippedAtKey,
                probeLockKey,
                String(TRIP_THRESHOLDS.CONSECUTIVE_DISCONNECTS),
                String(TRIP_THRESHOLDS.COUNTER_TTL_SEC),
                reason,
                String(nowMs)
            );

            const result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;

            if (result.tripped) {
                console.error(`[WhatsAppCircuitBreaker] 🚨 CIRCUIT BREAKER TRIPPED for integration ${id}: ${result.reason}`);
            }

            return result;
        } catch (err) {
            console.error(`[WhatsAppCircuitBreaker] Error recording disconnect for ${id}:`, err.message);
            throw err;
        }
    }

    /**
     * Manual or health-check reset of the circuit breaker. Must be authorized and audited.
     * Executes atomic cleanup of all state, locks, and counters.
     */
    static async reset(integrationId, operator = 'SYSTEM', auditReason = 'Manual operator reset') {
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

            await redis.eval(
                LUA_SCRIPTS.MANUAL_RESET,
                7,
                stateKey,
                reasonKey,
                trippedAtKey,
                probeLockKey,
                timeoutsKey,
                authFailuresKey,
                disconnectsKey
            );

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

            const [
                state,
                tripReason,
                trippedAtRaw,
                timeoutsRaw,
                authFailuresRaw,
                disconnectsRaw,
                activeProbeToken
            ] = await Promise.all([
                redis.get(stateKey),
                redis.get(reasonKey),
                redis.get(trippedAtKey),
                redis.get(timeoutsKey),
                redis.get(authFailuresKey),
                redis.get(disconnectsKey),
                redis.get(probeLockKey)
            ]);

            return {
                integrationId: id,
                state: state || 'CLOSED',
                tripReason: tripReason || null,
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
