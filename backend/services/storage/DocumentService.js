import { withMongoTransaction } from '../../utils/withMongoTransaction.js';
import mongoose from 'mongoose';
import Document from '../../models/Document.js';
import DocumentVersion from '../../models/DocumentVersion.js';
import DocumentAccessService, { LifecycleRestrictionError } from './DocumentAccessService.js';
import ProviderRegistry from './ProviderRegistry.js';
import { StorageError, ObjectNotFoundError, ObjectConflictError } from './StorageErrors.js';
import crypto from 'crypto';

export class LifecycleTransitionError extends StorageError {
    constructor(from, to) {
        super(`Invalid lifecycle transition from ${from} to ${to}`);
        this.name = 'LifecycleTransitionError';
    }
}

export default class DocumentService {
    /**
     * @param {Object} deps Dependency Injection
     * @param {DocumentAccessService} deps.accessService
     * @param {ProviderRegistry} deps.registry
     */
    constructor(deps = {}) {
        this.accessService = deps.accessService || new DocumentAccessService();
        this.registry = deps.registry || new ProviderRegistry(); 
        // In real app, registry must be configured with SecretStore and factories.
        // For testing we will inject a fake registry.
    }

    _transitionState(document, newState) {
        const validTransitions = {
            'PENDING': ['UPLOADING', 'DELETED'],
            'UPLOADING': ['PROCESSING', 'MALWARE_POLICY', 'DELETED'],
            'PROCESSING': ['CONTENT_VALIDATION', 'MALWARE_POLICY', 'DELETED'],
            'CONTENT_VALIDATION': ['MALWARE_POLICY', 'DELETED'],
            'MALWARE_POLICY': ['ACTIVE', 'REJECTED', 'QUARANTINED', 'DELETED'],
            'ACTIVE': ['DELETED'],
            'DELETED': ['PURGE_ELIGIBLE', 'ACTIVE'], // ACTIVE for restore
            'MIGRATING': ['ACTIVE', 'MIGRATION_FAILED']
        };

        const allowed = validTransitions[document.state];
        if (!allowed || !allowed.includes(newState)) {
            throw new LifecycleTransitionError(document.state, newState);
        }
        document.state = newState;
    }

    /**
     * 1. Create Document (and initial version metadata)
     */
    async createDocument(user, payload) {
        const { entityType, entityId, providerInstanceId, logicalKey, metadata } = payload;
        
        // Authorize creation on parent entity
        await this.accessService.authorizeEntityTarget(user, entityType, entityId, 'WRITE');

        const documentId = `doc-${crypto.randomBytes(8).toString('hex')}`;
        const versionId = `ver-${crypto.randomBytes(8).toString('hex')}`;
        
        // Note: Transaction support requires replica set. Assuming no transactions for broader compatibility
        // unless explicitly needed. We'll rely on idempotency/cleanup if it fails.
        const document = new Document({
            documentId,
            entityType,
            entityId,
            metadata: metadata || {},
            state: 'PENDING'
        });

        const version = new DocumentVersion({
            versionId,
            documentId,
            versionNumber: 1,
            providerInstanceId,
            objectKey: logicalKey || `${documentId}/v1`,
            createdBy: user._id
        });

        document.currentVersionId = version._id; // Ref binding
        
        await document.save();
        await version.save();

        return { document: this._toDocumentDTO(document), version: this._toVersionDTO(version) };
    }

    /**
     * 2. Create Document Version
     */
    async createDocumentVersion(user, documentId, payload) {
        const { providerInstanceId, logicalKey } = payload;
        
        // We need an AccessGrant to WRITE to this document.
        // The operation here conceptually is "WRITE" on the Document.
        await this.accessService.authorizeAccess(user, documentId, 'WRITE');

        // Execute MongoDB domain persistence inside the unified transaction boundary
        const savedVersion = await withMongoTransaction(async (session) => {
            const document = await Document.findOne({ documentId }).session(session);
            if (!document) {
                throw new (await import('./StorageErrors.js')).ObjectNotFoundError("CRM", documentId);
            }
            
            const latestVersion = await DocumentVersion.findOne({ documentId }, null, { sort: { versionNumber: -1 } }).session(session);
            const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

            const versionId = `ver-${crypto.randomBytes(8).toString('hex')}`;
            const version = new DocumentVersion({
                versionId,
                documentId,
                versionNumber: nextVersionNumber,
                providerInstanceId,
                objectKey: logicalKey || `${documentId}/v${nextVersionNumber}`,
                createdBy: user._id
            });

            await version.save({ session });

            // Update document current version and reset state to PENDING for the new version upload.
            document.currentVersionId = version._id;
            document.state = 'PENDING';
            await document.save({ session });

            return version;
        });

        return this._toVersionDTO(savedVersion);
    }

    /**
     * 3. Upload File (Begin + Complete)
     */
    async uploadFile(user, documentId, versionId, streamOrBuffer, mimeType, sizeBytes) {
        // Authorize physical storage execution
        const grant = await this.accessService.authorizeAccess(user, documentId, 'WRITE', versionId);
        
        const document = await Document.findOne({ documentId });
        const version = await DocumentVersion.findOne({ versionId: grant.versionId, documentId });

        // Transition to UPLOADING
        this._transitionState(document, 'UPLOADING');
        await document.save();

        const adapter = await this.registry.resolve(version.providerInstanceId);
        
        try {
            // Execute physical PUT
            const result = await adapter.put(version.objectKey, streamOrBuffer, { mimeType, sizeBytes });
            
            // Metadata persistence
            version.sizeBytes = result.sizeBytes || sizeBytes;
            version.mimeType = mimeType;
            version.checksum = result.checksum;
            version.providerVersionId = result.providerVersionId;
            await version.save();

            // Strict state machine traversal
            this._transitionState(document, 'PROCESSING');
            this._transitionState(document, 'CONTENT_VALIDATION');
            this._transitionState(document, 'MALWARE_POLICY');
            
            // Assuming no scanner is implemented in this gate, we preserve MALWARE_POLICY
            // or if policy says active is fine, we'd do ACTIVE. We'll leave it in MALWARE_POLICY
            // per "preserve the previously approved policy boundary: MALWARE_POLICY -> policy-dependent".
            // We will NOT transition to ACTIVE automatically if malware policy dictates otherwise.
            // But wait, the R4-A report said: "Unvalidated external uploads are physically blocked from ACTIVE status".
            
            await document.save();
            return { document: this._toDocumentDTO(document), version: this._toVersionDTO(version) };

        } catch (err) {
            // If it fails, we should perhaps transition back or leave it in uploading to eventually timeout
            throw err;
        }
    }

    /**
     * 4. Read Document Content
     */
    async readDocumentStream(user, documentId, versionId = null) {
        const grant = await this.accessService.authorizeAccess(user, documentId, 'READ', versionId);
        const version = await DocumentVersion.findOne({ versionId: grant.versionId, documentId });
        const adapter = await this.registry.resolve(version.providerInstanceId);

        const result = await adapter.read(version.objectKey);
        
        return {
            stream: result.stream,
            mimeType: result.mimeType || version.mimeType,
            sizeBytes: result.sizeBytes || version.sizeBytes,
            documentId,
            versionId: version.versionId
        };
    }

    /**
     * 5. Logical Delete
     */
    async deleteDocument(user, documentId) {
        await this.accessService.authorizeAccess(user, documentId, 'DELETE');
        
        const document = await Document.findOne({ documentId });
        this._transitionState(document, 'DELETED');
        
        // This relies on softDelete plugin to set deletedAt if desired,
        // but explicit state 'DELETED' is the domain source of truth.
        // We will invoke the soft delete method just in case.
        if (typeof document.softDelete === 'function') {
            await document.softDelete();
        } else {
            await document.save();
        }
        
        return this._toDocumentDTO(document);
    }


    /**
     * 6. Malware Policy Resolution (Internal/Worker Boundary)
     * Transitions document out of MALWARE_POLICY based on ScanResult.
     */
    async evaluateMalwarePolicy(documentId, versionId, scanResult) {
        return await withMongoTransaction(async (session) => {
            const document = await Document.findOne({ documentId }).session(session);
            const version = await DocumentVersion.findOne({ versionId, documentId }).session(session);

            if (!document || !version) {
                return null;
            }

            if (document.state !== 'MALWARE_POLICY') {
                return null; // Stale job or changed state
            }

            if (document.currentVersionId.toString() !== version._id.toString()) {
                return null; // Version changed during scan
            }

            // Transition based on policy
            if (scanResult.outcome === 'CLEAN') {
                // Check if any retention or legal logic implicitly blocks activation here?
                // The prompt says: "no legal/retention rule blocks activation". 
                // We'll assume ACTIVE is fine if no other errors exist.
                this._transitionState(document, 'ACTIVE');
            } else if (scanResult.outcome === 'INFECTED') {
                // Example of CRM policy separating scan outcome from lifecycle state
                const quarantinePolicyEnabled = false; // Mocked policy flag
                if (quarantinePolicyEnabled) {
                    this._transitionState(document, 'QUARANTINED');
                } else {
                    this._transitionState(document, 'REJECTED');
                }
            } else {
                throw new Error(`Cannot transition document with scan outcome: ${scanResult.outcome}`);
            }

            // Save minimal evidence metadata
            version.set('malwareScanOutcome', scanResult.outcome);
            version.set('malwareScanAt', scanResult.scannedAt);
            
            await version.save({ session });
            await document.save({ session });
            
            return { document: this._toDocumentDTO(document), version: this._toVersionDTO(version) };
        });
    }


    /**
     * 7. List Documents for Entity (First-class listing API)
     */
    async listDocuments(user, entityType, entityId) {
        await this.accessService.authorizeEntityTarget(user, entityType, entityId, 'READ');
        
        const documents = await Document.find({ 
            entityType, 
            entityId, 
            deleted: { $ne: true } 
        }).lean();

        const currentVersionIds = documents.map(d => d.currentVersionId).filter(Boolean);
        const versions = await DocumentVersion.find({ _id: { $in: currentVersionIds } }).lean();
        const versionMap = new Map(versions.map(v => [v._id.toString(), v]));

        return documents.map(doc => {
            const v = doc.currentVersionId ? versionMap.get(doc.currentVersionId.toString()) : null;
            return {
                documentId: doc.documentId,
                entityType: doc.entityType,
                entityId: doc.entityId,
                metadata: doc.metadata || {},
                state: doc.state,
                currentVersion: v ? v.versionId : null,
                versionNumber: v ? v.versionNumber : null,
                mimeType: v ? v.mimeType : null,
                sizeBytes: v ? v.sizeBytes : null,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt
            };
        });
    }

    // DTO sanitizers
    _toDocumentDTO(doc) {
        return {
            documentId: doc.documentId,
            entityType: doc.entityType,
            entityId: doc.entityId,
            state: doc.state,
            retentionUntil: doc.retentionUntil,
            legalHold: doc.legalHold,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
        };
    }

    _toVersionDTO(ver) {
        return {
            versionId: ver.versionId,
            documentId: ver.documentId,
            versionNumber: ver.versionNumber,
            mimeType: ver.mimeType,
            sizeBytes: ver.sizeBytes,
            checksum: ver.checksum,
            checksumAlgorithm: ver.checksumAlgorithm,
            createdAt: ver.createdAt
        };
    }
}
