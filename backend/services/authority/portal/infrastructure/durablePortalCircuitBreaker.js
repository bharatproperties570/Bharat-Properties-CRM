/**
 * Durable Portal Circuit Breaker Store
 *
 * Persists and checks pause states for authority sources.
 * Pauses automatically upon 403, 429, CAPTCHA, login walls, or manual kill switch.
 */

import mongoose from 'mongoose';
import AuthoritySourceSettings from '../../../../models/AuthoritySourceSettings.js';

export class DurablePortalCircuitBreaker {
    constructor() {
        this._localPauseState = new Map();
    }

    /**
     * Check if an authority source is currently paused.
     * @param {string} authorityCode
     * @param {string} [tenantId]
     * @returns {Promise<boolean>}
     */
    async isPaused(authorityCode, tenantId = null) {
        const code = String(authorityCode || '').trim().toUpperCase();

        // 1. Check local in-memory pause state first
        if (this._localPauseState.get(code)?.paused === true) {
            return true;
        }

        // 2. Check database settings only if MongoDB connection is active
        if (mongoose.connection?.readyState === 1) {
            try {
                if (tenantId) {
                    const settings = await AuthoritySourceSettings.findOne({ tenantId, authorityCode: code });
                    if (settings?.isPaused) return true;
                } else {
                    const settings = await AuthoritySourceSettings.findOne({ authorityCode: code, isPaused: true });
                    if (settings) return true;
                }
            } catch {
                // DB check error falls back to local state
            }
        }

        return false;
    }

    /**
     * Pauses an authority source durably.
     * Supports both pause(code, reason, metadata) and pause({ authorityCode, reason, at })
     * @param {string|object} firstArg
     * @param {string} [reasonArg]
     * @param {object} [metadataArg]
     * @returns {Promise<void>}
     */
    async pause(firstArg, reasonArg, metadataArg = {}) {
        let code = '';
        let reason = '';
        let metadata = {};

        if (firstArg && typeof firstArg === 'object') {
            code = String(firstArg.authorityCode || '').trim().toUpperCase();
            reason = firstArg.reason || '';
            metadata = firstArg.metadata || firstArg;
        } else {
            code = String(firstArg || '').trim().toUpperCase();
            reason = reasonArg || '';
            metadata = metadataArg || {};
        }

        this._localPauseState.set(code, {
            paused: true,
            reason,
            metadata,
            pausedAt: new Date()
        });

        if (mongoose.connection?.readyState === 1) {
            try {
                await AuthoritySourceSettings.updateMany(
                    { authorityCode: code },
                    { $set: { isPaused: true } }
                );
            } catch {
                // Database update error should not block circuit breaker trip
            }
        }
    }

    /**
     * Resumes an authority source.
     * @param {string} authorityCode
     * @returns {Promise<void>}
     */
    async resume(authorityCode) {
        const code = String(authorityCode || '').trim().toUpperCase();
        this._localPauseState.set(code, { paused: false });

        if (mongoose.connection?.readyState === 1) {
            try {
                await AuthoritySourceSettings.updateMany(
                    { authorityCode: code },
                    { $set: { isPaused: false } }
                );
            } catch {
                // Ignore DB error
            }
        }
    }

    /** Reset state (for tests) */
    reset() {
        this._localPauseState.clear();
    }
}

export const defaultPortalCircuitBreaker = new DurablePortalCircuitBreaker();
export default defaultPortalCircuitBreaker;
