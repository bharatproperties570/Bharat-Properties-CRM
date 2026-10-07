/**
 * PRIVATE CAPABILITY SECRET
 * Not exported. Cannot be imported or forged by external modules or payloads.
 */
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

/**
 * Trusted Ingress Issuance Boundaries
 * These factory methods are the EXCLUSIVE way to generate proofs.
 * They represent the trusted system boundary.
 */

export class AuthorityProofIssuer {
    /**
     * Issues a Webhook Authority Proof for a target Deal.
     * MUST ONLY be called by webhook.controller.js AFTER verifying the Meta signature
     * and securely looking up the Deal by the verified phone number.
     */
    static issueWebhookDealProof(dealId) {
        if (!dealId) throw new Error("dealId required for webhook proof issuance");
        return new ServerAuthorityProof(dealId, 'WEBHOOK', AUTHORITY_SECRET);
    }

    /**
     * Issues a System Authority Proof for a target Lead.
     * MUST ONLY be called by trusted internal crons/schedulers (e.g. enrichmentEngine)
     * executing predefined server tasks.
     */
    static issueSystemLeadProof(leadId) {
        if (!leadId) throw new Error("leadId required for system proof issuance");
        return new ServerAuthorityProof(leadId, 'SYSTEM', AUTHORITY_SECRET);
    }
}
