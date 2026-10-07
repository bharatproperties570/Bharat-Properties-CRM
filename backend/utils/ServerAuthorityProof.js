import mongoose from 'mongoose';

const AUTHORITY_SECRET = Symbol('SERVER_AUTHORITY_SECRET');
const validProofs = new WeakSet();

async function _enqueueSystemEnrichment(leadId) {
    if (!leadId) throw new Error("SECURITY_VIOLATION: Missing target ID");
    const Lead = mongoose.model("Lead");
    const updated = await Lead.findOneAndUpdate(
        { _id: leadId, "enrichmentState.status": { $nin: ["REQUESTED", "COMPLETED", "IN_PROGRESS", "FAILED_PERMANENTLY"] } },
        { $set: { "enrichmentState.status": "REQUESTED", "enrichmentState.requestedAt": new Date() } },
        { new: true }
    );
    if (!updated) {
        throw new Error("SECURITY_VIOLATION: Lead not found or already requested");
    }
    const queues = await import('../src/queues/queueManager.js');
    await queues.enrichmentQueue.add('enrichLead', { leadId });
}

export class ServerAuthorityProof {
    constructor(secret, targetId, actorType = 'SYSTEM') {
        if (secret !== AUTHORITY_SECRET) {
            throw new Error("SECURITY_VIOLATION: Cannot directly construct ServerAuthorityProof");
        }
        this.targetId = targetId.toString();
        this.actorType = actorType;
        Object.freeze(this);
        validProofs.add(this);
    }
}

export class AuthorityProofIssuer {
    
    static async resolveSystemProof(leadId, jobId = 'sync') {
        const Lead = mongoose.model("Lead");
        const updated = await Lead.findOneAndUpdate(
            { _id: leadId, "enrichmentState.status": "REQUESTED" },
            { $set: { "enrichmentState.status": "CLAIMED", "enrichmentState.lastJobId": jobId, "enrichmentState.claimedAt": new Date() } },
            { new: true }
        );
        if (!updated) {
            throw new Error("SECURITY_VIOLATION: Missing execution context/authority proof");
        }
        return new ServerAuthorityProof(AUTHORITY_SECRET, leadId);
    }

    static async finalizeSystemProof(leadId, success = true) {
        const Lead = mongoose.model("Lead");
        const update = success 
            ? { $set: { "enrichmentState.status": "COMPLETED", "enrichmentState.completedAt": new Date() } }
            : { $set: { "enrichmentState.status": "FAILED" } };

        const updated = await Lead.findOneAndUpdate(
            { _id: leadId, "enrichmentState.status": "CLAIMED" },
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
// Instead of exporting acquirers or using setters (which an attacker could call first),
// ServerAuthorityProof internally wires the capability issuers directly into
// the consumers via a private composition boundary.
// This makes it absolutely impossible for an arbitrary module to acquire or inject issuers.

import { Worker } from 'bullmq';
import redisConnection from '../src/config/redis.js';
import { processDomainEventJob } from '../src/workers/domainEventWorkerLogic.js';
import { __composeStageTransitionEngine } from '../src/services/StageTransitionEngineLogic.js';

const domainEventIssuer = (jobData) => {
    if (!jobData) throw new Error("SECURITY_VIOLATION: Invalid job provenance");
    const { eventId, aggregateId, aggregateType, eventType } = jobData;
    if (!eventId || !aggregateId || !aggregateType || !eventType) throw new Error("SECURITY_VIOLATION: Missing event provenance");
    const capability = {
        eventId,
        aggregateId,
        aggregateType,
        eventType,
        requestSystemEnrichment: async () => await _enqueueSystemEnrichment(aggregateId)
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
export const domainEventWorker = new Worker('domainEventQueue', async (job) => {
    if (!job || !job.data) throw new Error("SECURITY_VIOLATION: Invalid job provenance");
    const capability = domainEventIssuer(job.data);
    return await processDomainEventJob(job, capability);
}, { connection: redisConnection });

domainEventWorker.on('failed', async (job, err) => {
    console.error(`[DomainEventWorker] Job ${job?.id} failed:`, err.message);
});
domainEventWorker.on('error', err => {});

// 2. Compose StageTransitionEngine
export const StageTransitionEngine = __composeStageTransitionEngine(revivalSyncIssuer);

