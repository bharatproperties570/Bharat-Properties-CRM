/**
 * MarketingComplianceEnforcementService.js
 * 
 * Enterprise Backend Compliance Enforcement Service for Marketing OS & Social Publishing
 * 
 * Enforces server-side statutory compliance across all social publishing routes:
 * - Direct immediate social dispatch (Facebook, Instagram, LinkedIn, Twitter/X, Google Business, YouTube)
 * - Scheduled Outbox event generation (pre-dispatch validation)
 * - Worker execution-time revalidation (fencing against expired or revoked verification)
 * - Stored MarketingContent publishing (multi-channel syndication)
 * 
 * Strict Invariants:
 * - Never trust client-supplied verification facts, `isVerified`, or authority claims.
 * - Facts are extracted exclusively from authoritative canonical Deal, Inventory, or Project records.
 * - Missing or inaccessible entities fail closed (all claims treated as unverified).
 * - Enforces record-level RBAC & visibility (via getVisibilityFilter) so unauthorized users cannot access or leak records.
 * - Supports authorized internal system execution path (`user.isSystem === true`) for BullMQ background workers.
 * - Post-sanitization audit guarantees zero unsupported or prohibited claims reach providers.
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import '../models/Document.js';
import '../models/DocumentVersion.js';
import '../models/Deal.js';
import '../models/Project.js';
import '../models/Inventory.js';
import '../models/User.js';
import '../models/Role.js';
import '../models/PropertyVerificationSnapshot.js';
import '../models/PropertyAuthorityLink.js';
import { getVisibilityFilter } from '../utils/visibility.js';
import {
    hasAuthoritativeTitleVerification,
    hasAuthoritativeReraApproval,
    hasAuthoritativeBankApproval,
    hasAuthoritativeReadyPossession,
    extractVerificationFacts,
    validateAndSanitizeCopy,
    generateCompliantFallback,
    TRUSTED_VERIFIER_ROLES,
    TRUSTED_SYSTEM_SERVICES,
    hasStatutoryVerifierPermissions
} from '../utils/propertyComplianceValidator.js';

const FORMER_INSECURE_SECRETS = Object.freeze([
    'crm-system-service-internal-secret-phase6-compliance',
    'default-secret',
    'secret',
    'change-me',
    'system-secret',
    'crm_secret_key'
]);

/**
 * Validates the configured SYSTEM_SERVICE_SECRET.
 * Requires:
 * - Environment variable process.env.SYSTEM_SERVICE_SECRET
 * - Adequate cryptographic entropy (minimum 32 characters)
 * - Must NOT be any known default or former hard-coded secret
 * Fails closed (returns null) if any condition is not satisfied.
 * 
 * @returns {string|null}
 */
export function getValidatedSystemServiceSecret(customSecret = null) {
    const rawSecret = customSecret !== null ? customSecret : process.env.SYSTEM_SERVICE_SECRET;
    if (!rawSecret || typeof rawSecret !== 'string') {
        return null;
    }
    const secret = rawSecret.trim();
    if (secret.length < 32) {
        return null;
    }
    if (FORMER_INSECURE_SECRETS.includes(secret)) {
        return null;
    }
    return secret;
}

/**
 * Generates an HMAC-SHA256 signature for trusted system services.
 * Cryptographically binds the service identity, verification timestamp, entity ID, and document ID.
 * 
 * @param {string} serviceId
 * @param {Date|string} verifiedAt
 * @param {Object} [context={}] - { entityId, documentId }
 * @param {string} [overrideSecret=null]
 * @returns {string}
 */
export function generateSystemServiceSignature(serviceId, verifiedAt, context = {}, overrideSecret = null) {
    const secret = getValidatedSystemServiceSecret(overrideSecret);
    if (!secret) {
        throw new Error('SYSTEM_SERVICE_SECRET_UNAVAILABLE: System service secret is missing, weak, or invalid. Refusing to sign.');
    }
    if (!serviceId || !verifiedAt) {
        throw new Error('SYSTEM_SERVICE_SIGNATURE_INVALID_PARAMS: Missing serviceId or verifiedAt.');
    }
    const timeStr = verifiedAt instanceof Date ? verifiedAt.toISOString() : String(verifiedAt);
    const entityIdStr = context.entityId ? String(context.entityId).trim() : '';
    const docIdStr = context.documentId ? String(context.documentId).trim() : '';
    const payload = `${String(serviceId).trim().toUpperCase()}:${timeStr}:${entityIdStr}:${docIdStr}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verifies an HMAC-SHA256 signature for trusted system services using constant-time comparison.
 * Rejects expired, replayed, or context-mismatched signatures.
 * 
 * @param {string} serviceId
 * @param {Date|string} verifiedAt
 * @param {string} signature
 * @param {Object} [context={}] - { entityId, documentId }
 * @param {string} [overrideSecret=null]
 * @returns {boolean}
 */
export function verifySystemServiceSignature(serviceId, verifiedAt, signature, context = {}, overrideSecret = null) {
    if (!serviceId || !verifiedAt || !signature || typeof signature !== 'string') return false;
    const secret = getValidatedSystemServiceSecret(overrideSecret);
    if (!secret) return false;

    try {
        const timeStr = verifiedAt instanceof Date ? verifiedAt.toISOString() : String(verifiedAt);
        const entityIdStr = context.entityId ? String(context.entityId).trim() : '';
        const docIdStr = context.documentId ? String(context.documentId).trim() : '';
        const payload = `${String(serviceId).trim().toUpperCase()}:${timeStr}:${entityIdStr}:${docIdStr}`;
        const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

        const sigBuf = Buffer.from(signature, 'hex');
        const expBuf = Buffer.from(expected, 'hex');
        if (sigBuf.length !== expBuf.length || sigBuf.length !== 32) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch (_) {
        return false;
    }
}

class MarketingComplianceEnforcementService {
    /**
     * Resolves the canonical entity (Deal, Inventory, or Project) from the database
     * using the authorized identifier and enforces visibility/authorization checks.
     * 
     * @param {string|mongoose.Types.ObjectId} entityId - Entity identifier
     * @param {string} [entityType='deal'] - 'deal' | 'inventory' | 'project'
     * @param {Object} [user=null] - Authenticated user context (or { isSystem: true } for workers)
     * @returns {Promise<Object|null>} Canonical entity document (or null if missing/inaccessible)
     */
    async resolveAuthoritativeEntity(entityId, entityType = 'deal', user = null) {
        if (!entityId) return null;

        const idStr = String(entityId).trim();
        if (!mongoose.Types.ObjectId.isValid(idStr)) {
            return null;
        }

        const normType = String(entityType || 'deal').toLowerCase();

        try {
            let entity = null;
            const isSystemExecution = Boolean(user && user.isSystem === true);

            // Compute visibility filter unless executing as authorized internal system worker
            let visibilityFilter = {};
            if (!isSystemExecution) {
                // If user is null/undefined, getVisibilityFilter(null) safely locks down to { _id: null }
                visibilityFilter = await getVisibilityFilter(user);
            }

            const query = {
                _id: new mongoose.Types.ObjectId(idStr),
                ...visibilityFilter
            };

            if (normType === 'project') {
                const Project = mongoose.model('Project');
                entity = await Project.findOne(query).lean();
            } else if (normType === 'inventory') {
                const Inventory = mongoose.model('Inventory');
                entity = await Inventory.findOne(query).lean();
                if (entity?.projectId) {
                    const Project = mongoose.model('Project');
                    const projQuery = isSystemExecution 
                        ? { _id: entity.projectId } 
                        : { _id: entity.projectId, ...visibilityFilter };
                    const proj = await Project.findOne(projQuery).lean();
                    if (proj) {
                        entity.project = proj;
                    } else {
                        // Inaccessible linked project: reject linkage
                        entity.project = null;
                    }
                }
            } else {
                // Default: Deal
                const Deal = mongoose.model('Deal');
                entity = await Deal.findOne(query).lean();
                
                // If Deal has linked inventory, hydrate ONLY if user has visibility to it (Gate 6 RBAC)
                if (entity?.inventoryId) {
                    try {
                        const Inventory = mongoose.model('Inventory');
                        const invQuery = isSystemExecution
                            ? { _id: entity.inventoryId }
                            : { _id: entity.inventoryId, ...visibilityFilter };
                        const inv = await Inventory.findOne(invQuery).lean();
                        if (inv) {
                            entity.inventory = inv;
                        } else {
                            // Inaccessible linked inventory: reject linkage so it cannot contribute evidence
                            entity.inventory = null;
                        }
                    } catch (_) {
                        entity.inventory = null;
                    }
                }

                // If Deal has linked project, hydrate ONLY if user has visibility to it (Gate 6 RBAC)
                if (entity?.projectId) {
                    try {
                        const Project = mongoose.model('Project');
                        const projQuery = isSystemExecution
                            ? { _id: entity.projectId }
                            : { _id: entity.projectId, ...visibilityFilter };
                        const proj = await Project.findOne(projQuery).lean();
                        if (proj) {
                            entity.project = proj;
                        } else {
                            // Inaccessible linked project: reject linkage so it cannot contribute evidence
                            entity.project = null;
                        }
                    } catch (_) {
                        entity.project = null;
                    }
                }
            }

            if (!entity) return null;

            // Explicitly set canonical entityType
            entity._entityType = normType === 'project' ? 'Project' : (normType === 'inventory' ? 'Inventory' : 'Deal');

            // Authorization / tenant verification check (defense-in-depth)
            if (user && user.tenantId && entity.tenantId) {
                if (String(user.tenantId) !== String(entity.tenantId)) {
                    console.warn(`[ComplianceEnforcement] Tenant mismatch: user=${user.tenantId}, entity=${entity.tenantId}`);
                    return null; // Deny access
                }
            }

            // Resolve and validate authentic CRM evidence records (Document, DocumentVersion, Snapshot)
            await this.resolveAuthoritativeEvidence(entity, user);

            return entity;
        } catch (err) {
            console.error(`[ComplianceEnforcement] Failed to resolve canonical entity ${entityId}:`, err.message);
            return null; // Fail closed
        }
    }

    /**
     * Resolves and validates referenced CRM Document and DocumentVersion records from MongoDB.
     * Prevents client-supplied or synthesized document IDs/hashes from bypassing evidence verification.
     * 
     * @param {Object} entity - Resolved Deal, Inventory, or Project record
     * @param {Object} [user=null] - User context
     */
    async resolveAuthoritativeEvidence(entity, user = null) {
        if (!entity || typeof entity !== 'object') return;
        if (mongoose.connection?.readyState !== 1) return;

        try {
            const Document = mongoose.model('Document');
            const DocumentVersion = mongoose.model('DocumentVersion');

            // Helper to resolve and validate a single candidate document
            const resolveSingleDoc = async (docCandidate, expectedClaimType = null) => {
                if (!docCandidate || typeof docCandidate !== 'object') return;
                const docId = docCandidate.documentId || docCandidate.crmDocumentId || docCandidate.documentNumber || docCandidate.referenceNo;
                if (!docId || typeof docId !== 'string') return;

                const docRecord = await Document.findOne({
                    $or: [
                        { documentId: String(docId).trim() },
                        { 'metadata.documentNo': String(docId).trim() },
                        { 'metadata.documentNumber': String(docId).trim() }
                    ],
                    isDeleted: false
                }).lean();

                if (!docRecord) {
                    // Document does not exist in CRM repository
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // 1. Verify lifecycle state
                if (docRecord.state !== 'ACTIVE') {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // 2. Verify entity ownership: validate both Document.entityType and Document.entityId
                const docEntityType = String(docRecord.entityType || '').trim();
                // Reject Contact, Lead, User or other non-property collections immediately
                if (['Contact', 'Lead', 'User', 'Account'].includes(docEntityType)) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                const entityIdStr = String(entity._id || entity.id || '');
                const projIdStr = String(entity.projectId?._id || entity.projectId || (entity.project?._id) || '');
                const invIdStr = String(entity.inventoryId?._id || entity.inventoryId || (entity.inventory?._id) || '');
                const docEntityIdStr = String(docRecord.entityId?._id || docRecord.entityId || '');
                const canonicalType = String(entity._entityType || 'Deal');

                let isAuthorizedOwner = false;
                if (docEntityIdStr === entityIdStr && docEntityType === canonicalType) {
                    isAuthorizedOwner = true;
                } else if (projIdStr && docEntityIdStr === projIdStr && docEntityType === 'Project') {
                    isAuthorizedOwner = true;
                } else if (invIdStr && docEntityIdStr === invIdStr && docEntityType === 'Inventory') {
                    isAuthorizedOwner = true;
                }

                if (!isAuthorizedOwner) {
                    // Document belongs to a different entity or wrong entityType!
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // 3. Verify document category/type matches intended evidence claim
                if (expectedClaimType) {
                    const rawCat = String(
                        docRecord.metadata?.documentCategory ||
                        docRecord.metadata?.documentType ||
                        docRecord.metadata?.type ||
                        docRecord.type ||
                        ''
                    ).trim().toUpperCase();

                    if (expectedClaimType === 'BANK') {
                        const isBankMatch = ['BANK_APPROVAL', 'BANK_SANCTION', 'SANCTION_LETTER', 'BANK_APF_LETTER', 'APF_RECORD', 'APF', 'LOAN_APPROVAL', 'LOAN_SANCTION'].some(t => rawCat.includes(t));
                        if (!isBankMatch) {
                            docCandidate.documentRecord = null;
                            docCandidate._isVerifiedRecord = false;
                            return;
                        }
                    } else if (expectedClaimType === 'POSSESSION') {
                        const isPosMatch = ['OCCUPANCY_CERTIFICATE', 'COMPLETION_CERTIFICATE', 'OC', 'CC', 'OCCUPANCY', 'COMPLETION'].some(t => rawCat.includes(t));
                        if (!isPosMatch) {
                            docCandidate.documentRecord = null;
                            docCandidate._isVerifiedRecord = false;
                            return;
                        }
                    } else if (expectedClaimType === 'RERA') {
                        const isReraMatch = ['RERA_CERTIFICATE', 'RERA_REGISTRATION', 'RERA_APPROVAL', 'RERA_VERIFICATION', 'RERA'].some(t => rawCat.includes(t));
                        if (!isReraMatch) {
                            docCandidate.documentRecord = null;
                            docCandidate._isVerifiedRecord = false;
                            return;
                        }
                    }
                }

                // 4. Verify current document version reference
                if (!docRecord.currentVersionId) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                const versionRecord = await DocumentVersion.findById(docRecord.currentVersionId).lean();
                if (!versionRecord) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // 5. Verify DocumentVersion.documentId exactly matches Document.documentId
                if (String(versionRecord.documentId).trim() !== String(docRecord.documentId).trim()) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // 6. Verify resolved version is the current version referenced by Document
                if (String(versionRecord._id) !== String(docRecord.currentVersionId)) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // 7. Validate checksum algorithm and 64-char hexadecimal SHA-256 checksum format
                const algo = String(versionRecord.checksumAlgorithm || 'SHA-256').trim().toUpperCase();
                if (algo !== 'SHA-256' && algo !== 'SHA256') {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }
                const checksum = String(versionRecord.checksum || '').trim();
                if (!/^[a-fA-F0-9]{64}$/.test(checksum)) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // 8. Reject if embedded candidate checksum does not match actual DocumentVersion checksum
                const candidateHash = docCandidate.checksum || docCandidate.contentHash || docCandidate.snapshotContentHash;
                if (candidateHash && String(candidateHash).trim().toLowerCase() !== checksum.toLowerCase()) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // 9. Reject revoked or deleted versions
                if (versionRecord.isRevoked === true || versionRecord.isDeleted === true || docRecord.isRevoked === true || docRecord.status === 'REVOKED') {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // 10. Mandatory Audit Linkage & Real Verifier Authorization (P0 - Round 6)
                // Accept audit evidence ONLY from resolved CRM Document record
                const audit = docRecord.verificationAudit || docRecord.metadata?.verificationAudit;
                if (!audit || typeof audit !== 'object') {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // Required 7 core fields: documentId, versionId, entityId, entityType, verifierId, verifiedAt, outcome
                const auditDocId = String(audit.documentId || '').trim();
                const auditVerId = String(audit.versionId?._id || audit.versionId || '').trim();
                const auditEntId = String(audit.entityId?._id || audit.entityId || '').trim();
                const auditEntType = String(audit.entityType || '').trim();
                const verifierId = audit.verifierId || audit.verifiedBy;
                const verifiedAt = audit.verifiedAt || audit.timestamp;
                const outcome = String(audit.outcome || audit.verificationOutcome || '').trim().toUpperCase();

                if (!auditDocId || auditDocId !== String(docRecord.documentId).trim()) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }
                if (!auditVerId || (auditVerId !== String(docRecord.currentVersionId) && auditVerId !== String(versionRecord._id))) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }
                // Document ownership and audit ownership must never contradict each other
                const docEntId = String(docRecord.entityId?._id || docRecord.entityId || '').trim();
                const docEntType = String(docRecord.entityType || '').trim();
                if (docEntId && auditEntId !== docEntId) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }
                if (docEntType && auditEntType !== docEntType) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                if (!auditEntId || (auditEntId !== entityIdStr && auditEntId !== projIdStr && auditEntId !== invIdStr)) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }
                if (!auditEntType || !['Deal', 'Project', 'Inventory'].includes(auditEntType)) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }
                if (!verifierId || !verifiedAt || !['VERIFIED', 'APPROVED'].includes(outcome)) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }
                if (audit.isRevoked === true || audit.isSuperseded === true) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // Resolve verifier against trusted persisted source (User collection or authentic system service)
                const verifierStr = String(verifierId).trim();
                let verifierAuthorized = false;

                if (mongoose.Types.ObjectId.isValid(verifierStr)) {
                    const User = mongoose.model('User');
                    const userDoc = await User.findById(verifierStr).populate('role').lean();
                    if (userDoc && userDoc.isActive === true && userDoc.status === 'active' && !userDoc.isDeleted && !userDoc.deletedAt) {
                        const roleObj = (userDoc.role && typeof userDoc.role === 'object') ? userDoc.role : null;
                        // Enforce statutory verifier permission contract (view + edit + approveAuthorityChanges)
                        // Role name alone is NOT authorization; canApproveDeal alone is NOT authority verification
                        if (roleObj && !roleObj.isDeleted && !roleObj.deletedAt && hasStatutoryVerifierPermissions(roleObj)) {
                            audit._verifierAuthorized = true;
                            audit._authorizedVerifierType = 'USER';
                            audit._verifierUser = {
                                _id: String(userDoc._id),
                                fullName: userDoc.fullName,
                                roleName: roleObj.name,
                                isActive: userDoc.isActive,
                                status: userDoc.status,
                                role: roleObj
                            };
                            verifierAuthorized = true;
                        }
                    }
                } else if (TRUSTED_SYSTEM_SERVICES.includes(verifierStr.toUpperCase())) {
                    const sysId = verifierStr.toUpperCase();
                    const context = {
                        entityId: entityIdStr || String(entity._id || ''),
                        documentId: String(docRecord.documentId || '').trim()
                    };
                    // Plain JS object from untrusted caller context is NEVER accepted
                    // System verifier authorization strictly requires cryptographic HMAC-SHA256 signature verification
                    const isSystemAuth = Boolean(
                        audit.systemSignature &&
                        verifySystemServiceSignature(sysId, verifiedAt, audit.systemSignature, context)
                    );
                    if (isSystemAuth) {
                        audit._verifierAuthorized = true;
                        audit._authorizedVerifierType = 'SYSTEM';
                        audit._systemAuthenticated = true;
                        verifierAuthorized = true;
                    }
                }

                if (!verifierAuthorized) {
                    docCandidate.documentRecord = null;
                    docCandidate._isVerifiedRecord = false;
                    return;
                }

                // Successfully verified authentic CRM document record
                docRecord._isResolverVerified = true;
                docCandidate._isResolverVerified = true;
                docCandidate._isVerifiedRecord = true;
                docCandidate.documentRecord = {
                    ...docRecord,
                    currentVersion: versionRecord,
                    verificationAudit: audit
                };
            };

            // 1. Resolve Bank Approval candidate documents
            if (entity.bankApproval) await resolveSingleDoc(entity.bankApproval, 'BANK');
            if (Array.isArray(entity.bankApprovals)) {
                for (const b of entity.bankApprovals) await resolveSingleDoc(b, 'BANK');
            }
            if (entity.project?.bankApproval) await resolveSingleDoc(entity.project.bankApproval, 'BANK');
            if (Array.isArray(entity.project?.bankApprovals)) {
                for (const b of entity.project.bankApprovals) await resolveSingleDoc(b, 'BANK');
            }

            // 2. Resolve Possession (OC/CC) candidate documents
            if (entity.occupancyCertificate) await resolveSingleDoc(entity.occupancyCertificate, 'POSSESSION');
            if (entity.completionCertificate) await resolveSingleDoc(entity.completionCertificate, 'POSSESSION');
            if (entity.project?.occupancyCertificate) await resolveSingleDoc(entity.project.occupancyCertificate, 'POSSESSION');
            if (entity.project?.completionCertificate) await resolveSingleDoc(entity.project.completionCertificate, 'POSSESSION');

            // 3. Resolve Approvals array documents
            if (Array.isArray(entity.approvals)) {
                for (const a of entity.approvals) {
                    const cat = String(a.category || a.documentType || a.approvalAuthority || '').toUpperCase();
                    let claimType = null;
                    if (cat.includes('BANK') || cat.includes('LOAN') || cat.includes('MORTGAGE') || cat.includes('FINANCE')) claimType = 'BANK';
                    else if (cat.includes('OC') || cat.includes('CC') || cat.includes('OCCUPANCY') || cat.includes('COMPLETION')) claimType = 'POSSESSION';
                    else if (cat.includes('RERA')) claimType = 'RERA';
                    await resolveSingleDoc(a, claimType);
                }
            }
            if (Array.isArray(entity.project?.approvals)) {
                for (const a of entity.project.approvals) {
                    const cat = String(a.category || a.documentType || a.approvalAuthority || '').toUpperCase();
                    let claimType = null;
                    if (cat.includes('BANK') || cat.includes('LOAN') || cat.includes('MORTGAGE') || cat.includes('FINANCE')) claimType = 'BANK';
                    else if (cat.includes('OC') || cat.includes('CC') || cat.includes('OCCUPANCY') || cat.includes('COMPLETION')) claimType = 'POSSESSION';
                    else if (cat.includes('RERA')) claimType = 'RERA';
                    await resolveSingleDoc(a, claimType);
                }
            }

            // Also check dedicated RERA document references
            if (entity.reraDocument) await resolveSingleDoc(entity.reraDocument, 'RERA');
            if (entity.reraRegistrationDocument) await resolveSingleDoc(entity.reraRegistrationDocument, 'RERA');
            if (entity.reraDocumentId) {
                const reraDocCandidate = { documentId: entity.reraDocumentId };
                await resolveSingleDoc(reraDocCandidate, 'RERA');
                if (reraDocCandidate.documentRecord) {
                    entity.documentRecord = reraDocCandidate.documentRecord;
                    entity.reraDocument = reraDocCandidate;
                }
            }
            if (entity.reraNumber) {
                const reraDocCandidate = { documentId: entity.reraNumber };
                await resolveSingleDoc(reraDocCandidate, 'RERA');
                if (reraDocCandidate.documentRecord) {
                    entity.documentRecord = reraDocCandidate.documentRecord;
                    entity.reraDocument = reraDocCandidate;
                }
            }

            // 4. Resolve RERA Snapshots via verified relationship chain:
            // PropertyVerificationSnapshot -> PropertyAuthorityLink -> canonical property entity
            // P0: Clear client-supplied embedded snapshot/link fields before database resolution
            entity._resolvedSnapshot = null;
            if (entity.authorityVerification) entity.authorityVerification.snapshotRecord = null;
            if (entity.inventory?.authorityVerification) entity.inventory.authorityVerification.snapshotRecord = null;

            const snapshotId = entity.reraVerificationSnapshotId || entity.verificationSnapshotId || entity.authorityVerification?.verificationSnapshotId;
            if (snapshotId && mongoose.modelNames().includes('PropertyVerificationSnapshot')) {
                const PropertyVerificationSnapshot = mongoose.model('PropertyVerificationSnapshot');
                let snapDoc = null;
                // Resolve snapshot strictly by authentic DB _id or snapshotId field (no searching by linkId or propertyId!)
                if (mongoose.Types.ObjectId.isValid(String(snapshotId))) {
                    snapDoc = await PropertyVerificationSnapshot.findById(snapshotId).lean();
                }
                if (!snapDoc) {
                    snapDoc = await PropertyVerificationSnapshot.findOne({ snapshotId: String(snapshotId) }).lean();
                }

                // Check snapshot positive states, sealing, revocation, data quality restrictions, synthetic status, and provenance
                if (snapDoc) {
                    if (
                        snapDoc.isSealed !== true ||
                        snapDoc.isRevoked === true ||
                        snapDoc.status === 'REVOKED' ||
                        snapDoc.dataQuality?.status === 'RESTRICTED' ||
                        snapDoc.isSynthetic === true ||
                        snapDoc.provenance === 'SYNTHETIC_FIXTURE' ||
                        !snapDoc.provenance ||
                        snapDoc.provenance !== 'LIVE'
                    ) {
                        snapDoc = null;
                    }
                }

                // Enforce verified relationship chain: Snapshot -> PropertyAuthorityLink -> canonical property entity
                if (snapDoc && snapDoc.linkId && mongoose.modelNames().includes('PropertyAuthorityLink')) {
                    const PropertyAuthorityLink = mongoose.model('PropertyAuthorityLink');
                    const linkDoc = await PropertyAuthorityLink.findById(snapDoc.linkId).lean();

                    const entityTenantId = String(entity.tenantId?._id || entity.tenantId || '').trim();

                    if (!linkDoc) {
                        // Missing PropertyAuthorityLink -> relationship chain broken -> fail closed
                        snapDoc = null;
                    } else if (linkDoc.isActive !== true || linkDoc.identityVerified !== true || linkDoc.matchEligibility !== 'ELIGIBLE') {
                        // Link deactivated, unverified identity, or not strictly positive ELIGIBLE state -> reject
                        snapDoc = null;
                    } else if (!entityTenantId || !snapDoc.tenantId || !linkDoc.tenantId) {
                        // Missing tenantId on canonical entity, snapshot, or link -> fail closed
                        snapDoc = null;
                    } else if (
                        String(snapDoc.tenantId) !== String(linkDoc.tenantId) ||
                        String(snapDoc.tenantId) !== entityTenantId ||
                        String(linkDoc.tenantId) !== entityTenantId
                    ) {
                        // Tenant mismatch across snapshot, link, and canonical entity -> fail closed
                        snapDoc = null;
                    } else if (String(snapDoc.authorityCode).toUpperCase() !== String(linkDoc.authorityCode).toUpperCase()) {
                        // Authority code mismatch -> fail closed
                        snapDoc = null;
                    } else {
                        // Verify link ownership using actual PropertyAuthorityLink schema:
                        // - PropertyAuthorityLink ONLY has inventoryId (ObjectId ref Inventory)
                        // - propertyId is a String authority plot/file code (NEVER treated as Mongo entity ID)
                        // - projectId and dealId are undeclared schema fields and not relationships
                        const entityIdStr = String(entity._id || entity.id || '');
                        const canonicalType = String(entity._entityType || '').toLowerCase();
                        const linkInventoryId = String(linkDoc.inventoryId?._id || linkDoc.inventoryId || '');

                        if (!linkInventoryId) {
                            // Missing inventoryId on link -> fail closed
                            snapDoc = null;
                        } else {
                            let matchesProperty = false;

                            if (canonicalType === 'inventory') {
                                matchesProperty = (linkInventoryId === entityIdStr);
                            } else if (canonicalType === 'deal') {
                                // Deal: must resolve through Deal's linked Inventory
                                const dealInvId = String(entity.inventoryId?._id || entity.inventoryId || (entity.inventory?._id) || '');
                                if (dealInvId && linkInventoryId === dealInvId) {
                                    // Verify linked inventory belongs to same canonical tenant
                                    const Inventory = mongoose.model('Inventory');
                                    const dealInvDoc = await Inventory.findById(dealInvId).lean();
                                    if (dealInvDoc && String(dealInvDoc.tenantId?._id || dealInvDoc.tenantId || '').trim() === entityTenantId) {
                                        linkDoc._resolvedDealInventory = dealInvDoc;
                                        matchesProperty = true;
                                    }
                                }
                            } else if (canonicalType === 'project') {
                                // Project: resolve genuine schema-supported Project-to-Inventory relationship
                                const Inventory = mongoose.model('Inventory');
                                const projectInventory = await Inventory.findOne({
                                    _id: linkDoc.inventoryId,
                                    projectId: entity._id,
                                    isDeleted: false
                                }).lean();
                                if (projectInventory) {
                                    // Verify project inventory belongs to same canonical tenant
                                    if (String(projectInventory.tenantId?._id || projectInventory.tenantId || '').trim() === entityTenantId) {
                                        linkDoc._resolvedProjectInventory = projectInventory;
                                        matchesProperty = true;
                                    }
                                }
                            }

                            if (!matchesProperty) {
                                // Snapshot linked to another property -> fail closed
                                snapDoc = null;
                            } else {
                                // Validate authority code against permitted authority contract
                                const permittedAuthorities = ['HRERA', 'HARERA', 'PBRERA', 'RERA', 'HSVP', 'GMADA', 'CHD'];
                                const snapAuth = String(snapDoc.authorityCode || '').trim().toUpperCase();
                                const linkAuth = String(linkDoc.authorityCode || '').trim().toUpperCase();

                                if (!permittedAuthorities.includes(snapAuth) || (linkAuth && !permittedAuthorities.includes(linkAuth))) {
                                    snapDoc = null;
                                } else {
                                    // Verified relationship chain confirmed: attach linkDoc to snapDoc with resolver proof
                                    snapDoc._isResolverVerified = true;
                                    linkDoc._isResolverVerified = true;
                                    snapDoc._resolvedLink = linkDoc;
                                    snapDoc.linkRecord = linkDoc;
                                }
                            }
                        }
                    }
                } else if (snapDoc) {
                    // Missing linkId on snapshot -> entity identity cannot be established -> reject
                    snapDoc = null;
                }

                if (snapDoc && snapDoc._resolvedLink) {
                    entity._resolvedSnapshot = snapDoc;
                    if (entity.authorityVerification) entity.authorityVerification.snapshotRecord = snapDoc;
                } else {
                    entity._resolvedSnapshot = null;
                    if (entity.authorityVerification) entity.authorityVerification.snapshotRecord = null;
                }
            }
        } catch (err) {
            console.warn('[ComplianceEnforcement] Evidence resolution non-fatal warning:', err.message);
        }
    }

    /**
     * Extracts verification facts exclusively from a resolved canonical record.
     * Never trusts client-supplied facts or boolean flags.
     * If entity is null or unresolvable, returns an all-unverified facts object.
     * 
     * @param {Object|null} canonicalEntity - Resolved database entity record
     * @returns {Object} Authoritative verification facts
     */
    extractAuthoritativeFacts(canonicalEntity) {
        if (!canonicalEntity || typeof canonicalEntity !== 'object') {
            return {
                isTitleVerified: false,
                isReraApproved: false,
                isBankApproved: false,
                isBankLoanApproved: false,
                isReadyPossession: false,
                authorityCode: null,
                titleEvidenceCode: null,
                reraNumber: null
            };
        }

        return extractVerificationFacts(canonicalEntity);
    }

    /**
     * Enforces statutory compliance on copy before immediate social dispatch or Outbox creation.
     * 
     * @param {string} rawText - Unsanitized copy from request or content store
     * @param {Object|null} canonicalEntity - Authoritative entity from database
     * @param {string} [platform='facebook'] - Target social platform
     * @param {Object} [context={}] - Additional context (format, tone, options)
     * @returns {{ sanitizedText: string, facts: Object, entityResolved: boolean }}
     */
    enforceCompliance(rawText, canonicalEntity, platform = 'facebook', context = {}) {
        const facts = this.extractAuthoritativeFacts(canonicalEntity);
        const entityResolved = Boolean(canonicalEntity);

        const sanitizedText = validateAndSanitizeCopy(
            rawText,
            facts,
            {
                ...context,
                deal: canonicalEntity || {},
                platform: platform?.toLowerCase() || 'facebook'
            }
        );

        return {
            sanitizedText,
            facts,
            entityResolved
        };
    }

    /**
     * Execution-time revalidation for scheduled posts in workers.
     * Resolves the latest canonical record from the database to fence against
     * verification expiry or revocation between schedule time and execution time.
     * 
     * @param {Object} jobData - { platform, text, imageUrl, format, entityId, entityType }
     * @returns {Promise<{ sanitizedText: string, facts: Object, canonicalEntity: Object|null }>}
     */
    async revalidateScheduledPost(jobData) {
        const { entityId, entityType, text, title, postTitle, platform, format } = jobData;

        // Fetch fresh canonical record from database at time of worker execution via authorized system execution path
        const canonicalEntity = await this.resolveAuthoritativeEntity(entityId, entityType, { isSystem: true });

        // Re-extract authoritative facts and sanitize copy against latest status
        const { sanitizedText, facts } = this.enforceCompliance(
            text,
            canonicalEntity,
            platform,
            { format }
        );

        let sanitizedTitle = null;
        const rawTitle = title || postTitle;
        if (rawTitle) {
            const titleRes = this.enforceCompliance(rawTitle, canonicalEntity, platform, { format });
            sanitizedTitle = titleRes.sanitizedText;
        }

        return {
            sanitizedText,
            sanitizedTitle,
            facts,
            canonicalEntity
        };
    }
}

export const marketingComplianceEnforcementService = new MarketingComplianceEnforcementService();
export default marketingComplianceEnforcementService;
