import mongoose from 'mongoose';

const AUTHORITY_SECRET = Symbol('SERVER_AUTHORITY_SECRET');

export class ServerAuthorityProof {
    constructor(targetId, actorType, secret) {
        if (secret !== AUTHORITY_SECRET) {
            throw new Error("SECURITY_VIOLATION: ServerAuthorityProof cannot be arbitrarily instantiated. It must be derived from a trusted server ingress boundary.");
        }
        if (!targetId || !actorType) {
            throw new Error("ServerAuthorityProof requires targetId and actorType");
        }
        this.targetId = targetId.toString();
        this.actorType = actorType;
        this.issuedAt = Date.now();
        this._isServerProof = true;
    }
}

export class AuthorityProofIssuer {
    /**
     * Resolves pending verification deals for a given mobile number.
     * This independently verifies the CRM relationship (Conversation -> verificationDealIds)
     * preventing callers from arbitrarily injecting deal IDs.
     */
    static async resolveWebhookProofs(mobile) {
        if (!mobile) throw new Error("mobile required for webhook proof resolution");
        
        const cleanMobile = mobile.replace(/[^0-9]/g, '').slice(-10);
        const Conversation = mongoose.models.Conversation || mongoose.model('Conversation');
        const conv = await Conversation.findOne({ phoneNumber: cleanMobile }).lean();
        
        if (!conv || !conv.verificationDealIds || conv.verificationDealIds.length === 0) {
            return [];
        }
        
        return conv.verificationDealIds.map(dealId => 
            new ServerAuthorityProof(dealId, 'WEBHOOK', AUTHORITY_SECRET)
        );
    }

    /**
     * Attempts to resolve system authority for Lead enrichment.
     * Forensic audit concluded that enrichmentEngine currently processes arbitrary caller-supplied lead IDs
     * rather than performing independent server-side target resolution.
     * Therefore, System authority CANNOT be safely certified in this gate.
     */
    static async resolveSystemProof(leadId) {
        throw new Error("P16_RUNTIME_SECURITY_R4B1R4_BLOCKED_NO_TRUSTED_SYSTEM_TARGET_SOURCE");
    }
}
