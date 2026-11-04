import { Worker } from 'bullmq';
import redisConnection from '../config/redis.js';
import { executeDistributionCycle } from '../utils/distributionEngine.js';
import DistributionAudit from '../../models/DistributionAudit.js';
import { writeFailedJobLog } from '../utils/failedJobLogger.js';

export const distributionWorker = new Worker('distributionQueue', async (job) => {
    // Phase 5 / R14: Dedicated job processors
    if (job.name === 'process_pending_distribution') {
        const AutomationLog = (await import('../../models/AutomationLog.js')).default;
        const Lead = (await import('../../models/Lead.js')).default;
        const { distributeEntity } = await import('../utils/distributionEngine.js');
        const { idempotencyKey } = job.data;
        console.log(`[Distribution Worker] Processing pending distribution ${idempotencyKey}`);

        const log = await AutomationLog.findOneAndUpdate(
            { idempotencyKey, status: 'pending' },
            { $set: { status: 'processing', executedAt: new Date() } },
            { new: true }
        );

        if (!log) return null;

        const lead = await Lead.findById(log.targetEntityId);
        if (!lead) throw new Error(`Lead ${log.targetEntityId} missing for pending distribution.`);

        const triggerEvent = log.details?.triggerEvent || 'onCreate';
        const result = await distributeEntity(lead, triggerEvent, false, log._id);

        if (!result) {
            await AutomationLog.findByIdAndUpdate(log._id, { status: 'pending' });
            throw new Error('No eligible agents available yet (off-shift or capped). Retrying...');
        }

        return result;
    }

    if (job.name === 'process_domain_event') {
        const AutomationLog = (await import('../../models/AutomationLog.js')).default;
        const Lead = (await import('../../models/Lead.js')).default;
        const Deal = (await import('../../models/Deal.js')).default;
        const Inventory = (await import('../../models/Inventory.js')).default;
        const AutomationEngine = (await import('../../services/AutomationEngine.js')).default;

        const { idempotencyKey } = job.data;
        console.log(`[Distribution Worker] Processing DomainEvent ${idempotencyKey}`);

        const log = await AutomationLog.findOneAndUpdate(
            { idempotencyKey, status: 'pending' },
            { $set: { status: 'processing', executedAt: new Date() } },
            { new: true }
        );

        if (!log) {
            console.warn(`[Distribution Worker] DomainEvent ${idempotencyKey} not found or claimed.`);
            return null;
        }

        const { eventType, entityId, entityType } = log.details || {};
        let entity;
        if (entityType === 'Lead') entity = await Lead.findById(entityId);
        else if (entityType === 'Deal') entity = await Deal.findById(entityId);
        else if (entityType === 'Inventory') entity = await Inventory.findById(entityId);

        if (!entity) {
            await AutomationLog.findByIdAndUpdate(log._id, { status: 'failed', details: { ...log.details, error: 'Entity missing' } });
            throw new Error(`Entity ${entityId} (${entityType}) missing.`);
        }

        const entityPayload = entity.toObject ? entity.toObject() : entity;
        entityPayload._eventContext = { idempotencyKey };

        if (eventType === 'LEAD_CREATED') {
            try {
                const { default: nurtureBot } = await import('../../services/NurtureBot.js');
                await nurtureBot.initiate(entity).catch(e => console.error('[NurtureBot] error:', e));
            } catch (err) {
                console.error('[NurtureBot] Failed to trigger:', err.message);
            }
        }

        await AutomationEngine.processEvent(
            eventType,
            entityPayload,
            entityType,
            true
        );

        console.log(`[Distribution Worker] 📢 Successfully processed ${eventType}`);
        await AutomationLog.findByIdAndUpdate(log._id, { status: 'success' });
        return { success: true, eventType };
    }

    if (job.name === 'process_durable_event') {
        const AutomationLog = (await import('../../models/AutomationLog.js')).default;
        const Lead = (await import('../../models/Lead.js')).default;
        const AutomationEngine = (await import('../../services/AutomationEngine.js')).default;
        const eventBus = (await import('../../services/EventBus.js')).default;

        const { idempotencyKey } = job.data;
        console.log(`[Distribution Worker] Processing durable event ${idempotencyKey}`);

        const log = await AutomationLog.findOneAndUpdate(
            { idempotencyKey, status: 'pending' },
            { $set: { status: 'processing', executedAt: new Date() } },
            { new: true }
        );

        if (!log) {
            const existing = await AutomationLog.findOne({ idempotencyKey });
            if (!existing) {
                console.warn(`[Distribution Worker] Durable event ${idempotencyKey} not found.`);
            } else {
                console.log(`[Distribution Worker] Event ${idempotencyKey} is ${existing.status}. Skipping duplicate emission.`);
            }
            return null;
        }

        const lead = await Lead.findById(log.targetEntityId);
        if (!lead) {
            throw new Error(`Lead ${log.targetEntityId} missing for durable event.`);
        }

        const eventName = log.details?.eventName || 'LEAD_UPDATED';
        const leadPayload = lead.toObject ? lead.toObject() : lead;
        leadPayload._eventContext = { idempotencyKey };

        await AutomationEngine.processEvent(eventName, leadPayload, 'Lead', true);
        eventBus.emit(eventName, leadPayload);
        console.log(`[Distribution Worker] 📢 Emitted ${eventName} successfully.`);

        await AutomationLog.findByIdAndUpdate(log._id, { status: 'success' });
        return { success: true, eventName };
    }

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
