import mongoose from 'mongoose';
import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import SystemServiceReplayLedgerModel from '../models/SystemServiceReplayLedger.js';
import { hasStatutoryVerifierPermissions } from '../utils/propertyComplianceValidator.js';
import { 
    verifySystemServiceSignatureDurable, 
    commitNonceConsumptionDurable,
    failNonceConsumptionDurable
} from './MarketingComplianceEnforcementService.js';
import { bindAuditPersistence } from './internalAuditBridge.js';

let privilegedAuditWriter = null;
bindAuditPersistence((writer) => {
    privilegedAuditWriter = writer;
});

async function executePrivilegedAuditWrite(filter, updateOps, options = {}) {
    if (!privilegedAuditWriter) {
        throw new Error('AUDIT_PERSISTENCE_UNAVAILABLE: Privileged audit writer has not been initialized.');
    }
    return privilegedAuditWriter(filter, updateOps, options);
}

/**
 * DocumentAuditService
 * 
 * Internal trusted service for writing, superseding, and revoking Document verification audits.
 * This is the ONLY authorized mechanism capable of modifying verification audit evidence.
 * 
 * Boundary Enforcement:
 * - Uses internalAuditBridge.js to execute privileged writes with call-stack authentication.
 * - Always resolves User and Role from the database; caller-supplied permission objects are disregarded.
 * - System services must authenticate with HMAC-SHA256 signatures, validated nonces, and bounded timestamps.
 * - Distributed replay protection prevents replaying nonces across worker processes or restarts.
 * - Revocation requires identical statutory authorization or HMAC signature.
 * - Revoked documents cannot be reactivated.
 */
export class DocumentAuditService {
    /**
     * Resolves and verifies an authorized statutory verifier from persisted MongoDB User & Role collections.
     * Treats caller identity strictly as an identifier, never trusting caller-provided permission/role objects.
     * 
     * @param {string|mongoose.Types.ObjectId|Object} userRef - User identifier or object
     * @returns {Promise<{ isAuthorized: boolean, userId: string|null, roleId: string|null }>}
     */
    static async resolvePersistedVerifierAuthorization(userRef) {
        if (!userRef) return { isAuthorized: false, userId: null, roleId: null };

        const userId = String(userRef._id || userRef).trim();
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return { isAuthorized: false, userId: null, roleId: null };
        }

        // Always query database directly to ensure role changes, deactivation, or deletion are reflected immediately
        const userDoc = await User.findById(userId).populate('role').lean();
        if (!userDoc || userDoc.isActive !== true || userDoc.status !== 'active' || userDoc.isDeleted || userDoc.deletedAt) {
            return { isAuthorized: false, userId, roleId: null };
        }

        let roleDoc = userDoc.role && typeof userDoc.role === 'object' ? userDoc.role : null;
        if (!roleDoc || !roleDoc.moduleAccess) {
            const roleId = userDoc.role?._id || userDoc.role;
            if (roleId && mongoose.Types.ObjectId.isValid(String(roleId))) {
                roleDoc = await Role.findById(roleId).lean();
            }
        }

        if (!roleDoc || roleDoc.isDeleted || roleDoc.deletedAt) {
            return { isAuthorized: false, userId, roleId: null };
        }

        if (!hasStatutoryVerifierPermissions(roleDoc)) {
            return { isAuthorized: false, userId, roleId: String(roleDoc._id || '') };
        }

        return { isAuthorized: true, userId, roleId: String(roleDoc._id || '') };
    }

    /**
     * Attaches or supersedes verification audit evidence on an active Document.
     * 
     * @param {Object} params
     * @param {string} params.documentId - Unique document identifier
     * @param {Object} params.auditPayload - 7-field verification audit record
     * @param {Object} [params.verifierUser=null] - Authenticated User entity or identifier
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
            throw new Error(`DOCUMENT_REVOKED: Document '${documentId}' is revoked and cannot be reactivated.`);
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
        let consumedSignature = null;
        let consumedClaimToken = null;
        const verifierStr = String(verifierId).trim();

        if (verifierUser) {
            const authRes = await this.resolvePersistedVerifierAuthorization(verifierUser);
            if (authRes.isAuthorized) {
                isAuthorized = true;
            }
        } else if (systemContext) {
            const sysId = String(systemContext.serviceId || verifierStr).toUpperCase();
            const signature = systemContext.systemSignature || auditPayload.systemSignature;
            const context = {
                entityId: auditEntId,
                documentId: auditDocId,
                nonce: systemContext.nonce || auditPayload.systemNonce,
                idempotencyKey: systemContext.idempotencyKey
            };

            const sigRes = await verifySystemServiceSignatureDurable(
                sysId,
                verifiedAt,
                signature,
                context
            );

            if (sigRes.isValid) {
                isAuthorized = true;
                consumedSignature = signature;
                consumedClaimToken = sigRes.claimToken;
                // Safe idempotent retry: If already committed, return the document without repeating mutation
                if (sigRes.isIdempotentRetry && sigRes.isCommitted) {
                    return Document.findById(doc._id);
                }
            } else {
                throw new Error(`UNAUTHORIZED_VERIFIER: System service verification failed: ${sigRes.error || 'INVALID_SIGNATURE'}`);
            }
        } else if (mongoose.Types.ObjectId.isValid(verifierStr)) {
            const authRes = await this.resolvePersistedVerifierAuthorization(verifierStr);
            if (authRes.isAuthorized) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            throw new Error('UNAUTHORIZED_VERIFIER: Verifier lacks required statutory verification permissions or valid signature.');
        }

        // 5. Build Audit Record and Preserve Prior History
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

        // 6. Mutate Document via privileged internal bridge with atomic state fencing & transaction boundary
        if (consumedSignature && consumedClaimToken) {
            if (!mongoose.connection || mongoose.connection.readyState !== 1) {
                throw new Error('DURABLE_STORAGE_UNAVAILABLE: MongoDB storage is offline.');
            }

            let session = null;
            try {
                session = await mongoose.startSession();
            } catch (err) {
                throw new Error(`TRANSACTION_UNAVAILABLE: Failed to start MongoDB session: ${err.message}`);
            }

            let transactionStarted = false;
            try {
                session.startTransaction();
                transactionStarted = true;
            } catch (err) {
                await session.endSession();
                throw new Error(`TRANSACTION_UNAVAILABLE: Failed to start transaction: ${err.message}`);
            }

            try {
                const now = new Date();

                // Step 1: Conditionally update replay ledger within transaction to establish exclusive ownership
                // Enforces exact signature, claimToken, status CONSUMED, leaseExpiresAt > now
                const ownershipFilter = {
                    signature: consumedSignature,
                    claimToken: consumedClaimToken,
                    status: 'CONSUMED',
                    leaseExpiresAt: { $gt: now }
                };
                const ledgerLockRes = await SystemServiceReplayLedgerModel.updateOne(
                    ownershipFilter,
                    {
                        $set: {
                            updatedAt: now,
                            inTransaction: true
                        }
                    },
                    { session }
                );

                if (!ledgerLockRes || ledgerLockRes.matchedCount === 0) {
                    throw new Error('STALE_CLAIM_SUPERSEDED: Replay lease expired or was superseded prior to transaction lock.');
                }

                // Step 2: Perform privileged Document mutation using the SAME MongoDB session
                const atomicFilter = {
                    _id: doc._id,
                    isRevoked: { $ne: true },
                    'verificationAudit.isRevoked': { $ne: true }
                };
                const writeRes = await executePrivilegedAuditWrite(atomicFilter, updateOps, { session });
                if (!writeRes || writeRes.matchedCount === 0) {
                    throw new Error('DOCUMENT_STATE_CONFLICT: Document is revoked or in an invalid state.');
                }

                // Step 3: Mark replay ledger COMMITTED in that SAME transaction
                await commitNonceConsumptionDurable(consumedSignature, consumedClaimToken, { session });

                // Step 4: Commit transaction
                await session.commitTransaction();
                await session.endSession();
                session = null;

                return Document.findById(doc._id);
            } catch (err) {
                if (session && transactionStarted) {
                    try {
                        await session.abortTransaction();
                    } catch (abortErr) {}
                }
                if (session) {
                    try {
                        await session.endSession();
                    } catch (endErr) {}
                }

                if (consumedSignature && consumedClaimToken && err.message && !err.message.includes('STALE_CLAIM_SUPERSEDED')) {
                    try {
                        await failNonceConsumptionDurable(consumedSignature, consumedClaimToken, err.message);
                    } catch (failErr) {}
                }
                throw err;
            }
        } else {
            // Statutory Human Verifier (verifierUser / verifierStr)
            const atomicFilter = {
                _id: doc._id,
                isRevoked: { $ne: true },
                'verificationAudit.isRevoked': { $ne: true }
            };
            const writeRes = await executePrivilegedAuditWrite(atomicFilter, updateOps);
            if (!writeRes || writeRes.matchedCount === 0) {
                throw new Error('DOCUMENT_STATE_CONFLICT: Document is revoked or in an invalid state.');
            }
            return Document.findById(doc._id);
        }
    }

    /**
     * Revokes a Document verification audit through the approved workflow while preserving history.
     * Strictly requires statutory authorization (persisted User+Role) or cryptographically verified systemContext.
     * 
     * @param {Object} params
     * @param {string} params.documentId - Unique document identifier
     * @param {string} params.revocationReason - Statutory reason for revocation
     * @param {string} params.revokedBy - User or service ID issuing revocation
     * @param {Object} [params.verifierUser=null] - Authenticated User entity or identifier
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
        if (!revocationReason || typeof revocationReason !== 'string' || !revocationReason.trim()) {
            throw new Error('INVALID_REVOCATION_REASON: Revocation reason is mandatory.');
        }
        if (!revokedBy) {
            throw new Error('INVALID_REVOKED_BY: Identifier of revoking entity is required.');
        }

        const doc = await Document.findOne({ documentId: String(documentId).trim() });
        if (!doc) {
            throw new Error(`DOCUMENT_NOT_FOUND: Document '${documentId}' does not exist.`);
        }

        // If already revoked, preserve idempotency
        if (doc.isRevoked === true && doc.status === 'REVOKED') {
            return doc;
        }

        // Authenticate the revoker strictly
        let isAuthorized = false;
        let consumedSignature = null;
        let consumedClaimToken = null;
        const revokerStr = String(revokedBy).trim();

        if (systemContext) {
            // System-service revocation requires exact HMAC cryptographic verification
            if (!systemContext.serviceId || !systemContext.systemSignature || !systemContext.nonce) {
                throw new Error('UNAUTHORIZED_REVOKER: System service revocation requires serviceId, systemSignature, and nonce.');
            }
            const sysId = String(systemContext.serviceId).trim().toUpperCase();
            const timestamp = systemContext.timestamp || systemContext.revokedAt || new Date();
            const signature = systemContext.systemSignature;
            const context = {
                entityId: String(doc.entityId || ''),
                documentId: String(doc.documentId || ''),
                nonce: systemContext.nonce,
                idempotencyKey: systemContext.idempotencyKey
            };

            const sigRes = await verifySystemServiceSignatureDurable(
                sysId,
                timestamp,
                signature,
                context
            );

            if (sigRes.isValid) {
                isAuthorized = true;
                consumedSignature = signature;
                consumedClaimToken = sigRes.claimToken;
                if (sigRes.isIdempotentRetry && sigRes.isCommitted) {
                    return Document.findById(doc._id);
                }
            } else {
                throw new Error(`UNAUTHORIZED_REVOKER: System service revocation signature verification failed: ${sigRes.error || 'INVALID_SIGNATURE'}`);
            }
        } else {
            const userIdentifier = verifierUser?._id || verifierUser || revokerStr;
            const authRes = await this.resolvePersistedVerifierAuthorization(userIdentifier);
            if (authRes.isAuthorized) {
                isAuthorized = true;
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

        // Mutate Document via privileged internal bridge with atomic filter & transaction boundary
        if (consumedSignature && consumedClaimToken) {
            if (!mongoose.connection || mongoose.connection.readyState !== 1) {
                throw new Error('DURABLE_STORAGE_UNAVAILABLE: MongoDB storage is offline.');
            }

            let session = null;
            try {
                session = await mongoose.startSession();
            } catch (err) {
                throw new Error(`TRANSACTION_UNAVAILABLE: Failed to start MongoDB session: ${err.message}`);
            }

            let transactionStarted = false;
            try {
                session.startTransaction();
                transactionStarted = true;
            } catch (err) {
                await session.endSession();
                throw new Error(`TRANSACTION_UNAVAILABLE: Failed to start transaction: ${err.message}`);
            }

            try {
                const now = new Date();

                // Step 1: Conditionally update replay ledger within transaction to establish exclusive ownership
                const ownershipFilter = {
                    signature: consumedSignature,
                    claimToken: consumedClaimToken,
                    status: 'CONSUMED',
                    leaseExpiresAt: { $gt: now }
                };
                const ledgerLockRes = await SystemServiceReplayLedgerModel.updateOne(
                    ownershipFilter,
                    {
                        $set: {
                            updatedAt: now,
                            inTransaction: true
                        }
                    },
                    { session }
                );

                if (!ledgerLockRes || ledgerLockRes.matchedCount === 0) {
                    throw new Error('STALE_CLAIM_SUPERSEDED: Replay lease expired or was superseded prior to transaction lock.');
                }

                // Step 2: Perform privileged Document mutation using the SAME MongoDB session
                const atomicFilter = { _id: doc._id, isRevoked: { $ne: true } };
                const writeRes = await executePrivilegedAuditWrite(atomicFilter, updateOps, { session });

                if (!writeRes || writeRes.matchedCount === 0) {
                    // Check if already revoked concurrently (idempotent revocation)
                    const refreshed = await Document.findById(doc._id).session(session);
                    if (refreshed && refreshed.isRevoked === true) {
                        await commitNonceConsumptionDurable(consumedSignature, consumedClaimToken, { session });
                        await session.commitTransaction();
                        await session.endSession();
                        session = null;
                        return refreshed;
                    }
                    throw new Error('DOCUMENT_REVOCATION_CONFLICT: Document could not be revoked.');
                }

                // Step 3: Mark replay ledger COMMITTED in that SAME transaction
                await commitNonceConsumptionDurable(consumedSignature, consumedClaimToken, { session });

                // Step 4: Commit transaction
                await session.commitTransaction();
                await session.endSession();
                session = null;

                return Document.findById(doc._id);
            } catch (err) {
                if (session && transactionStarted) {
                    try {
                        await session.abortTransaction();
                    } catch (abortErr) {}
                }
                if (session) {
                    try {
                        await session.endSession();
                    } catch (endErr) {}
                }

                if (consumedSignature && consumedClaimToken && err.message && !err.message.includes('STALE_CLAIM_SUPERSEDED')) {
                    try {
                        await failNonceConsumptionDurable(consumedSignature, consumedClaimToken, err.message);
                    } catch (failErr) {}
                }
                throw err;
            }
        } else {
            // Statutory Human Verifier (verifierUser / verifierStr)
            const atomicFilter = { _id: doc._id, isRevoked: { $ne: true } };
            const writeRes = await executePrivilegedAuditWrite(atomicFilter, updateOps);
            if (!writeRes || writeRes.matchedCount === 0) {
                const refreshed = await Document.findById(doc._id);
                if (refreshed && refreshed.isRevoked === true) {
                    return refreshed;
                }
                throw new Error('DOCUMENT_REVOCATION_CONFLICT: Document could not be revoked.');
            }
            return Document.findById(doc._id);
        }
    }
}

export default DocumentAuditService;
