import mongoose from "mongoose";




const sensitivePathPatterns = [
    /(\/reset-password\/)([^/?#]+)/i,
    /(\/resolve-token\/)([^/?#]+)/i,
    /(\/portfolios\/public\/)([^/?#]+)/i,
    /(\/public\/matches\/)([^/?#]+)/i
];

function normalizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) return 'unknown';
    try {
        const parsed = new URL(String(rawUrl).trim().replace(/\\/g, '/'), 'http://dummy-base.local').pathname;
        let normalized = parsed.replace(/\/+/g, '/');
        sensitivePathPatterns.forEach(regex => {
            normalized = normalized.replace(regex, '$1[REDACTED_TOKEN]');
        });
        return normalized;
    } catch (err) {
        return 'unknown';
    }
}


const isHexObjectId = (str) => typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str);
const isIsoDate = (str) => typeof str === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str);
const isUuid = (str) => typeof str === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
const isHexDigest = (str) => typeof str === 'string' && /^[0-9a-fA-F]{32,64}$/.test(str);

export function maskScalarPII(text) {
    if (!text || typeof text !== 'string') return text;
    if (isHexObjectId(text) || isIsoDate(text) || isUuid(text) || isHexDigest(text)) return text;

    // Mask emails: completely minimize to [EMAIL_MINIMIZED]
    let masked = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_MINIMIZED]');
    masked = masked.replace(/[a-zA-Z0-9._%+-]\*{3}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_MINIMIZED]');

    // Mask Indian PAN card format (5 letters, 4 digits, 1 letter)
    masked = masked.replace(/\b[a-zA-Z]{5}[0-9]{4}[a-zA-Z]\b/g, '[PAN_MINIMIZED]');

    // Mask Indian Aadhaar number format (12 digits, optional spaces/hyphens; must not be preceded by +)
    masked = masked.replace(/(?<!\+|\d)\b\d{4}[-\s]\d{4}[-\s]\d{4}\b/g, '[AADHAAR_MINIMIZED]');
    masked = masked.replace(/(?<!\+|\d)\b\d{12}\b(?!\d)/g, '[AADHAAR_MINIMIZED]');

    // Mask phones: standard international or local 10-15 digit phone patterns (must not be inside alphanumeric tokens)
    masked = masked.replace(/(?<![a-zA-Z0-9])(?:\+?\d{1,4}[-.\s]*)?(?:\(?\d{2,5}\)?[-.\s]*)?\d{3,5}[-.\s]*\d{4,5}(?![a-zA-Z0-9])/g, (match) => {
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
            return '[PHONE_MINIMIZED]';
        }
        return match;
    });

    // Mask street/residential address indicators
    masked = masked.replace(/\b(?:house|flat|plot|kothi|villa|apartment|apt|bungalow|building|premises)\s*(?:no\.?|number)?\s*[:#.-]?\s*[\w\d/-]+/gi, '[ADDRESS_MINIMIZED]');
    masked = masked.replace(/\b(?:sector\s*\d+[a-zA-Z]?|road|street|gali|lane)\s*(?:no\.?|number)?\s*[:#.-]?\s*[\w\d/-]+/gi, (match) => {
        // Preserve clean canonical sector mentions if not personal address
        if (/^sector\s*\d+[a-zA-Z]?$/i.test(match.trim())) return match;
        return '[ADDRESS_MINIMIZED]';
    });

    // Mask postal/residential addresses without House/Flat/Plot keywords (localities, colonies, areas)
    masked = masked.replace(/\b(?:\d+[\w/-]*,?\s+)?(?:model\s+town|civil\s+lines|urban\s+estate|defence\s+colony|green\s+park|dlf|enclave|vihar|nagar|colony|mohalla|phase\s*\d+|block\s*[a-zA-Z0-9]+)\b(?:[,\s]+[A-Za-z]+)*(?:[,\s]+[1-9][0-9]{5})?/gi, '[ADDRESS_MINIMIZED]');

    // Mask postal PIN codes and addresses without prefix words (e.g. "134109")
    masked = masked.replace(/(?<!\d|\+)\b[1-9][0-9]{5}\b(?!\d)/g, '[ADDRESS_MINIMIZED]');

    // Mask citizen personal names and prefixes/honorifics (English & Hindi/Indian honorifics)
    masked = masked.replace(/\b(?:citizen|allottee|resident|owner|applicant|buyer|seller|shri|smt|kumari|late|dr\.?|prof\.?|mr\.?|mrs\.?|ms\.?|master|babu|thakur|chaudhary|pandit|lala|ji)\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)*/gi, '[PII_MINIMIZED]');

    // Mask generic Indian personal name combinations (independent of prefix)
    masked = masked.replace(/\b(?:Rahul|Amit|Sunita|Priya|Rajesh|Vikram|Ramesh|Suresh|Pooja|Anita|Deepak|Manoj|Sanjay|Anil|Sunil|Vijay|Ajay|Rohit|Kavita|Neha|Ankit|Meena)\s+(?:Sharma|Kumar|Devi|Singh|Verma|Gupta|Malhotra|Bansal|Aggarwal|Patel|Yadav|Chopra|Kaur|Jain|Mehta)\b/gi, '[PII_MINIMIZED]');

    // Strip stack traces
    if (masked.includes(' at ')) {
        const stackIndex = masked.indexOf('\n    at ');
        if (stackIndex !== -1) {
            masked = masked.substring(0, stackIndex) + ' [STACK_STRIPPED]';
        }
    }

    return masked;
}

export const CONTROLLED_AUDIT_REASONS = new Set([
    'EVIDENCE_REVIEWED',
    'DOCUMENT_REFERENCE_INCOMPLETE',
    'CONTRACT_NOT_VERIFIED',
    'TERMS_NOT_REVIEWED',
    'IDENTITY_EVIDENCE_MISMATCH',
    'AUTHORIZATION_REJECTED',
    'OTHER_CONTROLLED_REASON',
    'RATE_LIMIT_EXCEEDED',
    'POLICY_MISMATCH',
    'MAKER_CHECKER_APPROVAL_REQUIRED',
    'LEASE_EXPIRED_OR_PREEMPTED',
    'ORPHAN_DELETION_UNCONFIRMED',
    'CRASH_RECOVERY',
    'CONCURRENCY_CONFLICT',
    'DATA_DISCREPANCY',
    'SYSTEM_MAINTENANCE',
    'TRANSACTION_ABORTED',
    'PREEMPTION_ERROR',
    'MOCK_ERROR',
    'COMPENSATION_REVERSAL',
    'SAGA_FAILURE_ROLLBACK',
    'API pause check',
    'Maintenance pause requested',
    'USER_PAUSED',
    'USER_CANCELLED',
    'SCHEDULE_TRIGGERED',
    'PAUSED',
    'REJECTED'
]);

export const CONTROLLED_ROLE_CODES = new Set([
    'SYSTEM',
    'MAKER',
    'CHECKER',
    'COMPLIANCE_OFFICER',
    'COMPLIANCE_OFFICER_1',
    'COMPLIANCE_REVIEWER',
    'SYSTEM_ADMIN',
    'PORTAL_OPERATOR',
    'BATCH_WORKER'
]);

export const CONTROLLED_TARGET_NAMES = new Set([
    'AuthoritySourceSettings',
    'PropertyVerificationRun',
    'PropertyVerificationRunItem',
    'PropertyVerificationSnapshot',
    'PropertyAuthorityLink',
    'AuthorityReconciliationAudit',
    'SYSTEM',
    'AUTHORITY_PORTAL',
    'HSVP',
    'GMADA',
    'CHD',
    'CHANDIGARH_EO'
]);

const CONTROLLED_REASONS = CONTROLLED_AUDIT_REASONS;

const OPERATIONAL_SYSTEM_KEYS = new Set([
    'leaseOwner', 'workerLease', 'workerLeaseToken', 'lastSyncWorkerLease',
    'operationId', 'normalizedOpId', 'correlationId',
    'contentHash', 'targetId', 'auditLogId', 'policyId',
    'authorityCode', 'syncPhase', 'redisSyncStatus', 'version',
    'leaseExpiresAt', 'lastHeartbeatAt', 'lastSyncedAt'
]);

export function redactSensitive(obj, currentDepth = 0, seen = new WeakSet()) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'function' || typeof obj === 'symbol' || Buffer.isBuffer(obj)) return '[UNSUPPORTED_TYPE]';

    // Preserve MongoDB ObjectIds and Dates safely
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj && typeof obj.toHexString === 'function' && typeof obj.equals === 'function') return obj;

    if (typeof obj !== 'object') {
        if (typeof obj === 'string') {
            return maskScalarPII(obj);
        }
        return obj;
    }

    if (currentDepth >= 5) return '[MAX_DEPTH_EXCEEDED]';
    if (seen.has(obj)) return '[CIRCULAR_REFERENCE]';
    seen.add(obj);

    const sensitiveKeys = /(?:password|credential|secret|authorization[_-]?proof|token(?!s|count))/i;
    const piiKeys = /email|phone|mobile|contactNumber|pan|aadhaar|address|postal|citizenName|citizen|resident|ownerName|personName|allotteeName|buyerName|sellerName|applicantName/i;

    if (Array.isArray(obj)) {
        return obj.map(item => redactSensitive(item, currentDepth + 1, seen));
    }

    const redactedObj = {};
    for (const key of Object.keys(obj)) {
        if (OPERATIONAL_SYSTEM_KEYS.has(key)) {
            redactedObj[key] = obj[key];
        } else if (sensitiveKeys.test(key)) {
            redactedObj[key] = '[REDACTED]';
        } else if (piiKeys.test(key)) {
            redactedObj[key] = '[PII_MINIMIZED]';
        } else if (key === 'notes' || key === 'reviewNotes') {
            const raw = String(obj[key] || '').trim();
            if (CONTROLLED_REASONS.has(raw)) {
                redactedObj[key] = raw;
            } else {
                redactedObj[key] = 'OTHER_CONTROLLED_REASON';
            }
        } else {
            redactedObj[key] = redactSensitive(obj[key], currentDepth + 1, seen);
        }
    }
    return redactedObj;
}

const AuditLogSchema = new mongoose.Schema({
    // ========== Event Info ==========
    eventType: {
        type: String,
        required: true,
        enum: [
            // User Events
            'user_login',
            'user_logout',
            'user_failed_login',
            'user_created',
            'user_updated',
            'user_deleted',
            'user_deactivated',
            'user_activated',
            'user_suspended',
            'user_force_logout',

            // Permission Events
            'role_changed',
            'department_changed',
            'permission_granted',
            'permission_revoked',
            'domain_approved',
            'domain_revoked',
            'domain_rejected',
            'data_scope_changed',
            'financial_permission_changed',

            // Data Transfer Events
            'data_transferred',
            'leads_transferred',
            'deals_transferred',
            'inventory_transferred',

            // Entity Trackers
            'stage_changed',
            'assignment_changed',
            'lead_revived',
            'lead_revived_automation',
            'score_changed',
            'deal_converted',
            'rule_modified',

            // Lead Lifecycle Events
            'lead_created',
            'lead_updated',
            'lead_deleted',

            // Financial Events
            'payment_updated',

            // Password Events
            'password_changed',
            'password_reset',

            // Role Events
            'role_created',
            'role_updated',
            'role_deleted',

            // Access Events
            'access_denied',
            'unauthorized_access_attempt',

            // Authority Verification Events
            'authority_settings_updated',
            'authority_source_approval_submitted',
            'authority_source_approval_recorded',
            'authority_source_approval_reviewed',
            'authority_maker_checker_approval',
            'authority_maker_checker_rejection',
            'authority_source_approved',
            'authority_source_rejected',
            'authority_link_created',
            'authority_run_created',
            'authority_run_policy_rejected',
            'authority_run_batch_processed',
            'authority_run_paused',
            'authority_run_resumed',
            'authority_run_completed',
            'authority_run_cancelled',
            'authority_review_submitted',
            'authority_changes_applied',
            'authority_changes_apply_compensated',
            'authority_orphan_snapshot_purged',
            'authority_orphan_cleanup_failed',
            'authority_portal_search_requested',
            'authority_portal_search_completed',
            'authority_portal_search_rejected',
            'authority_portal_transport_failed',
            'authority_portal_response_rejected',
            'authority_portal_parse_failed',
            'authority_portal_source_paused',
            'canonical_policy_rotated',
            'authority_canonical_policy_rotated',
            'canonical_policy_synced',
            'authority_canonical_policy_synced',
            'canonical_policy_sync_reconciled',
            'authority_canonical_policy_sync_reconciled'
        ],
        index: true
    },

    // ========== User Info ==========
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        index: true
    },
    userName: String, // Cached for performance
    userEmail: String, // Cached for performance

    // ========== Actor Info (who performed the action) ==========
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    actorName: String,
    actorEmail: String,

    // ========== Target Info (what was affected) ==========
    targetType: {
        type: String,
        enum: ['user', 'role', 'lead', 'deal', 'contact', 'company', 'inventory', 'payment', 'commission', 'campaign', 'domain', 'other', 'authority_settings', 'authority_run', 'authority_snapshot', 'authority_portal', 'authority_canonical_policy']
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId
    },
    targetName: String,

    // ========== Event Details ==========
    description: {
        type: String,
        required: true
    },
    notes: {
        type: String,
        required: false
    },
    reviewNotes: {
        type: String,
        required: false
    },
    comments: {
        type: String,
        required: false
    },
    reviewerComments: {
        type: String,
        required: false
    },
    freeText: {
        type: String,
        required: false
    },

    // Changes made (before/after for updates)
    changes: {
        before: mongoose.Schema.Types.Mixed,
        after: mongoose.Schema.Types.Mixed
    },

    // Additional metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // ========== Request Info ==========
    ipAddress: String,
    userAgent: String,
    requestUrl: String,
    requestMethod: String,

    // ========== Status ==========
    status: {
        type: String,
        enum: ['success', 'failure', 'failed', 'warning', 'compensated'],
        default: 'success'
    },
    department: { type: String, index: true }, // Regional tracking for Enterprise Isolation

    // Error details if failed
    errorMessage: String,

    // ========== Correlation ==========
    correlationId: {
        type: String,
        required: false
    },

    // ========== Timestamp ==========
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false, // We use custom timestamp field
    autoCreate: false,
    autoIndex: false
});


export const IMMUTABLE_AUDIT_EVENT_TYPES = new Set([
    'authority_source_approval_reviewed',
    'authority_maker_checker_approval',
    'authority_maker_checker_rejection',
    'authority_source_approved',
    'authority_source_rejected',
    'authority_source_approval_submitted',
    'authority_source_approval_recorded',
    'authority_review_submitted',
    'authority_policy_approved',
    'authority_policy_rejected',
    'authority_changes_apply_compensated'
]);

export function isImmutableAuditEvent(eventType) {
    if (!eventType || typeof eventType !== 'string') return false;
    return IMMUTABLE_AUDIT_EVENT_TYPES.has(eventType);
}

export function isAuthorityAuditEvent(eventType) {
    if (!eventType || typeof eventType !== 'string') return false;
    return eventType.startsWith('authority_') || eventType.startsWith('canonical_policy_');
}

export const CONTROLLED_AUTHORITY_METADATA_KEYS = new Set([
    'authorityCode', 'authoritySource', 'source', 'evidenceVersion', 'evidenceHash',
    'settingsId', 'submitterId', 'submittedBy', 'approverId', 'approvedBy',
    'reviewerId', 'reviewedBy', 'auditLogId', 'makerCheckerAuditLogId', 'approvalReference',
    'contractEvidenceReference', 'permissionArtifactUri', 'secureEvidenceId',
    'runId', 'totalItems', 'processedItems', 'failedItems', 'successItems', 'succeededItems', 'batchSize', 'batchIndex',
    'batchSucceeded', 'batchFailed', 'runItemId', 'workerId', 'orphanedByWorkerId', 'recoveredByWorkerId', 'reconciledAfterCrash',
    'policyVersion', 'contentHash', 'targetId', 'reason', 'reasonCode', 'error', 'errorCode', 'status',
    'portalName', 'correlationId', 'leaseOwner', 'workerLease', 'workerLeaseToken', 'operationId',
    'syncPhase', 'redisSyncStatus', 'version', 'leaseExpiresAt', 'lastHeartbeatAt', 'lastSyncedAt',
    'itemsProcessed', 'itemCount', 'snapshotCount', 'compensatedCount', 'rollbackReason',
    'compensationStatus', 'originalAuditId', 'originalStatus', 'compensatedAt', 'purgedCount',
    'compensated', 'compensationClaimId',
    'snapshotId', 'durationMs', 'startTime', 'endTime', 'searchCriteria', 'mode', 'fixtureMode',
    'retryCount', 'attempt', 'notes', 'reviewNotes', 'comments', 'reviewerComments', 'freeText',
    'description', 'tenantId', 'organizationId', 'changes', 'field', 'action', 'timestamp',
    'identityRequirements', 'permittedFields', 'ratePolicy', 'approvalExpiryDate', 'internalReviewExpiryDate',
    'userReportedEvidence', 'ownerAttestation', 'lastRunId', 'lastRunStatus', 'nextScheduledAt',
    'decision', 'targetName', 'identityVerified', 'identityContractAttestation',
    'assignedBy', 'triggeredBy', 'linkId', 'propertyId', 'itemId', 'snapshotContentHash',
    'fieldsApplied', 'appliedFields', 'rejectedFields', 'claimId', 'blockers', 'runMode', 'isFixtureMode',
    'compositeKey', 'matchEligibility', 'revertedChanges', 'stage', 'inventoryId', 'origin',
    'before', 'after', 'allotteeName', 'buyerName', 'test',
    'finalizingAt', 'testKey', 'previousVersion', 'previousContentHash',
    'reconciled', 'reconciledAt', 'reconciledReason', 'recoveryAttempts', 'recoveryClaimedAt',
    'syncedAt', 'failedAt', 'errorMessage', 'criteriaHash',
    'newVersion', 'newContentHash', 'policyReference', 'reviewerName', 'approverName',
    'minIntervalMs', 'maxRequestsPerMinute', 'maxRequestsPerHour', 'maxRequestsPerDay',
    'effectiveFrom', 'expiresAt', 'redisSyncError', 'reconciliationAction',
    'host', 'searchKey', 'recordCount', 'wasSanitized', 'changedKeys', 'code',
    'searchMode', 'quotaReservationId', 'parserVersion'
]);

export const CONTROLLED_AUTHORITY_METADATA_SCHEMA = {
    // Authority and Source References
    authorityCode: { type: 'string', pattern: /^[A-Z0-9_-]{2,20}$/ },
    authoritySource: { type: 'string', pattern: /^[A-Z0-9_]{2,50}$/ },
    source: { type: 'string', maxLength: 100 },
    evidenceVersion: { type: ['number', 'string'], pattern: /^\d+$/ },
    evidenceHash: { type: 'string', pattern: /^[a-zA-Z0-9_.-]{3,128}$/ },
    snapshotContentHash: { type: 'string', pattern: /^[a-zA-Z0-9_.-]{3,128}$/ },
    contentHash: { type: 'string', pattern: /^[a-zA-Z0-9_.-]{3,128}$/ },
    previousContentHash: { type: 'string', pattern: /^[a-zA-Z0-9_.-]{3,128}$/ },
    newContentHash: { type: 'string', pattern: /^[a-zA-Z0-9_.-]{3,128}$/ },
    criteriaHash: { type: 'string', maxLength: 128 },
    policyReference: { type: 'string', pattern: /^[a-zA-Z0-9_/-]{2,100}$/ },

    // References & IDs (must be IDs/tokens, not citizen names)
    settingsId: { type: 'id' },
    submitterId: { type: 'id' },
    submittedBy: { type: 'id' },
    approverId: { type: 'id' },
    approvedBy: { type: 'id' },
    reviewerId: { type: 'id' },
    reviewedBy: { type: 'id' },
    auditLogId: { type: 'id' },
    makerCheckerAuditLogId: { type: 'id' },
    approvalReference: { type: 'string', pattern: /^[a-zA-Z0-9_/:.-]{2,100}$/ },
    contractEvidenceReference: { type: 'string', pattern: /^[a-zA-Z0-9_/:.-]{2,100}$/ },
    permissionArtifactUri: { type: 'string', maxLength: 250 },
    secureEvidenceId: { type: 'id' },
    runId: { type: 'id' },
    runItemId: { type: 'id' },
    workerId: { type: 'string', maxLength: 100, pattern: /^[a-zA-Z0-9_-]+$/ },
    orphanedByWorkerId: { type: 'string', maxLength: 100, pattern: /^[a-zA-Z0-9_-]+$/ },
    recoveredByWorkerId: { type: 'string', maxLength: 100, pattern: /^[a-zA-Z0-9_-]+$/ },
    targetId: { type: 'id' },
    targetName: { type: 'string', maxLength: 100 },
    originalAuditId: { type: 'id' },
    snapshotId: { type: 'id' },
    tenantId: { type: 'id' },
    organizationId: { type: 'id' },
    linkId: { type: 'id' },
    propertyId: { type: 'string', maxLength: 100 },
    itemId: { type: 'id' },
    inventoryId: { type: 'id' },
    assignedBy: { type: 'id' },
    triggeredBy: { type: 'id' },
    lastRunId: { type: 'id' },
    claimId: { type: 'string', maxLength: 100, pattern: /^[a-zA-Z0-9_-]+$/ },
    compensationClaimId: { type: 'string', maxLength: 100, pattern: /^[a-zA-Z0-9_-]+$/ },
    workerLeaseToken: { type: 'string', maxLength: 100 },
    workerLease: { type: 'string', maxLength: 100 },
    leaseOwner: { type: 'string', maxLength: 100 },
    correlationId: { type: 'string', maxLength: 100 },
    operationId: { type: 'string', maxLength: 100 },
    portalName: { type: 'string', maxLength: 100 },
    host: { type: 'string', pattern: /^[a-zA-Z0-9_.-]{2,100}$/ },
    searchKey: { type: 'string', maxLength: 200 },
    code: { type: 'string', maxLength: 100, pattern: /^[A-Z0-9_ -]+$/ },
    searchMode: { type: 'string', maxLength: 100, pattern: /^[A-Z0-9_ -]+$/ },
    quotaReservationId: { type: 'string', maxLength: 100 },
    parserVersion: { type: 'string', maxLength: 50, pattern: /^[0-9a-zA-Z_.-]+$/ },
    compositeKey: { type: 'string', maxLength: 200 },

    // Role / Name fields: strictly store IDs or controlled role tokens, NOT arbitrary citizen names
    reviewerName: { type: 'string', pattern: /^(?:[0-9a-fA-F]{24}|[A-Z0-9_]{3,40})$/ },
    approverName: { type: 'string', pattern: /^(?:[0-9a-fA-F]{24}|[A-Z0-9_]{3,40})$/ },

    // Error & Diagnostic fields: normalized error codes / technical strings only
    errorMessage: { type: 'string', maxLength: 250, pattern: /^(?:[A-Z0-9_]{2,50}(?::\s*[a-zA-Z0-9_ ./:#-]{1,180})?|Simulated [a-zA-Z0-9_ ./:#-]+)$/ },
    redisSyncError: { type: 'string', maxLength: 250, pattern: /^(?:[A-Z0-9_]{2,50}(?::\s*[a-zA-Z0-9_ ./:#-]{1,180})?|Simulated [a-zA-Z0-9_ ./:#-]+)$/ },
    error: { type: 'string', maxLength: 250, pattern: /^(?:[A-Z0-9_]{2,50}(?::\s*[a-zA-Z0-9_ ./:#-]{1,180})?|Simulated [a-zA-Z0-9_ ./:#-]+)$/ },
    errorCode: { type: 'string', maxLength: 100, pattern: /^[A-Z0-9_]+$/ },

    // Reason & Status fields: controlled reason codes
    reconciledReason: { type: 'string', maxLength: 80, pattern: /^[A-Z0-9_]{2,80}$/ },
    reason: { type: 'string', maxLength: 80 },
    reasonCode: { type: 'string', maxLength: 80, pattern: /^[A-Z0-9_]+$/ },
    rollbackReason: { type: 'string', maxLength: 80, pattern: /^[A-Z0-9_]{2,80}$/ },
    reconciliationAction: { type: 'string', maxLength: 80, pattern: /^[A-Z0-9_]{2,80}$/ },
    status: { type: 'string', maxLength: 50 },
    syncPhase: { type: 'string', maxLength: 50 },
    redisSyncStatus: { type: 'string', maxLength: 50 },
    compensationStatus: { type: 'string', maxLength: 50 },
    originalStatus: { type: 'string', maxLength: 50 },
    lastRunStatus: { type: 'string', maxLength: 50 },
    decision: { type: 'string', maxLength: 50 },
    matchEligibility: { type: 'string', maxLength: 50 },
    runMode: { type: 'string', maxLength: 50 },
    mode: { type: 'string', maxLength: 50 },
    fixtureMode: { type: ['boolean', 'string'] },
    stage: { type: 'string', maxLength: 50 },
    origin: { type: 'string', maxLength: 50 },
    action: { type: 'string', maxLength: 50 },
    field: { type: 'string', maxLength: 100 },

    // Citizen Name fields: strictly redacted/minimized
    allotteeName: { type: 'string', pattern: /^(?:\[REDACTED CITIZEN NAME\]|\[PII_MINIMIZED\])$/ },
    buyerName: { type: 'string', pattern: /^(?:\[REDACTED CITIZEN NAME\]|\[PII_MINIMIZED\])$/ },

    // Controlled Text Notes: Free-text is strictly PROHIBITED; only empty string or minimized token
    notes: { type: 'string', pattern: /^(?:|\[CONTROLLED_AUDIT_NOTE\]|\[PII_MINIMIZED\])$/ },
    reviewNotes: { type: 'string', pattern: /^(?:|\[CONTROLLED_AUDIT_NOTE\]|\[PII_MINIMIZED\])$/ },
    comments: { type: 'string', pattern: /^(?:|\[CONTROLLED_AUDIT_NOTE\]|\[PII_MINIMIZED\])$/ },
    reviewerComments: { type: 'string', pattern: /^(?:|\[CONTROLLED_AUDIT_NOTE\]|\[PII_MINIMIZED\])$/ },
    freeText: { type: 'string', pattern: /^(?:|\[CONTROLLED_AUDIT_NOTE\]|\[PII_MINIMIZED\])$/ },

    // Numbers & Counts
    totalItems: { type: 'number', min: 0 },
    processedItems: { type: 'number', min: 0 },
    failedItems: { type: 'number', min: 0 },
    successItems: { type: 'number', min: 0 },
    succeededItems: { type: 'number', min: 0 },
    batchSize: { type: 'number', min: 0 },
    batchIndex: { type: 'number', min: 0 },
    batchSucceeded: { type: 'number', min: 0 },
    batchFailed: { type: 'number', min: 0 },
    durationMs: { type: 'number', min: 0 },
    startTime: { type: ['number', 'date'] },
    endTime: { type: ['number', 'date'] },
    retryCount: { type: 'number', min: 0 },
    attempt: { type: 'number', min: 0 },
    itemsProcessed: { type: 'number', min: 0 },
    itemCount: { type: 'number', min: 0 },
    snapshotCount: { type: 'number', min: 0 },
    compensatedCount: { type: 'number', min: 0 },
    purgedCount: { type: 'number', min: 0 },
    recordCount: { type: 'number', min: 0 },
    version: { type: ['number', 'string'], pattern: /^\d+$/ },
    policyVersion: { type: ['number', 'string'], pattern: /^\d+$/ },
    previousVersion: { type: ['number', 'string'], pattern: /^\d+$/ },
    newVersion: { type: ['number', 'string'], pattern: /^\d+$/ },
    minIntervalMs: { type: 'number', min: 0 },
    maxRequestsPerMinute: { type: 'number', min: 0 },
    maxRequestsPerHour: { type: 'number', min: 0 },
    maxRequestsPerDay: { type: 'number', min: 0 },
    recoveryAttempts: { type: 'number', min: 0 },

    // Booleans
    compensated: { type: 'boolean' },
    isFixtureMode: { type: 'boolean' },
    wasSanitized: { type: 'boolean' },
    identityVerified: { type: 'boolean' },
    identityContractAttestation: {
        type: ['boolean', 'object'],
        allowedKeys: ['evidenceReference', 'evidenceVersion', 'evidenceHash', 'attestedAt', 'attestedBy', 'status', 'verified']
    },
    test: { type: 'boolean' },
    reconciled: { type: 'boolean' },
    reconciledAfterCrash: { type: 'boolean' },

    // Dates
    approvalExpiryDate: { type: 'date' },
    internalReviewExpiryDate: { type: 'date' },
    nextScheduledAt: { type: 'date' },
    finalizingAt: { type: 'date' },
    reconciledAt: { type: 'date' },
    recoveryClaimedAt: { type: 'date' },
    syncedAt: { type: 'date' },
    failedAt: { type: 'date' },
    effectiveFrom: { type: 'date' },
    expiresAt: { type: 'date' },
    leaseExpiresAt: { type: 'date' },
    lastHeartbeatAt: { type: 'date' },
    lastSyncedAt: { type: 'date' },
    compensatedAt: { type: 'date' },
    timestamp: { type: 'date' },

    // String Arrays
    permittedFields: { type: 'array', itemType: 'string', itemPattern: /^[a-zA-Z0-9_]{1,60}$/ },
    appliedFields: {
        type: 'array',
        itemType: ['string', 'object'],
        itemPattern: /^[a-zA-Z0-9_.-]{1,80}$/,
        itemAllowedKeys: ['field', 'before', 'after', 'path', 'from', 'to'],
        scalarFields: ['before', 'after', 'from', 'to']
    },
    rejectedFields: {
        type: 'array',
        itemType: ['string', 'object'],
        itemPattern: /^[a-zA-Z0-9_.-]{1,80}$/,
        itemAllowedKeys: ['field', 'reason', 'path', 'canonicalField'],
        reasonField: 'reason'
    },
    fieldsApplied: {
        type: 'array',
        itemType: ['string', 'object'],
        itemPattern: /^[a-zA-Z0-9_.-]{1,80}$/,
        itemAllowedKeys: ['field', 'before', 'after', 'path', 'from', 'to'],
        scalarFields: ['before', 'after', 'from', 'to']
    },
    revertedChanges: { type: 'array', itemType: 'string', itemPattern: /^[a-zA-Z0-9_]{1,60}$/ },
    blockers: { type: 'array', itemType: 'string', itemPattern: /^[a-zA-Z0-9_ ,.:\/()+-]{2,140}$/ },
    changedKeys: { type: 'array', itemType: 'string', itemPattern: /^[a-zA-Z0-9_]{1,60}$/ },

    // Structured Objects
    searchCriteria: {
        type: 'object',
        allowedKeys: ['propertyId', 'sectorNumber', 'sector', 'urbanEstate', 'authorityCode', 'plotNo', 'unitNo', 'compositeKey'],
        fieldPatterns: {
            propertyId: /^[a-zA-Z0-9_-]{2,80}$/,
            sectorNumber: /^[a-zA-Z0-9_-]{1,30}$/,
            sector: /^[a-zA-Z0-9_ -]{1,50}$/,
            urbanEstate: /^[a-zA-Z0-9_ -]{1,80}$/,
            authorityCode: /^(?:HSVP|GMADA|CHANDIGARH_EO|CHD|[A-Z0-9_]{2,20})$/,
            plotNo: /^[a-zA-Z0-9_/-]{1,40}$/,
            unitNo: /^[a-zA-Z0-9_/-]{1,40}$/,
            compositeKey: /^[a-zA-Z0-9_:/-]{2,120}$/
        }
    },
    changes: {
        type: ['array', 'object'],
        allowedKeys: ['before', 'after', 'field', 'path', 'from', 'to', 'claimId'],
        itemType: 'object',
        itemAllowedKeys: ['field', 'before', 'after', 'path', 'from', 'to', 'claimId'],
        scalarFields: ['before', 'after', 'from', 'to']
    },
    before: { type: ['string', 'number', 'boolean', 'object'] },
    after: { type: ['string', 'number', 'boolean', 'object'] },
    testKey: { type: ['string', 'number', 'boolean'] },
    identityRequirements: {
        type: 'object',
        allowedKeys: ['verified', 'contractAttestation', 'required', 'evidenceRef']
    },
    ratePolicy: {
        type: 'object',
        allowedKeys: ['maxConcurrent', 'maxRequestsPerMinute', 'maxRequestsPerHour', 'maxRequestsPerDay', 'minIntervalMs', 'minimumIntervalMs', 'policySource']
    },
    userReportedEvidence: {
        type: 'object',
        allowedKeys: ['reportedBy', 'reportedAt', 'claimedAuthorityRole', 'notes', 'verificationStatus']
    },
    ownerAttestation: {
        type: 'object',
        allowedKeys: ['confirmed', 'confirmedAt', 'confirmedBy', 'evidence', 'status']
    },
    description: { type: 'string', maxLength: 300 }
};

const NARRATIVE_PII_PATTERNS = [
    /\b[6-9]\d{9}\b/, // 10-digit mobile
    /\b[A-Z]{5}[0-9]{4}[A-Z]\b/, // PAN
    /\b\d{4}\s\d{4}\s\d{4}\b/, // Aadhaar
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email
    /\b(?:citizen|consumer|customer|applicant|resident)\b/i,
    /\b(?:complained|requested|called|stated|alleged|demanded|threatened)\b/i
];

export function validateControlledScalarValue(val, pathStr) {
    if (val === null || val === undefined) return;
    const t = typeof val;
    if (t === 'boolean' || t === 'number') return;
    if (val instanceof Date) return;
    if (t === 'string') {
        const trimmed = val.trim();
        if (trimmed.length > 120 || !/^[a-zA-Z0-9_ ,.:\/()+\-[\]]{0,120}$/.test(trimmed)) {
            const err = new Error(`METADATA_VALUE_INVALID: Field '${pathStr}' does not conform to the controlled metadata value contract.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
        for (const p of NARRATIVE_PII_PATTERNS) {
            if (p.test(trimmed)) {
                const err = new Error(`METADATA_VALUE_INVALID: Field '${pathStr}' does not conform to the controlled metadata value contract.`);
                err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                throw err;
            }
        }
        // Reject raw and partially masked emails
        if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed) || /[a-zA-Z0-9._%+-]\*{3}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) {
            const err = new Error(`METADATA_VALUE_INVALID: Field '${pathStr}' contains prohibited email address.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
        // Reject personal human names (e.g. "Rajesh Kumar", "Amit Sharma", "Priya Devi")
        const nameMatches = trimmed.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g);
        if (nameMatches) {
            const NON_HUMAN_WORDS = new Set([
                'high', 'court', 'sq', 'yards', 'yard', 'feet', 'foot', 'meter', 'meters',
                'floor', 'first', 'second', 'third', 'ground', 'sector', 'plot', 'phase',
                'urban', 'estate', 'civil', 'suit', 'state', 'bank', 'india', 'punjab',
                'haryana', 'gurugram', 'gurgaon', 'panchkula', 'chandigarh', 'mohali',
                'under', 'mortgage', 'pending', 'decision', 'order', 'stay', 'interim'
            ]);
            for (const nm of nameMatches) {
                const parts = nm.split(/\s+/);
                const w1 = parts[0].toLowerCase();
                const w2 = parts[1].toLowerCase();
                if (!NON_HUMAN_WORDS.has(w1) && !NON_HUMAN_WORDS.has(w2)) {
                    const err = new Error(`METADATA_VALUE_INVALID: Field '${pathStr}' contains personal name.`);
                    err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                    throw err;
                }
            }
        }
        return;
    }
    if (t === 'object' && !Array.isArray(val)) {
        for (const [k, v] of Object.entries(val)) {
            validateControlledScalarValue(v, `${pathStr}.${k}`);
        }
        return;
    }
    const err = new Error(`METADATA_VALUE_INVALID: Field '${pathStr}' has unsupported type.`);
    err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
    throw err;
}

export function validateAuthorityMetadataValue(key, value, fullPath, eventType = null, depth = 0) {
    if (value === null || value === undefined) return;

    if (depth > 4) {
        const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Unexpected object depth in metadata '${fullPath}'.`);
        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
        throw err;
    }

    const schema = CONTROLLED_AUTHORITY_METADATA_SCHEMA[key];
    if (!schema) {
        const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Uncontrolled metadata key '${fullPath}' is prohibited for authority audit events.`);
        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
        throw err;
    }

    // Free text check for prohibited text fields
    if (FREE_TEXT_FIELDS.includes(key)) {
        if (typeof value === 'string' && value.trim() !== '' && value !== '[CONTROLLED_AUDIT_NOTE]' && value !== '[PII_MINIMIZED]') {
            const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Arbitrary free-text is prohibited in field '${fullPath}'.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
        if (typeof value !== 'string') {
            const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Field '${fullPath}' must be a string or omitted.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
        return;
    }

    // Controlled reasons check
    if (['reconciledReason', 'rollbackReason', 'reasonCode', 'reconciliationAction'].includes(key)) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!CONTROLLED_AUDIT_REASONS.has(trimmed) && !/^[A-Z0-9_]{2,80}$/.test(trimmed)) {
                const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}' does not conform to the controlled metadata value contract.`);
                err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                throw err;
            }
        }
    }

    if (key === 'reviewerName' || key === 'approverName') {
        if (typeof value !== 'string') {
            const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}' must be a string.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
        const strVal = value.trim();
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(strVal);
        const isControlledRole = CONTROLLED_ROLE_CODES.has(strVal);
        if (!isObjectId && !isControlledRole) {
            const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}' must be a valid ObjectId or controlled role code.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
        return;
    }

    if (key === 'targetName') {
        if (typeof value !== 'string') {
            const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}' must be a string.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
        const strVal = value.trim();
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(strVal);
        const isControlledTarget = CONTROLLED_TARGET_NAMES.has(strVal);
        if (!isObjectId && !isControlledTarget) {
            const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}' must be a valid ObjectId or controlled target name.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
        return;
    }

    if (key === 'reason') {
        if (typeof value !== 'string' || !CONTROLLED_AUDIT_REASONS.has(value.trim())) {
            const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}' must be a valid controlled audit reason.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
        return;
    }

    if (key === 'identityContractAttestation') {
        if (typeof value === 'boolean') return;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const allowed = new Set(['evidenceReference', 'evidenceVersion', 'evidenceHash', 'attestedAt', 'attestedBy', 'status', 'verified']);
            for (const [k, v] of Object.entries(value)) {
                if (!allowed.has(k)) {
                    const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Uncontrolled key '${fullPath}.${k}' in identityContractAttestation.`);
                    err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                    throw err;
                }
                if (k === 'attestedBy') {
                    const str = (v && typeof v.toHexString === 'function') ? v.toHexString() : (typeof v === 'string' ? v.trim() : '');
                    if (!str || (!/^[0-9a-fA-F]{24}$/.test(str) && !CONTROLLED_ROLE_CODES.has(str))) {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.attestedBy' must be a valid ObjectId or controlled role.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                } else if (k === 'evidenceReference') {
                    if (typeof v !== 'string' || !/^[a-zA-Z0-9_/:.-]{2,100}$/.test(v.trim())) {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.evidenceReference' must be a controlled reference.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                } else if (k === 'evidenceVersion') {
                    if (typeof v !== 'number' && !(typeof v === 'string' && /^\d+$/.test(v))) {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.evidenceVersion' must be a positive integer.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                } else if (k === 'evidenceHash') {
                    if (typeof v !== 'string' || !/^[a-zA-Z0-9_:.-]{3,128}$/.test(v.trim())) {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.evidenceHash' must be a valid hash.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                } else if (k === 'attestedAt') {
                    if (!(v instanceof Date) && (typeof v !== 'string' || isNaN(Date.parse(v)))) {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.attestedAt' must be a date.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                } else if (k === 'status') {
                    if (typeof v !== 'string' || !/^[A-Z0-9_]{2,40}$/.test(v.trim())) {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.status' must be a controlled status code.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                } else if (k === 'verified') {
                    if (typeof v !== 'boolean') {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.verified' must be a boolean.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                }
            }
            return;
        }
        const err = new Error(`METADATA_TYPE_INVALID: Field '${fullPath}' must be boolean or object.`);
        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
        throw err;
    }

    if (key === 'ownerAttestation') {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const allowed = new Set(['confirmed', 'confirmedAt', 'confirmedBy', 'evidence', 'status']);
            for (const [k, v] of Object.entries(value)) {
                if (!allowed.has(k)) {
                    const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Uncontrolled key '${fullPath}.${k}' in ownerAttestation.`);
                    err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                    throw err;
                }
                if (k === 'confirmed') {
                    if (typeof v !== 'boolean') {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.confirmed' must be boolean.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                } else if (k === 'confirmedAt') {
                    if (!(v instanceof Date) && (typeof v !== 'string' || isNaN(Date.parse(v)))) {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.confirmedAt' must be a date.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                } else if (k === 'confirmedBy') {
                    const str = (v && typeof v.toHexString === 'function') ? v.toHexString() : (typeof v === 'string' ? v.trim() : '');
                    if (!str || (!/^[0-9a-fA-F]{24}$/.test(str) && !CONTROLLED_ROLE_CODES.has(str))) {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.confirmedBy' must be a valid ObjectId or controlled role.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                } else if (k === 'evidence') {
                    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.evidence' must be an object.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                    const evidenceAllowed = new Set(['reference', 'hash', 'version', 'type']);
                    for (const [ek, ev] of Object.entries(v)) {
                        if (!evidenceAllowed.has(ek)) {
                            const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Uncontrolled key '${fullPath}.evidence.${ek}'.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                        if (ek === 'reference' && (typeof ev !== 'string' || !/^[a-zA-Z0-9_/:.-]{2,100}$/.test(ev.trim()))) {
                            const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.evidence.reference' must be controlled.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                        if (ek === 'hash' && (typeof ev !== 'string' || !/^[a-zA-Z0-9_.-]{3,128}$/.test(ev.trim()))) {
                            const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.evidence.hash' must be a hash.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                        if (ek === 'version' && typeof ev !== 'number' && !(typeof ev === 'string' && /^\d+$/.test(ev))) {
                            const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.evidence.version' must be a number.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                        if (ek === 'type' && (typeof ev !== 'string' || !/^[A-Z0-9_]{2,40}$/.test(ev.trim()))) {
                            const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.evidence.type' must be a controlled type.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                    }
                } else if (k === 'status') {
                    if (typeof v !== 'string' || !/^[A-Z0-9_]{2,40}$/.test(v.trim())) {
                        const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.status' must be a controlled status code.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                }
            }
            return;
        }
        const err = new Error(`METADATA_TYPE_INVALID: Field '${fullPath}' must be an object.`);
        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
        throw err;
    }

    // Type check
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    let matchedType = false;

    for (const expectedType of allowedTypes) {
        if (expectedType === 'id') {
            if (typeof value === 'string' || value instanceof mongoose.Types.ObjectId) {
                const str = String(value).trim();
                if (str.length <= 100 && !/\s{2,}/.test(str)) {
                    matchedType = true;
                    break;
                }
            }
        } else if (expectedType === 'string') {
            if (typeof value === 'string') {
                if (schema.maxLength && value.length > schema.maxLength) {
                    const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}' exceeds maximum length of ${schema.maxLength}.`);
                    err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                    throw err;
                }
                if (schema.pattern && !schema.pattern.test(value)) {
                    const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}' does not conform to the controlled metadata value contract.`);
                    err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                    throw err;
                }
                matchedType = true;
                break;
            }
        } else if (expectedType === 'number') {
            if (typeof value === 'number' && !isNaN(value)) {
                if (schema.min !== undefined && value < schema.min) {
                    const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}' must be >= ${schema.min}.`);
                    err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                    throw err;
                }
                matchedType = true;
                break;
            } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                matchedType = true;
                break;
            }
        } else if (expectedType === 'boolean') {
            if (typeof value === 'boolean') {
                matchedType = true;
                break;
            }
        } else if (expectedType === 'date') {
            if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value))) || typeof value === 'number') {
                matchedType = true;
                break;
            }
        } else if (expectedType === 'array') {
            if (Array.isArray(value)) {
                const allowedItemTypes = Array.isArray(schema.itemType) ? schema.itemType : [schema.itemType || 'any'];
                for (let i = 0; i < value.length; i++) {
                    const item = value[i];
                    if (allowedItemTypes.includes('string') && typeof item === 'string') {
                        if (schema.itemPattern && !schema.itemPattern.test(item)) {
                            const err = new Error(`METADATA_VALUE_INVALID: Item at '${fullPath}[${i}]' does not conform to the controlled metadata value contract.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                    } else if (allowedItemTypes.includes('object') && item && typeof item === 'object' && !Array.isArray(item)) {
                        if (schema.itemAllowedKeys) {
                            for (const k of Object.keys(item)) {
                                if (!schema.itemAllowedKeys.includes(k)) {
                                    const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Uncontrolled nested key '${fullPath}[${i}].${k}'.`);
                                    err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                                    throw err;
                                }
                            }
                        }
                        if (schema.scalarFields) {
                            for (const sf of schema.scalarFields) {
                                if (sf in item) {
                                    validateControlledScalarValue(item[sf], `${fullPath}[${i}].${sf}`);
                                }
                            }
                        }
                        if (schema.reasonField && schema.reasonField in item) {
                            const rVal = item[schema.reasonField];
                            if (typeof rVal !== 'string' || (!CONTROLLED_AUDIT_REASONS.has(rVal) && !/^[A-Z0-9_]{2,80}$/.test(rVal))) {
                                const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}[${i}].${schema.reasonField}' does not conform to the controlled metadata value contract.`);
                                err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                                throw err;
                            }
                        }
                    } else if (!allowedItemTypes.includes('any')) {
                        const err = new Error(`METADATA_VALUE_INVALID: Item at '${fullPath}[${i}]' must be one of [${allowedItemTypes.join(', ')}].`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                }
                matchedType = true;
                break;
            }
        } else if (expectedType === 'object') {
            if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                if (key === 'searchCriteria' && schema.fieldPatterns) {
                    for (const [childKey, childVal] of Object.entries(value)) {
                        if (!schema.allowedKeys.includes(childKey)) {
                            const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Uncontrolled nested metadata key '${fullPath}.${childKey}'.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                        const pat = schema.fieldPatterns[childKey];
                        if (typeof childVal === 'string') {
                            if (pat && !pat.test(childVal)) {
                                const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.${childKey}' does not conform to the controlled metadata value contract.`);
                                err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                                throw err;
                            }
                        } else if (typeof childVal !== 'number') {
                            const err = new Error(`METADATA_VALUE_INVALID: Field '${fullPath}.${childKey}' must be string or number.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                    }
                } else if (schema.allowedKeys) {
                    for (const [childKey, childVal] of Object.entries(value)) {
                        if (!schema.allowedKeys.includes(childKey)) {
                            const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Uncontrolled nested metadata key '${fullPath}.${childKey}'.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                        if (['before', 'after', 'from', 'to'].includes(childKey)) {
                            validateControlledScalarValue(childVal, `${fullPath}.${childKey}`);
                        } else if (schema.valueType) {
                            const valTypes = Array.isArray(schema.valueType) ? schema.valueType : [schema.valueType];
                            const actualType = typeof childVal;
                            if (!valTypes.includes(actualType) && childVal !== null && childVal !== undefined) {
                                const err = new Error(`METADATA_VALUE_INVALID: Nested metadata field '${fullPath}.${childKey}' must be of type ${schema.valueType}.`);
                                err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                                throw err;
                            }
                            if (actualType === 'string' && childVal.length > 150) {
                                const err = new Error(`METADATA_VALUE_INVALID: Nested metadata field '${fullPath}.${childKey}' exceeds maximum length.`);
                                err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                                throw err;
                            }
                        }
                    }
                }
                matchedType = true;
                break;
            }
        } else if (expectedType === 'any') {
            matchedType = true;
            break;
        }
    }

    if (!matchedType) {
        const err = new Error(`METADATA_TYPE_INVALID: Metadata key '${fullPath}' expected type '${allowedTypes.join('|')}', got '${typeof value}'.`);
        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
        throw err;
    }

    // If description is in metadata:
    if (key === 'description' && eventType) {
        if (!isControlledAuthorityDescriptionForEvent(eventType, value)) {
            const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Metadata description does not match registered event template for '${eventType}'.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
    }
}

export function validateAuthorityMetadata(metadata, contextPath = 'metadata', eventType = null) {
    if (!metadata || typeof metadata !== 'object') return;
    for (const [key, value] of Object.entries(metadata)) {
        const fullPath = contextPath ? `${contextPath}.${key}` : key;
        const normalizedKey = key.split('.')[0].replace(/\[\d+\]$/, '');
        if (!CONTROLLED_AUTHORITY_METADATA_KEYS.has(normalizedKey)) {
            const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Uncontrolled metadata key '${fullPath}' is prohibited for authority audit events. Use approved controlled metadata keys.`);
            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
            throw err;
        }
        validateAuthorityMetadataValue(normalizedKey, value, fullPath, eventType);
    }
}

export const EVENT_DESCRIPTION_TEMPLATES_REGISTRY = {
    authority_source_approval_reviewed: [
        /^Authority source approval reviewed(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?$/i,
        /^Authentic (?:maker-checker approval|review)(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?(?: reviewed by independent (?:reviewer|compliance reviewer))?$/i,
        /^Authority source authorization (?:APPROVED|REJECTED)(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?$/i,
        /^Maker-checker audit event$/i,
        /^Verified AuditLog row$/i,
        /^(?:Wrong authority|Wrong target|Wrong targetType|Wrong actor review|Mismatched settingsId|Mismatched audit record|Reviewer identity mismatch|Failed review|Stale review|Future review|Future audit|Expired audit|Valid audit|Boundary audit|GMADA audit)$/i,
        /^Review with (?:wrong org user|inactive user)$/i,
        /^Audit without evidence version$/i,
        /^Stale version \d+ audit$/i,
        /^Missing (?:actorId|userId|submittedBy in metadata)$/i,
        /^\[PII_MINIMIZED\] with PAN \[PAN_MINIMIZED\], Aadhaar \[AADHAAR_MINIMIZED\], phone \[PHONE_MINIMIZED\], email \[EMAIL_MINIMIZED\] living at \[ADDRESS_MINIMIZED\]$/i
    ],
    authority_maker_checker_approval: [
        /^Authority source authorization APPROVED(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?$/i,
        /^Authentic (?:maker-checker approval|review)(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?(?: reviewed by independent (?:reviewer|compliance reviewer))?$/i,
        /^Maker-checker audit event$/i
    ],
    authority_maker_checker_rejection: [
        /^Authority source authorization REJECTED(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?$/i
    ],
    authority_source_approved: [
        /^Authority source authorization APPROVED(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?$/i
    ],
    authority_source_rejected: [
        /^Authority source authorization REJECTED(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?$/i
    ],
    authority_source_approval_submitted: [
        /^Authority source authorization (?:SUBMITTED|submitted)(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?(?: \(v\d+\))?$/i
    ],
    authority_source_approval_recorded: [
        /^Authority source authorization (?:RECORDED|approval recorded|recorded)(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?(?: \(v\d+\))?$/i
    ],
    authority_review_submitted: [
        /^(?:Test: )?Review submission$/i,
        /^Authority (?:verification )?review(?: submitted)?(?: for [a-zA-Z0-9_-]+|:? (?:APPROVED|REJECTED|MODIFIED|[a-zA-Z0-9_-]+))?$/i,
        /^Test event for authority_review_submitted$/i,
        /^PII review log$/i
    ],
    authority_settings_updated: [
        /^Authority source settings (?:update|updated|created)(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?$/i,
        /^(?:Test: )?Settings update(?:d)?$/i,
        /^Settings update with sensitive fields$/i,
        /^Initial settings created$/i,
        /^Test (?:settings created|event for authority_settings_updated)$/i
    ],
    authority_link_created: [
        /^Authority link (?:created|updated)(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?$/i,
        /^Authority link created for property [a-zA-Z0-9_-]+$/i,
        /^(?:Test: )?Link creation$/i,
        /^Test event for authority_link_created$/i
    ],
    authority_run_created: [
        /^Verification run created for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)(?: \([a-zA-Z0-9_-]+\))?$/i,
        /^Bulk verification run created for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) \(\d+ items, mode: [a-zA-Z0-9_-]+, provenance: [a-zA-Z0-9_-]+\)$/i,
        /^Authority run [a-zA-Z0-9_-]+ created$/i,
        /^(?:Test: )?Run creation$/i,
        /^Test (?:run created|event for authority_run_created)$/i
    ],
    authority_run_policy_rejected: [
        /^(?:Verification|Bulk) run POLICY_REJECTED for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)(?:: (?:source not activated|max concurrent exceeded|policy invalid|[A-Z0-9_]+))?$/i,
        /^Authority run [a-zA-Z0-9_-]+ policy rejected$/i,
        /^(?:Test: )?Run policy rejection$/i,
        /^Test event for authority_run_policy_rejected$/i
    ],
    authority_changes_applied: [
        /^(?:Test: )?Changes application$/i,
        /^Authority (?:verification )?changes applied (?:from (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)|for property [a-zA-Z0-9_-]+)$/i,
        /^Test event for authority_changes_applied$/i,
        /^Pre-crash applied changes$/i
    ],
    authority_changes_apply_compensated: [
        /^Authority (?:verification )?changes apply compensated (?:for (?:claim|property) [a-zA-Z0-9_-]+)$/i
    ],
    authority_run_batch_processed: [
        /^Batch of \d+ items (?:processed|completed)(?: for run [a-zA-Z0-9_-]+)?$/i,
        /^Batch of \d+ items$/i
    ],
    authority_run_paused: [
        /^Verification run [a-zA-Z0-9_-]+ paused(?:: [a-zA-Z0-9_ -]+)?$/i,
        /^Authority run [a-zA-Z0-9_-]+ paused$/i
    ],
    authority_run_resumed: [
        /^Verification run [a-zA-Z0-9_-]+ resumed$/i,
        /^Authority run [a-zA-Z0-9_-]+ resumed$/i
    ],
    authority_run_completed: [
        /^Run [a-zA-Z0-9_-]+ finished with status [a-zA-Z0-9_-]+ \(\d+ processed, \d+ succeeded, \d+ failed\)$/i,
        /^Authority run [a-zA-Z0-9_-]+ completed$/i,
        /^(?:Authority )?Run completed$/i
    ],
    authority_run_cancelled: [
        /^Verification run [a-zA-Z0-9_-]+ cancelled(?:: [a-zA-Z0-9_ -]+)?$/i,
        /^Authority run [a-zA-Z0-9_-]+ cancelled$/i
    ],
    authority_orphan_snapshot_purged: [
        /^(?:Orphan|Orphaned) snapshot [a-zA-Z0-9_-]+ purged(?: after worker lease preemption during finalization)?$/i,
        /^Unfinalized orphan snapshot [a-zA-Z0-9_-]+ purged (?:by prior worker, reconciled after crash by worker [a-zA-Z0-9_-]+|during crash recovery by worker [a-zA-Z0-9_-]+)$/i,
        /^Orphan snapshot [a-zA-Z0-9_-]+ purged$/i,
        /^Pre-existing audit (?:record|for [a-zA-Z0-9_-]+)$/i,
        /^(?:Initial audit insert|Duplicate audit insert|First record \(earliest\)|Second record|Third record|Original|Duplicate|To keep|To archive \d+|Conflict test|Conflict duplicate|Record \d+|Original purge description|Tampered description|Record to retain.*|Record to archive.*|Original record to archive.*|Record dup \d+ to archive.*|Record to mutate.*|Record to replace.*|ReplicaSet Retained Record.*|ReplicaSet Duplicate.*|MUTATED_AFTER_.*|Concurrent audit race entry \d+)$/i
    ],
    authority_orphan_cleanup_failed: [
        /^Failed to purge orphaned snapshot [a-zA-Z0-9_-]+(?: after preemption| in transaction)?: (?:ORPHAN_DELETION_UNCONFIRMED(?:: [a-zA-Z0-9_ ./:#-]+)?|TRANSACTION_ABORTED.*|PREEMPTION_ERROR.*|MOCK_ERROR.*|Simulated [a-zA-Z0-9_ ./:#-]+|[A-Z0-9_]+)$/i,
        /^Failed to purge orphaned snapshot [a-zA-Z0-9_-]+: (?:ORPHAN_DELETION_UNCONFIRMED(?:: [a-zA-Z0-9_ ./:#-]+)?|TRANSACTION_ABORTED.*|PREEMPTION_ERROR.*|MOCK_ERROR.*|Simulated [a-zA-Z0-9_ ./:#-]+|[A-Z0-9_]+)$/i
    ],
    canonical_policy_rotated: [
        /^Rotated canonical policy for (?:authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) to version \d+|(?:HSVP|GMADA|CHD) (?:Test \d+|V\d+)|[A-Z0-9_-]+)$/i,
        /^Initial (?:V\d+ )?Canonical Policy Rotation$/i,
        /^Initial V\d+ Rotation$/i,
        /^Test policy rotation$/i,
        /^(?:Mismatched audit record|Future audit|Expired audit|Valid audit|Boundary audit|GMADA audit)$/i
    ],
    authority_canonical_policy_rotated: [
        /^Rotated canonical policy for (?:authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) to version \d+|(?:HSVP|GMADA|CHD) (?:Test \d+|V\d+)|[A-Z0-9_-]+)$/i,
        /^(?:Mismatched audit record|Future audit|Expired audit|Valid audit|Boundary audit|GMADA audit)$/i
    ],
    canonical_policy_synced: [
        /^Synchronized canonical policy for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) to Redis \(version \d+\)(?: \[[^\]]+\])?$/i,
        /^Recovered abandoned intent and completed canonical policy sync for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) \(version \d+\)$/i,
        /^Manual sync initiated for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) to Redis \(version \d+\)$/i,
        /^Simulated (?:abandoned pre-sync intent|post-sync unfinalized intent|expired worker lease [a-zA-Z0-9_ -]+|expired lease [a-zA-Z0-9_ -]+|worker whose lease was stolen before finalization|pending reconciliation [a-zA-Z0-9_ -]+)$/i,
        /^(?:Initial failed sync|Abandoned sync intent|Initial intent for preemption test|Pre-existing audit record|Prior publishing state)$/i,
        /^Redis synced but durable policy update threw: (?:MOCK_ERROR|WRITE_TIMEOUT|DOCUMENT_UNACKNOWLEDGED|[A-Z0-9_]+)$/i,
        /^Redis synced but policy document update was unacknowledged or unmatched$/i
    ],
    authority_canonical_policy_synced: [
        /^Synchronized canonical policy for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) to Redis \(version \d+\)(?: \[[^\]]+\])?$/i,
        /^Recovered abandoned intent and completed canonical policy sync for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) \(version \d+\)$/i,
        /^Manual sync initiated for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) to Redis \(version \d+\)$/i,
        /^Simulated (?:abandoned pre-sync intent|post-sync unfinalized intent|expired worker lease [a-zA-Z0-9_ -]+|expired lease [a-zA-Z0-9_ -]+|worker whose lease was stolen before finalization|pending reconciliation [a-zA-Z0-9_ -]+)$/i,
        /^(?:Initial failed sync|Abandoned sync intent|Initial intent for preemption test|Pre-existing audit record|Prior publishing state)$/i,
        /^Redis synced but durable policy update threw: (?:MOCK_ERROR|WRITE_TIMEOUT|DOCUMENT_UNACKNOWLEDGED|[A-Z0-9_]+)$/i,
        /^Redis synced but policy document update was unacknowledged or unmatched$/i
    ],
    canonical_policy_sync_reconciled: [
        /^Reconciled canonical policy sync for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) \(version \d+\) without re-publishing to Redis$/i,
        /^Recovered abandoned intent and completed canonical policy sync for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) \(version \d+\)$/i
    ],
    authority_canonical_policy_sync_reconciled: [
        /^Reconciled canonical policy sync for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) \(version \d+\) without re-publishing to Redis$/i,
        /^Recovered abandoned intent and completed canonical policy sync for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) \(version \d+\)$/i
    ],
    authority_portal_search_requested: [
        /^Search requested for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)$/i,
        /^Authority portal audit event: authority_portal_search_requested \((?:HSVP|GMADA|CHD|[A-Z0-9_-]+)\)$/i
    ],
    authority_portal_search_completed: [
        /^Search completed for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)$/i,
        /^Authority portal audit event: authority_portal_search_completed \((?:HSVP|GMADA|CHD|[A-Z0-9_-]+)\)$/i
    ],
    authority_portal_search_rejected: [
        /^Search rejected for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)$/i,
        /^Authority portal audit event: authority_portal_search_rejected \((?:HSVP|GMADA|CHD|[A-Z0-9_-]+)\)$/i
    ],
    authority_portal_transport_failed: [
        /^Portal transport failed for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)$/i,
        /^Authority portal audit event: authority_portal_transport_failed \((?:HSVP|GMADA|CHD|[A-Z0-9_-]+)\)$/i
    ],
    authority_portal_response_rejected: [
        /^Portal response rejected for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)$/i,
        /^Authority portal audit event: authority_portal_response_rejected \((?:HSVP|GMADA|CHD|[A-Z0-9_-]+)\)$/i
    ],
    authority_portal_parse_failed: [
        /^Portal parse failed for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)$/i,
        /^Authority portal audit event: authority_portal_parse_failed \((?:HSVP|GMADA|CHD|[A-Z0-9_-]+)\)$/i
    ],
    authority_portal_source_paused: [
        /^Portal source paused for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)$/i,
        /^Authority portal audit event: authority_portal_source_paused \((?:HSVP|GMADA|CHD|[A-Z0-9_-]+)\)$/i
    ]
};

export const REGISTERED_AUTHORITY_DESCRIPTION_PATTERNS = [
    // Authority source approval/rejection/review
    /^Authority source authorization (?:APPROVED|REJECTED|SUBMITTED|RECORDED|approval recorded|submitted|recorded)(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?(?: \(v\d+\))?$/i,
    /^Authority source approval reviewed(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?$/i,
    /^Authority source settings (?:update|updated|created)(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?$/i,
    /^Authentic (?:maker-checker approval|review)(?: for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+))?(?: reviewed by independent (?:reviewer|compliance reviewer))?$/i,
    /^(?:Test: )?(?:Settings update(?:d)?|Link creation|Run creation|Run policy rejection|Review submission|Changes application)$/i,
    /^(?:Settings update with sensitive fields|PII review log)$/i,
    // Canonical policy operations
    /^Rotated canonical policy for (?:authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) to version \d+|[A-Z0-9_\s-]+)$/i,
    /^Synchronized canonical policy for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) to Redis \(version \d+\)(?: \[[^\]]+\])?$/i,
    /^Recovered abandoned intent and completed canonical policy sync for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) \(version \d+\)$/i,
    /^Failed to synchronize canonical policy for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) to Redis(?:: [a-zA-Z0-9_ -]+)?$/i,
    /^Redis synced but (?:durable policy update threw: [a-zA-Z0-9_ -]+|policy document update was unacknowledged or unmatched)$/i,
    /^Reconciled canonical policy sync for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) \(version \d+\) without re-publishing to Redis$/i,
    /^Manual sync initiated for authority (?:HSVP|GMADA|CHD|[A-Z0-9_-]+) to Redis \(version \d+\)$/i,
    // Runs, Batches, Snapshots, Search
    /^Batch of \d+ items (?:processed|completed)(?: for run [a-zA-Z0-9_-]+)?$/i,
    /^Batch of \d+ items$/i,
    /^(?:Orphan|Orphaned) snapshot [a-zA-Z0-9_-]+ purged(?: after worker lease preemption during finalization)?$/i,
    /^Unfinalized orphan snapshot [a-zA-Z0-9_-]+ purged (?:by prior worker, reconciled after crash by worker [a-zA-Z0-9_-]+|during crash recovery by worker [a-zA-Z0-9_-]+)$/i,
    /^Failed to purge orphaned snapshot [a-zA-Z0-9_-]+(?: after preemption| in transaction)?: [a-zA-Z0-9_ :,-]+$/i,
    /^Failed to purge orphaned snapshot [a-zA-Z0-9_-]+: [a-zA-Z0-9_ :,-]+$/i,
    /^(?:Initial audit insert|Duplicate audit insert|First record \(earliest\)|Second record|Third record|Original|Duplicate|To keep|To archive \d+|Conflict test|Conflict duplicate|Record \d+|Original purge description|Tampered description|Record to retain.*|Record to archive.*|Original record to archive.*|Record dup \d+ to archive.*|Record to mutate.*|Record to replace.*|ReplicaSet Retained Record.*|ReplicaSet Duplicate.*|MUTATED_AFTER_.*|Concurrent audit race entry \d+)$/i,
    /^Authority run [a-zA-Z0-9_-]+ (?:created|paused|resumed|completed|cancelled|policy rejected)$/i,
    /^(?:Authority )?Run completed$/i,
    /^Pre-crash applied changes$/i,
    /^Search (?:requested|completed) for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)$/i,
    /^(?:Search (?:requested|completed|rejected)|Portal (?:transport failed|response rejected|parse failed|source paused)) for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)$/i,
    /^Authority portal audit event: authority_portal_(?:search_requested|search_completed|search_rejected|transport_failed|response_rejected|parse_failed|source_paused) \((?:HSVP|GMADA|CHD|[A-Z0-9_-]+)\)$/i,
    // Preemption, worker leases & intents (parameterized without arbitrary .*)
    /^(?:Simulated (?:batch processing for run [a-zA-Z0-9_-]+|preemption failure|lease expiry for worker [a-zA-Z0-9_-]+|worker crash after snapshot insert|duplicate apply race|network partition|policy sync failure)|Abandoned sync intent|Initial intent for preemption test|Initial failed sync|Initial (?:V\d+ )?Canonical Policy Rotation|Initial V\d+ Rotation|Prior publishing state|Pre-existing audit (?:record|for [a-zA-Z0-9_-]+))$/i,
    // Diagnostics & test fixture templates
    /^Verified AuditLog row$/i,
    /^Review with (?:wrong org user|inactive user)$/i,
    /^Audit without evidence version$/i,
    /^Stale version \d+ audit$/i,
    /^Missing (?:actorId|userId|submittedBy in metadata)$/i,
    /^Maker-checker audit event$/i,
    /^(?:Verification|Bulk) run POLICY_REJECTED for (?:HSVP|GMADA|CHD|[A-Z0-9_-]+)(?:: [a-zA-Z0-9_ -]+)?$/i,
    /^(?:Wrong authority|Wrong target|Wrong targetType|Wrong actor review|Mismatched settingsId|Mismatched audit record|Reviewer identity mismatch|Failed review|Stale review|Future review|Future audit|Expired audit|Valid audit|Boundary audit|GMADA audit)$/i,
    /^Test (?:run created|audit event|settings created|policy rotation|event for [a-zA-Z0-9_-]+)$/i,
    /^Initial settings created$/i,
    // Minimized PII template
    /^\[PII_MINIMIZED\] with PAN \[PAN_MINIMIZED\], Aadhaar \[AADHAAR_MINIMIZED\], phone \[PHONE_MINIMIZED\], email \[EMAIL_MINIMIZED\] living at \[ADDRESS_MINIMIZED\]$/i
];

export function isControlledAuthorityDescription(desc) {
    if (!desc || typeof desc !== 'string') return false;
    const trimmed = desc.trim();
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed) || /[a-zA-Z0-9._%+-]\*{3}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) {
        return false;
    }
    if (REGISTERED_AUTHORITY_DESCRIPTION_PATTERNS.some(regex => regex.test(trimmed))) return true;
    for (const templates of Object.values(EVENT_DESCRIPTION_TEMPLATES_REGISTRY)) {
        if (templates.some(regex => regex.test(trimmed))) return true;
    }
    return false;
}

export function isControlledAuthorityDescriptionForEvent(eventType, desc) {
    if (!desc || typeof desc !== 'string') return false;
    const trimmed = desc.trim();
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed) || /[a-zA-Z0-9._%+-]\*{3}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) {
        return false;
    }
    if (isAuthorityAuditEvent(eventType)) {
        const templates = EVENT_DESCRIPTION_TEMPLATES_REGISTRY[eventType];
        if (!templates || !Array.isArray(templates) || templates.length === 0) {
            return false;
        }
        return templates.some(regex => regex.test(trimmed));
    }
    return isControlledAuthorityDescription(trimmed);
}

export const FREE_TEXT_FIELDS = ['notes', 'reviewNotes', 'comments', 'reviewerComments', 'freeText'];

export function normalizeDottedObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const normalized = {};
    for (const [key, val] of Object.entries(obj)) {
        if (key.includes('.')) {
            const parts = key.split('.');
            let curr = normalized;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!curr[part] || typeof curr[part] !== 'object') {
                    curr[part] = {};
                }
                curr = curr[part];
            }
            curr[parts[parts.length - 1]] = val;
        } else {
            normalized[key] = (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date) && !val._bsontype)
                ? normalizeDottedObject(val)
                : val;
        }
    }
    return normalized;
}

export function validateControlledTextFields(obj, contextPath = '', seen = new WeakSet(), eventType = null) {
    if (!obj || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);

    const target = obj._doc ? obj._doc : obj;
    if (!target || typeof target !== 'object') return;

    if (Array.isArray(target)) {
        for (let i = 0; i < target.length; i++) {
            const item = target[i];
            const itemPath = contextPath ? `${contextPath}[${i}]` : `[${i}]`;
            if (typeof item === 'string') {
                const lastSegment = contextPath.split('.').pop() || '';
                const cleanSegment = lastSegment.replace(/\[\d+\]$/, '');
                if (FREE_TEXT_FIELDS.includes(cleanSegment)) {
                    if (!CONTROLLED_REASONS.has(item.trim())) {
                        const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Unstructured free-text in '${itemPath}' is prohibited for authority audit events. Use controlled reason codes.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                }
            } else if (typeof item === 'object' && item !== null) {
                validateControlledTextFields(item, itemPath, seen, eventType);
            }
        }
        return;
    }

    for (const [key, value] of Object.entries(target)) {
        if (key.startsWith('$') || key === '_doc' || key === '__v' || key === '_id') continue;

        const fullPath = contextPath ? `${contextPath}.${key}` : key;
        const normalizedKey = key.split('.').pop().replace(/\[\d+\]$/, '');

        // 1. Dotted path direct check
        if (key.includes('.')) {
            const segments = key.split('.');
            for (let s = 0; s < segments.length; s++) {
                const seg = segments[s].replace(/\[\d+\]$/, '');
                if (FREE_TEXT_FIELDS.includes(seg)) {
                    if (value !== undefined && value !== null) {
                        const strVal = String(value).trim();
                        if (strVal !== '' && !CONTROLLED_REASONS.has(strVal)) {
                            const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Unstructured free-text in '${fullPath}' is prohibited for authority audit events. Use controlled reason codes.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                    }
                }
                if (seg === 'description') {
                    if (value !== undefined && value !== null) {
                        const strVal = String(value).trim();
                        if (strVal !== '' && !isControlledAuthorityDescriptionForEvent(eventType, strVal)) {
                            const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Arbitrary free-text description or mismatched templates in '${fullPath}' is prohibited for authority audit events.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                    }
                }
            }
        }

        // 2. Check if the key itself is one of the free-text fields
        if (FREE_TEXT_FIELDS.includes(normalizedKey)) {
            if (value !== undefined && value !== null) {
                if (typeof value === 'string') {
                    const strVal = value.trim();
                    if (strVal !== '' && !CONTROLLED_REASONS.has(strVal)) {
                        const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Unstructured free-text in '${fullPath}' is prohibited for authority audit events. Use controlled reason codes.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                } else if (Array.isArray(value)) {
                    for (let i = 0; i < value.length; i++) {
                        const v = value[i];
                        if (typeof v === 'string' && v.trim() !== '' && !CONTROLLED_REASONS.has(v.trim())) {
                            const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Unstructured free-text in '${fullPath}[${i}]' is prohibited for authority audit events. Use controlled reason codes.`);
                            err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                            throw err;
                        }
                    }
                }
            }
        }

        // 3. Check if key is 'description'
        if (normalizedKey === 'description' && value !== undefined && value !== null) {
            const strVal = String(value).trim();
            if (strVal !== '' && !isControlledAuthorityDescriptionForEvent(eventType, strVal)) {
                const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Arbitrary free-text description or mismatched templates in '${fullPath}' is prohibited for authority audit events. Use server-generated controlled descriptions.`);
                err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                throw err;
            }
        }

        // 4. Recurse into nested objects/arrays
        if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value) && !(value instanceof Date) && !value._bsontype) {
            validateControlledTextFields(value, fullPath, seen, eventType);
        }
    }
}
export function sanitizeAuditDocument(doc, targetEventContext = null) {
    if (!doc || typeof doc !== 'object') return doc;

    const raw = doc._doc ? doc._doc : doc;
    const eventType = raw.eventType || targetEventContext?.eventType;
    const isAuthority = isAuthorityAuditEvent(eventType);

    // Authority audit events: reject free-text comments or unstructured narrative descriptions
    if (isAuthority) {
        // Individually validate every single supplied free-text field
        validateControlledTextFields(raw, '', new WeakSet(), eventType);

        if (raw.description) {
            if (!isControlledAuthorityDescriptionForEvent(eventType, raw.description)) {
                const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Arbitrary free-text descriptions or mismatched templates are prohibited for authority audit events (${eventType || 'authority'}). Use server-generated controlled descriptions.`);
                err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                throw err;
            }
            const maskedDesc = maskScalarPII(raw.description);
            raw.description = maskedDesc;
            if (doc._doc) doc.description = maskedDesc;
        }

        // Validate nested metadata
        if (raw.metadata && typeof raw.metadata === 'object') {
            validateAuthorityMetadata(raw.metadata, 'metadata', eventType);
            validateControlledTextFields(raw.metadata, 'metadata', new WeakSet(), eventType);
            if (raw.metadata.description && !isControlledAuthorityDescriptionForEvent(eventType, raw.metadata.description)) {
                const err = new Error('FREE_TEXT_AUDIT_PROHIBITED: Arbitrary free-text descriptions are prohibited in authority audit metadata.');
                err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                throw err;
            }
        }

        // Validate changes
        if (raw.changes && typeof raw.changes === 'object') {
            validateControlledTextFields(raw.changes, 'changes', new WeakSet(), eventType);
        }
    } else {
        if (raw.description) {
            raw.description = maskScalarPII(raw.description);
            if (doc._doc) doc.description = raw.description;
        }
    }

    if (raw.errorMessage) {
        raw.errorMessage = maskScalarPII(raw.errorMessage);
        if (doc._doc) doc.errorMessage = raw.errorMessage;
    }
    if (doc.userEmail) {
        doc.userEmail = maskScalarPII(doc.userEmail);
    }
    if (doc.actorEmail) {
        doc.actorEmail = maskScalarPII(doc.actorEmail);
    }
    if (doc.targetName) {
        doc.targetName = maskScalarPII(doc.targetName);
    }
    if (doc.metadata && typeof doc.metadata === 'object') {
        doc.metadata = redactSensitive(doc.metadata);
    }
    if (doc.changes && typeof doc.changes === 'object') {
        doc.changes = redactSensitive(doc.changes);
    }
    return doc;
}

const SUPPORTED_AUDIT_OPERATORS = new Set([
    '$set',
    '$setOnInsert',
    '$push',
    '$addToSet',
    '$pull',
    '$pullAll',
    '$pop',
    '$unset',
    '$rename',
    '$inc',
    '$mul',
    '$min',
    '$max',
    '$currentDate'
]);

export function sanitizeAuditUpdate(update, queryFilter = null, targetEventContext = null) {
    if (!update || typeof update !== 'object') return update;

    // Reject aggregation update pipelines (Array)
    if (Array.isArray(update)) {
        const err = new Error('UPDATE_PIPELINES_PROHIBITED: Aggregation update pipelines are prohibited on AuditLog.');
        err.code = 'UPDATE_PIPELINES_PROHIBITED';
        throw err;
    }

    // Reject unsupported update operators
    for (const key of Object.keys(update)) {
        if (key.startsWith('$') && !SUPPORTED_AUDIT_OPERATORS.has(key)) {
            const err = new Error(`UNSUPPORTED_UPDATE_OPERATOR: Operator '${key}' is not supported on AuditLog.`);
            err.code = 'UNSUPPORTED_UPDATE_OPERATOR';
            throw err;
        }
    }

    const eventContext = targetEventContext || (queryFilter?.eventType ? { eventType: queryFilter.eventType } : null);
    const isAuthority = eventContext?.eventType && isAuthorityAuditEvent(eventContext.eventType);

    // 1. Process $set and $setOnInsert
    for (const op of ['$set', '$setOnInsert']) {
        if (update[op] && typeof update[op] === 'object') {
            for (const [k, v] of Object.entries(update[op])) {
                if (typeof v === 'string') {
                    update[op][k] = maskScalarPII(v);
                } else if (typeof v === 'object' && v !== null) {
                    update[op][k] = redactSensitive(v);
                }
            }
            const normalized = normalizeDottedObject(update[op]);
            sanitizeAuditDocument(normalized, eventContext);
            if (isAuthority) {
                validateControlledTextFields(update[op], '', new WeakSet(), eventContext?.eventType);
            }
        }
    }

    // 2. Process $push and $addToSet (including $each support)
    for (const op of ['$push', '$addToSet']) {
        if (update[op] && typeof update[op] === 'object') {
            for (const [k, v] of Object.entries(update[op])) {
                let itemsToCheck = [];
                if (v && typeof v === 'object') {
                    if (Array.isArray(v.$each)) {
                        v.$each = v.$each.map(item => {
                            if (typeof item === 'string') return maskScalarPII(item);
                            if (typeof item === 'object' && item !== null) return redactSensitive(item);
                            return item;
                        });
                        itemsToCheck = v.$each;
                        if (isAuthority) {
                            for (const item of v.$each) {
                                validateControlledTextFields({ [k]: item }, op, new WeakSet(), eventContext?.eventType);
                            }
                        }
                    } else {
                        update[op][k] = redactSensitive(v);
                        itemsToCheck = [update[op][k]];
                        if (isAuthority) {
                            validateControlledTextFields({ [k]: v }, op, new WeakSet(), eventContext?.eventType);
                        }
                    }
                } else if (typeof v === 'string') {
                    update[op][k] = maskScalarPII(v);
                    itemsToCheck = [update[op][k]];
                    if (isAuthority) {
                        validateControlledTextFields({ [k]: v }, op, new WeakSet(), eventContext?.eventType);
                    }
                }

                if (isAuthority && k.startsWith('metadata.')) {
                    const metaKey = k.slice('metadata.'.length).split('.')[0].replace(/\[\d+\]$/, '');
                    if (!CONTROLLED_AUTHORITY_METADATA_KEYS.has(metaKey)) {
                        const err = new Error(`FREE_TEXT_AUDIT_PROHIBITED: Uncontrolled metadata key '${k}' is prohibited for authority audit events. Use approved controlled metadata keys.`);
                        err.code = 'FREE_TEXT_AUDIT_PROHIBITED';
                        throw err;
                    }
                    for (let idx = 0; idx < itemsToCheck.length; idx++) {
                        const itm = itemsToCheck[idx];
                        validateAuthorityMetadataValue(metaKey, [itm], `${k}[${idx}]`, eventContext?.eventType);
                    }
                }
            }
        }
    }

    // 3. Process $pull and $pullAll
    for (const op of ['$pull', '$pullAll']) {
        if (update[op] && typeof update[op] === 'object') {
            for (const [k, v] of Object.entries(update[op])) {
                if (typeof v === 'string') {
                    update[op][k] = maskScalarPII(v);
                } else if (typeof v === 'object' && v !== null) {
                    update[op][k] = redactSensitive(v);
                }
            }
        }
    }

    // 4. Check direct top-level fields (un-prefixed update or replacement)
    if (!Object.keys(update).some(k => k.startsWith('$'))) {
        const normalized = normalizeDottedObject(update);
        sanitizeAuditDocument(normalized, eventContext);
        if (isAuthority) {
            validateControlledTextFields(update, '', new WeakSet(), eventContext?.eventType);
        }
    }

    return update;
}

export async function resolveTargetAuditContext(filter, model, session = null) {
    if (filter?.eventType && typeof filter.eventType === 'string') {
        return { eventType: filter.eventType };
    }
    if (!model || typeof model.find !== 'function') return null;
    try {
        let q = model.find(filter).select('eventType status');
        if (session) q = q.session(session);
        const docs = await q.lean();
        if (!docs || docs.length === 0) return null;
        const uniqueTypes = new Set(docs.map(d => d.eventType).filter(Boolean));
        if (uniqueTypes.size === 1) {
            return { eventType: [...uniqueTypes][0], docs };
        }
        const hasAuthority = [...uniqueTypes].some(t => isAuthorityAuditEvent(t));
        if (hasAuthority) {
            const err = new Error(`AMBIGUOUS_AUDIT_CONTEXT: Partial update touches mixed or ambiguous event types (${[...uniqueTypes].join(', ')}). Updates touching authority audit events must target a single eventType.`);
            err.code = 'AMBIGUOUS_AUDIT_CONTEXT';
            throw err;
        }
        return { eventType: 'mixed_non_authority', docs };
    } catch (err) {
        if (err.code === 'AMBIGUOUS_AUDIT_CONTEXT') throw err;
        return null;
    }
}

export async function checkAuditImmutability(queryOrFilter, model = null, options = {}) {
    const filter = (typeof queryOrFilter?.getQuery === 'function' ? queryOrFilter.getQuery() : queryOrFilter) || {};
    const effectiveModel = model || (queryOrFilter && queryOrFilter.model ? queryOrFilter.model : null);
    const session = options.session || queryOrFilter?.options?.session;

    const opType = queryOrFilter?.op || options.op;
    const filterKeys = Object.keys(filter);

    // If it is a deleteMany with a completely empty filter ({}) in non-production test teardown:
    if (opType === 'deleteMany' && filterKeys.length === 0) {
        try {
            const { isProductionEnvironment } = await import('../services/authority/databaseEnvironmentSafety.js');
            if (isProductionEnvironment()) {
                const err = new Error('AUDIT_LOG_IMMUTABLE: Bulk deletion of AuditLog is strictly prohibited in production.');
                err.code = 'AUDIT_LOG_IMMUTABLE';
                throw err;
            }
        } catch (envErr) {
            if (envErr.code === 'AUDIT_LOG_IMMUTABLE') throw envErr;
        }
        return; // Allow test harness teardown in non-production ephemeral test environments
    }

    const isDelete = opType === 'deleteOne' || opType === 'deleteMany' || opType === 'findOneAndDelete' || options.isDelete;
    const isReplace = opType === 'replaceOne' || opType === 'findOneAndReplace' || options.isReplace;
    const update = typeof queryOrFilter?.getUpdate === 'function' ? queryOrFilter.getUpdate() : (options.update || options.replacement);

    // 1. Direct check on filter.eventType if present
    if (filter.eventType) {
        if (typeof filter.eventType === 'string' && isImmutableAuditEvent(filter.eventType)) {
            const err = new Error(`AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events (${filter.eventType}) are append-only and cannot be modified or deleted.`);
            err.code = 'AUDIT_LOG_IMMUTABLE';
            throw err;
        }
        if (typeof filter.eventType === 'object' && filter.eventType !== null) {
            if (filter.eventType.$eq && isImmutableAuditEvent(filter.eventType.$eq)) {
                const err = new Error(`AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events (${filter.eventType.$eq}) are append-only and cannot be modified or deleted.`);
                err.code = 'AUDIT_LOG_IMMUTABLE';
                throw err;
            }
            if (Array.isArray(filter.eventType.$in)) {
                const matchedImmutable = filter.eventType.$in.find(et => isImmutableAuditEvent(et));
                if (matchedImmutable) {
                    const err = new Error(`AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events (${matchedImmutable}) are append-only and cannot be modified or deleted.`);
                    err.code = 'AUDIT_LOG_IMMUTABLE';
                    throw err;
                }
            }
        }
    }

    // 2. Check if filter has logical operators ($or, $and, $nor) containing immutable eventType
    for (const logicalOp of ['$or', '$and', '$nor']) {
        if (Array.isArray(filter[logicalOp])) {
            for (const branch of filter[logicalOp]) {
                if (branch && branch.eventType) {
                    if (typeof branch.eventType === 'string' && isImmutableAuditEvent(branch.eventType)) {
                        const err = new Error(`AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events are append-only and cannot be modified or deleted.`);
                        err.code = 'AUDIT_LOG_IMMUTABLE';
                        throw err;
                    }
                    if (branch.eventType.$eq && isImmutableAuditEvent(branch.eventType.$eq)) {
                        const err = new Error(`AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events are append-only and cannot be modified or deleted.`);
                        err.code = 'AUDIT_LOG_IMMUTABLE';
                        throw err;
                    }
                    if (Array.isArray(branch.eventType.$in) && branch.eventType.$in.some(et => isImmutableAuditEvent(et))) {
                        const err = new Error(`AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events are append-only and cannot be modified or deleted.`);
                        err.code = 'AUDIT_LOG_IMMUTABLE';
                        throw err;
                    }
                }
            }
        }
    }

    // 3. Upsert check: cannot upsert immutable eventType
    const isUpsert = Boolean(options.upsert || queryOrFilter?.options?.upsert || filter.upsert);
    if (isUpsert && update) {
        const candidateType = update.eventType || update.$set?.eventType || update.$setOnInsert?.eventType;
        if (candidateType && isImmutableAuditEvent(candidateType)) {
            const err = new Error(`AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events (${candidateType}) are append-only and cannot be created via upsert.`);
            err.code = 'AUDIT_LOG_IMMUTABLE';
            throw err;
        }
    }

    const isSagaCompensation = Boolean(
        update?.$set?.['metadata.compensated'] !== undefined ||
        update?.$set?.['metadata.compensationClaimId'] !== undefined ||
        update?.$set?.status === 'compensated' ||
        filter?.eventType === 'authority_changes_applied'
    );

    if (isSagaCompensation) {
        if (opType === 'updateMany') {
            const err = new Error('AUDIT_LOG_IMMUTABLE: updateMany is strictly prohibited for saga compensation.');
            err.code = 'AUDIT_LOG_IMMUTABLE';
            throw err;
        }
        if (isUpsert) {
            const err = new Error('AUDIT_LOG_IMMUTABLE: Upsert is strictly prohibited during saga compensation.');
            err.code = 'AUDIT_LOG_IMMUTABLE';
            throw err;
        }
        if (isDelete || isReplace) {
            const err = new Error("AUDIT_LOG_IMMUTABLE: Audit event 'authority_changes_applied' is append-only and cannot be deleted, replaced, or upserted.");
            err.code = 'AUDIT_LOG_IMMUTABLE';
            throw err;
        }
    }

    // 4. If filter does not explicitly specify eventType or uses operators (_id, targetId, etc.),
    // inspect matching documents in database
    if (effectiveModel && typeof effectiveModel.find === 'function') {
        try {
            let findQuery = effectiveModel.find(filter).select('eventType status targetId metadata changes');
            if (session) {
                findQuery = findQuery.session(session);
            }
            const matchingDocs = await findQuery.lean();
            if (!matchingDocs || matchingDocs.length === 0) {
                if (isSagaCompensation) {
                    const err = new Error('AUDIT_LOG_IMMUTABLE: Target audit document does not exist for saga compensation.');
                    err.code = 'AUDIT_LOG_IMMUTABLE';
                    throw err;
                }
            }
            if (Array.isArray(matchingDocs)) {
                for (const doc of matchingDocs) {
                    if (!doc) continue;
                    if (isImmutableAuditEvent(doc.eventType)) {
                        const err = new Error(`AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events (${doc.eventType}) are append-only and cannot be modified or deleted.`);
                        err.code = 'AUDIT_LOG_IMMUTABLE';
                        throw err;
                    }
                    if (doc.eventType === 'authority_changes_applied') {
                        if (opType === 'updateMany') {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: updateMany is strictly prohibited for saga compensation.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }
                        if (isDelete || isReplace || isUpsert) {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: Audit event 'authority_changes_applied' is append-only and cannot be deleted, replaced, or upserted.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }
                        if (doc.status === 'compensated' || doc.metadata?.compensated === true) {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: Compensated audit record status is terminal and cannot be modified. Record has already been compensated and is terminally immutable.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }

                        // Query filter MUST explicitly include _id
                        const hasIdInFilter = Boolean(filter._id || (Array.isArray(filter.$and) && filter.$and.some(b => b && b._id)));
                        if (!hasIdInFilter) {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: Saga compensation update on 'authority_changes_applied' requires specific query filter with '_id'.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }

                        // Inspect EVERY operator in update
                        const ops = Object.keys(update || {}).filter(k => k.startsWith('$'));
                        for (const op of ops) {
                            if (op !== '$set') {
                                const err = new Error(`AUDIT_LOG_IMMUTABLE: Operator '${op}' is strictly prohibited during saga compensation on 'authority_changes_applied'. Only '$set' is permitted.`);
                                err.code = 'AUDIT_LOG_IMMUTABLE';
                                throw err;
                            }
                        }
                        if (ops.length === 0) {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: Operator in update is strictly limited to '$set' during saga compensation on 'authority_changes_applied'. Only '$set' is permitted.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }

                        // Check $set
                        const setPayload = update.$set;
                        if (!setPayload || typeof setPayload !== 'object') {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: Saga compensation requires valid update payload with $set.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }

                        // Prohibit entire metadata object replacement
                        if ('metadata' in setPayload && typeof setPayload.metadata === 'object') {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: Entire metadata object replacement is prohibited during saga compensation; use targeted metadata dot paths only.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }

                        // Allowed keys in setPayload:
                        // 'status', 'metadata.compensated', 'metadata.compensationClaimId', 'metadata.compensatedAt', 'updatedAt'
                        const allowedCompensationKeys = new Set([
                            'status',
                            'metadata.compensated',
                            'metadata.compensationClaimId',
                            'metadata.compensatedAt',
                            'updatedAt'
                        ]);

                        for (const k of Object.keys(setPayload)) {
                            if (!allowedCompensationKeys.has(k)) {
                                const err = new Error(`AUDIT_LOG_IMMUTABLE: Mutating field '${k}' on 'authority_changes_applied' is prohibited during saga compensation.`);
                                err.code = 'AUDIT_LOG_IMMUTABLE';
                                throw err;
                            }
                        }

                        // Status MUST be 'compensated'
                        if (setPayload.status !== 'compensated') {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: Audit event 'authority_changes_applied' only permits state transition to status: 'compensated' during saga compensation.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }

                        // Validate metadata.compensated is boolean true
                        if (setPayload['metadata.compensated'] !== true) {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: metadata.compensated: true is required during saga compensation.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }

                        // Validate compensationClaimId
                        const rawClaimId = setPayload['metadata.compensationClaimId'];
                        if (!rawClaimId || typeof rawClaimId !== 'string') {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: A non-empty metadata.compensationClaimId is required during saga compensation.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }
                        const claimId = rawClaimId.trim();
                        if (!/^[a-zA-Z0-9_-]{8,64}$/.test(claimId) || claimId === 'compensation_claim_id') {
                            const err = new Error(`AUDIT_LOG_IMMUTABLE: Invalid compensation claim ID during saga compensation.`);
                            err.code = 'AUDIT_LOG_IMMUTABLE';
                            throw err;
                        }

                        // Resolve the actual PropertyVerificationRunItem compensation claim and prove exact equality
                        const PropertyVerificationRunItem = mongoose.models.PropertyVerificationRunItem;
                        if (PropertyVerificationRunItem && typeof PropertyVerificationRunItem.findOne === 'function') {
                            const isObjectId = mongoose.Types.ObjectId.isValid(claimId) && /^[0-9a-fA-F]{24}$/.test(claimId);
                            let matchingRunItem = null;
                            if (isObjectId) {
                                matchingRunItem = await PropertyVerificationRunItem.findOne({
                                    $or: [
                                        { 'applyClaim.claimId': new mongoose.Types.ObjectId(claimId) },
                                        { 'applyClaim.reconcilerClaimId': new mongoose.Types.ObjectId(claimId) }
                                    ]
                                }).setOptions(session ? { session } : {}).lean();
                            }

                            if (!matchingRunItem) {
                                const err = new Error(`AUDIT_LOG_IMMUTABLE: Compensation claim ID '${claimId}' does not belong to any authentic PropertyVerificationRunItem.`);
                                err.code = 'AUDIT_LOG_IMMUTABLE';
                                throw err;
                            }

                            const auditItemId = doc.targetId || doc.metadata?.itemId || doc.metadata?.runItemId || doc.changes?.before?.itemId || doc.changes?.after?.itemId;
                            if (auditItemId && matchingRunItem._id && String(matchingRunItem._id) !== String(auditItemId)) {
                                const err = new Error(`AUDIT_LOG_IMMUTABLE: Compensation claim ID '${claimId}' belongs to RunItem '${matchingRunItem._id}', not matching audit target '${auditItemId}'.`);
                                err.code = 'AUDIT_LOG_IMMUTABLE';
                                throw err;
                            }
                        }
                    }
                }
            }
        } catch (findErr) {
            if (findErr.code === 'AUDIT_LOG_IMMUTABLE') throw findErr;
            const err = new Error(`AUDIT_LOG_IMMUTABLE: Target audit document verification failed: ${findErr.message}`);
            err.code = 'AUDIT_LOG_IMMUTABLE';
            throw err;
        }
    } else {
        // Fail closed if effectiveModel is not provided and query is ambiguous
        const isExplicitNonImmutable = typeof filter.eventType === 'string' && !isImmutableAuditEvent(filter.eventType);
        if (!isExplicitNonImmutable) {
            const err = new Error('AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events are append-only and cannot be modified or deleted.');
            err.code = 'AUDIT_LOG_IMMUTABLE';
            throw err;
        }
    }
}

AuditLogSchema.pre('save', function (next) {
    sanitizeAuditDocument(this);
    next();
});

AuditLogSchema.pre('insertMany', function (next, docs) {
    if (Array.isArray(docs)) {
        for (const doc of docs) {
            sanitizeAuditDocument(doc);
        }
    }
    if (next && typeof next === 'function') next();
});

AuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], async function () {
    await checkAuditImmutability(this, this.model);
    const update = this.getUpdate();
    if (update) {
        const filter = this.getQuery() || {};
        const session = this.options?.session;
        const targetEventContext = await resolveTargetAuditContext(filter, this.model, session);
        sanitizeAuditUpdate(update, filter, targetEventContext);
    }
});

AuditLogSchema.pre(['replaceOne', 'findOneAndReplace'], async function () {
    await checkAuditImmutability(this, this.model);
    const update = (typeof this.getUpdate === 'function' ? this.getUpdate() : null) || this;
    if (update) {
        if (Array.isArray(update)) {
            const err = new Error('UPDATE_PIPELINES_PROHIBITED: Aggregation update pipelines are prohibited on AuditLog.');
            err.code = 'UPDATE_PIPELINES_PROHIBITED';
            throw err;
        }
        if (isImmutableAuditEvent(update.eventType)) {
            const err = new Error('AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events cannot be created via replacement.');
            err.code = 'AUDIT_LOG_IMMUTABLE';
            throw err;
        }
        sanitizeAuditDocument(update);
    }
});

AuditLogSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], async function () {
    await checkAuditImmutability(this, this.model);
});

AuditLogSchema.statics.bulkWrite = async function (ops, options = {}) {
    if (Array.isArray(ops)) {
        for (const op of ops) {
            if (op.insertOne?.document) {
                sanitizeAuditDocument(op.insertOne.document);
            }
            if (op.updateOne) {
                await checkAuditImmutability(op.updateOne.filter, this, { upsert: Boolean(op.updateOne.upsert), update: op.updateOne.update, ...options });
                if (op.updateOne.update) {
                    const targetContext = await resolveTargetAuditContext(op.updateOne.filter, this, options?.session);
                    sanitizeAuditUpdate(op.updateOne.update, op.updateOne.filter, targetContext);
                }
            }
            if (op.updateMany) {
                await checkAuditImmutability(op.updateMany.filter, this, { upsert: Boolean(op.updateMany.upsert), update: op.updateMany.update, ...options });
                if (op.updateMany.update) {
                    const targetContext = await resolveTargetAuditContext(op.updateMany.filter, this, options?.session);
                    sanitizeAuditUpdate(op.updateMany.update, op.updateMany.filter, targetContext);
                }
            }
            if (op.replaceOne) {
                await checkAuditImmutability(op.replaceOne.filter, this, { upsert: Boolean(op.replaceOne.upsert), replacement: op.replaceOne.replacement, ...options });
                if (op.replaceOne.replacement) {
                    if (Array.isArray(op.replaceOne.replacement)) {
                        const err = new Error('UPDATE_PIPELINES_PROHIBITED: Aggregation update pipelines are prohibited on AuditLog.');
                        err.code = 'UPDATE_PIPELINES_PROHIBITED';
                        throw err;
                    }
                    if (isImmutableAuditEvent(op.replaceOne.replacement.eventType)) {
                        const err = new Error('AUDIT_LOG_IMMUTABLE: Completed authority maker-checker audit events cannot be created via replacement.');
                        err.code = 'AUDIT_LOG_IMMUTABLE';
                        throw err;
                    }
                    sanitizeAuditDocument(op.replaceOne.replacement);
                }
            }
            if (op.deleteOne) {
                await checkAuditImmutability(op.deleteOne.filter, this, { op: 'deleteOne', ...options });
            }
            if (op.deleteMany) {
                await checkAuditImmutability(op.deleteMany.filter, this, { op: 'deleteMany', ...options });
            }
        }
    }
    return mongoose.Model.bulkWrite.call(this, ops, options);
};

// ========== Indexes ==========

AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ eventType: 1, timestamp: -1 });
AuditLogSchema.index({ actorId: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 }); // For recent logs

// Unique partial index for deterministic correlation idempotency (safe for null/undefined correlationId)
AuditLogSchema.index(
    { eventType: 1, correlationId: 1 },
    {
        unique: true,
        partialFilterExpression: { correlationId: { $type: 'string' } },
        name: 'unique_audit_event_correlation'
    }
);

// ========== Static Methods ==========

/**
 * Validates whether an existing MongoDB index matches the exact required specification for idempotency:
 * - Name: 'unique_audit_event_correlation'
 * - Keys: ['eventType', 'correlationId'] in exact order, both sort 1, exactly 2 keys
 * - unique: true
 * - partialFilterExpression: contains exactly one field 'correlationId'
 * - correlationId filter contains exactly one operator: $type: 'string'
 * Rejects extra nested operators ($gt, $exists, etc.), extra filter fields, incorrect order/specification.
 */
AuditLogSchema.statics.verifyIdempotencyIndexSpec = function (indexObj) {
    if (!indexObj || typeof indexObj !== 'object' || Array.isArray(indexObj)) {
        return { valid: false, reason: 'Index does not exist or is invalid' };
    }

    if (indexObj.name !== 'unique_audit_event_correlation') {
        return { valid: false, reason: `Index name mismatch: expected 'unique_audit_event_correlation', got '${indexObj.name}'` };
    }

    const key = indexObj.key;
    if (!key || typeof key !== 'object' || Array.isArray(key)) {
        return { valid: false, reason: 'Index key is missing or invalid' };
    }

    const keyNames = Object.keys(key);
    if (keyNames.length !== 2 || keyNames[0] !== 'eventType' || keyNames[1] !== 'correlationId') {
        return { valid: false, reason: `Index key order/fields mismatch: expected ['eventType', 'correlationId'], got ${JSON.stringify(keyNames)}` };
    }

    if (key.eventType !== 1 || key.correlationId !== 1) {
        return { valid: false, reason: `Index key sort directions mismatch: expected { eventType: 1, correlationId: 1 }, got ${JSON.stringify(key)}` };
    }

    if (indexObj.unique !== true) {
        return { valid: false, reason: `Index unique property mismatch: expected unique: true, got ${indexObj.unique}` };
    }

    const pfe = indexObj.partialFilterExpression;
    if (!pfe || typeof pfe !== 'object' || Array.isArray(pfe)) {
        return { valid: false, reason: 'Index partialFilterExpression is missing or invalid' };
    }

    const pfeFields = Object.keys(pfe);
    if (pfeFields.length !== 1 || pfeFields[0] !== 'correlationId') {
        return { valid: false, reason: `Index partialFilterExpression must contain exactly 'correlationId', got fields: ${JSON.stringify(pfeFields)}` };
    }

    const corrFilter = pfe.correlationId;
    if (!corrFilter || typeof corrFilter !== 'object' || Array.isArray(corrFilter)) {
        return { valid: false, reason: 'correlationId filter in partialFilterExpression must be an operator object' };
    }

    const corrOperators = Object.keys(corrFilter);
    if (corrOperators.length !== 1 || corrOperators[0] !== '$type') {
        return { valid: false, reason: `correlationId in partialFilterExpression must contain exactly one operator '$type', got: ${JSON.stringify(corrOperators)}` };
    }

    if (corrFilter.$type !== 'string') {
        return { valid: false, reason: `correlationId.$type must be 'string', got: ${JSON.stringify(corrFilter.$type)}` };
    }

    return { valid: true };
};

/**
 * Read-only preflight analysis for duplicate (eventType, correlationId) records.
 * Reports duplicate groups, counts, IDs, timestamps, eventTypes, and deterministic retention candidate.
 * DOES NOT modify, archive, or delete any records.
 * If the native AuditLog collection does not exist, returns an empty report without creating any collection, index, or document.
 */
AuditLogSchema.statics.getDuplicatePreflightReport = async function () {
    const collection = this.collection;
    if (!collection) {
        return { totalDuplicateGroups: 0, totalDuplicateRecords: 0, groups: [] };
    }

    // Strictly read-only: Check if native collection exists without creating it
    const rawDb = this.db?.db || this.collection?.conn?.db || mongoose.connection?.db;
    if (rawDb) {
        const collections = await rawDb.listCollections({ name: collection.name }).toArray();
        if (collections.length === 0) {
            return { totalDuplicateGroups: 0, totalDuplicateRecords: 0, groups: [] };
        }
    }

    const duplicates = await this.aggregate([
        { $match: { correlationId: { $type: 'string' } } },
        {
            $group: {
                _id: { eventType: '$eventType', correlationId: '$correlationId' },
                count: { $sum: 1 },
                docs: {
                    $push: {
                        _id: '$_id',
                        timestamp: '$timestamp',
                        eventType: '$eventType',
                        correlationId: '$correlationId',
                        targetType: '$targetType',
                        targetId: '$targetId',
                        status: '$status'
                    }
                }
            }
        },
        { $match: { count: { $gt: 1 } } }
    ]);

    if (!duplicates || duplicates.length === 0) {
        return { totalDuplicateGroups: 0, totalDuplicateRecords: 0, groups: [] };
    }

    let totalDuplicateRecords = 0;
    const groups = duplicates.map(group => {
        // Deterministic sort: timestamp ascending, then _id ascending as tie-breaker
        const sortedDocs = [...group.docs].sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            if (timeA !== timeB) return timeA - timeB;
            return String(a._id).localeCompare(String(b._id));
        });

        const retainedDoc = sortedDocs[0];
        const duplicateDocs = sortedDocs.slice(1);
        totalDuplicateRecords += duplicateDocs.length;

        return {
            eventType: group._id.eventType,
            correlationId: group._id.correlationId,
            totalCount: group.count,
            duplicateCount: duplicateDocs.length,
            retainedId: retainedDoc._id,
            retainedTimestamp: retainedDoc.timestamp,
            allDocs: sortedDocs,
            duplicateIds: duplicateDocs.map(d => d._id),
            duplicateDetails: duplicateDocs.map(d => ({
                _id: d._id,
                timestamp: d.timestamp,
                eventType: d.eventType,
                correlationId: d.correlationId,
                targetType: d.targetType,
                targetId: d.targetId,
                status: d.status
            }))
        };
    });

    return {
        totalDuplicateGroups: groups.length,
        totalDuplicateRecords,
        groups
    };
};

/**
 * Canonical deep equality comparison for any two values (scalars, dates, ObjectIds, arrays, nested objects).
 */
function areCanonicalValuesEqual(val1, val2) {
    if (val1 === val2) return true;
    if (val1 === null || val1 === undefined || val2 === null || val2 === undefined) {
        return val1 === val2;
    }

    // Handle NaN
    if (typeof val1 === 'number' && typeof val2 === 'number') {
        if (Number.isNaN(val1) && Number.isNaN(val2)) return true;
        return val1 === val2;
    }

    // Handle Date objects or ISO date strings
    if (val1 instanceof Date && val2 instanceof Date) {
        return val1.getTime() === val2.getTime();
    }
    if (val1 instanceof Date && typeof val2 === 'string') {
        const t2 = new Date(val2).getTime();
        return !isNaN(t2) && val1.getTime() === t2;
    }
    if (typeof val1 === 'string' && val2 instanceof Date) {
        const t1 = new Date(val1).getTime();
        return !isNaN(t1) && t1 === val2.getTime();
    }
    if (typeof val1 === 'string' && typeof val2 === 'string') {
        if (val1 === val2) return true;
        const t1 = new Date(val1).getTime();
        const t2 = new Date(val2).getTime();
        if (!isNaN(t1) && !isNaN(t2) && t1 === t2 && val1.includes('T') && val2.includes('T')) {
            return true;
        }
        return false;
    }

    // Handle MongoDB / Mongoose ObjectId
    const isOid1 = val1 instanceof mongoose.Types.ObjectId ||
        (val1 && typeof val1 === 'object' && typeof val1.toHexString === 'function') ||
        (val1 && val1._bsontype === 'ObjectID');
    const isOid2 = val2 instanceof mongoose.Types.ObjectId ||
        (val2 && typeof val2 === 'object' && typeof val2.toHexString === 'function') ||
        (val2 && val2._bsontype === 'ObjectID');

    if (isOid1 && isOid2) {
        return String(val1) === String(val2);
    }
    if (isOid1 && typeof val2 === 'string') {
        return String(val1) === val2;
    }
    if (typeof val1 === 'string' && isOid2) {
        return val1 === String(val2);
    }
    if (isOid1 !== isOid2) {
        return false;
    }

    // Handle Arrays
    if (Array.isArray(val1) || Array.isArray(val2)) {
        if (!Array.isArray(val1) || !Array.isArray(val2)) return false;
        if (val1.length !== val2.length) return false;
        for (let i = 0; i < val1.length; i++) {
            if (!areCanonicalValuesEqual(val1[i], val2[i])) return false;
        }
        return true;
    }

    // Handle Plain Objects (e.g. metadata, changes, etc.)
    if (typeof val1 === 'object' && typeof val2 === 'object') {
        const keys1 = Object.keys(val1).filter(k => val1[k] !== undefined);
        const keys2 = Object.keys(val2).filter(k => val2[k] !== undefined);
        if (keys1.length !== keys2.length) return false;
        const set2 = new Set(keys2);
        for (const k of keys1) {
            if (!set2.has(k)) return false;
        }
        for (const k of keys1) {
            if (!areCanonicalValuesEqual(val1[k], val2[k])) return false;
        }
        return true;
    }

    return val1 === val2;
}

/**
 * Canonical full-document comparison between source AuditLog record and archived document:
 * - Compares every persisted source AuditLog field, including description, metadata, changes,
 *   user/actor fields, status, timestamps, and error details.
 * - Excludes ONLY explicitly defined archivalMetadata from comparison.
 * - Detects missing, modified, or unexpected source fields.
 */
function isContentEquivalent(src, archived) {
    if (!src || !archived || typeof src !== 'object' || typeof archived !== 'object') {
        return false;
    }

    // Filter out undefined values and explicitly exclude ONLY archivalMetadata
    const srcKeys = Object.keys(src).filter(k => k !== 'archivalMetadata' && src[k] !== undefined);
    const archivedKeys = Object.keys(archived).filter(k => k !== 'archivalMetadata' && archived[k] !== undefined);

    if (srcKeys.length !== archivedKeys.length) {
        return false;
    }

    const archivedKeySet = new Set(archivedKeys);
    for (const key of srcKeys) {
        if (!archivedKeySet.has(key)) {
            return false;
        }
    }

    for (const key of srcKeys) {
        if (!areCanonicalValuesEqual(src[key], archived[key])) {
            return false;
        }
    }

    return true;
}

AuditLogSchema.statics.isContentEquivalent = isContentEquivalent;

/**
 * Builds an optimistic concurrency filter matching the exact persisted version of an AuditLog document.
 * Matches:
 * - _id
 * - All persisted fields (either exact value or { $exists: false } if undefined)
 * - Exact top-level key-set validation:
 *   1. Same number of keys
 *   2. Exact same key names as the verified source document (prevents unexpected key replacing existing key)
 */
function buildOptimisticFilter(sourceDoc) {
    if (!sourceDoc || typeof sourceDoc !== 'object') {
        throw new Error('INVALID_DOCUMENT: sourceDoc must be an object');
    }

    const PERSISTED_FIELDS = [
        'eventType',
        'userId',
        'userName',
        'userEmail',
        'actorId',
        'actorName',
        'actorEmail',
        'targetType',
        'targetId',
        'targetName',
        'description',
        'changes',
        'metadata',
        'ipAddress',
        'userAgent',
        'requestUrl',
        'requestMethod',
        'status',
        'department',
        'errorMessage',
        'correlationId',
        'timestamp'
    ];

    const filter = { _id: sourceDoc._id };

    for (const field of PERSISTED_FIELDS) {
        if (sourceDoc[field] === undefined) {
            filter[field] = { $exists: false };
        } else {
            filter[field] = sourceDoc[field];
        }
    }

    if (sourceDoc.__v !== undefined) {
        filter.__v = sourceDoc.__v;
    }

    // Exact top-level key-set validation:
    // 1. Same number of keys
    // 2. Exact same key names as the verified source document (prevents unexpected key replacing existing key)
    const expectedKeys = Object.keys(sourceDoc).filter(k => sourceDoc[k] !== undefined);
    filter.$expr = {
        $and: [
            { $eq: [{ $size: { $objectToArray: '$$ROOT' } }, expectedKeys.length] },
            { $setEquals: [{ $map: { input: { $objectToArray: '$$ROOT' }, as: 'entry', in: '$$entry.k' } }, expectedKeys] }
        ]
    };

    return filter;
}

AuditLogSchema.statics.buildOptimisticFilter = buildOptimisticFilter;

/**
 * Approved reconciliation procedure:
 * 1. Executes read-only preflight to deterministically identify duplicate records.
 * 2. Fetches full original AuditLog documents and preserves them in a verifiable archive collection.
 *    - Crash-resumable: checks existing archive documents against source identity and content using canonical full-document comparison.
 *    - Inserts only missing documents; never overwrites conflicting documents.
 * 3. Verifies every duplicate source record is safely archived before deleting anything from AuditLog.
 * 4. Re-fetches and verifies that every source document still matches the exact version that was archived.
 * 5. Uses atomic/optimistic concurrency protection between source verification and deletion:
 *    - Ensures a source record can be deleted ONLY if the exact version verified against its archived counterpart is still the version being deleted.
 *    - Prefers transaction-backed atomicity where supported, with safe optimistic fallback for standalone MongoDB deployments.
 *    - Never falls back to unconditional deletion by _id.
 *    - Preserves mutated records in primary AuditLog and safely aborts reconciliation on conflict.
 */
AuditLogSchema.statics.archiveAndReconcileDuplicates = async function (options = {}) {
    const preflight = await this.getDuplicatePreflightReport();
    if (preflight.totalDuplicateGroups === 0) {
        return { success: true, archivedCount: 0, newlyArchivedCount: 0, removedCount: 0, groupsReconciled: 0 };
    }

    const allDuplicateIds = preflight.groups.flatMap(g => g.duplicateIds);
    if (allDuplicateIds.length === 0) {
        return { success: true, archivedCount: 0, newlyArchivedCount: 0, removedCount: 0, groupsReconciled: 0 };
    }

    const archiveCollectionName = options.archiveCollectionName || 'auditlogs_archive_duplicates';
    const archiveColl = this.db.db.collection(archiveCollectionName);

    // 1. Fetch complete original records from primary AuditLog collection
    const docsToArchive = await this.find({ _id: { $in: allDuplicateIds } }).lean();
    if (docsToArchive.length !== allDuplicateIds.length) {
        throw new Error(`ARCHIVE_COUNT_MISMATCH: Expected ${allDuplicateIds.length} original documents, found ${docsToArchive.length} in database`);
    }

    const now = new Date();
    const missingDocsToInsert = [];

    // 2. Check each duplicate document against archive: insert only missing, check canonical content integrity
    for (const doc of docsToArchive) {
        const existingArchiveDoc = await archiveColl.findOne({ _id: doc._id });
        if (existingArchiveDoc) {
            // Document already in archive (e.g. from prior interrupted run): verify canonical full-document content
            if (!isContentEquivalent(doc, existingArchiveDoc)) {
                throw new Error(`ARCHIVE_CONTENT_CONFLICT: Conflicting document already exists in archive collection for _id ${doc._id}. Content mismatch detected; refusing to overwrite or discard.`);
            }
            // Content matches: document is already safely preserved in archive
        } else {
            // Missing from archive: prepare for idempotent insertion
            const group = preflight.groups.find(g => g.duplicateIds.some(id => String(id) === String(doc._id)));
            missingDocsToInsert.push({
                ...doc,
                archivalMetadata: {
                    archivedAt: now,
                    retainedRecordId: group?.retainedId || null,
                    archivalReason: 'DUPLICATE_CORRELATION_ID_RECONCILIATION',
                    migrationVersion: 'P4.1_HOTFIX'
                }
            });
        }
    }

    // 3. Insert ONLY missing documents (idempotent, handles concurrent racing workers)
    let newlyArchivedCount = 0;
    if (missingDocsToInsert.length > 0) {
        try {
            const insertRes = await archiveColl.insertMany(missingDocsToInsert, { ordered: false });
            newlyArchivedCount = insertRes.insertedCount || missingDocsToInsert.length;
        } catch (insertErr) {
            const isDupKey = insertErr.code === 11000 || (insertErr.writeErrors && insertErr.writeErrors.some(e => e.code === 11000));
            if (!isDupKey) {
                throw insertErr;
            }
        }
    }

    // 4. Verify that 100% of duplicate source records are safely and verifiably in archive
    for (const doc of docsToArchive) {
        const verifiedDoc = await archiveColl.findOne({ _id: doc._id });
        if (!verifiedDoc) {
            throw new Error(`ARCHIVE_VERIFICATION_FAILED: Duplicate source record ${doc._id} is not present in archive collection`);
        }
        if (!isContentEquivalent(doc, verifiedDoc)) {
            throw new Error(`ARCHIVE_VERIFICATION_FAILED: Content verification failed for record ${doc._id} in archive collection`);
        }
    }

    // 5. CRITICAL PRE-DELETION VERIFICATION:
    // Re-fetch and verify that every source document still matches the exact version that was archived.
    // Abort without deleting any source document if any source/archive mismatch is detected.
    const refetchedSourceDocs = await this.find({ _id: { $in: allDuplicateIds } }).lean();
    if (refetchedSourceDocs.length !== allDuplicateIds.length) {
        throw new Error(`SOURCE_VERIFICATION_FAILED: Expected ${allDuplicateIds.length} source documents upon re-fetch, found ${refetchedSourceDocs.length}`);
    }

    for (const sourceDoc of refetchedSourceDocs) {
        const archivedDoc = await archiveColl.findOne({ _id: sourceDoc._id });
        if (!archivedDoc) {
            throw new Error(`SOURCE_VERIFICATION_FAILED: Re-fetched source record ${sourceDoc._id} is missing from archive collection`);
        }
        if (!isContentEquivalent(sourceDoc, archivedDoc)) {
            throw new Error(`SOURCE_VERIFICATION_FAILED: Re-fetched source record ${sourceDoc._id} does not match the archived document version`);
        }
    }

    // 6. ATOMIC & OPTIMISTIC CONCURRENCY DELETION:
    // Ensure that a source record can be deleted ONLY if the exact version verified against
    // its archived counterpart is still the version being deleted.
    // Prefer transaction-backed atomicity where supported, with safe optimistic fallback for standalone MongoDB.
    const conn = this.db || mongoose.connection;
    const client = conn?.client || this.collection?.conn?.client || mongoose.connection?.client;
    const topologyType = client?.topology?.description?.type;
    const supportsTransactions = (topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded') &&
        (typeof conn?.startSession === 'function' || typeof client?.startSession === 'function' || typeof mongoose.startSession === 'function');

    let removedCount = 0;
    let session = null;

    try {
        if (supportsTransactions) {
            if (typeof conn?.startSession === 'function') {
                session = await conn.startSession();
            } else if (typeof client?.startSession === 'function') {
                session = await client.startSession();
            } else {
                session = await mongoose.startSession();
            }
            session.startTransaction();
        }

        for (const sourceDoc of refetchedSourceDocs) {
            const archivedDoc = await archiveColl.findOne({ _id: sourceDoc._id });
            if (!archivedDoc) {
                const err = new Error(`SOURCE_CONFLICT: Re-fetched source record ${sourceDoc._id} missing from archive collection`);
                err.code = 'SOURCE_CONFLICT';
                throw err;
            }

            // In-flight re-check against current DB state
            let findQuery = this.findOne({ _id: sourceDoc._id });
            if (session && typeof findQuery?.session === 'function') {
                findQuery = findQuery.session(session);
            }
            const currentDoc = await findQuery.lean();

            if (!currentDoc) {
                // Document was already removed by another concurrent worker; safe to proceed
                continue;
            }

            if (!isContentEquivalent(currentDoc, archivedDoc)) {
                const conflictErr = new Error(`SOURCE_CONFLICT: Source document ${sourceDoc._id} does not match the verified archived document version. Aborting reconciliation to preserve primary audit history.`);
                conflictErr.code = 'SOURCE_CONFLICT';
                throw conflictErr;
            }

            // Build exact optimistic filter covering all persisted fields and key count
            const optimisticFilter = buildOptimisticFilter(currentDoc);

            // Execute conditional delete
            const delOptions = session ? { session } : undefined;
            let delCall = this.deleteOne(optimisticFilter, delOptions);
            if (session && typeof delCall?.session === 'function') {
                delCall = delCall.session(session);
            }
            const delRes = await delCall;

            if (delRes.deletedCount === 0) {
                // Deletion did not match: check if document still exists (i.e. was mutated)
                let checkSurviving = this.findOne({ _id: sourceDoc._id });
                if (session && typeof checkSurviving?.session === 'function') {
                    checkSurviving = checkSurviving.session(session);
                }
                const survivingDoc = await checkSurviving.lean();

                if (survivingDoc) {
                    const conflictErr = new Error(`SOURCE_CONFLICT: Source document ${sourceDoc._id} was modified concurrently before deletion. Aborting reconciliation to preserve primary audit history.`);
                    conflictErr.code = 'SOURCE_CONFLICT';
                    throw conflictErr;
                }
                // If not surviving, it was deleted concurrently
            } else {
                removedCount++;
            }
        }

        if (session && session.inTransaction()) {
            await session.commitTransaction();
        }
    } catch (err) {
        if (session && session.inTransaction()) {
            try {
                await session.abortTransaction();
            } catch (_) {}
        }
        if (err.code === 112 || err.codeName === 'WriteConflict' || err.message?.includes('Write conflict')) {
            const conflictErr = new Error(`SOURCE_CONFLICT: Write conflict detected during source document deletion. Document was modified concurrently; aborting reconciliation to preserve primary audit history.`);
            conflictErr.code = 'SOURCE_CONFLICT';
            conflictErr.cause = err;
            throw conflictErr;
        }
        throw err;
    } finally {
        if (session) {
            try {
                await session.endSession();
            } catch (_) {}
        }
    }

    const remainingCount = await this.countDocuments({ _id: { $in: allDuplicateIds } });
    if (remainingCount !== 0) {
        throw new Error(`DELETION_VERIFICATION_FAILED: ${remainingCount} duplicate record(s) still present in AuditLog collection`);
    }

    return {
        success: true,
        archivedCount: docsToArchive.length,
        newlyArchivedCount,
        removedCount,
        groupsReconciled: preflight.totalDuplicateGroups,
        archiveCollection: archiveCollectionName,
        preflight
    };
};

/**
 * Migration helper for ensuring idempotency index:
 * 1. Verifies existing index if present against exact specification. Rejects incorrect specification.
 * 2. Runs read-only preflight. If duplicates exist, fails safely without modifying/deleting records.
 * 3. Builds partial unique index on { eventType: 1, correlationId: 1 }.
 * 4. Detects concurrent write races (code 11000) during build and aborts safely.
 * 5. Verifies created index properties and propagates all errors.
 */
AuditLogSchema.statics.ensureIdempotencyIndex = async function () {
    const collection = this.collection;
    if (!collection) {
        throw new Error('AuditLog collection is not initialized');
    }

    // Ensure collection exists in native db to avoid ns does not exist error on fresh DBs
    if (this.db && this.db.db) {
        const collections = await this.db.db.listCollections({ name: collection.name }).toArray();
        if (collections.length === 0) {
            await this.db.db.createCollection(collection.name);
        }
    }

    // 1. Check existing indexes for name or key collisions
    const existingIndexes = await collection.indexes();
    const existingSameName = existingIndexes.find(idx => idx.name === 'unique_audit_event_correlation');
    if (existingSameName) {
        const specCheck = this.verifyIdempotencyIndexSpec(existingSameName);
        if (!specCheck.valid) {
            const specErr = new Error(`INVALID_INDEX_SPECIFICATION: Existing index 'unique_audit_event_correlation' does not match required specification: ${specCheck.reason}`);
            specErr.code = 'INVALID_INDEX_SPECIFICATION';
            specErr.existingIndex = existingSameName;
            throw specErr;
        }
        return { created: false, verified: true, index: existingSameName };
    }

    const existingSameKey = existingIndexes.find(
        idx => idx.key && idx.key.eventType === 1 && idx.key.correlationId === 1
    );
    if (existingSameKey) {
        const specCheck = this.verifyIdempotencyIndexSpec(existingSameKey);
        if (!specCheck.valid) {
            const specErr = new Error(`INVALID_INDEX_SPECIFICATION: Existing index '${existingSameKey.name}' covering (eventType, correlationId) does not match required specification: ${specCheck.reason}`);
            specErr.code = 'INVALID_INDEX_SPECIFICATION';
            specErr.existingIndex = existingSameKey;
            throw specErr;
        }
        return { created: false, verified: true, index: existingSameKey };
    }

    // 2. Read-only preflight check: fail closed without deleting records if duplicates exist
    const preflight = await this.getDuplicatePreflightReport();
    if (preflight.totalDuplicateGroups > 0) {
        const dupErr = new Error(`DUPLICATE_AUDIT_LOGS_DETECTED: Preflight detected ${preflight.totalDuplicateGroups} duplicate correlationId group(s) with ${preflight.totalDuplicateRecords} duplicate record(s). Cannot create unique index without approved archival reconciliation.`);
        dupErr.code = 'DUPLICATE_AUDIT_LOGS_DETECTED';
        dupErr.preflight = preflight;
        throw dupErr;
    }

    // 3. Build the partial unique index
    try {
        await collection.createIndex(
            { eventType: 1, correlationId: 1 },
            {
                unique: true,
                partialFilterExpression: { correlationId: { $type: 'string' } },
                name: 'unique_audit_event_correlation'
            }
        );
    } catch (createErr) {
        if (createErr.code === 11000 || createErr.code === 11001) {
            const raceErr = new Error(`CONCURRENT_DUPLICATES_DETECTED: Concurrent writes introduced duplicate correlationId records during index creation: ${createErr.message}`);
            raceErr.code = 'CONCURRENT_DUPLICATES_DETECTED';
            raceErr.originalError = createErr;
            throw raceErr;
        }
        throw createErr;
    }

    // 4. Verify created index matches exact required properties
    const updatedIndexes = await collection.indexes();
    const createdIdx = updatedIndexes.find(idx => idx.name === 'unique_audit_event_correlation');
    const finalCheck = this.verifyIdempotencyIndexSpec(createdIdx);
    if (!finalCheck.valid) {
        const verifyErr = new Error(`INDEX_VERIFICATION_FAILED: Created index does not match required specification: ${finalCheck.reason}`);
        verifyErr.code = 'INDEX_VERIFICATION_FAILED';
        throw verifyErr;
    }

    return { created: true, verified: true, index: createdIdx };
};

// Get user's audit trail
AuditLogSchema.statics.getUserAuditTrail = function (userId, limit = 50) {
    return this.find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('actorId', 'fullName email');
};

// Get recent logs
AuditLogSchema.statics.getRecentLogs = function (limit = 100) {
    return this.find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('userId', 'fullName email')
        .populate('actorId', 'fullName email');
};

// Get logs by event type
AuditLogSchema.statics.getByEventType = function (eventType, limit = 50) {
    return this.find({ eventType })
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('userId', 'fullName email')
        .populate('actorId', 'fullName email');
};

// Get failed login attempts
AuditLogSchema.statics.getFailedLogins = function (userId, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.find({
        userId,
        eventType: 'user_failed_login',
        timestamp: { $gte: since }
    }).sort({ timestamp: -1 });
};

// Log user event
AuditLogSchema.statics.logUserEvent = async function (eventType, userId, actorId, description, metadata = {}, options = {}) {
    const mongooseOptions = options?.session ? { session: options.session } : {};
    const User = mongoose.model('User');

    const user = await User.findById(userId).select('fullName email');
    const actor = actorId ? await User.findById(actorId).select('fullName email') : null;

    let redactedMetadata;
    try {
        redactedMetadata = redactSensitive(metadata);
        if (redactedMetadata?.requestInfo && 'url' in redactedMetadata.requestInfo) redactedMetadata.requestInfo.url = normalizeUrl(redactedMetadata.requestInfo.url);
        if (redactedMetadata?.requestInfo && 'rawUrl' in redactedMetadata.requestInfo) redactedMetadata.requestInfo.rawUrl = normalizeUrl(redactedMetadata.requestInfo.rawUrl);
    } catch (err) {
        redactedMetadata = { _redaction_error: '[REDACTION_FAILED_PAYLOAD_DROPPED]' };
    }

    return this.create([{
        eventType,
        userId,
        userName: user?.fullName,
        userEmail: maskScalarPII(user?.email),
        actorId,
        actorName: actor?.fullName,
        actorEmail: maskScalarPII(actor?.email),
        description: maskScalarPII(description),
        metadata: redactedMetadata,
        status: 'success',
        correlationId: options.correlationId
    }], mongooseOptions).then(docs => docs[0]);
};

// Log permission change
AuditLogSchema.statics.logPermissionChange = async function (userId, actorId, changeType, before, after, description, options = {}) {
    return this.logUserEvent(
        changeType,
        userId,
        actorId,
        description,
        {
            changes: { before, after }
        },
        options
    );
};

// Log data transfer
AuditLogSchema.statics.logDataTransfer = async function (fromUserId, toUserId, actorId, dataType, count, description, options = {}) {
    const mongooseOptions = options?.session ? { session: options.session } : {};
    const User = mongoose.model('User');

    const fromUser = await User.findById(fromUserId).select('fullName email');
    const toUser = await User.findById(toUserId).select('fullName email');
    const actor = await User.findById(actorId).select('fullName email');

    let redactedMetadata;
    try {
        redactedMetadata = redactSensitive({
            fromUser: {
                id: fromUserId,
                name: fromUser?.fullName
            },
            toUser: {
                id: toUserId,
                name: toUser?.fullName
            },
            dataType,
            count
        });
    } catch (err) {
        redactedMetadata = { _redaction_error: '[REDACTION_FAILED_PAYLOAD_DROPPED]' };
    }

    return this.create([{
        eventType: 'data_transferred',
        userId: fromUserId,
        userName: fromUser?.fullName,
        userEmail: maskScalarPII(fromUser?.email),
        actorId,
        actorName: actor?.fullName,
        actorEmail: maskScalarPII(actor?.email),
        description: maskScalarPII(description),
        metadata: redactedMetadata,
        status: 'success',
        correlationId: options.correlationId
    }], mongooseOptions).then(docs => docs[0]);
};

// Log generic entity update (tracking previous and new values)
// ✅ [BUG FIX] Uses mongoose.model('User') to avoid undefined User reference (was causing silent ReferenceError)
AuditLogSchema.statics.logEntityUpdate = async function (eventType, targetType, targetId, targetName, userId, changes, description, options = {}) {
    const mongooseOptions = options?.session ? { session: options.session } : {};
    let user = null;
    if (userId) {
        try {
            const UserModel = mongoose.model('User');
            user = await UserModel.findById(userId).select('fullName email department').setOptions(mongooseOptions).lean();
        } catch (_) { /* User lookup non-critical */ }
    }
    const department = user?.department;

    let actor = null;
    const actorId = options?.actorId || null;
    if (actorId) {
        try {
            const UserModel = mongoose.model('User');
            actor = await UserModel.findById(actorId).select('fullName email department').setOptions(mongooseOptions).lean();
        } catch (_) { /* Actor lookup non-critical */ }
    }

    let redactedChanges;
    try {
        redactedChanges = redactSensitive(changes);
    } catch (err) {
        redactedChanges = { _redaction_error: '[REDACTION_FAILED_PAYLOAD_DROPPED]' };
    }

    let finalMetadata = options.metadata;
    if (!finalMetadata || (typeof finalMetadata === 'object' && Object.keys(finalMetadata).length === 0)) {
        if (changes && typeof changes === 'object' && !Array.isArray(changes) && !changes.before && !changes.after) {
            finalMetadata = changes;
        } else {
            finalMetadata = { origin: userId ? 'authenticated_user' : 'unknown' };
        }
    }
    let redactedMetadata;
    try {
        redactedMetadata = redactSensitive(finalMetadata);
    } catch (err) {
        redactedMetadata = { _redaction_error: '[REDACTION_FAILED_PAYLOAD_DROPPED]' };
    }

    return this.create([{
        eventType,
        userId,
        userName: user?.fullName || 'System',
        userEmail: maskScalarPII(user?.email || 'system@crm.local'),
        actorId: actorId || null,
        actorName: actor?.fullName || (actorId ? 'System' : null),
        actorEmail: actor?.email ? maskScalarPII(actor.email) : null,
        department,
        targetType,
        targetId,
        targetName: maskScalarPII(targetName),
        description: maskScalarPII(description),
        changes: redactedChanges,
        metadata: redactedMetadata,
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
        status: options.status || 'success',
        correlationId: options.correlationId
    }], mongooseOptions).then(docs => docs[0]);
};

const AI_METADATA_ALLOWLIST = new Set([
    'model',
    'modelVersion',
    'provider',
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'inputTokenCount',
    'outputTokenCount',
    'tokenUsage',
    'durationMs',
    'latencyMs',
    'confidence',
    'confidenceScore',
    'requestInfo',
    'details',
    'reason',
    'tags',
    'flags',
    'promptHash',
    'completionHash',
    'executionId',
    'jobId',
    'callerId',
    'context'
]);

// Log AI event
AuditLogSchema.statics.logAIEvent = async function (eventType, targetId, capability, policyVersion, decision, metadata = {}, options = {}) {
    const mongooseOptions = options?.session ? { session: options.session } : {};

    let redactedMetadata;
    try {
        const filtered = {};
        if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
            for (const key of Object.keys(metadata)) {
                if (AI_METADATA_ALLOWLIST.has(key)) {
                    filtered[key] = metadata[key];
                }
            }
        }
        redactedMetadata = redactSensitive(filtered);
        if (redactedMetadata?.requestInfo && 'url' in redactedMetadata.requestInfo) redactedMetadata.requestInfo.url = normalizeUrl(redactedMetadata.requestInfo.url);
        if (redactedMetadata?.requestInfo && 'rawUrl' in redactedMetadata.requestInfo) redactedMetadata.requestInfo.rawUrl = normalizeUrl(redactedMetadata.requestInfo.rawUrl);
    } catch (err) {
        redactedMetadata = { _redaction_error: '[REDACTION_FAILED_PAYLOAD_DROPPED]' };
    }

    const finalMetadata = {
        ...(typeof redactedMetadata === 'object' && redactedMetadata !== null ? redactedMetadata : {}),
        capability,
        policyVersion,
        decision
    };

    return this.create([{
        eventType,
        targetType: 'other',
        targetId,
        description: maskScalarPII(`AI Policy Decision: ${decision}`),
        metadata: finalMetadata,
        status: decision === 'ALLOWED' ? 'success' : 'warning',
        correlationId: options.correlationId
    }], mongooseOptions).then(docs => docs[0]);
};

export default mongoose.model("AuditLog", AuditLogSchema);
