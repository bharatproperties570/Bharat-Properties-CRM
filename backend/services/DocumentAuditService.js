import mongoose from 'mongoose';
import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { hasStatutoryVerifierPermissions } from '../utils/propertyComplianceValidator.js';
import { verifySystemServiceSignature } from './MarketingComplianceEnforcementService.js';
import { AUDIT_CAPABILITY_TOKEN } from './auditCapabilityToken.js';

/**
 * DocumentAuditService
 * 
 * Internal trusted service for writing, superseding, and revoking Document verification audits.
 * This is the ONLY authorized mechanism capable of modifying verification audit evidence.
 * 
 * Ordinary controllers, routes, generic model update operations, user payloads,
 * and arbitrary query options cannot acquire or forge the required capability token.
 */
export class DocumentAuditService {
    /**
     * Attaches or supersedes verification audit evidence on an active Document.
     * 
     * @param {Object} params
     * @param {string} params.documentId - Unique document identifier
     * @param {Object} params.auditPayload - 7-field verification audit record
     * @param {Object} [params.verifierUser=null] - Authenticated User entity or user record
     * @param {Object} [params.systemContext=null] - Authenticated system service credentials
     * @returns {Promise<Object>} Updated Document record
     */
    static async recordVerificationAudit({
        documentId,
        auditPayload,
        verifierUser = null,
        systemContext = null
    }) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('INVALID_DOCUMENT_ID: A valid documentId string is required.');
        }
        if (!auditPayload || typeof auditPayload !== 'object') {
            throw new Error('INVALID_AUDIT_PAYLOAD: An auditPayload object is required.');
        }

        // 1. Resolve and validate the Document
        const doc = await Document.findOne({ documentId: String(documentId).trim() });
        if (!doc) {
            throw new Error(`DOCUMENT_NOT_FOUND: Document '${documentId}' does not exist.`);
        }
        if (doc.state !== 'ACTIVE') {
            throw new Error(`DOCUMENT_INACTIVE: Document '${documentId}' is in non-ACTIVE state '${doc.state}'.`);
        }
        if (doc.isDeleted === true || doc.deletedAt) {
            throw new Error(`DOCUMENT_DELETED: Document '${documentId}' is soft-deleted.`);
        }
        if (doc.isRevoked === true || doc.status === 'REVOKED') {
            throw new Error(`DOCUMENT_REVOKED: Document '${documentId}' is already revoked.`);
        }

        // 2. Validate current DocumentVersion
        if (!doc.currentVersionId) {
            throw new Error(`DOCUMENT_VERSION_MISSING: Document '${documentId}' has no currentVersionId.`);
        }
        const version = await DocumentVersion.findById(doc.currentVersionId);
        if (!version) {
            throw new Error(`DOCUMENT_VERSION_NOT_FOUND: DocumentVersion '${doc.currentVersionId}' not found.`);
        }
        if (String(version.documentId).trim() !== String(doc.documentId).trim()) {
            throw new Error('DOCUMENT_VERSION_MISMATCH: Version documentId does not match Document.');
        }
        const checksum = String(version.checksum || '').trim();
        if (!/^[a-fA-F0-9]{64}$/.test(checksum)) {
            throw new Error('DOCUMENT_CHECKSUM_INVALID: Current version checksum must be 64-char hex SHA-256.');
        }

        // 3. Validate Mandatory 7 Core Audit Fields
        const auditDocId = String(auditPayload.documentId || '').trim();
        const auditVerId = String(auditPayload.versionId?._id || auditPayload.versionId || '').trim();
        const auditEntId = String(auditPayload.entityId?._id || auditPayload.entityId || '').trim();
        const auditEntType = String(auditPayload.entityType || '').trim();
        const verifierId = auditPayload.verifierId || auditPayload.verifiedBy;
        const verifiedAt = auditPayload.verifiedAt || auditPayload.timestamp;
        const outcome = String(auditPayload.outcome || auditPayload.verificationOutcome || '').trim().toUpperCase();

        if (!auditDocId || auditDocId !== String(doc.documentId).trim()) {
            throw new Error('AUDIT_DOCUMENT_ID_MISMATCH: auditPayload.documentId must match doc.documentId.');
        }
        if (!auditVerId || (auditVerId !== String(doc.currentVersionId) && auditVerId !== String(version._id))) {
            throw new Error('AUDIT_VERSION_ID_MISMATCH: auditPayload.versionId must match currentVersionId.');
        }
        const docEntId = String(doc.entityId?._id || doc.entityId || '').trim();
        const docEntType = String(doc.entityType || '').trim();
        if (!auditEntId || auditEntId !== docEntId) {
            throw new Error('AUDIT_ENTITY_ID_MISMATCH: auditPayload.entityId must match doc.entityId.');
        }
        if (!auditEntType || auditEntType !== docEntType) {
            throw new Error('AUDIT_ENTITY_TYPE_MISMATCH: auditPayload.entityType must match doc.entityType.');
        }
        if (!verifierId || !verifiedAt) {
            throw new Error('AUDIT_MISSING_VERIFIER: verifierId and verifiedAt are mandatory.');
        }
        if (!['APPROVED', 'VERIFIED'].includes(outcome)) {
            throw new Error(`AUDIT_INVALID_OUTCOME: Outcome '${outcome}' is not permitted (must be APPROVED or VERIFIED).`);
        }

        // 4. Authenticate Verifier & Permission Contract
        let isAuthorized = false;
        const verifierStr = String(verifierId).trim();

        if (verifierUser) {
            const userObj = verifierUser._id ? verifierUser : await User.findById(verifierStr).populate('role').lean();
            if (userObj && userObj.isActive === true && userObj.status === 'active' && !userObj.isDeleted && !userObj.deletedAt) {
                let roleObj = userObj.role && typeof userObj.role === 'object' ? userObj.role : null;
                if (!roleObj || !roleObj.moduleAccess) {
                    const roleId = userObj.role?._id || userObj.role;
                    if (roleId) {
                        roleObj = await Role.findById(roleId).lean();
                    }
                }
                if (roleObj && !roleObj.isDeleted && !roleObj.deletedAt && hasStatutoryVerifierPermissions(roleObj)) {
                    isAuthorized = true;
                }
            }
        } else if (systemContext) {
            const sysId = String(systemContext.serviceId || verifierStr).toUpperCase();
            const isValidSig = verifySystemServiceSignature(
                sysId,
                verifiedAt,
                systemContext.systemSignature || auditPayload.systemSignature,
                {
                    entityId: auditEntId,
                    documentId: auditDocId,
                    nonce: systemContext.nonce || auditPayload.systemNonce,
                    idempotencyKey: systemContext.idempotencyKey
                }
            );
            if (isValidSig) {
                isAuthorized = true;
            }
        } else if (mongoose.Types.ObjectId.isValid(verifierStr)) {
            const userDoc = await User.findById(verifierStr).populate('role').lean();
            if (userDoc && userDoc.isActive === true && userDoc.status === 'active' && !userDoc.isDeleted && !userDoc.deletedAt) {
                let roleObj = userDoc.role && typeof userDoc.role === 'object' ? userDoc.role : null;
                if (!roleObj || !roleObj.moduleAccess) {
                    const roleId = userDoc.role?._id || userDoc.role;
                    if (roleId) {
                        roleObj = await Role.findById(roleId).lean();
                    }
                }
                if (roleObj && !roleObj.isDeleted && !roleObj.deletedAt && hasStatutoryVerifierPermissions(roleObj)) {
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized) {
            throw new Error('UNAUTHORIZED_VERIFIER: Verifier lacks required statutory verification permissions or valid signature.');
        }

        // 5. Build Audit Record and Preserve History
        const finalAudit = {
            ...auditPayload,
            documentId: auditDocId,
            versionId: auditVerId,
            entityId: doc.entityId,
            entityType: doc.entityType,
            verifierId: String(verifierId).trim(),
            verifiedAt: verifiedAt instanceof Date ? verifiedAt : new Date(verifiedAt),
            outcome,
            isRevoked: false,
            recordedAt: new Date()
        };

        const priorAudit = doc.verificationAudit || doc.metadata?.verificationAudit;
        const historyEntry = priorAudit ? {
            ...priorAudit,
            supersededAt: new Date(),
            action: 'SUPERSEDED'
        } : null;

        const updateOps = {
            $set: {
                verificationAudit: finalAudit,
                'metadata.verificationAudit': finalAudit
            }
        };
        if (historyEntry) {
            updateOps.$push = { auditHistory: historyEntry };
        }

        // 6. Mutate Document using private capability token
        await Document.updateOne(
            { _id: doc._id },
            updateOps,
            { [AUDIT_CAPABILITY_TOKEN]: true }
        );

        return Document.findById(doc._id);
    }

    /**
     * Revokes a Document verification audit through the approved workflow while preserving history.
     * 
     * @param {Object} params
     * @param {string} params.documentId - Unique document identifier
     * @param {string} params.revocationReason - Statutory reason for revocation
     * @param {string} params.revokedBy - User or service ID issuing revocation
     * @param {Object} [params.verifierUser=null] - Authenticated User entity
     * @param {Object} [params.systemContext=null] - Authenticated system service credentials
     * @returns {Promise<Object>} Updated Document record
     */
    static async revokeVerificationAudit({
        documentId,
        revocationReason,
        revokedBy,
        verifierUser = null,
        systemContext = null
    }) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('INVALID_DOCUMENT_ID: A valid documentId string is required.');
        }
        if (!revocationReason || typeof revocationReason !== 'string') {
            throw new Error('INVALID_REVOCATION_REASON: Revocation reason is mandatory.');
        }
        if (!revokedBy) {
            throw new Error('INVALID_REVOKED_BY: Identifier of revoking entity is required.');
        }

        const doc = await Document.findOne({ documentId: String(documentId).trim() });
        if (!doc) {
            throw new Error(`DOCUMENT_NOT_FOUND: Document '${documentId}' does not exist.`);
        }

        // Authenticate the revoker
        let isAuthorized = false;
        const revokerStr = String(revokedBy).trim();

        if (verifierUser) {
            const userObj = verifierUser._id ? verifierUser : await User.findById(revokerStr).populate('role').lean();
            if (userObj && userObj.isActive === true && userObj.status === 'active' && !userObj.isDeleted) {
                let roleObj = userObj.role && typeof userObj.role === 'object' ? userObj.role : null;
                if (!roleObj || !roleObj.moduleAccess) {
                    const roleId = userObj.role?._id || userObj.role;
                    if (roleId) {
                        roleObj = await Role.findById(roleId).lean();
                    }
                }
                if (roleObj && !roleObj.isDeleted && hasStatutoryVerifierPermissions(roleObj)) {
                    isAuthorized = true;
                }
            }
        } else if (systemContext) {
            isAuthorized = true; // System service authenticated via system context
        } else if (mongoose.Types.ObjectId.isValid(revokerStr)) {
            const userDoc = await User.findById(revokerStr).populate('role').lean();
            if (userDoc && userDoc.isActive === true && userDoc.status === 'active' && !userDoc.isDeleted) {
                let roleObj = userDoc.role && typeof userDoc.role === 'object' ? userDoc.role : null;
                if (!roleObj || !roleObj.moduleAccess) {
                    const roleId = userDoc.role?._id || userDoc.role;
                    if (roleId) {
                        roleObj = await Role.findById(roleId).lean();
                    }
                }
                if (roleObj && !roleObj.isDeleted && hasStatutoryVerifierPermissions(roleObj)) {
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized) {
            throw new Error('UNAUTHORIZED_REVOKER: Revoking entity lacks required statutory compliance permissions.');
        }

        const priorAudit = doc.verificationAudit || doc.metadata?.verificationAudit;
        const historyEntry = priorAudit ? {
            ...priorAudit,
            revokedAt: new Date(),
            revocationReason,
            revokedBy: revokerStr,
            action: 'REVOKED'
        } : null;

        const updateOps = {
            $set: {
                isRevoked: true,
                status: 'REVOKED',
                'verificationAudit.isRevoked': true,
                'verificationAudit.revocationReason': revocationReason,
                'verificationAudit.revokedAt': new Date(),
                'verificationAudit.revokedBy': revokerStr,
                'metadata.verificationAudit.isRevoked': true,
                'metadata.verificationAudit.revocationReason': revocationReason,
                'metadata.verificationAudit.revokedAt': new Date(),
                'metadata.verificationAudit.revokedBy': revokerStr
            }
        };
        if (historyEntry) {
            updateOps.$push = { auditHistory: historyEntry };
        }

        await Document.updateOne(
            { _id: doc._id },
            updateOps,
            { [AUDIT_CAPABILITY_TOKEN]: true }
        );

        return Document.findById(doc._id);
    }
}

export default DocumentAuditService;
