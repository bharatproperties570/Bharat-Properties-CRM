/**
 * ============================================================================
 *  AUTHORITY PROPERTY VERIFICATION — SOURCE AUTHORIZATION & POLICY MATRIX
 *  Phase 1: Policy contract only. No live requests permitted.
 * ============================================================================
 *
 *  This module documents the authorization requirements, access policies,
 *  rate limits, retention rules, and pause conditions for each authority
 *  data source.
 *
 *  CRITICAL: permissionStatus for ALL sources is NOT_OBTAINED.
 *  Live HTTP collection MUST remain disabled until:
 *    1. Written permission is obtained from the authority
 *    2. The approved access method is documented here
 *    3. The rate policy is configured and tested
 *    4. A code review has approved the activation
 *
 *  @module sourcePolicy
 *  @version 1.0.0-phase1
 */

export const PERMISSION_STATUS = Object.freeze({
    NOT_OBTAINED: 'NOT_OBTAINED',
    REQUESTED: 'REQUESTED',
    APPROVED: 'APPROVED',
    DENIED: 'DENIED',
    SUSPENDED: 'SUSPENDED',
    EXPIRED: 'EXPIRED',
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
        permissionStatus: PERMISSION_STATUS.NOT_OBTAINED,
        permissionEvidence: null,
        permissionDate: null,
        permissionExpiry: null,
        permissionContact: null,

        // ── Access method ──────────────────────────────────────────────────
        approvedAccessMethod: ACCESS_METHOD.NONE,
        approvedAccessNotes: 'No access method has been approved. The portal existence is publicly known but no authorization to programmatically access it has been obtained.',

        // ── Permitted fields / use ─────────────────────────────────────────
        permittedFields: [],
        permittedUse: null,
        dataUsageRestrictions: 'Unknown — requires written clarification from HSVP.',

        // ── Rate & concurrency policy ──────────────────────────────────────
        maxRequestsPerMinute: null,
        maxRequestsPerDay: null,
        maxConcurrentRequests: null,
        requestRateNotes: 'No rate limit has been approved. Do NOT guess or invent numeric limits.',

        // ── Scheduling ─────────────────────────────────────────────────────
        desiredSchedule: 'Weekly, Asia/Kolkata business hours (future)',
        schedulingEnabled: false,
        schedulingNotes: 'Weekly scheduling is a desired future configuration, not an authorization to make requests.',

        // ── Retention ──────────────────────────────────────────────────────
        retentionPolicy: null,
        retentionNotes: 'Retention policy unknown — requires written authority confirmation.',

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

        // ── Source activation flag ─────────────────────────────────────────
        isEnabled: false,
    },

    // ════════════════════════════════════════════════════════════════════════
    //  ESTATE OFFICE CHANDIGARH
    // ════════════════════════════════════════════════════════════════════════
    ESTATE_OFFICE_CHD: {
        authorityId: 'ESTATE_OFFICE_CHD',
        fullName: 'Estate Office, Chandigarh Administration',
        portalUrl: 'https://chdestateoffice.gov.in',

        permissionStatus: PERMISSION_STATUS.NOT_OBTAINED,
        permissionEvidence: null,
        permissionDate: null,
        permissionExpiry: null,
        permissionContact: null,

        approvedAccessMethod: ACCESS_METHOD.NONE,
        approvedAccessNotes: 'No access method approved. Portal existence known but programmatic access not authorized.',

        permittedFields: [],
        permittedUse: null,
        dataUsageRestrictions: 'Unknown — requires clarification from Chandigarh Estate Office.',

        maxRequestsPerMinute: null,
        maxRequestsPerDay: null,
        maxConcurrentRequests: null,
        requestRateNotes: 'No rate limit approved. Do NOT invent numeric limits.',

        desiredSchedule: 'Weekly, Asia/Kolkata business hours (future)',
        schedulingEnabled: false,
        schedulingNotes: 'Desired future configuration, not authorization.',

        retentionPolicy: null,
        retentionNotes: 'Unknown — requires written confirmation.',

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
    },

    // ════════════════════════════════════════════════════════════════════════
    //  GMADA — Greater Mohali Area Development Authority
    // ════════════════════════════════════════════════════════════════════════
    GMADA: {
        authorityId: 'GMADA',
        fullName: 'Greater Mohali Area Development Authority',
        portalUrl: 'https://gmada.gov.in',

        permissionStatus: PERMISSION_STATUS.NOT_OBTAINED,
        permissionEvidence: null,
        permissionDate: null,
        permissionExpiry: null,
        permissionContact: null,

        approvedAccessMethod: ACCESS_METHOD.NONE,
        approvedAccessNotes: 'No access method approved. Portal existence known but programmatic access not authorized.',

        permittedFields: [],
        permittedUse: null,
        dataUsageRestrictions: 'Unknown — requires clarification from GMADA.',

        maxRequestsPerMinute: null,
        maxRequestsPerDay: null,
        maxConcurrentRequests: null,
        requestRateNotes: 'No rate limit approved. Do NOT invent numeric limits.',

        desiredSchedule: 'Weekly, Asia/Kolkata business hours (future)',
        schedulingEnabled: false,
        schedulingNotes: 'Desired future configuration, not authorization.',

        retentionPolicy: null,
        retentionNotes: 'Unknown — requires written confirmation.',

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
    if (policy.permissionStatus !== PERMISSION_STATUS.APPROVED) {
        return { allowed: false, reason: `Permission status is ${policy.permissionStatus}, not APPROVED` };
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

export default {
    PERMISSION_STATUS,
    ACCESS_METHOD,
    STOP_CONDITIONS,
    SOURCE_POLICY_MATRIX,
    isSourceActivated,
};
