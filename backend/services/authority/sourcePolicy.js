/**
 * ============================================================================
 *  AUTHORITY PROPERTY VERIFICATION — SOURCE AUTHORIZATION & POLICY MATRIX
 *  Phase 4.5: Canonical Owner-Attested Authority Permission & Internal Throttles
 * ============================================================================
 *
 *  This module documents the authorization requirements, access policies,
 *  rate limits, retention rules, and pause conditions for each authority
 *  data source.
 *
 *  Owner permission is attested as GRANTED under OWNER_ATTESTED_AUTHORITY_PERMISSION.
 *  Live HTTP collection and operational scheduling MUST remain disabled (isEnabled: false)
 *  until an independent maker-checker review has approved activation.
 *
 *  @module sourcePolicy
 *  @version 4.5.0-phase4.5d
 */

export const PERMISSION_STATUS = Object.freeze({
    NOT_OBTAINED: 'NOT_OBTAINED',
    REQUESTED: 'REQUESTED',
    APPROVED: 'APPROVED',
    GRANTED: 'GRANTED',
    DENIED: 'DENIED',
    SUSPENDED: 'SUSPENDED',
    EXPIRED: 'EXPIRED',
});

export const EVIDENCE_BASIS = Object.freeze({
    NOT_APPLICABLE: 'NOT_APPLICABLE',
    OWNER_ATTESTED_AUTHORITY_PERMISSION: 'OWNER_ATTESTED_AUTHORITY_PERMISSION',
    OFFICIAL_WRITTEN_LETTER: 'OFFICIAL_WRITTEN_LETTER'
});

export const ACCESS_METHOD = Object.freeze({
    /** No access method approved */
    NONE: 'NONE',
    /** Official public API with documentation */
    PUBLIC_API: 'PUBLIC_API',
    /** Authenticated API with issued credentials */
    AUTHENTICATED_API: 'AUTHENTICATED_API',
    /** Official data export / download */
    OFFICIAL_EXPORT: 'OFFICIAL_EXPORT',
    /** Manual data entry from physical records */
    MANUAL_ENTRY: 'MANUAL_ENTRY',
    /** RTI / public information request */
    RTI_REQUEST: 'RTI_REQUEST',
    /** Authorized web portal access (with terms acceptance) */
    AUTHORIZED_WEB: 'AUTHORIZED_WEB',
    /** Authorized public portal automation with owner attestation */
    AUTHORIZED_PUBLIC_PORTAL_AUTOMATION: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
});

export const STOP_CONDITIONS = Object.freeze({
    HTTP_403: 'HTTP 403 Forbidden — stop immediately, do not retry',
    HTTP_429: 'HTTP 429 Too Many Requests — pause, apply backoff, do not escalate rate',
    CAPTCHA: 'CAPTCHA challenge encountered — stop, flag for human review',
    AUTH_REQUIRED: 'Authentication/login required — stop, do not attempt login',
    UNEXPECTED_REDIRECT: 'Unexpected redirect (3xx to login/error) — stop, log, flag',
    POLICY_ERROR: 'Source returns terms-of-service violation or policy error — stop immediately',
    PARSE_FAILURE_THRESHOLD: 'More than 20% of responses fail parsing in a batch — pause, flag for review',
    EMPTY_RESPONSE_THRESHOLD: 'More than 50% of responses empty in a batch — pause, flag for review',
    PERMISSION_REVOKED: 'Authority revokes permission — disable source immediately',
    RATE_LIMIT_UNKNOWN: 'No approved rate limit configured — do not make requests',
});

/**
 * Source policy matrix.
 * Each entry documents the full authorization and operational contract
 * for one authority data source.
 */
export const SOURCE_POLICY_MATRIX = Object.freeze({

    // ════════════════════════════════════════════════════════════════════════
    //  HSVP — Haryana Shehri Vikas Pradhikaran
    // ════════════════════════════════════════════════════════════════════════
    HSVP: {
        authorityId: 'HSVP',
        fullName: 'Haryana Shehri Vikas Pradhikaran',
        portalUrl: 'https://hsvphry.org.in',

        // ── Authorization ──────────────────────────────────────────────────
        permissionStatus: PERMISSION_STATUS.GRANTED,
        evidenceBasis: EVIDENCE_BASIS.OWNER_ATTESTED_AUTHORITY_PERMISSION,
        permissionEvidence: null,
        permissionDate: null,
        permissionExpiry: null,
        permissionContact: null,
        userReportedEvidence: {
            reportedBy: 'Bharat Properties Owner',
            reportedAt: '2026-11-06',
            claimedRole: 'Authorized Broker',
            status: 'PENDING_WRITTEN_REFERENCE',
            evidenceBasis: 'OWNER_ATTESTED_AUTHORITY_PERMISSION',
            notes: 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized. Official written documentation and authority rate policy pending.'
        },
        ownerAttestation: {
            attestingParty: 'Bharat Properties Owner',
            attestedAt: '2026-11-06T17:51:10+05:30',
            scope: 'Read-only public property data retrieval, internal Bharat Properties CRM processing, staging and preview only. No writes or mutations.',
            notes: 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized.',
            claimedAuthorityRole: 'Authorized Broker'
        },

        // ── Access method ──────────────────────────────────────────────────
        approvedAccessMethod: ACCESS_METHOD.AUTHORIZED_PUBLIC_PORTAL_AUTOMATION,
        approvedAccessNotes: 'Owner-attested read-only public portal access for internal CRM staging and preview only.',

        // ── Operational status (disabled until maker-checker approval) ─────
        reviewStatus: 'UNDER_REVIEW',
        termsReviewed: false,
        termsReference: 'https://hsvphry.org.in/Home/Terms',
        contractVerificationStatus: 'UNVERIFIED',
        contractEvidenceReference: null,

        // ── Permitted fields / use ─────────────────────────────────────────
        permittedFields: [],
        permittedUse: 'Read-only internal CRM property status verification and staging',
        dataUsageRestrictions: 'Internal CRM preview and staging only. No automated mutations or public re-distribution.',

        // ── Rate & concurrency policy (Internal safety throttle) ───────────
        maxRequestsPerMinute: null,
        maxRequestsPerDay: null,
        maxConcurrentRequests: null,
        requestRateNotes: 'Internal CRM safety throttle: 1 req/min, 1 worker, 60s min interval, 1440/day max. Not an official government-issued rate quota.',
        ratePolicy: {
            maxRequestsPerMinute: 1,
            maxRequestsPerHour: 60,
            maxRequestsPerDay: 1440,
            minimumIntervalMs: 60000,
            minIntervalMs: 60000,
            maxConcurrent: 1,
            maxConcurrentRequests: 1,
            isInternalSafetyThrottle: true,
            policyReference: 'INTERNAL_SAFETY_THROTTLE_HSVP_1_REQ_PER_MIN'
        },

        // ── Scheduling ─────────────────────────────────────────────────────
        desiredSchedule: 'Weekly, Asia/Kolkata Sunday 02:00 AM IST',
        schedulingEnabled: false,
        schedulingNotes: 'Weekly scheduling requires operational maker-checker approval and enabled state.',

        // ── Retention ──────────────────────────────────────────────────────
        retentionPolicy: 'Snapshot immutable audit trail',
        retentionNotes: 'Sealed read-only staging snapshots with strict PII exclusion.',

        // ── Pause / stop conditions ────────────────────────────────────────
        stopConditions: [
            STOP_CONDITIONS.HTTP_403,
            STOP_CONDITIONS.HTTP_429,
            STOP_CONDITIONS.CAPTCHA,
            STOP_CONDITIONS.AUTH_REQUIRED,
            STOP_CONDITIONS.UNEXPECTED_REDIRECT,
            STOP_CONDITIONS.POLICY_ERROR,
            STOP_CONDITIONS.PARSE_FAILURE_THRESHOLD,
            STOP_CONDITIONS.EMPTY_RESPONSE_THRESHOLD,
            STOP_CONDITIONS.PERMISSION_REVOKED,
            STOP_CONDITIONS.RATE_LIMIT_UNKNOWN,
        ],

        // ── Evidence needed before activation ──────────────────────────────
        activationChecklist: [
            { item: 'Written permission from HSVP authorizing programmatic data access', status: 'MISSING' },
            { item: 'Approved access method documented (API, web, export, etc.)', status: 'MISSING' },
            { item: 'Approved rate limit / concurrency configuration', status: 'MISSING' },
            { item: 'Permitted fields list confirmed by authority', status: 'MISSING' },
            { item: 'Data retention policy confirmed', status: 'MISSING' },
            { item: 'Real source response sample obtained and parser verified', status: 'MISSING' },
            { item: 'Code review approving activation', status: 'MISSING' },
        ],

        // ── Source activation flag (strictly false until maker-checker) ───
        isEnabled: false,
        isPaused: false,
    },

    // ════════════════════════════════════════════════════════════════════════
    //  ESTATE OFFICE CHANDIGARH
    // ════════════════════════════════════════════════════════════════════════
    ESTATE_OFFICE_CHD: {
        authorityId: 'ESTATE_OFFICE_CHD',
        fullName: 'Estate Office, Chandigarh Administration',
        portalUrl: 'https://estateoffice.chd.gov.in',

        permissionStatus: PERMISSION_STATUS.GRANTED,
        evidenceBasis: EVIDENCE_BASIS.OWNER_ATTESTED_AUTHORITY_PERMISSION,
        permissionEvidence: null,
        permissionDate: null,
        permissionExpiry: null,
        permissionContact: null,
        userReportedEvidence: {
            reportedBy: 'Bharat Properties Owner',
            reportedAt: '2026-11-06',
            claimedRole: 'Authorized Broker',
            status: 'PENDING_WRITTEN_REFERENCE',
            evidenceBasis: 'OWNER_ATTESTED_AUTHORITY_PERMISSION',
            notes: 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized. Official written documentation and authority rate policy pending.'
        },
        ownerAttestation: {
            attestingParty: 'Bharat Properties Owner',
            attestedAt: '2026-11-06T17:51:10+05:30',
            scope: 'Read-only public property data retrieval, internal Bharat Properties CRM processing, staging and preview only. No writes or mutations.',
            notes: 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized.',
            claimedAuthorityRole: 'Authorized Broker'
        },

        approvedAccessMethod: ACCESS_METHOD.AUTHORIZED_PUBLIC_PORTAL_AUTOMATION,
        approvedAccessNotes: 'Owner-attested read-only public portal access for internal CRM staging and preview only.',

        reviewStatus: 'UNDER_REVIEW',
        termsReviewed: false,
        termsReference: 'https://estateoffice.chd.gov.in/KnowYourProperty/Search',
        contractVerificationStatus: 'UNVERIFIED',
        contractEvidenceReference: null,

        permittedFields: [],
        permittedUse: 'Read-only internal CRM property status verification and staging',
        dataUsageRestrictions: 'Internal CRM preview and staging only. Official provisional-record disclaimer must be preserved.',

        maxRequestsPerMinute: null,
        maxRequestsPerDay: null,
        maxConcurrentRequests: null,
        requestRateNotes: 'Internal CRM safety throttle: 1 req/min, 1 worker, 60s min interval, 1440/day max. Not an official government-issued rate quota.',
        ratePolicy: {
            maxRequestsPerMinute: 1,
            maxRequestsPerHour: 60,
            maxRequestsPerDay: 1440,
            minimumIntervalMs: 60000,
            minIntervalMs: 60000,
            maxConcurrent: 1,
            maxConcurrentRequests: 1,
            isInternalSafetyThrottle: true,
            policyReference: 'INTERNAL_SAFETY_THROTTLE_CHD_1_REQ_PER_MIN'
        },

        desiredSchedule: 'Weekly, Asia/Kolkata Sunday 02:00 AM IST',
        schedulingEnabled: false,
        schedulingNotes: 'Weekly scheduling requires operational maker-checker approval and enabled state.',

        retentionPolicy: 'Snapshot immutable audit trail',
        retentionNotes: 'Sealed read-only staging snapshots with strict PII exclusion.',

        stopConditions: [
            STOP_CONDITIONS.HTTP_403,
            STOP_CONDITIONS.HTTP_429,
            STOP_CONDITIONS.CAPTCHA,
            STOP_CONDITIONS.AUTH_REQUIRED,
            STOP_CONDITIONS.UNEXPECTED_REDIRECT,
            STOP_CONDITIONS.POLICY_ERROR,
            STOP_CONDITIONS.PARSE_FAILURE_THRESHOLD,
            STOP_CONDITIONS.EMPTY_RESPONSE_THRESHOLD,
            STOP_CONDITIONS.PERMISSION_REVOKED,
            STOP_CONDITIONS.RATE_LIMIT_UNKNOWN,
        ],

        activationChecklist: [
            { item: 'Written permission from Estate Office Chandigarh', status: 'MISSING' },
            { item: 'Approved access method documented', status: 'MISSING' },
            { item: 'Rate limit / concurrency configuration approved', status: 'MISSING' },
            { item: 'Permitted fields confirmed', status: 'MISSING' },
            { item: 'Data retention policy confirmed', status: 'MISSING' },
            { item: 'Real source response sample obtained and parser verified', status: 'MISSING' },
            { item: 'Code review approving activation', status: 'MISSING' },
        ],

        isEnabled: false,
        isPaused: false,
    },

    // ════════════════════════════════════════════════════════════════════════
    //  GMADA — Greater Mohali Area Development Authority
    // ════════════════════════════════════════════════════════════════════════
    GMADA: {
        authorityId: 'GMADA',
        fullName: 'Greater Mohali Area Development Authority',
        portalUrl: 'https://gmadaipms.in',

        permissionStatus: PERMISSION_STATUS.GRANTED,
        evidenceBasis: EVIDENCE_BASIS.OWNER_ATTESTED_AUTHORITY_PERMISSION,
        permissionEvidence: null,
        permissionDate: null,
        permissionExpiry: null,
        permissionContact: null,
        userReportedEvidence: {
            reportedBy: 'Bharat Properties Owner',
            reportedAt: '2026-11-06',
            claimedRole: 'Authorized Broker',
            status: 'PENDING_WRITTEN_REFERENCE',
            evidenceBasis: 'OWNER_ATTESTED_AUTHORITY_PERMISSION',
            notes: 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized. Official written documentation and authority rate policy pending.'
        },
        ownerAttestation: {
            attestingParty: 'Bharat Properties Owner',
            attestedAt: '2026-11-06T17:51:10+05:30',
            scope: 'Read-only public property data retrieval, internal Bharat Properties CRM processing, staging and preview only. No writes or mutations.',
            notes: 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized.',
            claimedAuthorityRole: 'Authorized Broker'
        },

        approvedAccessMethod: ACCESS_METHOD.AUTHORIZED_PUBLIC_PORTAL_AUTOMATION,
        approvedAccessNotes: 'Owner-attested read-only public portal access for internal CRM staging and preview only.',

        reviewStatus: 'UNDER_REVIEW',
        termsReviewed: false,
        termsReference: 'https://gmadaipms.in/UserExternalPages/Property_Ledger_Report.aspx',
        contractVerificationStatus: 'UNVERIFIED',
        contractEvidenceReference: null,

        permittedFields: [],
        permittedUse: 'Read-only internal CRM property status verification and staging',
        dataUsageRestrictions: 'Internal CRM preview and staging only. No automated mutations or public re-distribution.',

        maxRequestsPerMinute: null,
        maxRequestsPerDay: null,
        maxConcurrentRequests: null,
        requestRateNotes: 'Internal CRM safety throttle: 1 req/min, 1 worker, 60s min interval, 1440/day max. Not an official government-issued rate quota.',
        ratePolicy: {
            maxRequestsPerMinute: 1,
            maxRequestsPerHour: 60,
            maxRequestsPerDay: 1440,
            minimumIntervalMs: 60000,
            minIntervalMs: 60000,
            maxConcurrent: 1,
            maxConcurrentRequests: 1,
            isInternalSafetyThrottle: true,
            policyReference: 'INTERNAL_SAFETY_THROTTLE_GMADA_1_REQ_PER_MIN'
        },

        desiredSchedule: 'Weekly, Asia/Kolkata Sunday 02:00 AM IST',
        schedulingEnabled: false,
        schedulingNotes: 'Weekly scheduling requires operational maker-checker approval and enabled state.',

        retentionPolicy: 'Snapshot immutable audit trail',
        retentionNotes: 'Sealed read-only staging snapshots with strict PII exclusion.',

        stopConditions: [
            STOP_CONDITIONS.HTTP_403,
            STOP_CONDITIONS.HTTP_429,
            STOP_CONDITIONS.CAPTCHA,
            STOP_CONDITIONS.AUTH_REQUIRED,
            STOP_CONDITIONS.UNEXPECTED_REDIRECT,
            STOP_CONDITIONS.POLICY_ERROR,
            STOP_CONDITIONS.PARSE_FAILURE_THRESHOLD,
            STOP_CONDITIONS.EMPTY_RESPONSE_THRESHOLD,
            STOP_CONDITIONS.PERMISSION_REVOKED,
            STOP_CONDITIONS.RATE_LIMIT_UNKNOWN,
        ],

        activationChecklist: [
            { item: 'Written permission from GMADA', status: 'MISSING' },
            { item: 'Approved access method documented', status: 'MISSING' },
            { item: 'Rate limit / concurrency configuration approved', status: 'MISSING' },
            { item: 'Permitted fields confirmed', status: 'MISSING' },
            { item: 'Data retention policy confirmed', status: 'MISSING' },
            { item: 'Real source response sample obtained and parser verified', status: 'MISSING' },
            { item: 'Code review approving activation', status: 'MISSING' },
        ],

        isEnabled: false,
        isPaused: false,
    },
});

/**
 * Check if a source is authorized and enabled for live requests.
 * @param {string} authorityId
 * @returns {{ allowed: boolean, reason: string }}
 */
export const isSourceActivated = (authorityId) => {
    const policy = SOURCE_POLICY_MATRIX[authorityId];
    if (!policy) {
        return { allowed: false, reason: `Unknown authority: ${authorityId}` };
    }
    if (!policy.isEnabled) {
        return { allowed: false, reason: `Source ${authorityId} is disabled` };
    }
    if (policy.permissionStatus !== PERMISSION_STATUS.GRANTED && policy.permissionStatus !== PERMISSION_STATUS.APPROVED) {
        return { allowed: false, reason: `Permission status is ${policy.permissionStatus}, must be GRANTED` };
    }
    if (policy.reviewStatus !== 'APPROVED') {
        return { allowed: false, reason: `Review status is ${policy.reviewStatus || 'UNDER_REVIEW'}, must be APPROVED by independent maker-checker` };
    }
    if (policy.approvedAccessMethod === ACCESS_METHOD.NONE) {
        return { allowed: false, reason: 'No access method approved' };
    }
    if (policy.maxRequestsPerMinute === null && policy.maxRequestsPerDay === null) {
        return { allowed: false, reason: 'No rate limit configured' };
    }

    const missingChecklist = (policy.activationChecklist || []).filter(c => c.status !== 'COMPLETE');
    if (missingChecklist.length > 0) {
        return { allowed: false, reason: `${missingChecklist.length} activation checklist items incomplete` };
    }

    return { allowed: true, reason: 'All activation requirements met' };
};

export const OWNER_ATTESTED_AUTHORITY_POLICIES = Object.freeze({
    HSVP: Object.freeze({
        authorityId: 'HSVP',
        permissionStatus: 'GRANTED',
        evidenceBasis: EVIDENCE_BASIS.OWNER_ATTESTED_AUTHORITY_PERMISSION,
        attestingParty: 'Bharat Properties Owner',
        attestedAt: '2026-11-06T17:51:10+05:30',
        claimedRole: 'Authorized Broker',
        scope: 'Read-only public property data retrieval, internal Bharat Properties CRM processing, staging and preview only. No writes or mutations.',
        ratePolicy: Object.freeze({
            maxRequestsPerMinute: 1,
            maxRequestsPerHour: 60,
            maxRequestsPerDay: 1440,
            minimumIntervalMs: 60000,
            maxConcurrent: 1,
            isInternalSafetyThrottle: true,
            policyReference: 'INTERNAL_SAFETY_THROTTLE_HSVP_1_REQ_PER_MIN'
        })
    }),
    GMADA: Object.freeze({
        authorityId: 'GMADA',
        permissionStatus: 'GRANTED',
        evidenceBasis: EVIDENCE_BASIS.OWNER_ATTESTED_AUTHORITY_PERMISSION,
        attestingParty: 'Bharat Properties Owner',
        attestedAt: '2026-11-06T17:51:10+05:30',
        claimedRole: 'Authorized Broker',
        scope: 'Read-only public property data retrieval, internal Bharat Properties CRM processing, staging and preview only. No writes or mutations.',
        ratePolicy: Object.freeze({
            maxRequestsPerMinute: 1,
            maxRequestsPerHour: 60,
            maxRequestsPerDay: 1440,
            minimumIntervalMs: 60000,
            maxConcurrent: 1,
            isInternalSafetyThrottle: true,
            policyReference: 'INTERNAL_SAFETY_THROTTLE_GMADA_1_REQ_PER_MIN'
        })
    }),
    ESTATE_OFFICE_CHD: Object.freeze({
        authorityId: 'ESTATE_OFFICE_CHD',
        permissionStatus: 'GRANTED',
        evidenceBasis: EVIDENCE_BASIS.OWNER_ATTESTED_AUTHORITY_PERMISSION,
        attestingParty: 'Bharat Properties Owner',
        attestedAt: '2026-11-06T17:51:10+05:30',
        claimedRole: 'Authorized Broker',
        scope: 'Read-only public property data retrieval, internal Bharat Properties CRM processing, staging and preview only. No writes or mutations.',
        ratePolicy: Object.freeze({
            maxRequestsPerMinute: 1,
            maxRequestsPerHour: 60,
            maxRequestsPerDay: 1440,
            minimumIntervalMs: 60000,
            maxConcurrent: 1,
            isInternalSafetyThrottle: true,
            policyReference: 'INTERNAL_SAFETY_THROTTLE_CHD_1_REQ_PER_MIN'
        })
    })
});

export default {
    PERMISSION_STATUS,
    ACCESS_METHOD,
    STOP_CONDITIONS,
    SOURCE_POLICY_MATRIX,
    OWNER_ATTESTED_AUTHORITY_POLICIES,
    isSourceActivated,
};
