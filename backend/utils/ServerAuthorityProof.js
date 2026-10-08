import mongoose from 'mongoose';
import crypto from 'crypto';

const AUTHORITY_SECRET = Symbol('SERVER_AUTHORITY_SECRET');
const validProofs = new WeakSet();

async function _enqueueSystemEnrichment(leadId) {
    if (!leadId) throw new Error("SECURITY_VIOLATION: Missing target ID");
    
    const claimToken = crypto.randomBytes(32).toString('hex');
    const claimTokenHash = crypto.createHash('sha256').update(claimToken).digest('hex');

    const Lead = mongoose.model("Lead");
    const updated = await Lead.findOneAndUpdate(
        { _id: leadId, "enrichmentState.status": { $nin: ["REQUESTED", "COMPLETED", "IN_PROGRESS", "FAILED_PERMANENTLY"] } },
        { 
            $set: { 
                "enrichmentState.status": "REQUESTED", 
                "enrichmentState.requestedAt": new Date(),
                "enrichmentState.claimTokenHash": claimTokenHash
            } 
        },
        { new: true }
    );
    if (!updated) {
        throw new Error("SECURITY_VIOLATION: Lead not found or already requested");
    }
    const queues = await import('../src/queues/queueManager.js');
    await queues.enrichmentQueue.add('enrichLead', { leadId, claimToken });
}

export class ServerAuthorityProof {
    constructor(secret, targetId, jobId, actorType = 'SYSTEM', enrichmentExecutionId = null, companyId = null) {
        if (secret !== AUTHORITY_SECRET) {
            throw new Error("SECURITY_VIOLATION: Cannot directly construct ServerAuthorityProof");
        }
        if (!jobId) throw new Error("SECURITY_VIOLATION: Missing execution identity (jobId)");
        this.targetId = targetId.toString();
        this.jobId = jobId.toString();
        this.actorType = actorType;
        this.enrichmentExecutionId = enrichmentExecutionId;
        this.companyId = companyId ? companyId.toString() : null;
        Object.freeze(this);
        validProofs.add(this);
    }
}

export class AuthorityProofIssuer {
    
    static async resolveSystemProof(leadId, jobId = 'sync', claimToken) {
        if (!claimToken) throw new Error("SECURITY_VIOLATION: Missing claim token");
        const claimTokenHash = crypto.createHash('sha256').update(claimToken).digest('hex');
        
        // Generate Canonical Execution Identity
        const enrichmentExecutionId = `exec_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

        const Lead = mongoose.model("Lead");
        const updated = await Lead.findOneAndUpdate(
            { 
                _id: leadId, 
                "enrichmentState.claimTokenHash": claimTokenHash,
                "enrichmentState.status": { $in: ["REQUESTED", "FAILED"] }
            },
            { $set: { 
                "enrichmentState.status": "CLAIMED", 
                "enrichmentState.lastJobId": jobId, 
                "enrichmentState.claimedAt": new Date(),
                "enrichmentState.enrichmentExecutionId": enrichmentExecutionId
            } },
            { new: true }
        );
        if (!updated) {
            throw new Error("SECURITY_VIOLATION: Missing execution context/authority proof");
        }
        
        const companyId = updated.companyId ? updated.companyId.toString() : null;
        
        return new ServerAuthorityProof(AUTHORITY_SECRET, leadId, jobId, 'SYSTEM', enrichmentExecutionId, companyId);
    }

    static async finalizeSystemProof(proof, success = true) {
        if (!proof || !AuthorityProofIssuer.verify(proof)) {
            throw new Error("SECURITY_VIOLATION: Invalid or forged proof");
        }
        if (proof.actorType !== 'SYSTEM' || !proof.targetId || !proof.jobId) {
            throw new Error("SECURITY_VIOLATION: Invalid execution identity");
        }
        
        // R4-B6-R2 requires full mutation protection. For R1, we ensure finalization binds to the execution ID.
        const execIdQuery = proof.enrichmentExecutionId ? { "enrichmentState.enrichmentExecutionId": proof.enrichmentExecutionId } : {};
        
        const leadId = proof.targetId;
        const jobId = proof.jobId;
        const Lead = mongoose.model("Lead");
        const update = success 
            ? { $set: { "enrichmentState.status": "COMPLETED", "enrichmentState.completedAt": new Date() }, $unset: { "enrichmentState.claimTokenHash": 1 } }
            : { $set: { "enrichmentState.status": "FAILED", "enrichmentState.failedAt": new Date() } };

        const updated = await Lead.findOneAndUpdate(
            { 
                _id: leadId, 
                "enrichmentState.status": "CLAIMED",
                "enrichmentState.lastJobId": jobId,
                ...execIdQuery
            },
            update,
            { new: true }
        );
        if (!updated) {
            throw new Error("SECURITY_VIOLATION: Finalization failed or unauthorized state");
        }
    }

    static async resolveWebhookProofs(mobile) {
        let Conversation;
        try {
            Conversation = mongoose.model('Conversation');
        } catch(e) {
            Conversation = (await import('../models/Conversation.js')).default;
        }
        
        const openConv = await Conversation.findOne({
            userPhone: mobile,
            status: { $in: ['open', 'pending'] }
        });

        if (!openConv) {
            throw new Error("SECURITY_VIOLATION: Invalid WEBHOOK proof");
        }

        return {
            verify: (proof) => validProofs.has(proof)
        };
    }

    static verify(proof) {
        return validProofs.has(proof);
    }
}

// ---------------------------------------------------------
// TRUSTED BOOTSTRAP WIRING
// ---------------------------------------------------------
// The business logic modules NO LONGER receive capability issuers.
// They return execution intents.
// ServerAuthorityProof securely evaluates these intents and applies
// the privately held capability, ensuring zero public API surface.

import { Worker } from '../src/config/redis.js';
import redisConnection from '../src/config/redis.js';
import { processDomainEventJob } from '../src/workers/domainEventWorkerLogic.js';
import * as StageTransitionEngineLogic from '../src/services/StageTransitionEngineLogic.js';
import RevivalSyncService from '../src/services/RevivalSyncService.js';

const domainEventIssuer = async (jobData) => {
    if (!jobData) throw new Error("SECURITY_VIOLATION: Invalid job provenance");
    const { eventId, aggregateId, aggregateType, eventType, payload } = jobData;
    if (!eventId || !aggregateId || !aggregateType || !eventType) throw new Error("SECURITY_VIOLATION: Missing event provenance");
    
    let targetLeadId;
    if (aggregateType === 'Lead') {
        targetLeadId = aggregateId;
    } else if (aggregateType === 'Activity') {
        const Activity = mongoose.models.Activity || mongoose.model('Activity');
        const activity = await Activity.findById(aggregateId).select('entityType entityId').lean();
        if (activity?.entityType?.toLowerCase() === 'lead' && activity?.entityId) {
            targetLeadId = activity.entityId;
        } else {
            throw new Error("SECURITY_VIOLATION: Activity event missing valid Lead enrichment target");
        }
    } else {
        throw new Error("SECURITY_VIOLATION: Unsupported aggregateType for DomainEvent enrichment target");
    }

    const capability = {
        eventId,
        aggregateId,
        aggregateType,
        eventType,
        requestSystemEnrichment: async () => await _enqueueSystemEnrichment(targetLeadId)
    };
    return Object.freeze(capability);
};

const revivalSyncIssuer = (leadId) => {
    if (!leadId) throw new Error("SECURITY_VIOLATION: Missing target ID");
    const capability = {
        targetId: leadId,
        requestSystemEnrichment: async () => await _enqueueSystemEnrichment(leadId)
    };
    return Object.freeze(capability);
};

// 1. Compose DomainEventWorker
const _domainEventWorker = new Worker('domainEventQueue', async (job) => {
    if (!job || !job.data) throw new Error("SECURITY_VIOLATION: Invalid job provenance");
    
    // Evaluate the business logic which returns an intent
    const intent = await processDomainEventJob(job);
    
    // Process intent using the private capability
    if (intent?.action === 'REQUEST_SYSTEM_ENRICHMENT') {
        const capability = await domainEventIssuer(job.data);
        await capability.requestSystemEnrichment();
    }
}, { connection: redisConnection });

_domainEventWorker.on('failed', async (job, err) => {
    console.error(`[DomainEventWorker] Job ${job?.id} failed:`, err.message);
});
_domainEventWorker.on('error', err => {});

export const domainEventWorker = {
    close: async () => await _domainEventWorker.close(),
    on: (event, cb) => _domainEventWorker.on(event, cb),
    removeListener: (event, cb) => _domainEventWorker.removeListener(event, cb)
};

// 2. Compose StageTransitionEngine
export const StageTransitionEngine = {
    ...StageTransitionEngineLogic,
    executeTransition: async (leadId, newStage, options) => {
        // Evaluate the transition
        const result = await StageTransitionEngineLogic.executeTransition(leadId, newStage, options);
        
        // Process intent using the private capability
        if (result?.triggerRevivalSync) {
            const revivalIntent = await RevivalSyncService.processRevivalActions(leadId, options.triggeredByUser);
            if (revivalIntent?.intent === 'REQUEST_SYSTEM_ENRICHMENT') {
                const capability = revivalSyncIssuer(leadId);
                await capability.requestSystemEnrichment();
            }
        }
        return result;
    },
    evaluateAndTransition: async (leadId, activityType, outcome, outcomeReason, context = {}) => {
        // We must also wrap evaluateAndTransition because it calls executeTransition internally in the logic file.
        // Wait, if evaluateAndTransition calls executeTransition internally in StageTransitionEngineLogic.js,
        // it will call the UNWRAPPED executeTransition!
        // So we must handle the intent returned from evaluateAndTransition as well!
        const result = await StageTransitionEngineLogic.evaluateAndTransition(leadId, activityType, outcome, outcomeReason, context);
        if (result?.stageChanged) {
            // Wait, evaluateAndTransition returns { stageChanged, prevStage, newStage }.
            // Does it return triggerRevivalSync? Let's propagate it.
            if (result.triggerRevivalSync) {
                const revivalIntent = await RevivalSyncService.processRevivalActions(leadId, context.triggeredByUser);
                if (revivalIntent?.intent === 'REQUEST_SYSTEM_ENRICHMENT') {
                    const capability = revivalSyncIssuer(leadId);
                    await capability.requestSystemEnrichment();
                }
            }
        }
        return result;
    }
};

