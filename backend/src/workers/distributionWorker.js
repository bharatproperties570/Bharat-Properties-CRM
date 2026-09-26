import { Worker } from 'bullmq';
import redisConnection from '../config/redis.js';
import { executeDistributionCycle } from '../utils/distributionEngine.js';
import DistributionAudit from '../../models/DistributionAudit.js';
import { writeFailedJobLog } from '../utils/failedJobLogger.js';

export const distributionWorker = new Worker('distributionQueue', async (job) => {
    const { entityId, modelName, triggerEvent, cycleId, attempt } = job.data;

    // 9. LEGACY COMPATIBILITY
    // Handle transitional full-entity payloads seamlessly until queue clears.
    const actualEntityId = entityId || (job.data.entity && (job.data.entity._id || job.data.entity.id));
    const actualModelName = modelName || (job.data.entity && job.data.entity.constructor?.modelName) || 'Lead';
    const actualCycleId = cycleId || `cycle_legacy_${job.id}`;

    console.log(`[Distribution Worker] Processing queued distribution for ${actualModelName} ${actualEntityId} | cycleId: ${actualCycleId} | attempt: ${job.attemptsMade + 1}`);

    // 1. WORKER ARCHITECTURE: Call the authoritative execution cycle
    const result = await executeDistributionCycle({
        entityId: actualEntityId,
        modelName: actualModelName,
        triggerEvent,
        cycleId: actualCycleId,
        attempt: job.attemptsMade + 1
    });

    return result;
}, { connection: redisConnection });

distributionWorker.on('failed', async (job, err) => {
    console.error(`[Distribution Worker] Job ${job.id} failed attempt ${job.attemptsMade}:`, err.message);

    const maxAttempts = job.opts.attempts || 1;
    if (job.attemptsMade >= maxAttempts) {
        console.error(`[Distribution Worker] 💀 Terminal failure for Job ${job.id}. Exhausted all ${maxAttempts} retries.`);

        const { entityId, modelName, triggerEvent, cycleId } = job.data;
        const actualEntityId = entityId || (job.data.entity && (job.data.entity._id || job.data.entity.id));
        const actualModelName = modelName || 'Lead';
        const actualCycleId = cycleId || `cycle_legacy_${job.id}`;

        try {
            await DistributionAudit.create({
                entityId: actualEntityId,
                modelName: actualModelName,
                cycleId: actualCycleId,
                triggerEvent,
                status: 'FAILED',
                reason: err.message,
                attempt: job.attemptsMade
            });
            console.log(`[Distribution Worker] 💾 Terminal failure recorded to DistributionAudit for ${actualEntityId}.`);
        } catch (auditErr) {
            if (auditErr.code !== 11000) {
                console.error(`[Distribution Worker] ❌ Failed to write terminal audit log:`, auditErr.message);
            }
        }
    }
    await writeFailedJobLog(job, err);
});
