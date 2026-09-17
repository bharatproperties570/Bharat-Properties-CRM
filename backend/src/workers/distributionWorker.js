import { Worker } from 'bullmq';
import redisConnection from '../config/redis.js';
import { distributeEntity } from '../utils/distributionEngine.js';
import AutomationLog from '../../models/AutomationLog.js';
import Lead from '../../models/Lead.js';
import eventBus from '../../services/EventBus.js';
import AutomationEngine from '../../services/AutomationEngine.js';
import Deal from '../../models/Deal.js';
import Inventory from '../../models/Inventory.js';

export const distributionWorker = new Worker('distributionQueue', async (job) => {
    if (job.name === 'process_pending_distribution') {
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
        
        // This will natively start a transaction, assign, create LeadDistribution, mark pendingLog as success, and enqueue process_durable_event!
        const result = await distributeEntity(lead, triggerEvent, false, log._id);
        
        if (!result) {
            // Revert back to pending so it can be retried if no agents available
            await AutomationLog.findByIdAndUpdate(log._id, { status: 'pending' });
            throw new Error('No eligible agents available yet (off-shift or capped). Retrying...');
        }
        
        return result;
    }

    if (job.name === 'process_domain_event') {
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
        
        // 1. Safely trigger NurtureBot ONLY for LEAD_CREATED
        if (eventType === 'LEAD_CREATED') {
            try {
                const { default: nurtureBot } = await import('../../services/NurtureBot.js');
                await nurtureBot.initiate(entity).catch(e => console.error('[NurtureBot] error:', e));
            } catch (err) {
                console.error('[NurtureBot] Failed to trigger:', err.message);
            }
        }
        
        // 2. Direct AutomationEngine invocation with strict error propagation
        await AutomationEngine.processEvent(
            eventType,
            entityPayload,
            entityType,
            true
        );
        
        console.log(`[Distribution Worker] 📢 Successfully processed ${eventType}`);
        
        // Mark durable log successful!
        await AutomationLog.findByIdAndUpdate(log._id, { status: 'success' });
        return { success: true, eventType };
    }

    if (job.name === 'process_durable_event') {
        const { idempotencyKey } = job.data;
        console.log(`[Distribution Worker] Processing durable event ${idempotencyKey}`);
        
        const log = await AutomationLog.findOneAndUpdate(
            { idempotencyKey, status: 'pending' },
            { $set: { status: 'processing', executedAt: new Date() } },
            { new: true }
        );
        
        if (!log) {
            // Verify if it already succeeded or is currently processing by another worker
            const existing = await AutomationLog.findOne({ idempotencyKey });
            if (!existing) {
                console.warn(`[Distribution Worker] Durable event ${idempotencyKey} not found.`);
            } else {
                console.log(`[Distribution Worker] Event ${idempotencyKey} is ${existing.status}. Skipping duplicate emission.`);
            }
            return null;
        }
        
        // Load Lead to emit to AutomationEngine (maintaining contract)
        const lead = await Lead.findById(log.targetEntityId);
        if (!lead) {
            throw new Error(`Lead ${log.targetEntityId} missing for durable event.`);
        }
        
        const eventName = log.details?.eventName || 'LEAD_UPDATED';
        // Inject event identity for downstream idempotency
        const leadPayload = lead.toObject ? lead.toObject() : lead;
        leadPayload._eventContext = { idempotencyKey };
        
        await AutomationEngine.processEvent(eventName, leadPayload, 'Lead', true);
        eventBus.emit(eventName, leadPayload); // preserved for non-critical listeners
        console.log(`[Distribution Worker] 📢 Emitted ${eventName} successfully.`);
        
        // Mark durable log successful!
        await AutomationLog.findByIdAndUpdate(log._id, { status: 'success' });
        return { success: true, eventName };
    }

    // Default 'distribute' processing
    const { entity, triggerEvent } = job.data;
    console.log(`[Distribution Worker] Processing queued distribution for entity ${entity._id}`);
    
    // Pass true for isRetry flag to prevent infinite loops of re-queuing
    const result = await distributeEntity(entity, triggerEvent, true);
    
    if (!result) {
        throw new Error('No eligible agents available yet (off-shift or capped). Retrying...');
    }
    
    return result;
}, { connection: redisConnection });

distributionWorker.on('failed', (job, err) => {
    console.error(`[Distribution Worker] Job ${job.id} failed:`, err.message);
});
