import mongoose from 'mongoose';

const AUTHORITY_SECRET = Symbol('SERVER_AUTHORITY_SECRET');
const validProofs = new WeakSet();

export class ServerAuthorityProof {
    constructor(targetId, actorType, secret, provenance = {}) {
        if (secret !== AUTHORITY_SECRET) {
            throw new Error("SECURITY_VIOLATION: ServerAuthorityProof cannot be arbitrarily instantiated. It must be derived from a trusted server ingress boundary.");
        }
        if (!targetId || !actorType) {
            throw new Error("ServerAuthorityProof requires targetId and actorType");
        }
        this.targetId = targetId.toString();
        this.actorType = actorType;
        this.issuedAt = Date.now();
        this.provenance = provenance;
        this._isServerProof = true;
        Object.freeze(this.provenance);
        Object.freeze(this);
        
        validProofs.add(this);
    }
    
    static verify(proof) {
        if (!proof || !validProofs.has(proof)) {
            throw new Error("SECURITY_VIOLATION: Forged or invalid ServerAuthorityProof");
        }
        return true;
    }
}

export class AuthorityProofIssuer {
    /**
     * TRUSTED DOMAIN OPERATION: Requests SYSTEM enrichment.
     */
        /**
     * INTERNAL DOMAIN BOUNDARY
     * Only trusted execution contexts (like domainEventWorker) may request SYSTEM enrichment.
     * The public API has been removed to prevent unauthorized manufacturing of SYSTEM authority.
     */
    static async requestFromDomainEvent(leadId, eventType) {
        if (eventType !== 'LeadCreated' && eventType !== 'LeadUpdated' && eventType !== 'ManualEnrichmentRequested') {
            throw new Error("SECURITY_VIOLATION: Unrecognized domain event source");
        }
        return this._enqueueSystemEnrichment(leadId);
    }

    static async requestFromRevivalSync(leadId) {
        return this._enqueueSystemEnrichment(leadId);
    }

    static async requestFromTest(leadId) {
        if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID && !process.env.TEST_MODE) {
             throw new Error("SECURITY_VIOLATION: requestFromTest is only permitted in test environments");
        }
        return this._enqueueSystemEnrichment(leadId);
    }

    static async _enqueueSystemEnrichment(leadId) {

        const Lead = mongoose.models.Lead || mongoose.model('Lead');
        // Only allow request if it is not already requested or running
        const lead = await Lead.findOneAndUpdate(
            { _id: leadId, 'enrichmentState.status': { $in: ['NONE', 'COMPLETED', 'FAILED'] } },
            { 
                $set: { 
                    'enrichmentState.status': 'REQUESTED',
                    'enrichmentState.requestedAt': new Date()
                } 
            },
            { new: true }
        );
        
        if (lead) {
            const QueueManager = await import('../src/queues/queueManager.js');
            const job = await QueueManager.enrichmentQueue.add('enrichLead', { leadId: lead._id });
            return { success: true, jobId: job?.id || 'mock', status: 'REQUESTED' };
        }
        return { success: false, reason: 'ALREADY_REQUESTED_OR_CLAIMED' };
    }

    static async resolveWebhookProofs(mobile) {
        if (!mobile) throw new Error("mobile required for webhook proof resolution");
        
        const cleanMobile = mobile.replace(/[^0-9]/g, '').slice(-10);
        const Conversation = mongoose.models.Conversation || mongoose.model('Conversation');
        const conv = await Conversation.findOne({ phoneNumber: cleanMobile }).lean();
        
        if (!conv || !conv.verificationDealIds || conv.verificationDealIds.length === 0) {
            return [];
        }
        
        return conv.verificationDealIds.map(dealId => 
            new ServerAuthorityProof(dealId, 'WEBHOOK', AUTHORITY_SECRET, { authoritySource: 'WEBHOOK_CONVERSATION_MATCH' })
        );
    }

    /**
     * Atomically claims a Lead for SYSTEM enrichment.
     */
    static async resolveSystemProof(leadId, jobId = 'sync') {
        const Lead = mongoose.models.Lead || mongoose.model('Lead');
        
        const lead = await Lead.findOneAndUpdate(
            { _id: leadId, 'enrichmentState.status': 'REQUESTED' },
            { 
                $set: { 
                    'enrichmentState.status': 'CLAIMED', 
                    'enrichmentState.claimedAt': new Date(),
                    'enrichmentState.jobId': jobId 
                } 
            },
            { new: true }
        );

        if (!lead) {
            const existing = await Lead.findById(leadId).lean();
            if (!existing) throw new Error("SYSTEM_ENRICHMENT_TARGET_NOT_FOUND");
            if (existing.enrichmentState?.status === 'CLAIMED') throw new Error("SYSTEM_ENRICHMENT_ALREADY_CLAIMED");
            throw new Error("SYSTEM_ENRICHMENT_NOT_ELIGIBLE");
        }

        return new ServerAuthorityProof(leadId, 'SYSTEM', AUTHORITY_SECRET, {
            authoritySource: 'SYSTEM_ENRICHMENT_CLAIM',
            jobId
        });
    }

    /**
     * Finalizes the state after enrichment completes or fails.
     */
    static async finalizeSystemProof(leadId, success = true) {
        const Lead = mongoose.models.Lead || mongoose.model('Lead');
        await Lead.findOneAndUpdate(
            { _id: leadId, 'enrichmentState.status': 'CLAIMED' },
            { 
                $set: { 
                    'enrichmentState.status': success ? 'COMPLETED' : 'FAILED' 
                } 
            }
        );
    }
}
