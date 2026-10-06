import { AppError } from "../../src/middlewares/error.middleware.js";

export class AIGovernanceError extends AppError {
    constructor(reason, capability = 'UNKNOWN') {
        super(`AI Governance Blocked: ${reason} (Capability: ${capability})`, 403);
        this.name = 'AIGovernanceError';
        this.reason = reason;
        this.capability = capability;
        this.isGovernanceError = true;
    }
}
