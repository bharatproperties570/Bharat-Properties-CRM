/**
 * Execution-Owner Coordinator (deal_created_execution_coordinator)
 *
 * Enterprise Architecture Program — Phase E.3-D.9-B2-B
 *
 * Governs authoritative execution rights between legacy in-process WorkflowEngine.fireEvent
 * and durable event-driven domainEventWorker for DealCreated actions.
 *
 * Two-Tier Architecture:
 * - Tier 1: Macro-Routing via SystemSetting ('deal_created_execution_coordinator')
 *           In-memory TTL cache (3,000ms), fail-safe default to 'LEGACY'.
 * - Tier 2: Micro-Fencing via MongoDB unique index on AutomationLog.idempotencyKey
 *           Atomic CAS lease acquisition and claimToken fencing on finalization.
 */

import mongoose from 'mongoose';

export const COORDINATOR_KEY = 'deal_created_execution_coordinator';

export const EXECUTION_OWNERS = Object.freeze({
    LEGACY: 'LEGACY',
    TRANSITIONING: 'TRANSITIONING',
    DURABLE: 'DURABLE',
    DISABLED: 'DISABLED',
});

export const DEFAULT_FALLBACK_STATE = Object.freeze({
    owner: EXECUTION_OWNERS.LEGACY,
    epoch: 0,
    drainBarrierMs: 10000,
    isDefault: true,
    updatedAt: new Date(0),
});

const DEFAULT_CACHE_TTL_MS = 3000;

let cachedState = null;
let cacheExpiresAt = 0;

/**
 * Helper to get the SystemSetting Mongoose model safely in all environments
 */
async function getSystemSettingModel() {
    try {
        if (mongoose.models && mongoose.models.SystemSetting) {
            return mongoose.models.SystemSetting;
        }
        const mod = await import('../../models/SystemSetting.js');
        return mod.default || mongoose.models.SystemSetting;
    } catch {
        return mongoose.models?.SystemSetting || null;
    }
}

/**
 * Helper to get the AutomationLog Mongoose model safely in all environments
 */
async function getAutomationLogModel() {
    try {
        if (mongoose.models && mongoose.models.AutomationLog) {
            return mongoose.models.AutomationLog;
        }
        const mod = await import('../../models/AutomationLog.js');
        return mod.default || mongoose.models.AutomationLog;
    } catch {
        return mongoose.models?.AutomationLog || null;
    }
}

/**
 * Clear in-memory coordinator cache
 */
export function clearCache() {
    cachedState = null;
    cacheExpiresAt = 0;
}

/**
 * Retrieve current execution coordinator state
 *
 * @param {Object} [options]
 * @param {boolean} [options.bypassCache=false]
 * @param {string} [options.overrideOwner] - For testing only
 * @returns {Promise<{ owner: string, epoch: number, drainBarrierMs: number, updatedAt: Date, isDefault?: boolean }>}
 */
export async function getExecutionOwner(options = {}) {
    if (options.overrideOwner && Object.values(EXECUTION_OWNERS).includes(options.overrideOwner)) {
        return {
            owner: options.overrideOwner,
            epoch: 999,
            drainBarrierMs: 10000,
            isOverride: true,
            updatedAt: new Date(),
        };
    }

    const now = Date.now();
    if (!options.bypassCache && cachedState && now < cacheExpiresAt) {
        return cachedState;
    }

    try {
        const SystemSetting = await getSystemSettingModel();
        if (!SystemSetting) {
            return DEFAULT_FALLBACK_STATE;
        }

        if (mongoose.connection?.readyState === 0 && !Object.prototype.hasOwnProperty.call(SystemSetting, 'findOne')) {
            return DEFAULT_FALLBACK_STATE;
        }

        const settingDoc = await SystemSetting.findOne({ key: COORDINATOR_KEY }).lean();
        if (!settingDoc || !settingDoc.value) {
            const fallback = { ...DEFAULT_FALLBACK_STATE };
            cachedState = fallback;
            cacheExpiresAt = now + DEFAULT_CACHE_TTL_MS;
            return fallback;
        }

        const val = settingDoc.value;
        const owner = Object.values(EXECUTION_OWNERS).includes(val.owner)
            ? val.owner
            : EXECUTION_OWNERS.LEGACY;

        const epoch = Number.isInteger(val.epoch) && val.epoch >= 0 ? val.epoch : 0;
        const drainBarrierMs = typeof val.drainBarrierMs === 'number' && val.drainBarrierMs > 0
            ? val.drainBarrierMs
            : 10000;

        const state = {
            owner,
            epoch,
            drainBarrierMs,
            updatedAt: val.updatedAt ? new Date(val.updatedAt) : (settingDoc.updatedAt || new Date()),
            metadata: val.metadata || {},
            isDefault: false,
        };

        cachedState = state;
        cacheExpiresAt = now + DEFAULT_CACHE_TTL_MS;
        return state;
    } catch (err) {
        console.warn(`[ExecutionCoordinator] Error reading coordinator setting, falling back to LEGACY: ${err.message}`);
        return DEFAULT_FALLBACK_STATE;
    }
}

/**
 * Validate whether a given execution role is authorized to execute actions for an event.
 *
 * @param {'LEGACY'|'DURABLE'} role - The caller's role
 * @param {string} eventName - e.g. 'deal_created', 'DealCreated'
 * @param {Object} [options] - Options passed to getExecutionOwner
 * @returns {Promise<{ authorized: boolean, owner: string, epoch: number, reason?: string }>}
 */
export async function validateExecutionAuthority(role, eventName, options = {}) {
    const normalizedEvent = String(eventName || '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');

    // Only DealCreated events are coordinated in Phase E.3-D
    const isCoordinated = normalizedEvent === 'deal_created' || normalizedEvent === 'dealcreated';
    if (!isCoordinated) {
        return {
            authorized: true,
            owner: 'ALL',
            epoch: 0,
            reason: 'NON_COORDINATED_EVENT',
        };
    }

    const state = await getExecutionOwner(options);

    if (state.owner === EXECUTION_OWNERS.DISABLED) {
        return {
            authorized: false,
            owner: state.owner,
            epoch: state.epoch,
            reason: 'COORDINATOR_DISABLED',
        };
    }

    if (state.owner === EXECUTION_OWNERS.TRANSITIONING) {
        return {
            authorized: false,
            owner: state.owner,
            epoch: state.epoch,
            reason: 'COORDINATOR_TRANSITIONING',
        };
    }

    if (role === 'LEGACY') {
        const authorized = state.owner === EXECUTION_OWNERS.LEGACY;
        return {
            authorized,
            owner: state.owner,
            epoch: state.epoch,
            reason: authorized ? 'AUTHORITATIVE_LEGACY' : 'AUTHORITY_TRANSFERRED_TO_DURABLE',
        };
    }

    if (role === 'DURABLE') {
        const authorized = state.owner === EXECUTION_OWNERS.DURABLE;
        return {
            authorized,
            owner: state.owner,
            epoch: state.epoch,
            reason: authorized ? 'AUTHORITATIVE_DURABLE' : 'AUTHORITY_HELD_BY_LEGACY',
        };
    }

    return {
        authorized: false,
        owner: state.owner,
        epoch: state.epoch,
        reason: `UNKNOWN_ROLE: ${role}`,
    };
}

/**
 * Update the execution owner state in SystemSetting with monotonic epoch incrementing.
 *
 * @param {string} newOwner - One of EXECUTION_OWNERS
 * @param {Object} [options]
 * @param {string} [options.updatedBy='system']
 * @param {number} [options.expectedEpoch] - Optimistic locking check
 * @param {number} [options.drainBarrierMs]
 * @param {string} [options.reason]
 * @param {Object} [options.metadata]
 * @returns {Promise<{ owner: string, epoch: number, updatedAt: Date }>}
 */
export async function updateExecutionOwner(newOwner, options = {}) {
    if (!Object.values(EXECUTION_OWNERS).includes(newOwner)) {
        throw new Error(`Invalid execution owner: ${newOwner}. Valid options: ${Object.values(EXECUTION_OWNERS).join(', ')}`);
    }

    const SystemSetting = await getSystemSettingModel();
    if (!SystemSetting) {
        throw new Error('SystemSetting model is not available');
    }

    if (mongoose.connection?.readyState === 0 && !Object.prototype.hasOwnProperty.call(SystemSetting, 'findOne')) {
        throw new Error('Database is not connected');
    }

    const currentDoc = await SystemSetting.findOne({ key: COORDINATOR_KEY }).lean();
    const currentEpoch = currentDoc?.value?.epoch || 0;

    if (options.expectedEpoch !== undefined && currentEpoch !== options.expectedEpoch) {
        throw new Error(`Concurrent modification detected: expected epoch ${options.expectedEpoch}, but found ${currentEpoch}`);
    }

    const nextEpoch = currentEpoch + 1;
    const now = new Date();

    const updatePayload = {
        key: COORDINATOR_KEY,
        label: 'DealCreated Execution Owner Coordinator',
        description: 'Governs authoritative execution rights between legacy fireEvent and durable domainEventWorker',
        category: 'architecture_cutover',
        value: {
            owner: newOwner,
            epoch: nextEpoch,
            updatedAt: now,
            updatedBy: options.updatedBy || 'system',
            drainBarrierMs: options.drainBarrierMs || currentDoc?.value?.drainBarrierMs || 10000,
            metadata: {
                previousOwner: currentDoc?.value?.owner || EXECUTION_OWNERS.LEGACY,
                transitionReason: options.reason || 'State update',
                ...(options.metadata || {}),
            },
        },
    };

    const updated = await SystemSetting.findOneAndUpdate(
        { key: COORDINATOR_KEY },
        { $set: updatePayload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    clearCache();

    console.log(`[ExecutionCoordinator] State updated to ${newOwner} (epoch: ${nextEpoch}) by ${options.updatedBy || 'system'}`);

    return {
        owner: updated.value.owner,
        epoch: updated.value.epoch,
        updatedAt: updated.value.updatedAt,
        drainBarrierMs: updated.value.drainBarrierMs,
        metadata: updated.value.metadata,
    };
}

/**
 * Count active pending claims for deal_created actions to evaluate the drain barrier.
 *
 * @param {Object} [options]
 * @returns {Promise<{ activePendingCount: number, timestamp: Date }>}
 */
export async function getPendingClaimsCount(options = {}) {
    try {
        const AutomationLog = await getAutomationLogModel();
        if (!AutomationLog) {
            return { activePendingCount: 0, timestamp: new Date() };
        }

        const now = new Date();
        const activePendingCount = await AutomationLog.countDocuments({
            idempotencyKey: { $regex: /^canonical-deal_created-/ },
            status: 'pending',
            leaseUntil: { $gt: now },
        });

        return {
            activePendingCount,
            timestamp: now,
        };
    } catch (err) {
        console.warn(`[ExecutionCoordinator] Error querying pending claims: ${err.message}`);
        return { activePendingCount: 0, timestamp: new Date(), error: err.message };
    }
}
