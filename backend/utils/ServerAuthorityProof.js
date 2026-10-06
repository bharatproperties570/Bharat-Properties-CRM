export class ServerAuthorityProof {
    constructor(targetId, actorType) {
        if (!targetId || !actorType) {
            throw new Error("ServerAuthorityProof requires targetId and actorType");
        }
        this.targetId = targetId.toString();
        this.actorType = actorType;
        this.issuedAt = Date.now();
        // This is a private symbol/flag equivalent that JSON.parse cannot forge
        // because the instance prototype will not match.
    }
}
