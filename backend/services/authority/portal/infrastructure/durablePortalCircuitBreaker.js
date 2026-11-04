/**
 * Durable Portal Circuit Breaker Store
 *
 * Persists and checks pause states for authority sources with explicit tenant scoping.
 * Pauses automatically upon 403, 429, CAPTCHA, login walls, or manual kill switch.
 * Fails closed in production if MongoDB is unavailable.
 */

import mongoose from 'mongoose';
import AuthoritySourceSettings from '../../../../models/AuthoritySourceSettings.js';
import AuthorityGlobalKillSwitch from '../../../../models/AuthorityGlobalKillSwitch.js';

export class DurablePortalCircuitBreaker {
    constructor(options = {}) {
        const isRunningInTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || process.argv.some(arg => String(arg).includes('test'));
        this.testMode = options.testMode ?? isRunningInTest;
        this.allowInMemoryFallback = Boolean(options.allowInMemoryFallback ?? this.testMode);
        if (process.env.NODE_ENV === 'production') {
            this.allowInMemoryFallback = false;
        }
        this._localPauseState = new Map();
        this._globalKillSwitches = new Map();
    }

    /**
     * Check if an authority source is currently paused.
     * @param {string} authorityCode
     * @param {string} [tenantId]
     * @returns {Promise<boolean>}
     */
    async isPaused(authorityCode, tenantId = null) {
        const code = String(authorityCode || '').trim().toUpperCase();

        // 1. Check local in-memory global kill switch
        if (this._globalKillSwitches.get(code)?.killed === true) {
            return true;
        }

        // 2. Check local in-memory pause state
        const scopeKey = tenantId ? `${code}:${tenantId}` : code;
        if (this._localPauseState.get(scopeKey)?.paused === true) {
            return true;
        }
        if (this._localPauseState.get(code)?.paused === true) {
            return true;
        }

        // 3. Check durable database state: both global kill switch and tenant pause
        if (mongoose.connection?.readyState === 1) {
            try {
                // Check durable cross-instance global kill switch (P1.6)
                if (AuthorityGlobalKillSwitch && typeof AuthorityGlobalKillSwitch.findOne === 'function') {
                    const killed = await AuthorityGlobalKillSwitch.findOne({ authorityCode: code, isKilled: true });
                    if (killed) return true;
                }

                // Check tenant-level source pause
                if (tenantId) {
                    const settings = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: code });
                    if (settings?.isPaused) return true;
                } else {
                    const settings = await AuthoritySourceSettings.findOne({ authorityCode: code, isPaused: true });
                    if (settings) return true;
                }
            } catch (err) {
                if (!this.allowInMemoryFallback) {
                    // Fail closed on DB error in production: if unreadable, deny egress
                    return true;
                }
            }
        } else if (!this.allowInMemoryFallback) {
            // Fail closed in production when MongoDB disconnected
            return true;
        }

        return false;
    }

    /**
     * Pauses an authority source durably.
     * Scoped to { authorityCode, tenantId } unless global kill switch is explicitly intended.
     * @param {string|object} firstArg
     * @param {string} [reasonArg]
     * @param {object} [metadataArg]
     * @returns {Promise<void>}
     */
    async pause(firstArg, reasonArg, metadataArg = {}) {
        let code = '';
        let reason = '';
        let tenantId = null;
        let metadata = {};

        if (firstArg && typeof firstArg === 'object') {
            code = String(firstArg.authorityCode || '').trim().toUpperCase();
            tenantId = firstArg.tenantId || null;
            reason = firstArg.reason || '';
            metadata = firstArg.metadata || firstArg;
        } else {
            code = String(firstArg || '').trim().toUpperCase();
            reason = reasonArg || '';
            metadata = metadataArg || {};
            tenantId = metadata.tenantId || null;
        }

        const scopeKey = tenantId ? `${code}:${tenantId}` : code;
        this._localPauseState.set(scopeKey, {
            paused: true,
            tenantId,
            reason,
            metadata,
            pausedAt: new Date()
        });

        if (mongoose.connection?.readyState === 1) {
            try {
                const filter = { authorityCode: code };
                if (tenantId) filter.tenantId = tenantId;

                await AuthoritySourceSettings.updateMany(
                    filter,
                    { $set: { isPaused: true } }
                );
            } catch (dbErr) {
                if (!this.allowInMemoryFallback) {
                    const err = new Error(`CIRCUIT_BREAKER_PERSISTENCE_FAILED: Failed to record pause: ${dbErr.message}`);
                    err.code = 'CIRCUIT_BREAKER_PERSISTENCE_FAILED';
                    err.cause = dbErr;
                    throw err;
                }
            }
        } else if (!this.allowInMemoryFallback) {
            const err = new Error('CIRCUIT_BREAKER_PERSISTENCE_FAILED: MongoDB is disconnected; cannot persist durable pause.');
            err.code = 'CIRCUIT_BREAKER_PERSISTENCE_FAILED';
            throw err;
        }
    }

    /**
     * Explicit global authority kill switch (distinct from tenant-level pause).
     * Persisted durably in shared database across instances (P1.6).
     * @param {string} authorityCode
     * @param {boolean} isKilled
     * @param {string} [reason]
     */
    async setGlobalKillSwitch(authorityCode, isKilled, reason = '') {
        const code = String(authorityCode || '').trim().toUpperCase();
        this._globalKillSwitches.set(code, {
            killed: Boolean(isKilled),
            reason,
            updatedAt: new Date()
        });

        if (mongoose.connection?.readyState === 1 && AuthorityGlobalKillSwitch && typeof AuthorityGlobalKillSwitch.findOneAndUpdate === 'function') {
            try {
                await AuthorityGlobalKillSwitch.findOneAndUpdate(
                    { authorityCode: code },
                    {
                        $set: {
                            isKilled: Boolean(isKilled),
                            reason,
                            killedAt: isKilled ? new Date() : null
                        }
                    },
                    { upsert: true, new: true }
                );
            } catch (dbErr) {
                if (!this.allowInMemoryFallback) {
                    const err = new Error(`GLOBAL_KILL_SWITCH_PERSISTENCE_FAILED: Failed to record kill switch: ${dbErr.message}`);
                    err.code = 'GLOBAL_KILL_SWITCH_PERSISTENCE_FAILED';
                    throw err;
                }
            }
        } else if (!this.allowInMemoryFallback) {
            const err = new Error('GLOBAL_KILL_SWITCH_PERSISTENCE_FAILED: MongoDB disconnected; cannot record durable kill switch.');
            err.code = 'GLOBAL_KILL_SWITCH_PERSISTENCE_FAILED';
            throw err;
        }
    }

    /**
     * Convenience helper to trip the global kill switch for an authority.
     * @param {string} authorityCode
     * @param {string} [reason]
     */
    async tripGlobalKillSwitch(authorityCode, reason = '') {
        return await this.setGlobalKillSwitch(authorityCode, true, reason);
    }

    /**
     * Resumes an authority source for a specific tenant or globally.
     * @param {string|object} firstArg
     * @param {string} [tenantIdArg]
     * @returns {Promise<void>}
     */
    async resume(firstArg, tenantIdArg = null) {
        let code = '';
        let tenantId = tenantIdArg;

        if (firstArg && typeof firstArg === 'object') {
            code = String(firstArg.authorityCode || '').trim().toUpperCase();
            tenantId = firstArg.tenantId || tenantId;
        } else {
            code = String(firstArg || '').trim().toUpperCase();
        }

        const scopeKey = tenantId ? `${code}:${tenantId}` : code;
        this._localPauseState.set(scopeKey, { paused: false });
        if (!tenantId) {
            this._localPauseState.set(code, { paused: false });
            this._globalKillSwitches.set(code, { killed: false });
        }

        if (mongoose.connection?.readyState === 1) {
            try {
                const filter = { authorityCode: code };
                if (tenantId) filter.tenantId = tenantId;

                await AuthoritySourceSettings.updateMany(
                    filter,
                    { $set: { isPaused: false } }
                );
            } catch (dbErr) {
                if (!this.allowInMemoryFallback) {
                    const err = new Error(`CIRCUIT_BREAKER_RESUME_FAILED: Failed to resume source in DB: ${dbErr.message}`);
                    err.code = 'CIRCUIT_BREAKER_RESUME_FAILED';
                    throw err;
                }
            }
        }
    }

    /** Reset state (for tests) */
    reset() {
        this._localPauseState.clear();
        this._globalKillSwitches.clear();
    }
}

export const defaultPortalCircuitBreaker = new DurablePortalCircuitBreaker();
export default defaultPortalCircuitBreaker;
