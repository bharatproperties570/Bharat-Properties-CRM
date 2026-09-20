import EffectExecution from '../../models/EffectExecution.js';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

const LEASE_DURATION = 60000;
const MAX_ATTEMPTS = 5;
const WORKER_ID = `${os.hostname()}-${process.pid}`;

export const executeEffect = async (eventId, effectKey, aggregateType, aggregateId, fn) => {
    // 1. Establish baseline record
    await EffectExecution.updateOne(
        { eventId, effectKey },
        { 
            $setOnInsert: { 
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
    const lockedUntil = new Date(now.getTime() + LEASE_DURATION);

    const claim = await EffectExecution.findOneAndUpdate(
        {
            eventId,
            effectKey,
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
        const existing = await EffectExecution.findOne({ eventId, effectKey });
        if (!existing) throw new Error(`EffectExecution disappeared: ${eventId}:${effectKey}`);
        if (existing.status === 'COMPLETED') {
            console.log(`[EffectOrchestrator] Skipping ${effectKey}: Already COMPLETED.`);
            return { status: 'SKIPPED' };
        }
        if (existing.status === 'FAILED' && existing.attempts >= MAX_ATTEMPTS) {
            throw new Error(`Terminal failure reached for ${effectKey}. Attempts: ${existing.attempts}`);
        }
        throw new Error(`Effect ${effectKey} is currently locked by another worker.`);
    }

    try {
        await fn();

        const result = await EffectExecution.updateOne(
            { _id: claim._id, executionId: newExecutionId },
            { $set: { status: 'COMPLETED', lockedUntil: null, lastError: null } }
        );

        if (result.modifiedCount === 0) {
            console.warn(`[EffectOrchestrator] STALE WORKER DETECTED during COMPLETED for ${effectKey}. Lease was stolen.`);
            throw new Error(`Stale worker exception during COMPLETED checkpoint for ${effectKey}`);
        }

        return { status: 'COMPLETED' };
    } catch (err) {
        const result = await EffectExecution.updateOne(
            { _id: claim._id, executionId: newExecutionId },
            { $set: { status: 'FAILED', lockedUntil: null, lastError: err.message } }
        );

        if (result.modifiedCount === 0) {
            console.warn(`[EffectOrchestrator] STALE WORKER DETECTED during FAILED for ${effectKey}. Lease was stolen.`);
        }

        throw err;
    }
};
