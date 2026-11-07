/**
 * Authority Portal Automation Approval Gate.
 *
 * This gate prevents public-page visibility from being interpreted as
 * permission for automated collection or commercial CRM storage.
 * It does not make network requests and is disabled unless each source has
 * written authority approval and an independently reviewed rate/data policy.
 */

export const SUPPORTED_AUTHORITY_CODES = Object.freeze(['HSVP', 'GMADA', 'CHD']);
export const REQUIRED_APPROVED_ACCESS_METHOD = 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION';
export const DEFAULT_APPROVAL_GATE_CONFIG = Object.freeze({
    enabled: false,
    readOnly: true,
    requireWrittenPermission: true,
    requireCommercialUsePermission: true,
    requireApprovedFieldScope: true,
    requireApprovedRatePolicy: true,
    maxConcurrentRequests: 1
});

const FORBIDDEN_PERSONAL_FIELD_PATTERN = /(?:owner|allottee|applicant|father|husband|aadhaar|\bpan\b|pan_?no|pan_?card|phone|mobile|email|postal.?address|correspondence.?address|contact)/i;

function isValidDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function makeBlocker(code, message) {
    return Object.freeze({ code, message });
}

/**
 * Validates an authority-specific approval document.
 * Rate values must be obtained from the authority, never guessed by the CRM.
 */
export function evaluateAuthorityPortalApproval({
    authorityCode,
    approval,
    now = new Date(),
    gate = DEFAULT_APPROVAL_GATE_CONFIG,
    sourcePaused = false
} = {}) {
    const blockers = [];
    const code = String(authorityCode || '').trim().toUpperCase();
    const currentTime = isValidDate(now) || new Date();

    if (!SUPPORTED_AUTHORITY_CODES.includes(code)) {
        blockers.push(makeBlocker('UNKNOWN_AUTHORITY', 'Authority code is not supported.'));
    }
    if (sourcePaused) {
        blockers.push(makeBlocker('SOURCE_PAUSED', 'Source has been paused after an access or safety event.'));
    }
    if (!gate?.enabled) {
        blockers.push(makeBlocker('GATE_DISABLED', 'Authority portal automation is disabled by default.'));
    }
    if (gate?.readOnly !== true) {
        blockers.push(makeBlocker('READ_ONLY_REQUIRED', 'Only read-only property search is supported.'));
    }

    if (!approval || typeof approval !== 'object') {
        blockers.push(makeBlocker('APPROVAL_REQUIRED', 'A source-specific written approval record is required.'));
    } else {
        if (approval.status !== 'GRANTED') {
            blockers.push(makeBlocker('WRITTEN_APPROVAL_NOT_GRANTED', 'Written approval status must be GRANTED.'));
        }
        if (approval.accessMethod !== REQUIRED_APPROVED_ACCESS_METHOD) {
            blockers.push(makeBlocker('ACCESS_METHOD_NOT_APPROVED', 'Approval must explicitly cover automated public-portal access.'));
        }
        const isOwnerAttested = approval.evidenceBasis === 'OWNER_ATTESTED_AUTHORITY_PERMISSION';
        if (gate?.requireWrittenPermission && !isOwnerAttested && !String(approval.writtenPermissionReference || '').trim()) {
            blockers.push(makeBlocker('WRITTEN_PERMISSION_REFERENCE_MISSING', 'Written approval reference is missing.'));
        }
        if (isOwnerAttested) {
            const attestation = approval.ownerAttestation || {};
            if (!String(attestation.attestingParty || '').trim() || !attestation.attestedAt || !String(attestation.scope || '').trim()) {
                blockers.push(makeBlocker('OWNER_ATTESTATION_INCOMPLETE', 'Owner attestation requires attestingParty, attestedAt, and scope.'));
            }
        }
        if (gate?.requireCommercialUsePermission && approval.commercialUseAuthorized !== true) {
            blockers.push(makeBlocker('COMMERCIAL_USE_NOT_AUTHORIZED', 'Internal commercial CRM use must be explicitly authorized.'));
        }
        if (approval.readOnlySearchAuthorized !== true) {
            blockers.push(makeBlocker('READ_ONLY_SEARCH_NOT_AUTHORIZED', 'Read-only search activity must be explicitly authorized.'));
        }
        if (approval.termsReviewed !== true || !String(approval.termsReference || '').trim()) {
            blockers.push(makeBlocker('TERMS_REVIEW_MISSING', 'Current portal terms/access conditions must be reviewed and referenced.'));
        }
        if (approval.reviewStatus !== undefined && approval.reviewStatus !== 'APPROVED') {
            blockers.push(makeBlocker('MAKER_CHECKER_REVIEW_PENDING', `Maker-checker review status is ${approval.reviewStatus}, must be APPROVED.`));
        }
        if (!String(approval.approvedBy || '').trim() || !String(approval.reviewedBy || '').trim()) {
            blockers.push(makeBlocker('MAKER_CHECKER_REVIEW_MISSING', 'Approval requires named approver and independent reviewer.'));
        }
        if (String(approval.approvedBy || '').trim() && String(approval.approvedBy).trim() === String(approval.reviewedBy || '').trim()) {
            blockers.push(makeBlocker('SELF_APPROVAL_PROHIBITED', 'Independent maker-checker review required: approver and reviewer cannot be the same user.'));
        }
        if (String(approval.submittedBy || '').trim()) {
            const submitter = String(approval.submittedBy).trim();
            if (submitter === String(approval.approvedBy || '').trim() || submitter === String(approval.reviewedBy || '').trim()) {
                blockers.push(makeBlocker('SELF_APPROVAL_PROHIBITED', 'Independent maker-checker review required: submitter cannot be approver or reviewer.'));
            }
        }

        const expiry = isValidDate(approval.expiresAt);
        if (!expiry || expiry <= currentTime) {
            blockers.push(makeBlocker('APPROVAL_EXPIRED_OR_INVALID', 'Approval expiry is missing, invalid, or has passed.'));
        }

        const fields = Array.isArray(approval.permittedFields) ? approval.permittedFields : [];
        if (gate?.requireApprovedFieldScope && fields.length === 0) {
            blockers.push(makeBlocker('FIELD_SCOPE_MISSING', 'At least one permitted canonical field must be listed.'));
        }
        const forbiddenFields = fields.filter((field) => FORBIDDEN_PERSONAL_FIELD_PATTERN.test(String(field)));
        if (forbiddenFields.length) {
            blockers.push(makeBlocker('PERSONAL_DATA_FIELD_BLOCKED', `Personal/contact fields cannot be enabled in this integration: ${forbiddenFields.join(', ')}.`));
        }

        const rate = approval.ratePolicy || {};
        const hourlyOk = rate.maxRequestsPerHour === undefined || rate.maxRequestsPerHour === null
            || (Number.isFinite(Number(rate.maxRequestsPerHour)) && Number(rate.maxRequestsPerHour) > 0);
        const hasRatePolicy = Number.isFinite(rate.maxRequestsPerMinute) && rate.maxRequestsPerMinute > 0
            && Number.isFinite(rate.maxRequestsPerDay) && rate.maxRequestsPerDay > 0
            && Number.isFinite(rate.minimumIntervalMs) && rate.minimumIntervalMs > 0
            && Number(rate.maxConcurrentRequests || rate.maxConcurrent) === 1
            && hourlyOk
            && Boolean(String(rate.policyReference || '').trim());
        if (gate?.requireApprovedRatePolicy && !hasRatePolicy) {
            blockers.push(makeBlocker('APPROVED_RATE_POLICY_MISSING', 'Authority-defined requests/minute, requests/day, minimum interval, one-worker concurrency, and policy reference are required.'));
        }
    }

    return Object.freeze({
        authorityCode: code,
        approved: blockers.length === 0,
        liveAutomationAllowed: blockers.length === 0,
        blockers: Object.freeze(blockers)
    });
}

export function assertAuthorityPortalApproval(options = {}) {
    const result = evaluateAuthorityPortalApproval(options);
    if (!result.approved) {
        const error = new Error(`AUTHORITY_PORTAL_APPROVAL_BLOCKED: ${result.blockers.map((item) => item.code).join(', ')}`);
        error.code = 'AUTHORITY_PORTAL_APPROVAL_BLOCKED';
        error.blockers = result.blockers;
        throw error;
    }
    return result;
}
