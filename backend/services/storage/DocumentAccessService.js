import mongoose from "mongoose";
import Document from '../../models/Document.js';
import DocumentVersion from '../../models/DocumentVersion.js';
import { getVisibilityFilter } from '../../utils/visibility.js';
import { hasPermission as defaultHasPermission } from '../permission.service.js';
import { ObjectNotFoundError, StorageError } from './StorageErrors.js';
import AccessGrant from './AccessGrant.js';

export class AccessDeniedError extends StorageError {
    constructor(message) {
        super(message);
        this.name = 'AccessDeniedError';
    }
}

export class LifecycleRestrictionError extends StorageError {
    constructor(state) {
        super(`Access denied due to document lifecycle state: ${state}`);
        this.name = 'LifecycleRestrictionError';
        this.state = state;
    }
}

export default class DocumentAccessService {
    /**
     * @param {Object} deps Dependency injection
     * @param {Function} deps.hasPermission Optional permission check override
     * @param {number} deps.defaultExpiryMs Default grant validity (configurable policy)
     * @param {number} deps.maxExpiryMs Maximum allowed grant validity (configurable policy)
     */
    constructor(deps = {}) {
        this.hasPermission = deps.hasPermission || defaultHasPermission;
        this.defaultExpiryMs = deps.defaultExpiryMs || (15 * 60 * 1000); // 15 min default
        this.maxExpiryMs = deps.maxExpiryMs || (60 * 60 * 1000); // 1 hour max
    }

    /**
     * Authorize access to a document and return a logical provider-neutral AccessGrant.
     */
    async authorizeAccess(user, documentId, operation, versionId = null, requestedExpiryMs = null) {
        if (!user) throw new AccessDeniedError("Authentication required.");

        // 1. Fetch Document
        const document = await Document.findOne({ documentId }).lean();
        
        if (!document) {
            throw new ObjectNotFoundError('CRM', documentId);
        }

        // 2. Fetch Parent Entity & Check Visibility
        const visibilityFilter = await getVisibilityFilter(user);
        
        const parentModelName = document.entityType;
        if (!mongoose.models[parentModelName]) {
            throw new StorageError(`Unknown parent entity type: ${parentModelName}`);
        }
        
        const ParentModel = mongoose.model(parentModelName);
        
        const parentQuery = {
            _id: document.entityId,
            ...visibilityFilter
        };

        const parentExists = await ParentModel.exists(parentQuery);

        if (!parentExists) {
            throw new ObjectNotFoundError('CRM', documentId);
        }

        // 3. Operation Authorization
        if (operation === 'WRITE' || operation === 'DELETE') {
            const moduleName = parentModelName.toLowerCase();
            const action = operation === 'WRITE' ? 'edit' : 'delete';
            const hasModulePerm = await this.hasPermission(user, moduleName, action);
            if (!hasModulePerm) {
                throw new AccessDeniedError(`Operation ${operation} denied on module ${moduleName}`);
            }
        }

        // 4. Lifecycle Security
        this._enforceLifecyclePolicy(document, operation);

        // 5. Version Binding
        let boundVersionId = versionId;
        if (!boundVersionId) {
            boundVersionId = document.currentVersionId ? document.currentVersionId.toString() : null;
        } else {
            const version = await DocumentVersion.findOne({ versionId: boundVersionId, documentId }).lean();
            if (!version) {
                throw new ObjectNotFoundError('CRM', boundVersionId);
            }
        }

        // 6. Expiry Policy Validation
        const actualExpiryMs = Math.min(
            requestedExpiryMs || this.defaultExpiryMs,
            this.maxExpiryMs
        );
        const expiresAt = Date.now() + actualExpiryMs;

        // 7. Generate Stateless Logical AccessGrant
        const grantId = new mongoose.Types.ObjectId().toString();

        return new AccessGrant({
            grantId,
            documentId,
            versionId: boundVersionId,
            operation,
            subjectId: user._id.toString(),
            expiresAt
        });
    }

    /**
     * Authorize an operation directly against a parent entity.
     * Used for creating documents where the document itself does not exist yet.
     */
    async authorizeEntityTarget(user, entityType, entityId, operation) {
        if (!user) throw new AccessDeniedError("Authentication required.");

        const visibilityFilter = await getVisibilityFilter(user);
        if (!mongoose.models[entityType]) {
            throw new StorageError(`Unknown parent entity type: ${entityType}`);
        }
        
        const ParentModel = mongoose.model(entityType);
        const parentQuery = {
            _id: entityId,
            ...visibilityFilter
        };

        const parentExists = await ParentModel.exists(parentQuery);
        if (!parentExists) {
            throw new ObjectNotFoundError('CRM', entityId);
        }

        if (operation === 'WRITE' || operation === 'DELETE') {
            const moduleName = entityType.toLowerCase();
            const action = operation === 'WRITE' ? 'edit' : 'delete';
            const hasModulePerm = await this.hasPermission(user, moduleName, action);
            if (!hasModulePerm) {
                throw new AccessDeniedError(`Operation ${operation} denied on module ${moduleName}`);
            }
        }
        return true;
    }

    _enforceLifecyclePolicy(document, operation) {
        const state = document.state;
        
        // LIFECYCLE ACCESS MATRIX
        const readDeniedStates = [
            'PENDING', 'UPLOADING', 'PROCESSING', 'CONTENT_VALIDATION', 
            'MALWARE_POLICY', 'REJECTED', 'QUARANTINED', 'DELETED', 
            'PURGE_ELIGIBLE', 'PURGED'
        ];
        
        const writeDeniedStates = [
            'PROCESSING', 'CONTENT_VALIDATION', 'MALWARE_POLICY', 
            'REJECTED', 'QUARANTINED', 'DELETED', 'PURGE_ELIGIBLE', 
            'PURGED', 'MIGRATING', 'MIGRATION_FAILED'
        ];

        const deleteDeniedStates = [
            'PURGED' // Already purged physically
        ];

        if (operation === 'READ' && readDeniedStates.includes(state)) {
            throw new LifecycleRestrictionError(state);
        }

        if (operation === 'WRITE' && writeDeniedStates.includes(state)) {
            throw new LifecycleRestrictionError(state);
        }
        
        if (operation === 'DELETE') {
            if (deleteDeniedStates.includes(state)) {
                throw new LifecycleRestrictionError(state);
            }
            if (document.legalHold) {
                throw new AccessDeniedError("Cannot logical-delete document under legal hold.");
            }
            if (document.retentionUntil && new Date(document.retentionUntil) > new Date()) {
                throw new AccessDeniedError("Cannot logical-delete document within retention period.");
            }
        }
    }
}
