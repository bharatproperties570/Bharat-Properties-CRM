import EffectExecution from '../../models/EffectExecution.js';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

const DEFAULT_LEASE_DURATION = 60000;
const MAX_ATTEMPTS = 5;
const WORKER_ID = `${os.hostname()}-${process.pid}`;

export const executeEffect = async (eventId, effectKey, aggregateType, aggregateId, fn, options = {}) => {
    const stableKey = options?.stableKey || null;
    const query = stableKey ? { stableKey } : { eventId, effectKey };
    const leaseDuration = options?.leaseDurationMs || DEFAULT_LEASE_DURATION;
    const heartbeatInterval = options?.heartbeatIntervalMs || Math.max(100, Math.floor(leaseDuration / 3));

    // 1. Establish baseline record
    await EffectExecution.updateOne(
        query,
        { 
            $setOnInsert: { 
                eventId, 
                effectKey, 
                ...(stableKey ? { stableKey } : {}),
                aggregateType, 
                aggregateId, 
                status: 'PENDING',
                attempts: 0
            } 
        },
        { upsert: true }
    );

    // 2. Atomic Claim
    const newExecutionId = uuidv4();
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + leaseDuration);

    const claim = await EffectExecution.findOneAndUpdate(
        {
            ...query,
            $or: [
                { status: 'PENDING' },
                { status: 'FAILED', attempts: { $lt: MAX_ATTEMPTS } },
                { status: 'PROCESSING', lockedUntil: { $lt: now } }
            ]
        },
        {
            $set: {
                status: 'PROCESSING',
                workerId: WORKER_ID,
                executionId: newExecutionId,
                lockedUntil
            },
            $inc: { attempts: 1 }
        },
        { new: true }
    );

    // If we didn't get a claim, check why
    if (!claim) {
        const existing = await EffectExecution.findOne(query);
        if (!existing) throw new Error(`EffectExecution disappeared: ${stableKey || `${eventId}:${effectKey}`}`);
        if (existing.status === 'COMPLETED') {
            console.log(`[EffectOrchestrator] Skipping ${effectKey}: Already COMPLETED.`);
            return { status: 'SKIPPED' };
        }
        if (existing.status === 'AMBIGUOUS') {
            console.log(`[EffectOrchestrator] Skipping ${effectKey}: Status is AMBIGUOUS. Manual reconciliation required.`);
            return { status: 'SKIPPED', ambiguous: true };
        }
        if (existing.status === 'FAILED' && existing.attempts >= MAX_ATTEMPTS) {
            throw new Error(`Terminal failure reached for ${effectKey}. Attempts: ${existing.attempts}`);
        }
        throw new Error(`Effect ${effectKey} is currently locked by another worker.`);
    }

    // 3. Heartbeat Renewal State Machine
    let heartbeatTimer = null;
    let isHeartbeatActive = false;
    let ownershipLost = false;
    let currentLockedUntil = lockedUntil;
    let inFlightRenewalPromise = null;

    const stopHeartbeat = async () => {
        isHeartbeatActive = false;
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        if (inFlightRenewalPromise) {
            try {
                await inFlightRenewalPromise;
            } catch (_) {
                // Heartbeat error handled inside renewLease
            }
        }
    };

    const renewLease = async () => {
        if (!isHeartbeatActive || ownershipLost) return;
        if (inFlightRenewalPromise) {
            // Renewal already in progress: prevent overlapping asynchronous renewal operations
            return inFlightRenewalPromise;
        }

        inFlightRenewalPromise = (async () => {
            const renewTime = new Date();
            const nextLockedUntil = new Date(renewTime.getTime() + leaseDuration);

            try {
                if (options._simulateHeartbeatDbError) {
                    throw new Error('Simulated DB network partition during heartbeat');
                }
                if (options._simulateHeartbeatDelayMs) {
                    await new Promise(r => setTimeout(r, options._simulateHeartbeatDelayMs));
                }

                // Atomic ownership-checked update with $max:
                // 1. Exact _id, exact executionId, status: 'PROCESSING'
                // 2. $max guarantees an older or delayed renewal can NEVER shorten/regress lockedUntil
                const updateRes = await EffectExecution.updateOne(
                    {
                        _id: claim._id,
                        executionId: newExecutionId,
                        status: 'PROCESSING'
                    },
                    {
                        $max: { lockedUntil: nextLockedUntil }
                    }
                );

                // If matchedCount is 0, the record no longer exists with our executionId and PROCESSING status
                if (updateRes.matchedCount === 0) {
                    console.warn(`[EffectOrchestrator] Heartbeat renewal lost ownership for ${effectKey} (executionId: ${newExecutionId})`);
                    ownershipLost = true;
                    isHeartbeatActive = false;
                    if (heartbeatTimer) {
                        clearInterval(heartbeatTimer);
                        heartbeatTimer = null;
                    }
                    if (typeof options.onHeartbeatLost === 'function') {
                        options.onHeartbeatLost();
                    }
                    return;
                }

                if (nextLockedUntil.getTime() > currentLockedUntil.getTime()) {
                    currentLockedUntil = nextLockedUntil;
                }
                if (typeof options.onHeartbeat === 'function') {
                    options.onHeartbeat(currentLockedUntil);
                }
            } catch (err) {
                console.warn(`[EffectOrchestrator] Heartbeat renewal DB error for ${effectKey}: ${err.message}`);
                // Conservative error handling: if the clock has passed the lease expiry,
                // ownership is considered lost to prevent split-brain execution
                if (Date.now() >= currentLockedUntil.getTime()) {
                    ownershipLost = true;
                    isHeartbeatActive = false;
                    if (heartbeatTimer) {
                        clearInterval(heartbeatTimer);
                        heartbeatTimer = null;
                    }
                }
                if (typeof options.onHeartbeatError === 'function') {
                    options.onHeartbeatError(err);
                }
            } finally {
                inFlightRenewalPromise = null;
            }
        })();

        return inFlightRenewalPromise;
    };

    const startHeartbeat = () => {
        isHeartbeatActive = true;
        heartbeatTimer = setInterval(renewLease, heartbeatInterval);
        if (heartbeatTimer.unref) {
            heartbeatTimer.unref();
        }
    };

    // 4. Execution with heartbeat lifecycle
    try {
        startHeartbeat();
        try {
            await fn();
        } finally {
            await stopHeartbeat();
        }

        // Post-execution fence: ensure this worker still owns the lease
        if (ownershipLost || Date.now() >= currentLockedUntil.getTime()) {
            ownershipLost = true;
            console.warn(`[EffectOrchestrator] STALE WORKER DETECTED after fn() execution for ${effectKey}. Lease was lost.`);
            throw new Error(`Stale worker exception during execution of ${effectKey}: lease was lost`);
        }

        const result = await EffectExecution.updateOne(
            { _id: claim._id, executionId: newExecutionId, status: 'PROCESSING' },
            { $set: { status: 'COMPLETED', lockedUntil: null, lastError: null } }
        );

        if (result.modifiedCount === 0) {
            console.warn(`[EffectOrchestrator] STALE WORKER DETECTED during COMPLETED for ${effectKey}. Lease was stolen.`);
            throw new Error(`Stale worker exception during COMPLETED checkpoint for ${effectKey}`);
        }

        return { status: 'COMPLETED' };
    } catch (err) {
        if (!ownershipLost) {
            const isAmbiguous = Boolean(err.isAmbiguous || err.name === 'AmbiguousEffectError' || options.isAmbiguousError?.(err));
            const targetStatus = isAmbiguous ? 'AMBIGUOUS' : 'FAILED';

            const result = await EffectExecution.updateOne(
                { _id: claim._id, executionId: newExecutionId, status: 'PROCESSING' },
                { $set: { status: targetStatus, lockedUntil: null, lastError: err.message } }
            );

            if (result.modifiedCount === 0) {
                console.warn(`[EffectOrchestrator] STALE WORKER DETECTED during ${targetStatus} for ${effectKey}. Lease was stolen.`);
            }
        } else {
            console.warn(`[EffectOrchestrator] Stale worker suppressed failure transition for ${effectKey}. Lease was lost.`);
        }

        throw err;
    }
};
