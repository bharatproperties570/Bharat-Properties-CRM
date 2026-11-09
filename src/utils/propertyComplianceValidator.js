/**
 * propertyComplianceValidator.js
 * 
 * Authoritative Property Verification & Marketing Compliance Validator
 * Implements strict statutory, legal, and regulatory marketing guardrails:
 * - Real estate advertising regulations (RERA, consumer protection)
 * - Evidence-backed authoritative verification contracts
 * - Deterministic post-generation compliance validation & sanitization
 */

export const RECOGNIZED_AUTHORITY_CODES = Object.freeze([
    'HSVP',
    'CHD',
    'ESTATE_OFFICE_CHD',
    'GMADA',
    'DDA',
    'PUDA',
    'HRERA',
    'HARERA',
    'PBRERA',
    'RERA'
]);

export const TRUSTED_VERIFIER_ROLES = Object.freeze([
    'COMPLIANCE_OFFICER',
    'LEGAL_AUDITOR',
    'AUTHORITY_WORKER',
    'STATUTORY_AUDITOR',
    'COMPLIANCE_ADMIN',
    'BANK_OFFICER'
]);

export const TRUSTED_SYSTEM_SERVICES = Object.freeze([
    'SYSTEM_COMPLIANCE_ENGINE',
    'AUTHORITY_SYNC_WORKER',
    'BANK_INTEGRATION_GATEWAY'
]);

export const TRUSTED_SYSTEM_VERIFIER_IDS = TRUSTED_SYSTEM_SERVICES;

/**
 * Enforces the trusted verifier authorization contract.
 * Rejects:
 * - Bare verifierId strings without verified authorization context.
 * - Bare verifierRole strings from untrusted audit documents (untrusted role claims).
 * - Inactive users (isActive: false or status !== 'active').
 * - Revoked or non-compliance permissions.
 * - Arbitrary ObjectIds or structured IDs matching regexes without trusted authorization proof.
 * - Arbitrary system ID strings without authentic internal system execution authentication / HMAC signature.
 * 
 * @param {string|null} verifierId - Unique identifier of verifier
 * @param {Object|string|null} [auditContext=null] - Verification audit record or verifier authorization context
 * @param {Object|null} [parentEntity=null] - Canonical parent entity
 * @returns {boolean} True if identity and authorization satisfy trusted contract
 */
export function isAuthorizedVerifier(verifierId, auditContext = null, parentEntity = null) {
    if (!verifierId) return false;

    const vId = String(verifierId).trim();
    if (!vId || ['null', 'undefined', 'none', 'n/a', 'false', '0', 'system', 'admin'].includes(vId.toLowerCase())) {
        return false;
    }

    // auditContext must be an object containing trusted resolver verification metadata
    if (!auditContext || typeof auditContext !== 'object') {
        // String verifierRole or bare call without authenticated context MUST FAIL CLOSED
        return false;
    }

    // Must be explicitly marked as authorized by trusted resolver/service
    if (auditContext._verifierAuthorized !== true) {
        return false;
    }

    const authType = auditContext._authorizedVerifierType;

    if (authType === 'USER') {
        const user = auditContext._verifierUser;
        if (!user || typeof user !== 'object') return false;

        // Identity match: verifierId must match resolved user's _id
        const userIdStr = String(user._id || user.id || '').trim();
        if (!userIdStr || userIdStr !== vId) return false;

        // Active state verification
        if (user.isActive !== true || user.status !== 'active') return false;
        if (user.isDeleted === true || user.deletedAt) return false;

        // Role & permission check: User must hold compliance authorization
        const roleName = String(user.roleName || user.role?.name || user.role || '').trim().toUpperCase().replace(/\s+/g, '_');
        const hasTrustedRole = TRUSTED_VERIFIER_ROLES.includes(roleName) || roleName === 'COMPLIANCE_OFFICER' || roleName === 'COMPLIANCE_ADMIN' || roleName === 'BANK_OFFICER';

        const roleObj = (user.role && typeof user.role === 'object') ? user.role : {};
        const hasModuleAccess = Boolean(
            roleObj.moduleAccess?.authorityVerification?.view &&
            (roleObj.moduleAccess?.authorityVerification?.create || roleObj.moduleAccess?.authorityVerification?.edit)
        );
        const hasApprovalRight = Boolean(
            roleObj.approvalRights?.approveAuthorityChanges ||
            roleObj.approvalRights?.manageAuthoritySettings ||
            user.approvalRights?.approveAuthorityChanges ||
            user.approvalRights?.manageAuthoritySettings
        );
        const hasDealApproval = Boolean(user.financialPermissions?.canApproveDeal || roleObj.approvalRights?.approveDeal);

        if (!hasTrustedRole && !hasModuleAccess && !hasApprovalRight && !hasDealApproval) {
            return false;
        }

        return true;
    }

    if (authType === 'SYSTEM') {
        const sysId = vId.toUpperCase();
        if (!TRUSTED_SYSTEM_SERVICES.includes(sysId)) {
            return false;
        }
        // Must be authenticated by trusted internal system execution / HMAC signature
        if (auditContext._systemAuthenticated !== true) {
            return false;
        }
        return true;
    }

    return false;
}

export const APPROVED_AUTHORITY_STATUSES = Object.freeze(['VERIFIED']);
export const APPROVED_RERA_STATUSES = Object.freeze(['APPROVED', 'REGISTERED', 'ACTIVE', 'VALID']);
export const DISALLOWED_RERA_STATUSES = Object.freeze([
    'EXPIRED',
    'REJECTED',
    'PENDING',
    'REVOKED',
    'UNDER_REVIEW',
    'SUSPENDED',
    'UNKNOWN',
    'NOT_APPROVED',
    'APPLIED',
    'IN_PROCESS'
]);

export const AUTHORITATIVE_RERA_SOURCES = Object.freeze([
    'RERA_PORTAL',
    'GOVERNMENT_PORTAL',
    'OFFICIAL_REGISTRY',
    'STATE_RERA',
    'HARERA',
    'PBRERA',
    'HRERA',
    'AUTHORITY_SYNC',
    'DOCUMENT_VERIFIED',
    'OFFICIAL'
]);

export const RECOGNIZED_FINANCIAL_INSTITUTIONS = Object.freeze([
    'SBI', 'STATE BANK OF INDIA',
    'HDFC', 'HDFC BANK',
    'ICICI', 'ICICI BANK',
    'AXIS', 'AXIS BANK',
    'PNB', 'PUNJAB NATIONAL BANK',
    'BANK OF BARODA', 'BOB',
    'KOTAK', 'KOTAK MAHINDRA', 'KOTAK MAHINDRA BANK',
    'CANARA BANK', 'UNION BANK', 'UNION BANK OF INDIA',
    'LIC HOUSING FINANCE', 'LIC_HFL', 'LICHFL',
    'PNB HOUSING FINANCE', 'PNB_HFL',
    'BAJAJ HOUSING FINANCE', 'TATA CAPITAL',
    'IDFC FIRST', 'IDFC FIRST BANK',
    'INDUSIND BANK', 'YES BANK'
]);

export const CLEAN_LITIGATION_STATUSES = Object.freeze([
    'CLEAN',
    'NONE',
    'NO_DISPUTE',
    'CLEAR',
    'NO_LITIGATION'
]);

const MAX_VERIFICATION_AGE_MS = 180 * 24 * 60 * 60 * 1000; // 180 days
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000; // 1 minute

/**
 * Validates whether a snapshot identifier or document record identifier is structurally valid.
 * Must be a non-empty string of at least 3 characters and not a placeholder.
 */
function isValidSnapshotId(id) {
    if (!id || (typeof id !== 'string' && typeof id !== 'object')) return false;
    const s = String(id).trim();
    if (s.length < 3) return false;
    if (['null', 'undefined', 'none', 'n/a', 'false', '0'].includes(s.toLowerCase())) return false;
    return true;
}

/**
 * Validates whether an immutable content hash or checksum is structurally valid.
 * Requires at least 16 hex or base64/url-safe alphanumeric characters.
 */
function isValidContentHash(hash) {
    if (!hash || typeof hash !== 'string') return false;
    const s = hash.trim();
    if (s.length < 16) return false;
    if (['null', 'undefined', 'none', 'n/a', 'false'].includes(s.toLowerCase())) return false;
    return /^[0-9a-fA-F]{16,}$/.test(s) || /^[0-9a-zA-Z_-]{16,}$/.test(s);
}

/**
 * Validates timestamp freshness within 180 days and rejects future timestamps and malformed dates.
 */
function isValidVerificationDate(rawDate) {
    if (!rawDate) return false;
    const d = new Date(rawDate);
    const time = d.getTime();
    if (isNaN(time)) return false;
    const now = Date.now();
    // Reject future timestamps beyond minor clock skew
    if (time > now + CLOCK_SKEW_TOLERANCE_MS) return false;
    // Reject timestamps older than 180 days
    if (now - time > MAX_VERIFICATION_AGE_MS) return false;
    return true;
}

/**
 * Validates explicit clean litigation status.
 * Missing, null, undefined, or empty litigation information must NEVER automatically be clean.
 */
function isExplicitlyCleanLitigation(litStatus) {
    if (!litStatus || typeof litStatus !== 'string') return false;
    const norm = litStatus.trim().toUpperCase();
    return CLEAN_LITIGATION_STATUSES.includes(norm);
}

/**
 * Evaluates an authoritative verification evidence block (from authorityVerification or authorityLink).
 */
function evaluateAuthoritativeEvidence(evidence) {
    if (!evidence || typeof evidence !== 'object') return false;

    // 1. Authority code check
    const rawCode = evidence.authorityCode || evidence.authority;
    if (!rawCode || typeof rawCode !== 'string') return false;
    const code = rawCode.trim().toUpperCase();
    if (!RECOGNIZED_AUTHORITY_CODES.includes(code)) return false;

    // 2. Explicitly approved status (strictly 'VERIFIED')
    const rawStatus = evidence.authorityStatus || evidence.status || evidence.verificationStatus;
    if (!rawStatus || typeof rawStatus !== 'string') return false;
    const status = rawStatus.trim().toUpperCase();
    // Do NOT treat ALLOTTED or TRANSFERRED as verified legal title
    if (!APPROVED_AUTHORITY_STATUSES.includes(status)) return false;

    // 3. Freshness date check (within 180 days, not future, not malformed)
    const rawDate = evidence.lastVerifiedAt || evidence.verifiedAt || evidence.identityVerifiedAt;
    if (!isValidVerificationDate(rawDate)) return false;

    // 4. Structural validation of snapshot identifier
    const snapshotId = evidence.verificationSnapshotId || evidence.latestSnapshotId || evidence.snapshotId;
    if (!isValidSnapshotId(snapshotId)) return false;

    // 5. Structural validation of snapshot content hash
    const contentHash = evidence.snapshotContentHash || evidence.rawSnapshotHash || evidence.contentHash;
    if (!isValidContentHash(contentHash)) return false;

    // 6. Explicit clean litigation check (missing litigation NEVER defaults to clean)
    if (!isExplicitlyCleanLitigation(evidence.litigationStatus)) return false;

    return true;
}

/**
 * Checks whether a document or subdocument possesses an authentic resolved
 * CRM document record from the document repository/model.
 * 
 * Rejects:
 * - Bare documentId strings without underlying record
 * - Fake / syntactically valid ID strings without resolved CRM record
 * - Records linked to a different property (wrong-property relationship)
 * - Soft-deleted documents (isDeleted === true)
 * - Non-ACTIVE states (REJECTED, QUARANTINED, DELETED, PENDING, etc.)
 * - Replaced or missing currentVersionId / currentVersion
 * - Invalid checksum (< 16 hex chars)
 * - Revoked or expired documents
 */
export function validateAuthoritativeDocumentRecord(doc, parentEntity = null, expectedClaimType = null) {
    if (!doc || typeof doc !== 'object') return false;

    // Check if underlying record has been resolved
    const rec = doc.documentRecord || doc._resolvedRecord;
    if (!rec || typeof rec !== 'object') {
        // Disqualify bare client-supplied IDs, hashes, or booleans without resolved record
        return false;
    }

    // P0: Require proof that record was resolved by trusted resolver
    if (rec._isResolverVerified !== true && rec._isVerifiedRecord !== true) {
        return false;
    }

    // 1. Must have documentId matching doc.documentId (if doc.documentId is provided)
    if (doc.documentId && rec.documentId && String(doc.documentId).trim() !== String(rec.documentId).trim()) {
        return false;
    }

    // 2. Lifecycle state must be strictly ACTIVE
    if (rec.state !== 'ACTIVE') return false;

    // 3. Must not be soft-deleted
    if (rec.isDeleted === true || rec.deletedAt) return false;

    // 4. Must not be revoked
    if (rec.isRevoked === true || rec.metadata?.isRevoked === true || rec.status === 'REVOKED') return false;

    // 5. Entity ownership: validate both Document.entityType and Document.entityId
    const recEntityType = String(rec.entityType || '').trim();
    // Reject Contact, Lead, User or other non-property collections immediately
    if (['Contact', 'Lead', 'User', 'Account'].includes(recEntityType)) {
        return false;
    }

    if (parentEntity && (parentEntity._id || parentEntity.id)) {
        const parentId = String(parentEntity._id || parentEntity.id);
        const linkedProject = String(parentEntity.projectId?._id || parentEntity.projectId || (parentEntity.project?._id) || '');
        const linkedInventory = String(parentEntity.inventoryId?._id || parentEntity.inventoryId || (parentEntity.inventory?._id) || '');
        const recEntityId = String(rec.entityId?._id || rec.entityId || rec.propertyId || '');

        let parentEntityType = String(parentEntity._entityType || '').trim();
        if (!parentEntityType) {
            if (parentEntity.dealId || parentEntity.unitNo || parentEntity.stage) parentEntityType = 'Deal';
            else if (parentEntity.builderName || parentEntity.totalUnits || parentEntity.projectType) parentEntityType = 'Project';
            else if (parentEntity.inventoryId || parentEntity.unitNumber || parentEntity.status) parentEntityType = 'Inventory';
        }

        let isAuthorizedEntityOwnership = false;
        // Direct canonical entity match: entityId must match and entityType must match canonical collection
        if (recEntityId === parentId && parentEntityType && recEntityType === parentEntityType) {
            isAuthorizedEntityOwnership = true;
        }
        // Linked Project match: entityId must match linked Project AND entityType must be 'Project'
        else if (linkedProject && recEntityId === linkedProject && recEntityType === 'Project') {
            isAuthorizedEntityOwnership = true;
        }
        // Linked Inventory match: entityId must match linked Inventory AND entityType must be 'Inventory'
        else if (linkedInventory && recEntityId === linkedInventory && recEntityType === 'Inventory') {
            isAuthorizedEntityOwnership = true;
        }

        if (!isAuthorizedEntityOwnership) {
            // Cross-entity-type mismatch, wrong ID, or same-ID collision simulation -> REJECT
            return false;
        }
    } else {
        if (!['Deal', 'Project', 'Inventory'].includes(recEntityType)) {
            return false;
        }
    }

    // 6. Category/type must match intended evidence claim
    if (expectedClaimType) {
        const rawCat = String(
            rec.metadata?.documentCategory ||
            rec.metadata?.documentType ||
            rec.metadata?.type ||
            rec.type ||
            doc.documentCategory ||
            doc.documentType ||
            doc.category ||
            doc.type ||
            ''
        ).trim().toUpperCase();

        if (expectedClaimType === 'BANK') {
            const hasConflictingCat = ['OCCUPANCY_CERTIFICATE', 'COMPLETION_CERTIFICATE', 'RERA_CERTIFICATE'].some(t => rawCat.includes(t));
            if (hasConflictingCat) return false;
            const isBank = ['BANK_APPROVAL', 'BANK_SANCTION', 'SANCTION_LETTER', 'BANK_APF_LETTER', 'APF_RECORD', 'APF', 'LOAN_APPROVAL', 'LOAN_SANCTION', 'BANK', 'LOAN'].some(t => rawCat.includes(t)) || isRecognizedFinancialInstitution(doc.bankName || doc.institution || doc.financialInstitution);
            if (!isBank) return false;
        } else if (expectedClaimType === 'POSSESSION') {
            const hasConflictingCat = ['BANK_APPROVAL', 'BANK_SANCTION', 'SANCTION_LETTER', 'RERA_CERTIFICATE'].some(t => rawCat.includes(t));
            if (hasConflictingCat) return false;
            const isPos = ['OCCUPANCY_CERTIFICATE', 'COMPLETION_CERTIFICATE', 'OC', 'CC', 'OCCUPANCY', 'COMPLETION'].some(t => rawCat.includes(t)) || ['OC', 'CC', 'OCCUPANCY_CERTIFICATE', 'COMPLETION_CERTIFICATE'].includes(String(doc.certificateType || doc.documentType || doc.type || '').toUpperCase()) || Boolean(doc.certificateNumber);
            if (!isPos) return false;
        } else if (expectedClaimType === 'RERA') {
            const hasConflictingCat = ['BANK_APPROVAL', 'BANK_SANCTION', 'OCCUPANCY_CERTIFICATE', 'COMPLETION_CERTIFICATE'].some(t => rawCat.includes(t));
            if (hasConflictingCat) return false;
            const isRera = ['RERA_CERTIFICATE', 'RERA_REGISTRATION', 'RERA_APPROVAL', 'RERA_VERIFICATION', 'RERA'].some(t => rawCat.includes(t)) || String(doc.approvalAuthority || '').toUpperCase() === 'RERA';
            if (!isRera) return false;
        }
    }

    // 7. Must have currentVersionId and resolved currentVersion
    const currentVersionId = rec.currentVersionId?._id || rec.currentVersionId;
    if (!isValidSnapshotId(currentVersionId)) return false;

    const version = rec.currentVersion || rec.versionRecord;
    if (!version || typeof version !== 'object') return false;

    // Verify DocumentVersion.documentId exactly matches Document.documentId
    if (version.documentId && rec.documentId && String(version.documentId).trim() !== String(rec.documentId).trim()) {
        return false;
    }

    // Verify resolved version is the current version referenced by Document
    const curVerIdStr = String(currentVersionId).trim();
    const verIdStr = String(version._id || version.id || version.versionId || '').trim();
    if (verIdStr && curVerIdStr && verIdStr !== curVerIdStr) {
        return false;
    }

    // Check version revocation or deletion
    if (version.isRevoked === true || version.isDeleted === true) return false;

    // 8. Validate checksum algorithm and 64-char hexadecimal SHA-256 digest format
    const algo = String(version.checksumAlgorithm || 'SHA-256').trim().toUpperCase();
    if (algo !== 'SHA-256' && algo !== 'SHA256') {
        return false;
    }
    const checksum = String(version.checksum || rec.checksum || '').trim();
    if (!/^[a-fA-F0-9]{64}$/.test(checksum)) {
        return false;
    }

    // Reject if embedded candidate checksum does not match actual DocumentVersion checksum
    const candidateHash = doc.checksum || doc.contentHash || doc.snapshotContentHash || doc.fileHash;
    if (candidateHash && String(candidateHash).trim().toLowerCase() !== checksum.toLowerCase()) {
        return false;
    }

    // If doc specifies currentVersionId, confirm it is not replaced
    if (doc.currentVersionId && currentVersionId && String(doc.currentVersionId).trim() !== String(currentVersionId).trim()) {
        return false;
    }

    // 9. Expiry validation on record
    const expiry = rec.expiryDate || rec.metadata?.expiryDate || rec.validUntil;
    if (expiry) {
        const expTime = new Date(expiry).getTime();
        if (!isNaN(expTime) && expTime <= Date.now()) return false;
    }

    return true;
}

/**
 * Checks whether a document or subdocument possesses a linked real CRM document record or immutable hash.
 * Accepts:
 * - documentId or currentVersionId (valid structural ID)
 * - contentHash, rawSnapshotHash, snapshotContentHash, checksum, fileHash (>= 16 hex/alnum chars)
 * - verificationSnapshotId or snapshotId
 */
function hasLinkedDocumentRecordOrHash(doc) {
    if (!doc || typeof doc !== 'object') return false;

    const docId = doc.documentId || doc.currentVersionId || doc.crmDocumentId;
    if (isValidSnapshotId(docId)) return true;

    const hash = doc.contentHash || doc.snapshotContentHash || doc.rawSnapshotHash || doc.checksum || doc.fileHash;
    if (isValidContentHash(hash)) return true;

    const snapId = doc.verificationSnapshotId || doc.snapshotId;
    if (isValidSnapshotId(snapId)) return true;

    return false;
}

/**
 * Checks whether a document entry has authorized verification provenance.
 * Round 6 Hardening:
 * - Accept audit evidence ONLY from resolved CRM Document record (rec.verificationAudit / rec.metadata.verificationAudit).
 * - Strictly REJECT embedded candidate doc.verificationAudit, doc.auditEvidence, or doc.auditRecord!
 * - Strictly require ALL 7 core audit fields:
 *   1. documentId
 *   2. current versionId
 *   3. entityId
 *   4. entityType
 *   5. verifier identity (enforcing real verifier authorization contract)
 *   6. verification timestamp (non-future, <= 180 days)
 *   7. explicit successful outcome ('VERIFIED' or 'APPROVED')
 * - Enforces the trusted verifier authorization contract (rejects arbitrary strings / arbitrary 24-char IDs without authorized role).
 * - Validates all IDs against resolved Document, DocumentVersion and canonical Deal/Project/Inventory.
 * - Fails closed if verifier authorization or any mandatory audit field cannot be established.
 */
export function hasAuthoritativeDocumentProvenance(doc, parentEntity = null) {
    if (!doc || typeof doc !== 'object') return false;

    // Disqualify explicit manual input
    const rawSource = String(doc.source || doc.sourceType || doc.provenance?.source || parentEntity?.source || parentEntity?.provenance?.source || '').trim().toUpperCase();
    if (['MANUAL', 'USER_INPUT', 'AGENT_INPUT', 'SELF_REPORTED'].includes(rawSource) || doc.isManual === true || parentEntity?.isManual === true) {
        return false;
    }

    // MANDATORY: Accept audit evidence ONLY from resolved CRM Document record
    // NEVER accept doc.verificationAudit, doc.auditEvidence, or doc.auditRecord from embedded candidate!
    const rec = doc.documentRecord || doc._resolvedRecord;
    if (!rec || typeof rec !== 'object') {
        return false;
    }

    // Require resolver verification proof
    if (rec._isResolverVerified !== true && rec._isVerifiedRecord !== true) {
        return false;
    }

    const audit = rec.verificationAudit || 
                  rec.auditEvidence || 
                  rec.metadata?.verificationAudit || 
                  rec.metadata?.auditEvidence;

    if (!audit || typeof audit !== 'object') {
        // No synthetic audit invented during validation; fail closed.
        return false;
    }

    // Check revocation and supersession FIRST
    if (audit.isRevoked === true || audit.isSuperseded === true || rec.isRevoked === true || rec.metadata?.isRevoked === true || rec.status === 'REVOKED') {
        return false;
    }

    // MANDATORY 7 CORE FIELDS:
    // 1. documentId (mandatory, exact match to rec.documentId)
    if (!audit.documentId || typeof audit.documentId !== 'string') return false;
    const auditDocId = String(audit.documentId).trim();
    const recDocId = String(rec.documentId || '').trim();
    if (!recDocId || auditDocId !== recDocId) return false;
    if (doc.documentId && String(doc.documentId).trim() !== recDocId) return false;

    // 2. current versionId (mandatory, exact match to rec.currentVersionId or rec.currentVersion)
    if (!audit.versionId) return false;
    const auditVerId = String(audit.versionId?._id || audit.versionId).trim();
    const currentVerId = String(rec.currentVersionId?._id || rec.currentVersionId || '').trim();
    const resolvedVerId = String(rec.currentVersion?._id || rec.currentVersion?.versionId || '').trim();
    if (!currentVerId && !resolvedVerId) return false;
    if (currentVerId && auditVerId !== currentVerId) return false;
    if (resolvedVerId && auditVerId !== resolvedVerId) return false;

    // 3. entityId (mandatory)
    if (!audit.entityId) return false;
    const auditEntId = String(audit.entityId?._id || audit.entityId).trim();
    if (!auditEntId) return false;

    // 4. entityType (mandatory)
    if (!audit.entityType) return false;
    const auditEntType = String(audit.entityType).trim();
    if (!['Deal', 'Project', 'Inventory'].includes(auditEntType)) {
        return false;
    }

    // Validate entity linkage against parentEntity
    if (parentEntity && (parentEntity._id || parentEntity.id)) {
        const parentId = String(parentEntity._id || parentEntity.id).trim();
        const linkedProject = String(parentEntity.projectId?._id || parentEntity.projectId || (parentEntity.project?._id) || '').trim();
        const linkedInventory = String(parentEntity.inventoryId?._id || parentEntity.inventoryId || (parentEntity.inventory?._id) || '').trim();

        let parentEntityType = String(parentEntity._entityType || '').trim();
        if (!parentEntityType) {
            if (parentEntity.dealId || parentEntity.unitNo || parentEntity.stage) parentEntityType = 'Deal';
            else if (parentEntity.builderName || parentEntity.totalUnits || parentEntity.projectType) parentEntityType = 'Project';
            else if (parentEntity.inventoryId || parentEntity.unitNumber || parentEntity.status) parentEntityType = 'Inventory';
        }

        let matchesEntity = false;
        if (auditEntId === parentId && parentEntityType && auditEntType === parentEntityType) {
            matchesEntity = true;
        } else if (linkedProject && auditEntId === linkedProject && auditEntType === 'Project') {
            matchesEntity = true;
        } else if (linkedInventory && auditEntId === linkedInventory && auditEntType === 'Inventory') {
            matchesEntity = true;
        }

        if (!matchesEntity) {
            return false;
        }
    }

    // 5. verifier identity with real verifier authorization contract
    const verifierId = audit.verifierId || audit.verifiedBy || audit.auditorId;
    if (!verifierId) return false;
    if (!isAuthorizedVerifier(verifierId, audit, parentEntity)) {
        return false;
    }

    // 6. verification timestamp (must be present, non-future, <= 180 days)
    const verifiedAt = audit.verifiedAt || audit.timestamp;
    if (!verifiedAt || !isValidVerificationDate(verifiedAt)) {
        return false;
    }

    // 7. explicit successful verification outcome (strictly 'VERIFIED' or 'APPROVED')
    const outcome = String(audit.outcome || audit.verificationOutcome || audit.status || '').trim().toUpperCase();
    if (!['VERIFIED', 'APPROVED'].includes(outcome)) {
        return false;
    }

    return true;
}

/**
 * 1. Authoritative Title Verification Contract
 * 
 * Must require a recognized statutory authority verification result backed by
 * concrete evidence (snapshot ID, content hash, verified audit timestamp within 180 days)
 * and explicit presence of clean litigation result.
 * Generic booleans (deal.isVerified, deal.titleVerified, etc.) ALONE NEVER qualify.
 * 
 * @param {Object} entity - Deal, Inventory, or Project record
 * @returns {boolean}
 */
export function hasAuthoritativeTitleVerification(entity) {
    if (!entity || typeof entity !== 'object') return false;

    // Check authorityVerification subdocument on entity or entity.inventory
    const av = entity.authorityVerification || entity.inventory?.authorityVerification;
    if (av && evaluateAuthoritativeEvidence(av)) {
        return true;
    }

    // Check PropertyAuthorityLink if attached/present (enforces identical evidence, freshness & litigation)
    const link = entity.authorityLink || entity.propertyAuthorityLink || entity.inventory?.authorityLink;
    if (link && evaluateAuthoritativeEvidence(link)) {
        return true;
    }

    // Generic booleans alone (deal.isVerified, deal.titleVerified, etc.) must NEVER bypass evidence
    return false;
}

export const isAuthoritativelyVerified = hasAuthoritativeTitleVerification;

/**
 * Validates generic evidence reference string (sanction letter number, document number, etc.)
 */
function isValidEvidenceReference(ref) {
    if (!ref || (typeof ref !== 'string' && typeof ref !== 'object')) return false;
    const s = String(ref).trim();
    if (s.length < 3) return false;
    if (['null', 'undefined', 'pending', 'applied', 'none', 'n/a', 'false', '0'].includes(s.toLowerCase())) return false;
    return true;
}

/**
 * Validates whether an institution name is a recognized financial institution.
 * Strictly rejects generic placeholders: 'any bank', 'all banks', 'nationalized', 'bank finance', etc.
 */
function isRecognizedFinancialInstitution(rawName) {
    if (!rawName || typeof rawName !== 'string') return false;
    const norm = rawName.trim().toUpperCase();
    if (['ANY BANK', 'ALL BANKS', 'ALL MAJOR BANKS', 'NATIONALIZED', 'PRIVATE', 'BANK FINANCE', 'LOAN', 'FINANCE', 'UNKNOWN', 'N/A', 'NONE'].includes(norm)) {
        return false;
    }
    return RECOGNIZED_FINANCIAL_INSTITUTIONS.some(inst => norm === inst || norm.startsWith(`${inst} `) || norm.endsWith(` ${inst}`));
}

/**
 * Validates RERA registration reference string.
 */
function isValidReraReference(ref) {
    if (!ref || (typeof ref !== 'string' && typeof ref !== 'object')) return false;
    const s = String(ref).trim();
    if (s.length < 3) return false;
    if (['null', 'undefined', 'pending', 'applied', 'none', 'n/a', 'false'].includes(s.toLowerCase())) return false;
    return true;
}

/**
 * Validates whether an RERA record or approval entry has authoritative source provenance.
 * Round 3 Hardening:
 * - Mandatory non-future verification timestamp within 180 days on EVERY accepted evidence path.
 * - Bare documentId, snapshotId, externalVerificationId, or verifiedByAuthority: true alone fails closed.
 * - Rejects manual input (source: 'MANUAL', USER_INPUT, isManual: true).
 * - Requires resolved CRM document record, verified snapshot record, or statutory authority verification.
 */
function hasReraProvenance(item, parentEntity = null) {
    if (!item || typeof item !== 'object') return false;

    // Explicit manual indicators immediately disqualify
    const rawSource = String(item.source || item.sourceType || item.provenance?.source || parentEntity?.source || parentEntity?.provenance?.source || '').trim().toUpperCase();
    if (['MANUAL', 'USER_INPUT', 'AGENT_INPUT', 'SELF_REPORTED'].includes(rawSource) || item.isManual === true || parentEntity?.isManual === true) {
        return false;
    }

    // MANDATORY FRESHNESS: Non-future verification timestamp within 180 days on EVERY accepted evidence path
    const snapCandidate = item.snapshotRecord || item._resolvedSnapshot || parentEntity?._resolvedSnapshot || parentEntity?.authorityVerification?.snapshotRecord;
    const reviewDate = item.lastVerifiedAt || item.verifiedAt || item.reviewDate || item.date || item.identityVerifiedAt || 
                       snapCandidate?.observedAt || snapCandidate?.verifiedAt || snapCandidate?.lastVerifiedAt ||
                       parentEntity?.reraLastVerifiedAt || parentEntity?.lastVerifiedAt || parentEntity?.date;
    if (!isValidVerificationDate(reviewDate)) {
        return false;
    }

    // 1. Real resolved CRM document record of category RERA
    if (validateAuthoritativeDocumentRecord(item, parentEntity, 'RERA')) {
        return true;
    }

    // 2. Real resolved snapshot record from PropertyVerificationSnapshot
    const snap = item._resolvedSnapshot || parentEntity?._resolvedSnapshot || item.snapshotRecord || parentEntity?.authorityVerification?.snapshotRecord;
    if (snap && typeof snap === 'object') {
        // P0: Proof of trusted resolver attachment
        if (snap._isResolverVerified !== true) {
            // Fabricated or embedded snapshot without trusted DB resolution -> FAIL CLOSED
            return false;
        }

        // P0: Enforce verified relationship chain: Snapshot -> PropertyAuthorityLink -> canonical property entity
        const link = snap._resolvedLink;
        if (!link || typeof link !== 'object' || link._isResolverVerified !== true) {
            // Missing PropertyAuthorityLink or embedded link without trusted DB resolution -> FAIL CLOSED
            return false;
        }

        // Operational status
        if (link.isActive === false) return false;

        // P0: Require identityVerified === true
        if (link.identityVerified !== true) {
            return false;
        }

        // P0: Require exact permitted match eligibility state (strictly 'ELIGIBLE')
        // Reject INCOMPLETE, AMBIGUOUS, NEEDS_REVIEW, INELIGIBLE
        if (link.matchEligibility !== 'ELIGIBLE') {
            return false;
        }

        // P0: Tenant alignment between snapshot and link
        if (!snap.tenantId || !link.tenantId || String(snap.tenantId) !== String(link.tenantId)) {
            return false;
        }

        // P0: Authority code alignment
        const snapCode = String(snap.authorityCode || snap.source || '').trim().toUpperCase();
        const linkCode = String(link.authorityCode || '').trim().toUpperCase();
        if (!snapCode || !linkCode || snapCode !== linkCode) {
            return false;
        }

        const permittedAuthorities = ['HRERA', 'HARERA', 'PBRERA', 'RERA', 'HSVP', 'GMADA', 'CHD'];
        if (!permittedAuthorities.includes(snapCode)) return false;

        // P0: Entity relationship using actual PropertyAuthorityLink schema:
        // - PropertyAuthorityLink ONLY has inventoryId (ObjectId ref Inventory)
        // - propertyId is a String authority plot/file code (NEVER treated as Mongo entity ID)
        // - projectId and dealId are undeclared schema fields and NEVER treated as relationships
        const parentId = String(parentEntity?._id || parentEntity?.id || '');
        let parentType = String(parentEntity?._entityType || '').trim();
        if (!parentType && parentEntity) {
            if (parentEntity.dealId || parentEntity.unitNo || parentEntity.stage) parentType = 'Deal';
            else if (parentEntity.builderName || parentEntity.totalUnits || parentEntity.projectType) parentType = 'Project';
            else if (parentEntity.inventoryId || parentEntity.unitNumber || parentEntity.status) parentType = 'Inventory';
        }

        const linkInventoryId = String(link.inventoryId?._id || link.inventoryId || '');
        if (!linkInventoryId) {
            return false;
        }

        let matchesEntity = false;
        if (parentType === 'Inventory') {
            matchesEntity = (linkInventoryId === parentId);
        } else if (parentType === 'Deal') {
            // Deal: must resolve through Deal's linked Inventory
            const dealInvId = String(parentEntity?.inventoryId?._id || parentEntity?.inventoryId || (parentEntity?.inventory?._id) || '');
            if (!dealInvId) {
                // Deal has no linked inventory -> FAIL CLOSED
                return false;
            }
            matchesEntity = (linkInventoryId === dealInvId);
        } else if (parentType === 'Project') {
            // Project: resolve genuine schema-supported Project-to-Inventory relationship
            const projInv = link._resolvedProjectInventory;
            if (projInv && String(projInv.projectId?._id || projInv.projectId) === parentId) {
                matchesEntity = true;
            } else {
                return false; // No verified project inventory relationship -> FAIL CLOSED
            }
        }

        if (!matchesEntity) {
            // Snapshot linked to another property -> FAIL CLOSED
            return false;
        }

        // Sealing and revocation
        if (snap.isRevoked === true || snap.status === 'REVOKED' || snap.isSealed === false) return false;

        // Data quality restrictions
        if (snap.dataQuality?.status === 'RESTRICTED') return false;

        // Validate verification audit / authorized verifier
        const verifier = snap.createdByWorkerId || snap.verifiedBy || snap.verifierId || snap.runItemId || snap.fenceToken;
        if (!verifier) return false;

        // Content hash integrity
        const hash = snap.contentHash || snap.snapshotContentHash || snap.rawSnapshotHash;
        if (!isValidContentHash(hash)) return false;

        // Verification timestamp freshness
        const snapDate = snap.observedAt || snap.verifiedAt || snap.createdAt || snap.lastVerifiedAt;
        if (!isValidVerificationDate(snapDate)) return false;

        return true;
    }

    // ALL OTHER PATHS STRICTLY REMOVED:
    // - Embedded authorityVerification objects without underlying snapshot record -> FAIL CLOSED
    // - Reviewer strings + source strings + hashes -> FAIL CLOSED
    // - Arbitrary authoritative source strings + snapshot IDs + hashes -> FAIL CLOSED
    // - Boolean verification flags -> FAIL CLOSED
    return false;
}

/**
 * 2. Authoritative RERA Compliance Contract
 * 
 * Requires a valid, explicitly approved registration status backed by authoritative source record/provenance.
 * The mere presence of an RERA ID or number must never imply approval.
 * If status is missing, pending, expired, rejected, under review, unknown, or lacks independent provenance -> UNVERIFIED.
 * 
 * @param {Object} entity - Deal, Inventory, or Project record
 * @returns {boolean}
 */
export function hasAuthoritativeReraApproval(entity) {
    if (!entity || typeof entity !== 'object') return false;

    // Extract potential direct status
    const rawDirectStatus = entity.reraStatus || entity.reraApprovalStatus || entity.project?.reraStatus || entity.project?.reraApprovalStatus;
    const directStatus = rawDirectStatus ? String(rawDirectStatus).trim().toUpperCase() : '';

    // If direct status is explicitly disallowed, immediately fail
    if (directStatus && DISALLOWED_RERA_STATUSES.includes(directStatus)) {
        return false;
    }

    const regNumber = entity.reraNumber || entity.reraRegistrationNumber || entity.project?.reraNumber || entity.project?.reraRegistrationNumber || entity.reraId;
    const hasValidRegNumber = isValidReraReference(regNumber);

    // Direct status must be explicitly approved AND have valid registration reference AND authoritative provenance
    if (directStatus && APPROVED_RERA_STATUSES.includes(directStatus) && hasValidRegNumber) {
        // Check if expiry date is present
        const expiry = entity.reraValidUntil || entity.reraExpiryDate || entity.project?.reraValidUntil || entity.project?.reraExpiryDate;
        if (expiry) {
            const expTime = new Date(expiry).getTime();
            if (isNaN(expTime) || expTime <= Date.now()) {
                return false; // Expired or malformed expiry date
            }
        }
        // Gate 4: Require Authoritative Source Provenance & Evidence Record
        if (hasReraProvenance(entity, entity)) {
            return true;
        }
    }

    // Check project approvals array
    const approvals = Array.isArray(entity.approvals) 
        ? entity.approvals 
        : (Array.isArray(entity.project?.approvals) ? entity.project.approvals : []);

    for (const a of approvals) {
        if (!a || typeof a !== 'object') continue;
        const auth = String(a.approvalAuthority || a.authority || '').trim().toUpperCase();
        const docType = String(a.documentType || '').trim().toUpperCase();
        const isRera = auth === 'RERA' || docType === 'RERA' || auth.includes('RERA');
        if (!isRera) continue;

        const itemStatus = String(a.status || a.approvalStatus || '').trim().toUpperCase();
        
        // Explicitly reject disallowed/unknown statuses
        if (!itemStatus || DISALLOWED_RERA_STATUSES.includes(itemStatus)) {
            continue;
        }

        // Must have an explicitly approved status - NEVER use Boolean(a.registrationNo) as substitute!
        if (!APPROVED_RERA_STATUSES.includes(itemStatus)) {
            continue;
        }

        // Must have a valid registration reference
        const regRef = a.registrationNo || a.registrationNumber || a.referenceNo || a.approvalNo || a.documentNumber;
        if (!isValidReraReference(regRef)) {
            continue;
        }

        // If expiryDate or validUntil is provided, check that it is not expired
        const expiryDate = a.expiryDate || a.validUntil || a.validTill;
        if (expiryDate) {
            const exp = new Date(expiryDate);
            if (isNaN(exp.getTime()) || exp.getTime() <= Date.now()) {
                continue; // Expired or malformed date
            }
        }

        // Gate 4: Require Authoritative Source Provenance & Evidence Record
        if (hasReraProvenance(a, entity)) {
            return true;
        }
    }

    return false;
}

/**
 * 3. Authoritative Bank Loan Approval Contract (Gate 2 Hardened)
 * 
 * Requires verified bank approval evidence backed by recognized financial institution.
 * Distinguishes bank names, loan assistance, eligibility, and applications from genuine bank sanctions.
 * 
 * Requirements:
 * - Recognized financial institution (e.g. SBI, HDFC, ICICI, AXIS, PNB, etc.)
 * - Explicit approved status ('APPROVED', 'SANCTIONED', 'VALID')
 * - Rejects assistance, eligibility, inquiry, and application statuses/programs
 * - Valid evidence/document reference (sanction letter number, approval ref >= 3 chars)
 * - Linked real CRM document record (documentId, currentVersionId, or immutable content hash >= 16 hex chars)
 * - Authorized verification provenance and verified document status
 * - Non-expired validity and non-future sanction date
 * 
 * Generic booleans, bank names alone, loan eligibility, or loan assistance NEVER qualify.
 * 
 * @param {Object} entity
 * @returns {boolean}
 */
export function hasAuthoritativeBankApproval(entity) {
    if (!entity || typeof entity !== 'object') return false;

    // Collect candidate bank approval records
    const bankApprovalDocs = [];
    if (entity.bankApproval && typeof entity.bankApproval === 'object') bankApprovalDocs.push(entity.bankApproval);
    if (Array.isArray(entity.bankApprovals)) bankApprovalDocs.push(...entity.bankApprovals);
    if (entity.project?.bankApproval && typeof entity.project.bankApproval === 'object') bankApprovalDocs.push(entity.project.bankApproval);
    if (Array.isArray(entity.project?.bankApprovals)) bankApprovalDocs.push(...entity.project.bankApprovals);
    if (entity.inventory?.bankApproval && typeof entity.inventory.bankApproval === 'object') bankApprovalDocs.push(entity.inventory.bankApproval);
    if (Array.isArray(entity.inventory?.bankApprovals)) bankApprovalDocs.push(...entity.inventory.bankApprovals);

    // Also check approvals array for bank approval documents
    const approvals = Array.isArray(entity.approvals) 
        ? entity.approvals 
        : (Array.isArray(entity.project?.approvals) ? entity.project.approvals : []);

    for (const a of approvals) {
        if (!a || typeof a !== 'object') continue;
        const cat = String(a.category || a.documentType || a.approvalAuthority || '').trim().toUpperCase();
        if (cat.includes('BANK') || cat.includes('LOAN') || cat.includes('MORTGAGE') || cat.includes('FINANCE')) {
            bankApprovalDocs.push(a);
        }
    }

    for (const doc of bankApprovalDocs) {
        if (!doc || typeof doc !== 'object') continue;

        // 1. Distinguish assistance, eligibility, inquiry, and application from genuine sanctions
        const progOrType = String(doc.type || doc.category || doc.serviceType || doc.program || doc.label || doc.notes || '').trim().toUpperCase();
        if (['ASSISTANCE', 'ELIGIBILITY', 'APPLICATION', 'INQUIRY', 'PRE_QUALIFICATION', 'LEAD', 'ESTIMATE', 'CALCULATOR'].some(term => progOrType.includes(term))) {
            continue;
        }

        // 2. Recognized financial institution check (rejects generic placeholders like 'Any Bank')
        const bankName = doc.bankName || doc.institution || doc.financialInstitution || doc.lender || doc.approvedBank;
        if (!isRecognizedFinancialInstitution(bankName)) continue;

        // 3. Explicit approved/sanctioned status check (rejects ELIGIBLE, APPLIED, ASSISTED, PENDING)
        const status = String(doc.status || doc.approvalStatus || doc.sanctionStatus || '').trim().toUpperCase();
        if (!['APPROVED', 'SANCTIONED', 'VALID'].includes(status)) continue;
        if (['ELIGIBLE', 'APPLIED', 'ASSISTED', 'PENDING', 'IN_PROCESS', 'INQUIRY', 'REQUESTED'].includes(status)) continue;

        // 4. Valid evidence reference (sanction letter number, approval ref >= 3 chars)
        const ref = doc.sanctionLetterNumber || doc.approvalRef || doc.documentNumber || doc.referenceNo || doc.documentId || doc.sanctionNo || doc.approvalNumber;
        if (!isValidEvidenceReference(ref)) continue;

        // 5. Round 4 Hardening: Require authentic resolved CRM document record for BANK
        if (!validateAuthoritativeDocumentRecord(doc, entity, 'BANK')) continue;

        // 6. Authorized provenance & verified document status
        if (!hasAuthoritativeDocumentProvenance(doc, entity)) continue;

        // 7. Non-expired validity
        if (doc.expiryDate || doc.validUntil) {
            const exp = new Date(doc.expiryDate || doc.validUntil);
            if (isNaN(exp.getTime()) || exp.getTime() <= Date.now()) continue;
        }

        // 8. Non-future sanction/approval date
        if (doc.sanctionDate || doc.approvalDate || doc.issueDate) {
            const d = new Date(doc.sanctionDate || doc.approvalDate || doc.issueDate);
            if (isNaN(d.getTime()) || d.getTime() > Date.now() + CLOCK_SKEW_TOLERANCE_MS) continue;
        }

        return true;
    }

    return false;
}

/**
 * 4. Authoritative Ready Possession Contract (Gate 3 Hardened)
 * 
 * Requires verified ready possession evidence backed by Occupancy or Completion Certificate.
 * - Consistent possession status (rejects UNDER_CONSTRUCTION, PLANNED, DELAYED, PENDING, FUTURE, INCOMPLETE)
 * - Rejects progressPercentage < 100 on project or entity
 * - Requires explicit status ('APPROVED', 'ISSUED', 'VALID', 'ACTIVE', 'VERIFIED') — NO DEFAULT APPROVAL!
 * - Requires valid certificate type (OC, CC, Occupancy/Completion Certificate)
 * - Requires linked real CRM document record (documentId, snapshot ID, or immutable content hash >= 16 chars)
 * - Requires authorized verification provenance and non-future issue date
 * 
 * Generic booleans (isReadyToMove: true), bare status strings, or past dates alone NEVER qualify.
 * 
 * @param {Object} entity
 * @returns {boolean}
 */
export function hasAuthoritativeReadyPossession(entity) {
    if (!entity || typeof entity !== 'object') return false;

    // Reject contradictory, planned, delayed, or under-construction status across project and entity
    const constStatus = String(entity.constructionStatus || entity.stage || entity.project?.constructionStatus || entity.project?.stage || entity.inventory?.constructionStatus || '').trim().toUpperCase();
    if (['UNDER_CONSTRUCTION', 'PLANNED', 'DELAYED', 'PENDING', 'FUTURE', 'INCOMPLETE'].includes(constStatus)) {
        return false;
    }

    // 1. Check Occupancy Certificate (OC) or Completion Certificate (CC)
    const ocDocs = [];
    if (entity.occupancyCertificate && typeof entity.occupancyCertificate === 'object') ocDocs.push(entity.occupancyCertificate);
    if (entity.completionCertificate && typeof entity.completionCertificate === 'object') ocDocs.push(entity.completionCertificate);
    if (entity.project?.occupancyCertificate && typeof entity.project.occupancyCertificate === 'object') ocDocs.push(entity.project.occupancyCertificate);
    if (entity.project?.completionCertificate && typeof entity.project.completionCertificate === 'object') ocDocs.push(entity.project.completionCertificate);
    if (entity.inventory?.occupancyCertificate && typeof entity.inventory.occupancyCertificate === 'object') ocDocs.push(entity.inventory.occupancyCertificate);
    if (entity.inventory?.completionCertificate && typeof entity.inventory.completionCertificate === 'object') ocDocs.push(entity.inventory.completionCertificate);

    const approvals = Array.isArray(entity.approvals) 
        ? entity.approvals 
        : (Array.isArray(entity.project?.approvals) ? entity.project.approvals : []);

    for (const a of approvals) {
        if (!a || typeof a !== 'object') continue;
        const type = String(a.documentType || a.approvalAuthority || a.category || '').trim().toUpperCase();
        if (['OC', 'CC', 'OCCUPANCY_CERTIFICATE', 'COMPLETION_CERTIFICATE', 'OCCUPANCY', 'COMPLETION'].includes(type)) {
            ocDocs.push(a);
        }
    }

    if (ocDocs.length === 0) return false;

    // ENTERPRISE READY-POSSESSION PHYSICAL PROGRESS CONTRACT:
    // Physical progress must be explicitly 100%. Missing progress does not satisfy completion condition.
    const ep = entity.progressPercentage;
    const pp = entity.project?.progressPercentage;
    const ip = entity.inventory?.progressPercentage;
    const dp = ocDocs.map(d => typeof d.progressPercentage === 'number' ? d.progressPercentage : (typeof d.documentRecord?.progressPercentage === 'number' ? d.documentRecord.progressPercentage : null)).find(p => p !== null);

    // Check for contradictory progress across linked records
    if (typeof ep === 'number' && typeof pp === 'number' && ep !== pp) return false;
    if (typeof ep === 'number' && typeof ip === 'number' && ep !== ip) return false;
    if (typeof pp === 'number' && typeof ip === 'number' && pp !== ip) return false;
    if (typeof ep === 'number' && typeof dp === 'number' && ep !== dp) return false;

    // Incomplete progress (< 100) must strictly fail closed
    if (typeof ep === 'number' && ep < 100) return false;
    if (typeof pp === 'number' && pp < 100) return false;
    if (typeof ip === 'number' && ip < 100) return false;
    if (typeof dp === 'number' && dp < 100) return false;

    // Missing progress check on canonical entity / completion records
    // Must have at least one explicit progress percentage of 100
    const explicitProgress = typeof ep === 'number' ? ep : (typeof pp === 'number' ? pp : (typeof ip === 'number' ? ip : (typeof dp === 'number' ? dp : null)));
    if (explicitProgress === null || explicitProgress !== 100) {
        return false;
    }

    const posStatus = String(entity.possessionStatus || entity.authorityVerification?.possessionStatus || entity.project?.possessionStatus || entity.inventory?.possessionStatus || '').trim().toUpperCase();
    if (['UNDER_CONSTRUCTION', 'PLANNED', 'DELAYED', 'PENDING', 'FUTURE', 'INCOMPLETE'].includes(posStatus)) {
        return false;
    }

    for (const doc of ocDocs) {
        if (!doc || typeof doc !== 'object') continue;

        // Gate 3 Hardening: Remove default approval of missing certificate status!
        // Must be explicitly present and in approved set
        const rawStatus = doc.status || doc.approvalStatus;
        if (!rawStatus) continue;
        const status = String(rawStatus).trim().toUpperCase();
        if (!['APPROVED', 'ISSUED', 'VALID', 'ACTIVE', 'VERIFIED'].includes(status)) continue;

        // Valid certificate reference
        const ref = doc.certificateNumber || doc.documentNumber || doc.referenceNo || doc.registrationNo || doc.documentId;
        if (!isValidEvidenceReference(ref)) continue;

        // Round 4 Hardening: Require authentic resolved CRM document record representing OC or CC
        if (!validateAuthoritativeDocumentRecord(doc, entity, 'POSSESSION')) continue;

        // Authorized verification provenance
        if (!hasAuthoritativeDocumentProvenance(doc, entity)) continue;

        // Non-future issue date
        if (doc.issueDate || doc.verifiedAt || doc.approvalDate) {
            const d = new Date(doc.issueDate || doc.verifiedAt || doc.approvalDate);
            if (isNaN(d.getTime()) || d.getTime() > Date.now() + CLOCK_SKEW_TOLERANCE_MS) continue;
        }

        return true;
    }

    // Generic boolean, bare status string, past date alone, or snapshot fallback without authentic OC/CC document must FAIL CLOSED
    return false;
}

/**
 * Extract authoritative verification facts
 * 
 * @param {Object} entity
 * @returns {Object}
 */
export function extractVerificationFacts(entity) {
    const isTitleVerified = hasAuthoritativeTitleVerification(entity);
    const isReraApproved = hasAuthoritativeReraApproval(entity);
    const isBankApproved = hasAuthoritativeBankApproval(entity);
    const isReadyPossession = hasAuthoritativeReadyPossession(entity);

    const av = entity?.authorityVerification || entity?.inventory?.authorityVerification;
    const link = entity?.authorityLink || entity?.propertyAuthorityLink || entity?.inventory?.authorityLink;
    const rawCode = av?.authorityCode || av?.authority || link?.authorityCode || link?.authority || null;
    const authorityCode = rawCode ? String(rawCode).trim().toUpperCase() : null;
    const rawRera = entity?.reraNumber || entity?.reraRegistrationNumber || entity?.project?.reraNumber || null;
    const reraNumber = isValidReraReference(rawRera) ? String(rawRera).trim() : null;

    return {
        isTitleVerified,
        isReraApproved,
        isBankApproved,
        isBankLoanApproved: isBankApproved,
        isReadyPossession,
        authorityCode: isTitleVerified ? authorityCode : null,
        titleEvidenceCode: isTitleVerified ? authorityCode : null,
        reraNumber: isReraApproved ? reraNumber : null
    };
}

/**
 * Generate compliant, neutral fallback copy for all tones.
 * Ensures zero unsupported claims when evidence is missing.
 */
export function generateCompliantFallback(deal = {}, platform = 'facebook', options = {}, facts = null) {
    let opts = options;
    let actualFacts = facts;

    if (typeof options === 'string') {
        opts = { tone: options, format: typeof facts === 'string' ? facts : 'post' };
        actualFacts = typeof facts === 'object' && facts !== null ? facts : null;
    } else if (typeof facts === 'string') {
        opts = { ...(opts || {}), format: facts };
        actualFacts = null;
    }

    opts = opts || {};
    const tone = opts.tone || 'urgent';
    const format = opts.format || 'post';

    const unitNo = deal.unitNo || 'Premium Property';
    const projectName = deal.projectName || 'Prime Property';
    const price = deal.price ? (typeof deal.price === 'number' ? `₹${deal.price.toLocaleString('en-IN')}` : deal.price) : 'Contact for Price';
    const size = deal.size ? `${deal.size} ${deal.sizeUnit || 'sq.ft'}` : '';
    const location = deal.location || 'Kurukshetra, Haryana';
    const unitType = deal.unitType || '';

    const isMohali = location.toLowerCase().includes('mohali');
    const regionalPhone = isMohali ? '+91 99910 00570' : '+91 99913 33570';
    const website = 'www.bharatproperties.co';

    const vFacts = actualFacts || extractVerificationFacts(deal);

    // Title / Authority line
    const titleLine = vFacts.isTitleVerified
        ? `📜 ${vFacts.authorityCode ? `${vFacts.authorityCode} ` : ''}Verified Title`
        : '📜 Property details available on request.';

    // RERA line
    const reraLine = vFacts.isReraApproved
        ? `\n🏛️ RERA Approved${vFacts.reraNumber ? ` (${vFacts.reraNumber})` : ''}`
        : '';

    if (tone === 'luxury') {
        return `💎 EXCLUSIVE LUXURY LIVING | ${projectName}\n\nIndulge in refined architecture and serene living at ${location}. Designed for those who value timeless quality and premier lifestyle amenities.\n\n✨ Unit: ${unitNo} ${unitType} (${size})\n💰 Investment: ${price}\n${titleLine}${reraLine}\n\nPrivate viewings available on prior appointment:\n📞 ${regionalPhone}\n🌐 ${website}\n\n#BharatProperties #LuxuryHomes #PrimeRealEstate #Kurukshetra`;
    }

    if (tone === 'investor') {
        const docLine = vFacts.isTitleVerified
            ? `🛡️ ${vFacts.authorityCode ? `${vFacts.authorityCode} ` : ''}Verified Title`
            : '📋 Documentation status can be checked during due diligence.';

        return `📈 STRATEGIC PROPERTY OPPORTUNITY | ${projectName}\n\nCommercial/residential asset positioned in the growing corridor of ${location}. Contact us for current availability and property details.\n\n🔑 Property: ${unitNo} ${unitType} (${size})\n💵 Price: ${price}\n${docLine}${reraLine}\n\nRequest property details & advisory:\n📞 ${regionalPhone}\n🌐 ${website}\n\n#BharatProperties #RealEstate #CommercialProperty #Kurukshetra`;
    }

    if (tone === 'short_hook') {
        const hookDetail = vFacts.isTitleVerified
            ? `${vFacts.authorityCode ? `${vFacts.authorityCode} ` : ''}Verified Title`
            : 'Property details on request';
        
        let hook = `🚨 Prime Deal Alert in ${location}! ${unitNo} at ${price}. ${hookDetail}. Call ${regionalPhone} to book site visit! 🌐 ${website} #BharatProperties`;
        if (hook.length > 280) {
            hook = `🚨 Prime Deal in ${location}! ${unitNo} at ${price}. Call ${regionalPhone} to book site visit! 🌐 ${website} #BharatProperties`;
        }
        return hook;
    }

    // Default: Urgent Deal (Hinglish)
    const possessionPhrase = vFacts.isReadyPossession
        ? 'ready possession opportunity'
        : 'prime opportunity';
    
    const legalPhrase = vFacts.isTitleVerified
        ? `${vFacts.authorityCode ? `${vFacts.authorityCode} ` : ''}Verified Title, aur prime connectivity.`
        : 'Prime location connectivity. Documentation status can be checked during due diligence.';

    return `🔥 URGENT DEAL ALERT: ${unitNo} ${unitType} at ${projectName}!\n\nKurukshetra ke prime location ${location} par ${possessionPhrase}! ${legalPhrase}${reraLine}\n\n📍 Location: ${location}\n📐 Area: ${size}\n💰 Price: ${price}\n\nLimited units available — aaj hi site visit book karein!\n📞 Call/WhatsApp: ${regionalPhone}\n🌐 ${website}\n\n#BharatProperties #Kurukshetra #HotProperty #RealEstateDeals`;
}

/**
 * 5. Deterministic Post-Generation Compliance Validator & Sanitizer (Gate 6 Hardened)
 * 
 * Scans marketing content for unsupported statements and ensures compliance:
 * - Prohibits guaranteed/assured returns, ROI, yield, rental income, double investment, risk-free claims.
 * - Handles adversarial spacing (g u a r a n t e e d), hyphens (G-u-a-r-a-n-t-e-e-d), slashes, underscores, mixed casing.
 * - Neutralizes without replacing with promotional alternatives (NEVER "High Potential Rental Yields").
 * - Sanitizes 100% bank finance to neutral eligibility copy.
 * - Sanitizes ready possession to project schedule copy.
 * - Strips unverified RERA claims.
 * - Neutralizes unverified title/registry claims to due diligence copy.
 * - Enforces post-sanitization fail-closed audit pass.
 * 
 * @param {string} text - Generated marketing text
 * @param {Object} facts - Verified property facts
 * @param {Object} context - { deal, platform, tone, format }
 * @returns {string} Sanitized, compliant text
 */
export function validateAndSanitizeCopy(text, facts, context = {}) {
    if (!text || typeof text !== 'string') {
        return generateCompliantFallback(context.deal || {}, context.platform || 'facebook', context, facts);
    }

    let sanitized = text;

    // A. PROHIBITED INVESTMENT CLAIMS (Strictly prohibited regardless of verification status)
    // Neutralize without replacing with promotional alternatives (e.g. NEVER replace with "High Potential Rental Yields")
    const prohibitedGuarantees = [
        /\b(guaranteed|assured|fixed|promised|committed)[\s\-_/]+(\d+%\s*)?(returns?|roi|yield|income|profit|growth|rental|appreciation)\b/gi,
        /\b(returns?|roi|yield|income|rental)[\s\-_/]+(guarantee[d]?|assured|fixed)\b/gi,
        /\b((guaranteed|assured|fixed|promised)[\s\-_/]+)?\d+%\s*(annually|annual|monthly|p\.a\.|per\s*annum)?[\s\-_/]+(returns?|roi|yield|income|growth)\b/gi,
        /\b(returns?|roi|yield)[\s\-_/]+of[\s\-_/]+\d+%\b/gi,
        /\b(proven|guaranteed|assured|exponential)[\s\-_/]+(capital[\s\-_/]+)?appreciation\b/gi,
        /\b(high[\s\-_/]*potential[\s\-_/]+)?rental[\s\-_/]+yield[s]?\b/gi,
        /\b(strong|high)[\s\-_/]+rental[\s\-_/]+yield\b/gi,
        /\b(high[\s\-_/]*yield)[\s\-_/]+(investment|opportunity|asset|returns?|property)?\b/gi,
        /\b(high[\s\-_/]*yield)\b/gi,
        /\b(risk[\s\-_/]*free|zero[\s\-_/]*risk|no[\s\-_/]*risk|100%[\s\-_/]*safe)[\s\-_/]+(investment|opportunity|asset|property)?\b/gi,
        /\b(risk[\s\-_/]*free|zero[\s\-_/]*risk|no[\s\-_/]*risk)\b/gi,
        /\b100%[\s\-_/]+(guaranteed|safe|secure)[\s\-_/]+(investment|returns?)?\b/gi,
        /\b(doubl(e|ing)|tripl(e|ing))[\s\-_/]+(your[\s\-_/]+)?(money|investment|capital)\b/gi,
        /\bdouble[\s\-_/]+(your[\s\-_/]+)?investment\b/gi,
        /\b(assured|guaranteed)[\s\-_/]+monthly[\s\-_/]+(rental|income|return)\b/gi,
        /\bmonthly[\s\-_/]+rental[\s\-_/]+income\b/gi,
        /\bguaranteed[\s\-_/]+rental[\s\-_/]+income\b/gi,
        /\bup[\s\-_/]+to[\s\-_/]+\d+%[\s\-_/]+(annual|monthly)?[\s\-_/]*returns?\b/gi,
        /\bfixed[\s\-_/]+monthly[\s\-_/]+returns?\b/gi,
        /\bassured[\s\-_/]+roi[\s\-_/]*\d*%?\b/gi,
        /\brisk[\s\-_/]*free[\s\-_/]+investment\b/gi
    ];

    for (const pat of prohibitedGuarantees) {
        sanitized = sanitized.replace(pat, 'property opportunity as per market dynamics');
    }

    // Clean up any double-replaced phrases like "Guaranteed property opportunity as per market dynamics"
    sanitized = sanitized.replace(/\b(guaranteed|assured)[\s\-_/]+property[\s\-_/]+opportunity[\s\-_/]+as[\s\-_/]+per[\s\-_/]+market[\s\-_/]+dynamics\b/gi, 'property opportunity as per market dynamics');

    // Replace promotional phrases like "HIGH-YIELD INVESTMENT OPPORTUNITY"
    sanitized = sanitized.replace(/\bHIGH[\s\-_/]*YIELD[\s\-_/]+INVESTMENT[\s\-_/]+OPPORTUNITY\b/gi, 'STRATEGIC PROPERTY OPPORTUNITY');
    sanitized = sanitized.replace(/\bhigh[\s\-_/]*yield[\s\-_/]+investment[\s\-_/]+opportunity\b/gi, 'strategic property opportunity');
    sanitized = sanitized.replace(/\bhigh[\s\-_/]*yield[\s\-_/]+(investment|asset)\b/gi, 'property asset');

    // B. TITLE & REGISTRY CLAIMS
    const titlePatterns = [
        /\b(government|govt)[\s\-_/]+(approved|verified)[\s\-_/]+title\b/gi,
        /\b100%[\s\-_/]*verified[\s\-_/]+(registry[\s\-_/]+)?title([\s\-_/]*&[\s\-_/]*clear[\s\-_/]+registry)?\b/gi,
        /\b100%[\s\-_/]*verified[\s\-_/]+registry[\s\-_/]+title\b/gi,
        /\bverified[\s\-_/]+title([\s\-_/]*&[\s\-_/]*clear[\s\-_/]+registry)?\b/gi,
        /\bclear[\s\-_/]+registry\b/gi,
        /\bclear[\s\-_/]+title\b/gi,
        /\bclear[\s\-_/]+documentation\b/gi,
        /\bdocumented[\s\-_/]+property([\s\-_/]*&[\s\-_/]*clear[\s\-_/]+registry)?\b/gi,
        /\bdocumented[\s\-_/]+property\b/gi,
        /\btitle[\s\-_/]+guarantee[d]?\b/gi,
        /\blegal[\s\-_/]+verification[\s\-_/]+guaranteed\b/gi
    ];

    if (!facts?.isTitleVerified) {
        // If NOT verified by authority, ALL title/registry/documentation claims are unsupported
        for (const pat of titlePatterns) {
            sanitized = sanitized.replace(pat, 'Documentation status can be checked during due diligence');
        }
    } else {
        // If title IS verified, permit "Verified Title", but sanitize unverified "Clear Registry", "Clear Documentation", "Documented Property"
        sanitized = sanitized.replace(/\bclear[\s\-_/]+registry\b/gi, 'Authoritative Record');
        sanitized = sanitized.replace(/\bclear[\s\-_/]+documentation\b/gi, 'Verified Documentation');
        sanitized = sanitized.replace(/\bdocumented[\s\-_/]+property\b/gi, 'Verified Property');
    }

    // C. RERA COMPLIANCE CLAIMS
    const reraPatterns = [
        /&[\s\-_/]*rera[\s\-_/]+(compliant|approved|registered|verified|guaranteed|certified)/gi,
        /\brera[\s\-_/]+(compliant|approved|registered|verified|guaranteed|certified)\b/gi,
        /\b(approved|compliant|registered|verified|certified)[\s\-_/]+(by[\s\-_/]+)?rera\b/gi,
        /\brera[\s\-_/]+registered[\s\-_/]+project\b/gi
    ];

    if (!facts?.isReraApproved) {
        // If RERA is NOT approved, completely strip RERA claims
        for (const pat of reraPatterns) {
            sanitized = sanitized.replace(pat, '');
        }
    }

    // D. BANK LOAN CLAIMS
    const loanPatterns = [
        /\b100%[\s\-_/]+(bank[\s\-_/]+)?(finance|loan|funding)[\s\-_/]+(available|approved)?\b/gi,
        /\b(bank[\s\-_/]*loan|bank|home[\s\-_/]*loan|loan)[\s\-_/]+(approved|sanctioned|pre[\s\-_/]*approved|guaranteed)\b/gi,
        /\b(approved|sanctioned)[\s\-_/]+(bank|home)?[\s\-_/]*loan[s]?\b/gi,
        /\bpre[\s\-_/]*approved[\s\-_/]+(bank[\s\-_/]+)?loan[s]?\b/gi
    ];

    if (!facts?.isBankApproved) {
        for (const pat of loanPatterns) {
            sanitized = sanitized.replace(pat, 'Home loan assistance available as per eligibility');
        }
    }

    // E. READY POSSESSION CLAIMS
    const possessionPatterns = [
        /\bpossession[\s\-_/]+(guaranteed|assured|immediate|ready|scheduled)\b/gi,
        /\b(ready)[\s\-_/]+(possession|to[\s\-_/]+move)[\s\-_]*(opportunity)?\b/gi,
        /\b(immediate)[\s\-_/]+(possession|handover)\b/gi,
        /\bpossession[\s\-_/]+scheduled[\s\-_/]+for[\s\-_/]+[a-zA-Z0-9\s]+\b/gi
    ];

    if (!facts?.isReadyPossession) {
        for (const pat of possessionPatterns) {
            sanitized = sanitized.replace(pat, 'prime property opportunity');
        }
    }

    // F. PROHIBITED & UNVERIFIED HASHTAGS
    if (!facts?.isTitleVerified) {
        sanitized = sanitized.replace(/#(VerifiedDeal|VerifiedProperty|GovtApproved|GovernmentApproved|ClearTitle)\b/gi, '#PrimeListing');
    }
    if (!facts?.isReraApproved) {
        sanitized = sanitized.replace(/#(RERACertified|RERAApproved|RERAVerified|RERACompliant)\b/gi, '#RealEstateIndia');
    }
    sanitized = sanitized.replace(/#(GuaranteedReturns|AssuredROI|RiskFreeInvestment|DoubleInvestment|100PercentFinance|GuaranteedRentalIncome)\b/gi, '#BharatProperties');

    // Clean up double punctuation or awkward whitespace created by stripping
    sanitized = sanitized.replace(/\s+,\s+/g, ', ')
                         .replace(/,\s*,/g, ',')
                         .replace(/\s{2,}/g, ' ')
                         .replace(/\n\s*\n\s*\n/g, '\n\n')
                         .trim();

    // G. STRICT POST-SANITIZATION FAIL-CLOSED AUDIT PASS
    let hasRemainingViolations = false;
    if (!facts?.isTitleVerified) {
        if (/verified[\s\-_/]+title|clear[\s\-_/]+registry|clear[\s\-_/]+documentation|documented[\s\-_/]+property|verified[\s\-_/]+registry|(government|govt)[\s\-_/]+(approved|verified)[\s\-_/]+title|#(VerifiedDeal|VerifiedProperty)/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (!facts?.isReraApproved) {
        if (/rera[\s\-_/]+(compliant|approved|registered|verified|certified|guaranteed)|\brera\b|#(RERACertified|RERAApproved)/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (!facts?.isBankApproved) {
        if (/bank[\s\-_/]*loan[\s\-_/]+approved|approved[\s\-_/]+loan|pre[\s\-_/]*approved[\s\-_/]+loan|100%[\s\-_/]+(bank[\s\-_/]+)?finance/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (!facts?.isReadyPossession) {
        if (/ready[\s\-_/]+possession|immediate[\s\-_/]+possession|ready[\s\-_/]+to[\s\-_/]+move|possession[\s\-_/]+guaranteed|possession[\s\-_/]+scheduled/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (/guaranteed[\s\-_/]+(returns?|yield|appreciation|roi|rental)|assured[\s\-_/]+(returns?|roi|yield|growth)|risk[\s\-_/]*free|zero[\s\-_/]*risk|proven[\s\-_/]+capital[\s\-_/]+appreciation|(strong|high)[\s\-_/]+rental[\s\-_/]+yield|high[\s\-_/]*yield|\d+%\s*returns|\d+%\s*roi|8[\s\-_/]*10%|historical[\s\-_/]+trend|doubl(e|ing)[\s\-_/]+(your[\s\-_/]+)?investment|#(GuaranteedReturns|AssuredROI|RiskFreeInvestment)/i.test(sanitized)) {
        hasRemainingViolations = true;
    }

    // If text failed safe sanitization, fail-safe to deterministic compliant fallback
    if (hasRemainingViolations) {
        return generateCompliantFallback(context.deal || {}, context.platform || 'facebook', context, facts);
    }

    // G. PLATFORM-SPECIFIC LIMITS
    if (context.platform === 'x' || context.platform === 'twitter') {
        if (sanitized.length > 280) {
            const cut = sanitized.slice(0, 260);
            const lastWord = cut.lastIndexOf(' ');
            sanitized = (lastWord > 0 ? cut.slice(0, lastWord) : cut) + '... #BharatProperties';
        }
    }

    return sanitized;
}
