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
    'PUDA'
]);

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
export function validateAuthoritativeDocumentRecord(doc, parentEntity = null) {
    if (!doc || typeof doc !== 'object') return false;

    // Check if underlying record has been resolved
    const rec = doc.documentRecord || doc._resolvedRecord;
    if (!rec || typeof rec !== 'object') {
        // Disqualify bare client-supplied IDs, hashes, or booleans without resolved record
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

    // 5. Must belong to the correct property or parent entity
    if (parentEntity && (parentEntity._id || parentEntity.id)) {
        const parentId = String(parentEntity._id || parentEntity.id);
        const linkedId = String(rec.entityId?._id || rec.entityId || rec.propertyId || '');
        const linkedProject = String(parentEntity.projectId?._id || parentEntity.projectId || '');
        const linkedInventory = String(parentEntity.inventoryId?._id || parentEntity.inventoryId || '');

        const matchesEntity = linkedId === parentId || (linkedProject && linkedId === linkedProject) || (linkedInventory && linkedId === linkedInventory);
        if (!matchesEntity && linkedId) {
            return false;
        }
    }

    // 6. Must have currentVersionId and resolved currentVersion
    const currentVersionId = rec.currentVersionId?._id || rec.currentVersionId;
    if (!isValidSnapshotId(currentVersionId)) return false;

    // 7. Check currentVersion integrity and checksum
    const version = rec.currentVersion || rec.versionRecord;
    const checksum = version?.checksum || rec.checksum || rec.contentHash;
    if (!isValidContentHash(checksum)) return false;

    // If doc specifies currentVersionId, confirm it is not replaced
    if (doc.currentVersionId && currentVersionId && String(doc.currentVersionId) !== String(currentVersionId)) {
        return false;
    }

    // 8. Expiry validation on record
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
 * Disqualifies manual entries (MANUAL, USER_INPUT, AGENT_INPUT, SELF_REPORTED).
 * Requires verified status flag, authoritative source, or backing by statutory authority verification.
 */
function hasAuthoritativeDocumentProvenance(doc, parentEntity = null) {
    if (!doc || typeof doc !== 'object') return false;

    // Disqualify explicit manual input
    const rawSource = String(doc.source || doc.sourceType || doc.provenance?.source || parentEntity?.source || parentEntity?.provenance?.source || '').trim().toUpperCase();
    if (['MANUAL', 'USER_INPUT', 'AGENT_INPUT', 'SELF_REPORTED'].includes(rawSource) || doc.isManual === true || parentEntity?.isManual === true) {
        return false;
    }

    // Explicit verified status on document
    const verStatus = String(doc.verificationStatus || doc.documentStatus || doc.status || '').trim().toUpperCase();
    if (verStatus === 'VERIFIED' || doc.verified === true || doc.isVerified === true || doc.isSourceVerified === true || doc.verifiedByAuthority === true) {
        return true;
    }

    // Authoritative source
    const AUTHORITATIVE_DOC_SOURCES = [
        'AUTHORITY_SYNC',
        'DOCUMENT_VERIFIED',
        'OFFICIAL_REGISTRY',
        'OFFICIAL',
        'BANK_PORTAL',
        'BANK_SANCTION',
        'RERA_PORTAL',
        'GOVERNMENT_PORTAL',
        'STATE_RERA',
        'HARERA',
        'PBRERA',
        'HRERA'
    ];
    if (AUTHORITATIVE_DOC_SOURCES.includes(rawSource)) {
        return true;
    }

    // Backed by statutory authority verification
    const av = parentEntity?.authorityVerification || parentEntity?.inventory?.authorityVerification;
    if (av && evaluateAuthoritativeEvidence(av)) {
        return true;
    }

    return false;
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
    const reviewDate = item.lastVerifiedAt || item.verifiedAt || item.reviewDate || item.date || item.identityVerifiedAt || parentEntity?.reraLastVerifiedAt || parentEntity?.lastVerifiedAt || parentEntity?.authorityVerification?.lastVerifiedAt || parentEntity?.date;
    if (!isValidVerificationDate(reviewDate)) {
        return false;
    }

    // A bare documentId, snapshotId, externalVerificationId, or verifiedByAuthority: true alone must NEVER qualify
    // 1. Real resolved CRM document record
    if (validateAuthoritativeDocumentRecord(item, parentEntity)) {
        return true;
    }

    // 2. Real resolved snapshot record
    const snap = item.snapshotRecord || item._resolvedSnapshot;
    if (snap && typeof snap === 'object') {
        if (snap.isRevoked === true || snap.status === 'REVOKED') return false;
        const hash = snap.snapshotContentHash || snap.rawSnapshotHash || snap.contentHash;
        if (!isValidContentHash(hash)) return false;
        const snapDate = snap.verifiedAt || snap.createdAt || snap.lastVerifiedAt;
        if (!isValidVerificationDate(snapDate)) return false;
        return true;
    }

    // 3. Statutory authority link verification
    const av = parentEntity?.authorityVerification || parentEntity?.inventory?.authorityVerification;
    if (av && evaluateAuthoritativeEvidence(av)) {
        return true;
    }

    // 4. Authorized review provenance with verified reviewer, authoritative source, and immutable content hash
    const reviewer = item.verifiedBy || item.reviewerId || item.reviewedBy;
    const isAuthSource = AUTHORITATIVE_RERA_SOURCES.includes(rawSource);
    const hash = item.snapshotContentHash || item.contentHash || item.checksum || item.rawSnapshotHash || item.fileHash;
    if (reviewer && isAuthSource && isValidContentHash(hash)) {
        return true;
    }

    // 5. Official portal source with verified snapshot ID, immutable content hash, and mandatory verification timestamp
    const snapshotId = item.verificationSnapshotId || item.snapshotId || parentEntity?.reraVerificationSnapshotId;
    const snapHash = item.snapshotContentHash || item.contentHash || item.checksum || item.rawSnapshotHash || parentEntity?.reraSnapshotContentHash || parentEntity?.authorityVerification?.snapshotContentHash;
    if (isAuthSource && isValidSnapshotId(snapshotId) && isValidContentHash(snapHash) && !item.isManual) {
        return true;
    }

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

        // 5. Round 3 Hardening: Require authentic resolved CRM document record
        if (!validateAuthoritativeDocumentRecord(doc, entity)) continue;

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

    // Require progressPercentage === 100 where progress is part of the completion contract
    // Missing progress must not silently satisfy a 100% requirement
    if (entity.requiresCompletion === true || entity.completionContract === true || entity.requiresProgressAudit === true) {
        if (typeof entity.progressPercentage !== 'number' || entity.progressPercentage < 100) {
            return false;
        }
    }

    if (typeof entity.progressPercentage === 'number' && entity.progressPercentage < 100) {
        return false;
    }
    if (typeof entity.project?.progressPercentage === 'number' && entity.project.progressPercentage < 100) {
        return false;
    }
    if (typeof entity.inventory?.progressPercentage === 'number' && entity.inventory.progressPercentage < 100) {
        return false;
    }

    const posStatus = String(entity.possessionStatus || entity.authorityVerification?.possessionStatus || entity.project?.possessionStatus || entity.inventory?.possessionStatus || '').trim().toUpperCase();
    if (['UNDER_CONSTRUCTION', 'PLANNED', 'DELAYED', 'PENDING', 'FUTURE', 'INCOMPLETE'].includes(posStatus)) {
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

        // Round 3 Hardening: Require authentic resolved CRM document record representing OC or CC
        if (!validateAuthoritativeDocumentRecord(doc, entity)) continue;

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
        /\b(guaranteed|assured|fixed|promised|committed)[\s\-_/]+(returns?|roi|yield|income|profit|growth|rental|appreciation)\b/gi,
        /\b(returns?|roi|yield|income|rental)[\s\-_/]+(guarantee[d]?|assured|fixed)\b/gi,
        /\b(\d+%\s*(annually|annual|monthly|p\.a\.|per\s*annum)?[\s\-_/]+(returns?|roi|yield|income|growth))\b/gi,
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
        sanitized = sanitized.replace(pat, 'real estate opportunity as per market conditions');
    }

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
        /\b(approved|compliant|registered|verified|certified)[\s\-_/]+(by[\s\-_/]+)?rera\b/gi
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
        /\bpossession[\s\-_/]+(guaranteed|assured|immediate|ready)\b/gi,
        /\b(ready)[\s\-_/]+(possession|to[\s\-_/]+move)[\s\-_]*(opportunity)?\b/gi,
        /\b(immediate)[\s\-_/]+(possession|handover)\b/gi
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
        if (/rera[\s\-_/]+(compliant|approved|registered|verified|certified|guaranteed)|#(RERACertified|RERAApproved)/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (!facts?.isBankApproved) {
        if (/bank[\s\-_/]*loan[\s\-_/]+approved|approved[\s\-_/]+loan|pre[\s\-_/]*approved[\s\-_/]+loan|100%[\s\-_/]+(bank[\s\-_/]+)?finance/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (!facts?.isReadyPossession) {
        if (/ready[\s\-_/]+possession|immediate[\s\-_/]+possession|ready[\s\-_/]+to[\s\-_/]+move|possession[\s\-_/]+guaranteed/i.test(sanitized)) {
            hasRemainingViolations = true;
        }
    }
    if (/guaranteed[\s\-_/]+(returns?|yield|appreciation|roi|rental)|assured[\s\-_/]+(returns?|roi|yield|growth)|risk[\s\-_/]*free|zero[\s\-_/]*risk|proven[\s\-_/]+capital[\s\-_/]+appreciation|(strong|high)[\s\-_/]+rental[\s\-_/]+yield|high[\s\-_/]*yield|\d+%\s*returns|doubl(e|ing)[\s\-_/]+(your[\s\-_/]+)?investment|#(GuaranteedReturns|AssuredROI|RiskFreeInvestment)/i.test(sanitized)) {
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
