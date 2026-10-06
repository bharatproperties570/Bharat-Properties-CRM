import crypto from 'crypto';
import { AppError } from '../../src/middlewares/error.middleware.js';

export class AIExecutionError extends AppError {
    constructor(message, details = {}) {
        super(`AI Execution Error: ${message}`, 403);
        this.name = 'AIExecutionError';
        this.details = details;
        this.isAIExecutionError = true;
    }
}

const ALLOWED_ACTOR_TYPES = ['HUMAN_USER', 'WEBHOOK', 'WORKER', 'SYSTEM'];

/**
 * AIExecutionContext
 * Canonical immutable runtime context object for AI executions.
 * Enforces tenant isolation, actor identity, and trust boundaries.
 */
class AIExecutionContext {
    /**
     * Private constructor. Use static factory methods.
     * @param {Object} trustedParams - Strongly validated and server-derived parameters
     */
    constructor(trustedParams) {
        if (!trustedParams) {
            throw new AIExecutionError('Missing context parameters');
        }

        // 1. Validate Tenant
        if (!trustedParams.tenantId) {
            throw new AIExecutionError('tenantId is strictly required for AI Execution');
        }

        // 2. Validate Actor Type
        if (!ALLOWED_ACTOR_TYPES.includes(trustedParams.actorType)) {
            throw new AIExecutionError(`Invalid actorType: ${trustedParams.actorType}`);
        }

        // 3. Validate Actor Identity (Required for all executable contexts)
        if (!trustedParams.actorId) {
            throw new AIExecutionError(`actorId is strictly required for executable context (${trustedParams.actorType})`);
        }

        // 4. Map Trusted Values
        this.tenantId = trustedParams.tenantId;
        this.actorType = trustedParams.actorType;
        this.actorId = trustedParams.actorId;
        
        // Ensure arrays are copied to prevent reference mutation before freezing
        this.roles = Array.isArray(trustedParams.roles) ? [...trustedParams.roles] : [];
        this.permissions = Array.isArray(trustedParams.permissions) ? [...trustedParams.permissions] : [];
        
        this.correlationId = trustedParams.correlationId || crypto.randomUUID();
        this.sourceChannel = trustedParams.sourceChannel || 'INTERNAL';
        this.timestamp = trustedParams.timestamp instanceof Date ? trustedParams.timestamp : new Date();

        // 5. Freeze to guarantee Immutability
        Object.freeze(this.roles);
        Object.freeze(this.permissions);
        Object.freeze(this);
    }

    /**
     * Factory for standard authenticated HTTP requests.
     * Extracts trusted identity directly from req.user
     * @param {Object} reqUser - The authenticated req.user object
     * @param {string} [correlationId] - Optional existing tracing ID
     */
    static fromHttpRequest(reqUser, correlationId = null) {
        if (!reqUser) {
            throw new AIExecutionError('req.user is required to build HTTP context');
        }
        
        return new AIExecutionContext({
            tenantId: reqUser.tenantId?.toString() || reqUser.tenant?.toString(), // Support multiple common Mongoose schema patterns
            actorType: 'HUMAN_USER',
            actorId: reqUser._id?.toString() || reqUser.id,
            roles: reqUser.roles || (reqUser.role ? [reqUser.role] : []),
            permissions: reqUser.permissions || [],
            correlationId,
            sourceChannel: 'HTTP_API'
        });
    }

    /**
     * Factory for webhook execution.
     * Identity must be resolved by webhook middleware via IntegrationSettings.
     */
    static fromWebhook(integration, correlationId = null) {
        if (!integration || !integration.tenantId || !integration._id) {
            throw new AIExecutionError('Verified integration object with tenantId is required for Webhook context');
        }

        return new AIExecutionContext({
            tenantId: integration.tenantId.toString(),
            actorType: 'WEBHOOK',
            actorId: integration._id.toString(),
            roles: ['WEBHOOK_SYSTEM'],
            permissions: integration.permissions || [], // E.g., restricted webhook scopes
            correlationId,
            sourceChannel: 'WEBHOOK'
        });
    }

    /**
     * Factory for System level execution (e.g., cron jobs)
     */
    static fromSystem(tenantId, systemIdentifier, correlationId = null) {
        return new AIExecutionContext({
            tenantId,
            actorType: 'SYSTEM',
            actorId: systemIdentifier,
            roles: ['SYSTEM'],
            permissions: [], // System jobs rely on specialized capability checks
            correlationId,
            sourceChannel: 'CRON'
        });
    }

    /**
     * Serialize context for BullMQ/Async workers
     */
    toJSON() {
        return {
            tenantId: this.tenantId,
            actorType: this.actorType,
            actorId: this.actorId,
            roles: [...this.roles],
            permissions: [...this.permissions],
            correlationId: this.correlationId,
            sourceChannel: this.sourceChannel,
            timestamp: this.timestamp.toISOString()
        };
    }

    /**
     * Deserialize context from BullMQ/Async workers
     * Note: Permissions revalidation must happen at the Domain Service layer for mutations!
     */
    static fromSerialized(data) {
        if (!data || typeof data !== 'object') {
            throw new AIExecutionError('Invalid serialized context data');
        }
        
        // The constructor handles all strict validations again
        return new AIExecutionContext({
            tenantId: data.tenantId,
            actorType: data.actorType,
            actorId: data.actorId,
            roles: data.roles || [],
            permissions: data.permissions || [],
            correlationId: data.correlationId,
            sourceChannel: data.sourceChannel,
            timestamp: data.timestamp ? new Date(data.timestamp) : new Date()
        });
    }
}

export default AIExecutionContext;
