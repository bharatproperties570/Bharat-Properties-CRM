import mongoose from 'mongoose';

const AUTHORITY_SECRET = Symbol('SERVER_AUTHORITY_SECRET');

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
    }
}

export class AuthorityProofIssuer {
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
     * Atomically claims a Lead for SYSTEM enrichment based on its trusted status.
     * Revalidates execution-time eligibility and rejects stale or replayed requests.
     */
    static async resolveSystemProof(leadId, jobId = 'sync') {
        const Lead = mongoose.models.Lead || mongoose.model('Lead');
        
        // Atomic claim: only succeed if the lead is currently REQUESTED
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
            // Determine failure reason
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
