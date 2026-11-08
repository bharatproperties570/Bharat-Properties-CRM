import mongoose from 'mongoose';
import crypto from 'crypto';
import { CANONICAL_ORGANIZATION_ID, CANONICAL_ORGANIZATION_ID_STRING } from '../config/canonicalOrganization.js';

/**
 * AuthoritySourceSettings
 * 
 * Stores per-authority configuration, approval state, rate/concurrency policy,
 * and scheduling flags. One document per authority source per tenant.
 * 
 * All sources default to DISABLED with permission NOT_OBTAINED.
 * Activation requires: written approval evidence, approved access method,
 * confirmed rate policy, and verified source identity rules.
 */

const AUTHORITY_CODES = ['HSVP', 'CHD', 'GMADA'];

const PERMISSION_STATUSES = [
    'NOT_OBTAINED',      // No permission requested or granted
    'REQUESTED',         // Formal request submitted
    'PENDING_REVIEW',    // User evidence or request submitted, awaiting review
    'GRANTED',           // Written permission obtained
    'EXPIRED',           // Previously granted but expired
    'REVOKED',           // Previously granted but revoked
    'SUSPENDED'          // Temporarily suspended
];

const ACCESS_METHODS = [
    'NONE',                                 // No approved method
    'PUBLIC_API',                           // Official public API
    'AUTHORIZED_PORTAL',                    // Authorized portal access with credentials
    'DATA_SHARING_MOU',                     // Formal data-sharing agreement
    'RTI_RESPONSE',                         // Information obtained via RTI
    'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION'   // Phase 4.4.4 verified public portal automation
];

const PRIVATE_INTERNAL_WORKFLOW_SECRET = crypto.randomBytes(32).toString('hex');
export const INTERNAL_WORKFLOW_OPTION = '__internalWorkflowToken';

// Process-local, expiry-aware, bounded nonce registry to prevent token replay
// Scope: Process-local. Internal workflow capability tokens are non-transferable across worker processes.
const CONSUMED_WORKFLOW_NONCES = new Map(); // nonce -> expiresAt (number)
const WORKFLOW_TOKEN_MAX_TTL_MS = 300000; // 5 minutes

export function purgeExpiredNonces() {
    const now = Date.now();
    for (const [nonce, expiresAt] of CONSUMED_WORKFLOW_NONCES.entries()) {
        if (expiresAt <= now) {
            CONSUMED_WORKFLOW_NONCES.delete(nonce);
        }
    }
}

// Periodic cleanup every 60 seconds (purges ONLY expired nonces; never unexpired ones)
setInterval(purgeExpiredNonces, 60000).unref();

export function _getConsumedWorkflowNoncesCount() {
    return CONSUMED_WORKFLOW_NONCES.size;
}

export function createAuthorizedInternalWorkflowToken(workflowName, context = {}) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const tenantId = context.tenantId ? String(context.tenantId) : CANONICAL_ORGANIZATION_ID_STRING;
    const targetId = context.targetId ? String(context.targetId) : (context.authorityCode ? String(context.authorityCode) : '*');
    const authorityCode = context.authorityCode ? String(context.authorityCode) : (context.targetId ? String(context.targetId) : '*');
    const evidenceVersion = context.evidenceVersion !== undefined ? String(context.evidenceVersion) : '*';

    const payload = `${workflowName}:${tenantId}:${targetId}:${authorityCode}:${evidenceVersion}:${nonce}:${timestamp}`;
    const hmac = crypto.createHmac('sha256', PRIVATE_INTERNAL_WORKFLOW_SECRET)
        .update(payload)
        .digest('hex');
    return {
        workflowName,
        tenantId,
        targetId,
        authorityCode,
        evidenceVersion,
        nonce,
        timestamp,
        hmac
    };
}

export function verifyAuthorizedInternalWorkflow(options, allowedWorkflows = ['recordSourceApprover', 'reviewSourceApproval', 'ensureDefaults', 'recordOwnerConfirmation', 'authorizedReplacement', 'internal_seed'], expectedContext = {}) {
    if (!options || typeof options !== 'object') return false;
    const token = options[INTERNAL_WORKFLOW_OPTION];
    if (!token || typeof token !== 'object') return false;
    const { workflowName, tenantId, targetId, authorityCode, evidenceVersion, nonce, timestamp, hmac } = token;

    if (!workflowName || !allowedWorkflows.includes(workflowName)) return false;
    if (!tenantId || tenantId !== CANONICAL_ORGANIZATION_ID_STRING) return false;
    if (expectedContext.tenantId && String(expectedContext.tenantId) !== CANONICAL_ORGANIZATION_ID_STRING) return false;

    // Rule 1 & 2: Do not accept wildcard targetId or wildcard evidenceVersion for individual approval workflows
    if (workflowName === 'recordSourceApprover' || workflowName === 'reviewSourceApproval') {
        if (!targetId || targetId === '*') return false;
        if (evidenceVersion === undefined || evidenceVersion === '*') return false;
    }

    // Rule 3 & 4: Compare targetId and authorityCode
    if (expectedContext.targetId && targetId && targetId !== '*') {
        const expTarget = String(expectedContext.targetId);
        const targetMatch = targetId === expTarget ||
            (expectedContext.authorityCode && targetId === String(expectedContext.authorityCode)) ||
            (authorityCode && authorityCode === expTarget);
        if (!targetMatch) return false;
    }
    if (expectedContext.authorityCode) {
        const expAuth = String(expectedContext.authorityCode);
        const authMatch = targetId === expAuth ||
            (authorityCode && authorityCode === expAuth) ||
            (expectedContext.targetId && targetId === String(expectedContext.targetId));
        if (!authMatch) return false;
    }

    // Rule 6: Verify exact evidence version
    if (expectedContext.evidenceVersion !== undefined) {
        if (evidenceVersion === undefined || evidenceVersion === '*') return false;
        if (String(expectedContext.evidenceVersion) !== String(evidenceVersion)) return false;
    }

    if (!nonce || typeof nonce !== 'string') return false;

    // Single-use nonce verification: check if already consumed
    const now = Date.now();
    if (CONSUMED_WORKFLOW_NONCES.has(nonce)) {
        const expiresAt = CONSUMED_WORKFLOW_NONCES.get(nonce);
        if (expiresAt > now) {
            // If this query options object already verified this exact nonce during this query lifecycle, allow idempotent pass
            if (options._authorizedTokenVerified === nonce) {
                return true;
            }
            return false; // Replay detected!
        }
    }

    if (!timestamp || typeof timestamp !== 'number') return false;
    if (Math.abs(now - timestamp) > WORKFLOW_TOKEN_MAX_TTL_MS) return false; // Expired!

    try {
        const payload = `${workflowName}:${tenantId}:${targetId || '*'}:${authorityCode || '*'}:${evidenceVersion !== undefined ? evidenceVersion : '*'}:${nonce}:${timestamp}`;
        const expectedHmac = crypto.createHmac('sha256', PRIVATE_INTERNAL_WORKFLOW_SECRET)
            .update(payload)
            .digest('hex');
        const hmacBuf = Buffer.from(hmac || '', 'hex');
        const expectedBuf = Buffer.from(expectedHmac, 'hex');
        if (hmacBuf.length !== expectedBuf.length) return false;
        const isValid = crypto.timingSafeEqual(hmacBuf, expectedBuf);
        if (isValid) {
            // Consume the nonce with its expiration time
            CONSUMED_WORKFLOW_NONCES.set(nonce, timestamp + WORKFLOW_TOKEN_MAX_TTL_MS);
            options._authorizedTokenVerified = nonce;
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

const AuthoritySourceSettingsSchema = new mongoose.Schema({
    // ========== Identity ==========
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    authorityCode: {
        type: String,
        required: true,
        enum: {
            values: AUTHORITY_CODES,
            message: '{VALUE} is not a valid authority code'
        },
        index: true
    },

    // ========== Authorization State ==========
    permissionStatus: {
        type: String,
        required: true,
        enum: PERMISSION_STATUSES,
        default: 'NOT_OBTAINED'
    },
    evidenceBasis: {
        type: String,
        enum: ['NOT_APPLICABLE', 'OWNER_ATTESTED_AUTHORITY_PERMISSION', 'OFFICIAL_WRITTEN_LETTER'],
        default: 'NOT_APPLICABLE',
        index: true
    },
    ownerAttestation: {
        attestingParty: { type: String, default: null },
        attestedAt: { type: Date, default: null },
        scope: { type: String, default: null },
        notes: { type: String, default: null },
        claimedAuthorityRole: { type: String, default: null }
    },
    policyVersion: {
        type: String,
        default: null  // e.g. '2024-Q3-v1'
    },
    approvedAccessMethod: {
        type: String,
        enum: ACCESS_METHODS,
        default: 'NONE'
    },
    permittedFields: {
        type: [String],
        default: []  // Which canonical fields this source is authorized to provide
    },

    // ========== Approval Evidence & Phase 4.4.4 Authorization Lifecycle ==========
    approvalReference: {
        type: String,
        default: null  // e.g. 'Letter ref: HSVP/IT/2024/1234'
    },
    makerCheckerAuditLogId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AuditLog',
        default: null
    },
    permissionArtifactUri: {
        type: String,
        default: null  // URI or reference to official written authorization document
    },
    secureEvidenceId: {
        type: String,
        default: null  // SHA-256 or secure evidence vault identifier
    },
    issuedBy: {
        type: String,
        default: null  // Official department or authority signatory name
    },
    authorityRole: {
        type: String,
        default: null  // Official role/designation of the authority signatory
    },
    authorizationScope: {
        type: String,
        default: null  // Explicit scope of authorized use
    },
    commercialUseAuthorized: {
        type: Boolean,
        default: false // Whether commercial CRM processing is authorized
    },
    readOnlySearchAuthorized: {
        type: Boolean,
        default: false // Whether automated read-only lookup is explicitly authorized
    },
    termsReviewed: {
        type: Boolean,
        default: false // Whether current terms and conditions have been formally reviewed
    },
    termsReference: {
        type: String,
        default: null  // Document reference or URL of reviewed terms
    },
    contractVerificationStatus: {
        type: String,
        enum: ['NOT_VERIFIED', 'VERIFIED_CONTRACT', 'LIVE_VERIFIED'],
        default: 'NOT_VERIFIED'
    },
    contractEvidenceReference: {
        type: String,
        default: null
    },
    evidenceVersion: {
        type: Number,
        default: 1
    },
    evidenceHash: {
        type: String,
        default: null
    },
    retentionPolicy: {
        maxCacheHours: { type: Number, default: 24 },
        purgePersonalDataImmediately: { type: Boolean, default: true }
    },
    approvalDate: {
        type: Date,
        default: null
    },
    approvalExpiryDate: {
        type: Date,
        default: null
    },
    internalReviewExpiryDate: {
        type: Date,
        default: null
    },
    reviewStatus: {
        type: String,
        enum: ['NOT_REVIEWED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'],
        default: 'NOT_REVIEWED'
    },
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    submittedAt: {
        type: Date,
        default: null
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },

    // ========== User-Reported Evidence Metadata ==========
    // Captures verbal / preliminary confirmation claims without treating them as formal approvals
    userReportedEvidence: {
        reportedBy: { type: String, default: null },
        reportedAt: { type: Date, default: null },
        claimedAuthorityRole: { type: String, default: null },
        notes: { type: String, default: null },
        verificationStatus: {
            type: String,
            enum: ['UNVERIFIED', 'PENDING_WRITTEN_REFERENCE', 'VALIDATED', 'REJECTED'],
            default: 'UNVERIFIED'
        }
    },

    // ========== Rate & Concurrency Policy ==========
    // These are NOT guessed — they must come from the authority's terms
    ratePolicy: {
        maxRequestsPerMinute: { type: Number, default: null },
        maxRequestsPerHour: { type: Number, default: null },
        maxRequestsPerDay: { type: Number, default: null },
        minIntervalMs: { type: Number, default: null },
        minimumIntervalMs: { type: Number, default: null },
        maxConcurrent: { type: Number, default: null },
        cooldownSeconds: { type: Number, default: null },
        isInternalSafetyThrottle: { type: Boolean, default: false },
        policySource: { type: String, default: null }  // Reference to authority's rate policy document
    },

    // ========== Durable Fence Watermark (Phase 4.4.4 Finding 6) ==========
    lastCommittedFenceToken: {
        type: Number,
        default: 0,
        index: true
    },

    // ========== Operational Flags ==========
    isEnabled: {
        type: Boolean,
        default: false  // Must be explicitly enabled after all activation checks pass
    },
    isPaused: {
        type: Boolean,
        default: false  // Temporary pause without revoking permission
    },
    schedulingEnabled: {
        type: Boolean,
        default: false  // Weekly schedule disabled by default
    },
    scheduleCron: {
        type: String,
        default: null   // e.g. '0 2 * * 1' for Monday 2am IST
    },
    scheduleTimezone: {
        type: String,
        default: 'Asia/Kolkata'
    },

    // ========== Last/Next Run Metadata ==========
    lastRunId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyVerificationRun',
        default: null
    },
    lastRunAt: {
        type: Date,
        default: null
    },
    lastRunStatus: {
        type: String,
        enum: ['SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED', 'PAUSED', null],
        default: null
    },
    nextScheduledAt: {
        type: Date,
        default: null
    },

    // ========== Source Identity Rules ==========
    // Which identity fields are required/optional for this authority
    identityRequirements: {
        required: { type: [String], default: [] },   // e.g. ['sectorNumber', 'propertyId']
        optional: { type: [String], default: [] },   // e.g. ['phaseCode', 'urbanEstate']
        verified: { type: Boolean, default: false },   // Are these requirements confirmed with real data?
        attestation: {
            evidenceReference: { type: String, default: null },
            evidenceVersion: { type: Number, default: null },
            evidenceHash: { type: String, default: null },
            attestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            attestedAt: { type: Date, default: null }
        }
    }
}, {
    timestamps: true,
    collection: 'authority_source_settings'
});

// ========== Indexes ==========
AuthoritySourceSettingsSchema.index(
    { tenantId: 1, authorityCode: 1 },
    { unique: true }  // One settings doc per authority per tenant
);

// ========== Server-Side Activation Lock & Gate (Phase 4.4.4 Lifecycle) ==========
// Sources remain strictly offline and fixture-only until complete, independently verified Phase 4.4.4 approval records exist.
AuthoritySourceSettingsSchema.pre('save', async function (next) {
    // Identity immutability check on existing documents
    if (!this.isNew) {
        if (this.isModified('tenantId')) {
            const err = new Error('IMMUTABLE_IDENTITY_PROHIBITED: tenantId is immutable and cannot be changed.');
            err.code = 'IMMUTABLE_IDENTITY_PROHIBITED';
            if (next && typeof next === 'function') return next(err);
            throw err;
        }
        if (this.isModified('authorityCode')) {
            const err = new Error('IMMUTABLE_IDENTITY_PROHIBITED: authorityCode is immutable and cannot be changed.');
            err.code = 'IMMUTABLE_IDENTITY_PROHIBITED';
            if (next && typeof next === 'function') return next(err);
            throw err;
        }
    }

    // Single-organization enforcement: All documents must belong to canonical organization
    if (this.tenantId && String(this.tenantId) !== CANONICAL_ORGANIZATION_ID_STRING) {
        const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: AuthoritySourceSettings can only belong to canonical organization '${CANONICAL_ORGANIZATION_ID_STRING}'. Foreign organization '${this.tenantId}' is prohibited.`);
        err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
        if (next && typeof next === 'function') return next(err);
        throw err;
    }

    if (this.isEnabled || this.schedulingEnabled) {
        const check = this.checkActivationEligibility();
        if (!check.canActivate) {
            this.reviewStatus = 'UNDER_REVIEW';
            this.isEnabled = false;
            this.schedulingEnabled = false;
            const err = new Error(`SOURCE_ACTIVATION_LOCKED: Live authority activation and scheduling are prohibited without complete, independently verified Phase 4.4.4 approval record. Blockers: ${check.blockers.join('; ')}`);
            err.code = 'ACTIVATION_LOCKED_PHASE3';
            err.blockers = check.blockers;
            if (next && typeof next === 'function') return next(err);
            throw err;
        }
    }

    // Authenticated user and audit verification when reviewStatus is APPROVED for owner-attested portal automation
    const isOwnerAttestedPortal = this.evidenceBasis === 'OWNER_ATTESTED_AUTHORITY_PERMISSION' &&
        this.approvedAccessMethod === 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION';

    if (this.reviewStatus === 'APPROVED' && isOwnerAttestedPortal) {
        const userCheck = await AuthoritySourceSettingsSchema.statics.verifyMakerCheckerUsers({
            submitterId: this.submittedBy,
            approverId: this.approvedBy,
            reviewerId: this.reviewedBy,
            approvalReference: this.approvalReference,
            makerCheckerAuditLogId: this.makerCheckerAuditLogId,
            authorityCode: this.authorityCode,
            tenantId: this.tenantId,
            settingsId: this._id,
            session: this.$session ? this.$session() : undefined
        });
        if (!userCheck.valid) {
            this.reviewStatus = 'UNDER_REVIEW';
            this.isEnabled = false;
            this.schedulingEnabled = false;
            const err = new Error(`SOURCE_ACTIVATION_LOCKED: Maker-checker user/RBAC verification failed: ${userCheck.reason}`);
            err.code = 'ACTIVATION_LOCKED_PHASE3';
            err.blockers = [userCheck.reason];
            if (next && typeof next === 'function') return next(err);
            throw err;
        }
    }
    if (next && typeof next === 'function') next();
});

export const IMMUTABLE_IDENTITY_FIELDS = [
    'tenantId',
    'authorityCode'
];

export function isImmutableIdentityPath(path) {
    if (!path || typeof path !== 'string') return false;
    const clean = path.trim();
    return IMMUTABLE_IDENTITY_FIELDS.some(idf => clean === idf || clean.startsWith(idf + '.'));
}

export const PROTECTED_FIELDS = [
    'tenantId',
    'authorityCode',
    'reviewStatus',
    'approvedBy',
    'approvedAt',
    'reviewedBy',
    'reviewedAt',
    'submittedBy',
    'submittedAt',
    'makerCheckerAuditLogId',
    'approvalReference',
    'approvalDate',
    'approvalExpiryDate',
    'internalReviewExpiryDate',
    'isEnabled',
    'schedulingEnabled',
    'identityRequirements',
    'evidenceVersion',
    'evidenceHash',
    'permissionStatus',
    'evidenceBasis',
    'contractVerificationStatus',
    'contractEvidenceReference',
    'commercialUseAuthorized',
    'readOnlySearchAuthorized',
    'termsReviewed',
    'termsReference',
    'ownerAttestation',
    'userReportedEvidence',
    'permissionArtifactUri',
    'secureEvidenceId',
    'issuedBy',
    'authorityRole',
    'authorizationScope',
    'approvedAccessMethod',
    'policyVersion',
    'permittedFields'
];

export function isProtectedPath(path) {
    if (!path || typeof path !== 'string') return false;
    const clean = path.trim();
    return PROTECTED_FIELDS.some(pf => {
        if (clean === pf) return true;
        if (clean.startsWith(pf + '.')) return true;
        if (pf.startsWith(clean + '.')) return true;
        return false;
    });
}

const RECOGNIZED_UPDATE_OPERATORS = new Set([
    '$set',
    '$setOnInsert',
    '$unset',
    '$rename',
    '$inc',
    '$mul',
    '$min',
    '$max',
    '$currentDate',
    '$push',
    '$addToSet',
    '$pull',
    '$pullAll',
    '$pop',
    '$comment'
]);

const SAFE_DEACTIVATION_RESETS = {
    isEnabled: (v) => v === false,
    schedulingEnabled: (v) => v === false,
    permissionStatus: (v) => v === 'NOT_OBTAINED',
    reviewStatus: (v) => v === 'DRAFT' || v === 'NOT_REVIEWED',
    isPaused: (v) => typeof v === 'boolean',
    approvedBy: (v) => v === null,
    reviewedBy: (v) => v === null,
    submittedBy: (v) => v === null,
    makerCheckerAuditLogId: (v) => v === null,
    approvalReference: (v) => v === null,
    approvalExpiryDate: (v) => v === null,
    approvedAccessMethod: (v) => v === 'NONE',
    evidenceBasis: (v) => v === 'NOT_APPLICABLE'
};

function isSafeDeactivationReset(setObj) {
    if (!setObj || typeof setObj !== 'object') return false;
    const keys = Object.keys(setObj);
    if (keys.length === 0) return false;
    const protectedKeys = keys.filter(k => isProtectedPath(k));
    if (protectedKeys.length === 0) return true;
    return protectedKeys.every(k => {
        const validator = SAFE_DEACTIVATION_RESETS[k];
        return typeof validator === 'function' && validator(setObj[k]);
    });
}

export function validateOrganizationFilter(filter, { isUpsert = false, path = '' } = {}) {
    if (!filter || typeof filter !== 'object') {
        if (isUpsert) {
            const err = new Error(`CANONICAL_ORGANIZATION_REQUIRED: Upsert operations must explicitly include canonical tenantId '${CANONICAL_ORGANIZATION_ID_STRING}' in the filter.`);
            err.code = 'CANONICAL_ORGANIZATION_REQUIRED';
            throw err;
        }
        return;
    }

    // Check tenantId at current level
    if ('tenantId' in filter) {
        const val = filter.tenantId;
        if (val === null || val === undefined) {
            const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: tenantId cannot be null or undefined. Must be canonical '${CANONICAL_ORGANIZATION_ID_STRING}'.`);
            err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
            throw err;
        }
        if (typeof val === 'object' && !val._bsontype && typeof val.toHexString !== 'function') {
            if ('$in' in val && Array.isArray(val.$in)) {
                for (const item of val.$in) {
                    if (String(item) !== CANONICAL_ORGANIZATION_ID_STRING) {
                        const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Filter $in contains non-canonical organization '${item}'.`);
                        err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
                        throw err;
                    }
                }
            }
            if ('$eq' in val && String(val.$eq) !== CANONICAL_ORGANIZATION_ID_STRING) {
                const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Filter $eq specifies non-canonical organization '${val.$eq}'.`);
                err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
                throw err;
            }
            if ('$ne' in val && String(val.$ne) === CANONICAL_ORGANIZATION_ID_STRING) {
                const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Filter $ne excludes canonical organization.`);
                err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
                throw err;
            }
            if ('$nin' in val && Array.isArray(val.$nin) && val.$nin.some(x => String(x) === CANONICAL_ORGANIZATION_ID_STRING)) {
                const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Filter $nin excludes canonical organization.`);
                err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
                throw err;
            }
        } else {
            if (String(val) !== CANONICAL_ORGANIZATION_ID_STRING) {
                const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Filter tenantId '${val}' does not match canonical organization '${CANONICAL_ORGANIZATION_ID_STRING}'.`);
                err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
                throw err;
            }
        }
    }

    // Recursively validate logical operators: $and, $or, $nor
    for (const op of ['$and', '$or', '$nor']) {
        if (op in filter && Array.isArray(filter[op])) {
            for (const subFilter of filter[op]) {
                validateOrganizationFilter(subFilter, { isUpsert: false, path: `${path}.${op}` });
            }
        }
    }

    if (isUpsert && !extractCanonicalTenantFromFilter(filter)) {
        const err = new Error(`CANONICAL_ORGANIZATION_REQUIRED: Upsert operations must explicitly include canonical tenantId '${CANONICAL_ORGANIZATION_ID_STRING}' in the filter.`);
        err.code = 'CANONICAL_ORGANIZATION_REQUIRED';
        throw err;
    }
}

export function extractCanonicalTenantFromFilter(filter) {
    if (!filter || typeof filter !== 'object') return false;
    if (filter.tenantId && String(filter.tenantId) === CANONICAL_ORGANIZATION_ID_STRING) return true;
    if (Array.isArray(filter.$and)) {
        return filter.$and.some(sub => extractCanonicalTenantFromFilter(sub));
    }
    return false;
}

// Prohibit generic replaceOne and findOneAndReplace on AuthoritySourceSettings
AuthoritySourceSettingsSchema.pre(['replaceOne', 'findOneAndReplace'], function (next) {
    const options = this.getOptions() || {};
    if (options.isAuthorizedReviewWorkflow !== undefined) {
        const err = new Error('UNAUTHORIZED_INTERNAL_WORKFLOW: Caller-controlled boolean override is prohibited on AuthoritySourceSettings.');
        err.code = 'UNAUTHORIZED_INTERNAL_WORKFLOW';
        return next(err);
    }
    if (!verifyAuthorizedInternalWorkflow(options, ['authorizedReplacement'])) {
        const err = new Error('REPLACEMENT_PROHIBITED: Generic replacement operations (replaceOne, findOneAndReplace) are prohibited on AuthoritySourceSettings to prevent lifecycle circumvention.');
        err.code = 'REPLACEMENT_PROHIBITED';
        return next(err);
    }
    next();
});

// Guard against updateOne / findOneAndUpdate / updateMany circumvention
AuthoritySourceSettingsSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], async function (next) {
    const update = this.getUpdate();
    if (!update) return next();

    // Reject update pipelines
    if (Array.isArray(update)) {
        const err = new Error('UPDATE_PIPELINES_PROHIBITED: Aggregation pipeline updates are strictly prohibited on AuthoritySourceSettings.');
        err.code = 'UPDATE_PIPELINES_PROHIBITED';
        return next(err);
    }

    const options = this.getOptions() || {};

    // Reject caller-controlled boolean spoofing
    if (options.isAuthorizedReviewWorkflow !== undefined && !verifyAuthorizedInternalWorkflow(options)) {
        const err = new Error('UNAUTHORIZED_INTERNAL_WORKFLOW: Unauthorized internal workflow circumvention attempt detected. Caller-controlled boolean override is prohibited.');
        err.code = 'UNAUTHORIZED_INTERNAL_WORKFLOW';
        return next(err);
    }

    // Check for unrecognized update operators
    for (const key of Object.keys(update)) {
        if (key.startsWith('$') && !RECOGNIZED_UPDATE_OPERATORS.has(key)) {
            const err = new Error(`UNRECOGNIZED_UPDATE_OPERATOR_PROHIBITED: Update operator '${key}' is unrecognized or prohibited on AuthoritySourceSettings.`);
            err.code = 'UNRECOGNIZED_UPDATE_OPERATOR_PROHIBITED';
            return next(err);
        }
    }

    // Canonical organization enforcement on query filter
    const queryFilter = this.getQuery() || {};
    try {
        validateOrganizationFilter(queryFilter, { isUpsert: Boolean(options.upsert) });
    } catch (filterErr) {
        return next(filterErr);
    }

    if (options.upsert) {
        const candidateInsert = { ...(update.$setOnInsert || {}), ...(update.$set || {}) };
        for (const k of Object.keys(update)) {
            if (!k.startsWith('$')) candidateInsert[k] = update[k];
        }
        const isAuth = verifyAuthorizedInternalWorkflow(options);
        const hasProtectedActiveState = Object.keys(candidateInsert).some(k => {
            if (isProtectedPath(k)) {
                const v = candidateInsert[k];
                if (k === 'isEnabled' && v === true) return true;
                if (k === 'schedulingEnabled' && v === true) return true;
                if (k === 'reviewStatus' && (v === 'APPROVED' || v === 'REJECTED')) return true;
                if ((k === 'approvedBy' || k === 'reviewedBy' || k === 'submittedBy' || k === 'makerCheckerAuditLogId') && v) return true;
                if (k === 'identityRequirements' && typeof v === 'object' && v?.verified === true) return true;
                if (k === 'identityRequirements.verified' && v === true) return true;
                if (k === 'permissionStatus' && v === 'GRANTED') return true;
                if (k === 'approvalReference' && v) return true;
            }
            return false;
        });

        if (!isAuth && hasProtectedActiveState) {
            const err = new Error('SECURITY_UPSERT_PROHIBITED: Cannot insert active, scheduled, approved, or protected metadata via unauthorized upsert.');
            err.code = 'SECURITY_UPSERT_PROHIBITED';
            return next(err);
        }

        const setOnInsert = update.$setOnInsert || {};
        const set = update.$set || {};
        const candidateTenant = setOnInsert.tenantId || set.tenantId || update.tenantId;
        if (!candidateTenant) {
            const err = new Error(`CANONICAL_ORGANIZATION_REQUIRED: Upsert operations must explicitly include canonical tenantId '${CANONICAL_ORGANIZATION_ID_STRING}' in the update payload ($setOnInsert).`);
            err.code = 'CANONICAL_ORGANIZATION_REQUIRED';
            return next(err);
        }
        if (String(candidateTenant) !== CANONICAL_ORGANIZATION_ID_STRING) {
            const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Upsert for non-canonical organization '${candidateTenant}' is prohibited.`);
            err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
            return next(err);
        }
    }

    // Identity immutability enforcement: tenantId and authorityCode must never be mutated
    for (const opName of ['$set', '$unset', '$rename', '$inc', '$mul', '$min', '$max', '$currentDate', '$push', '$addToSet', '$pull', '$pullAll', '$pop']) {
        if (update[opName] && typeof update[opName] === 'object') {
            for (const key of Object.keys(update[opName])) {
                if (isImmutableIdentityPath(key) || (opName === '$rename' && isImmutableIdentityPath(update[opName][key]))) {
                    const err = new Error(`IMMUTABLE_IDENTITY_PROHIBITED: Modification of identity field '${key}' is strictly prohibited.`);
                    err.code = 'IMMUTABLE_IDENTITY_PROHIBITED';
                    return next(err);
                }
            }
        }
    }
    for (const key of Object.keys(update)) {
        if (!key.startsWith('$') && isImmutableIdentityPath(key)) {
            const err = new Error(`IMMUTABLE_IDENTITY_PROHIBITED: Modification of identity field '${key}' is strictly prohibited.`);
            err.code = 'IMMUTABLE_IDENTITY_PROHIBITED';
            return next(err);
        }
    }

    // Scan all touched paths across all operators
    const touchedProtectedPaths = [];

    // Check non-$ top-level keys
    for (const key of Object.keys(update)) {
        if (!key.startsWith('$') && isProtectedPath(key)) {
            touchedProtectedPaths.push(key);
        }
    }

    // Check $rename
    if (update.$rename && typeof update.$rename === 'object') {
        for (const [fromKey, toKey] of Object.entries(update.$rename)) {
            if (isProtectedPath(fromKey) || isProtectedPath(toKey)) {
                const err = new Error(`PROTECTED_FIELD_RENAME_PROHIBITED: Renaming protected field '${fromKey}' is prohibited.`);
                err.code = 'PROTECTED_FIELD_RENAME_PROHIBITED';
                return next(err);
            }
        }
    }

    // Check $unset
    if (update.$unset && typeof update.$unset === 'object') {
        for (const key of Object.keys(update.$unset)) {
            if (isProtectedPath(key)) {
                const err = new Error(`PROTECTED_FIELD_UNSET_PROHIBITED: Unsetting protected field '${key}' is prohibited.`);
                err.code = 'PROTECTED_FIELD_UNSET_PROHIBITED';
                return next(err);
            }
        }
    }

    // Check arithmetic / array operators: $inc, $mul, $min, $max, $currentDate, $push, $addToSet, $pull, $pullAll, $pop
    for (const op of ['$inc', '$mul', '$min', '$max', '$currentDate', '$push', '$addToSet', '$pull', '$pullAll', '$pop']) {
        if (update[op] && typeof update[op] === 'object') {
            for (const key of Object.keys(update[op])) {
                if (isProtectedPath(key)) {
                    const err = new Error(`PROTECTED_FIELD_UPDATE_PROHIBITED: Modifying protected field '${key}' via operator '${op}' is prohibited.`);
                    err.code = 'PROTECTED_FIELD_UPDATE_PROHIBITED';
                    return next(err);
                }
            }
        }
    }

    const isAuthorized = verifyAuthorizedInternalWorkflow(options);

    const set = update.$set ? { ...update.$set } : {};
    const setOnInsert = update.$setOnInsert ? { ...update.$setOnInsert } : {};

    for (const key of Object.keys(update)) {
        if (!key.startsWith('$')) {
            set[key] = update[key];
        }
    }

    const token = options ? options[INTERNAL_WORKFLOW_OPTION] : null;
    if (token && typeof token === 'object') {
        const workflowName = token.workflowName;
        if (workflowName === 'recordSourceApprover') {
            const allowedPaths = new Set([
                'submittedBy', 'approvedBy', 'approvedAt', 'approvalReference',
                'permissionStatus', 'reviewStatus', 'evidenceVersion', 'approvalExpiryDate',
                'userReportedEvidence', 'updatedAt', 'isEnabled', 'schedulingEnabled'
            ]);
            for (const k of Object.keys(set)) {
                const root = k.split('.')[0];
                if (!allowedPaths.has(root)) {
                    const err = new Error(`SCOPE_VIOLATION_PROHIBITED: Workflow 'recordSourceApprover' attempted to modify disallowed field '${k}'.`);
                    err.code = 'SCOPE_VIOLATION_PROHIBITED';
                    return next(err);
                }
                if ((k === 'isEnabled' || k === 'schedulingEnabled') && set[k] === true) {
                    const err = new Error(`SCOPE_VIOLATION_PROHIBITED: Workflow 'recordSourceApprover' cannot enable source or scheduling.`);
                    err.code = 'SCOPE_VIOLATION_PROHIBITED';
                    return next(err);
                }
            }
        } else if (workflowName === 'reviewSourceApproval') {
            const allowedPaths = new Set([
                'reviewedBy', 'reviewedAt', 'permissionStatus', 'reviewStatus',
                'makerCheckerAuditLogId', 'internalReviewExpiryDate', 'identityRequirements',
                'userReportedEvidence', 'reviewNotes', 'updatedAt', 'isEnabled', 'schedulingEnabled'
            ]);
            for (const k of Object.keys(set)) {
                const root = k.split('.')[0];
                if (!allowedPaths.has(root)) {
                    const err = new Error(`SCOPE_VIOLATION_PROHIBITED: Workflow 'reviewSourceApproval' attempted to modify disallowed field '${k}'.`);
                    err.code = 'SCOPE_VIOLATION_PROHIBITED';
                    return next(err);
                }
                if ((k === 'isEnabled' || k === 'schedulingEnabled') && set[k] === true) {
                    const err = new Error(`SCOPE_VIOLATION_PROHIBITED: Workflow 'reviewSourceApproval' cannot enable source or scheduling.`);
                    err.code = 'SCOPE_VIOLATION_PROHIBITED';
                    return next(err);
                }
            }
        }
    }

    const query = this.getQuery();
    const docs = await this.model.find(query).setOptions(options.session ? { session: options.session } : {});

    // Check upsert when no existing document matches
    if (docs.length === 0) {
        if (options.upsert) {
            const candidateInsert = { ...setOnInsert, ...set };
            const { CANONICAL_ORGANIZATION_ID } = await import('../config/canonicalOrganization.js');
            const canonStr = String(CANONICAL_ORGANIZATION_ID);
            const targetTenantId = candidateInsert.tenantId || query.tenantId;
            if (targetTenantId && String(targetTenantId) !== canonStr) {
                const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Upsert for non-canonical organization ${targetTenantId} is prohibited.`);
                err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
                return next(err);
            }

            const candidateKeys = Object.keys(candidateInsert);
            const hasProtectedActiveState = candidateKeys.some(k => {
                if (isProtectedPath(k)) {
                    const v = candidateInsert[k];
                    if (k === 'isEnabled' && v === true) return true;
                    if (k === 'schedulingEnabled' && v === true) return true;
                    if (k === 'reviewStatus' && (v === 'APPROVED' || v === 'REJECTED')) return true;
                    if ((k === 'approvedBy' || k === 'reviewedBy' || k === 'submittedBy' || k === 'makerCheckerAuditLogId') && v) return true;
                    if (k === 'identityRequirements' && typeof v === 'object' && v?.verified === true) return true;
                    if (k === 'identityRequirements.verified' && v === true) return true;
                    if (k === 'permissionStatus' && v === 'GRANTED') return true;
                    if (k === 'approvalReference' && v) return true;
                }
                return false;
            });
            if (!isAuthorized && hasProtectedActiveState) {
                const err = new Error('SECURITY_UPSERT_PROHIBITED: Cannot insert active, scheduled, approved, or protected metadata via unauthorized upsert.');
                err.code = 'SECURITY_UPSERT_PROHIBITED';
                return next(err);
            }
        }
        return next();
    }

    for (const doc of docs) {
        if (token && typeof token === 'object') {
            if (token.workflowName === 'recordSourceApprover' || token.workflowName === 'reviewSourceApproval') {
                if (token.targetId && token.targetId !== '*' && String(token.targetId) !== String(doc._id) && token.targetId !== doc.authorityCode) {
                    const err = new Error(`UNAUTHORIZED_INTERNAL_WORKFLOW: Internal workflow token targetId '${token.targetId}' does not match document ID '${doc._id}' or authority code '${doc.authorityCode}'.`);
                    err.code = 'UNAUTHORIZED_INTERNAL_WORKFLOW';
                    return next(err);
                }
                if (token.authorityCode && token.authorityCode !== '*' && token.authorityCode !== doc.authorityCode) {
                    const err = new Error(`UNAUTHORIZED_INTERNAL_WORKFLOW: Internal workflow token authorityCode '${token.authorityCode}' does not match document authority code '${doc.authorityCode}'.`);
                    err.code = 'UNAUTHORIZED_INTERNAL_WORKFLOW';
                    return next(err);
                }
                if (token.evidenceVersion !== undefined && token.evidenceVersion !== '*' && String(token.evidenceVersion) !== String(doc.evidenceVersion)) {
                    const err = new Error(`UNAUTHORIZED_INTERNAL_WORKFLOW: Internal workflow token evidenceVersion '${token.evidenceVersion}' does not match document evidenceVersion '${doc.evidenceVersion}'.`);
                    err.code = 'UNAUTHORIZED_INTERNAL_WORKFLOW';
                    return next(err);
                }
            }
        }

        // Build merged candidate state taking dotted paths into account
        const merged = doc.toObject();
        for (const [k, v] of Object.entries(set)) {
            if (k.includes('.')) {
                const parts = k.split('.');
                let curr = merged;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!curr[parts[i]] || typeof curr[parts[i]] !== 'object') curr[parts[i]] = {};
                    curr = curr[parts[i]];
                }
                curr[parts[parts.length - 1]] = v;
            } else {
                merged[k] = v;
            }
        }

        const isOwnerAttestedPortal = merged.evidenceBasis === 'OWNER_ATTESTED_AUTHORITY_PERMISSION' &&
            merged.approvedAccessMethod === 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION';

        // 1. If final merged state enables source or scheduling, enforce full activation eligibility first
        if (merged.isEnabled === true || merged.schedulingEnabled === true) {
            if (merged.reviewStatus !== 'APPROVED') {
                const err = new Error(`SOURCE_ACTIVATION_LOCKED: Cannot enable or schedule authority source while reviewStatus is ${merged.reviewStatus}. Source must be APPROVED.`);
                err.code = 'ACTIVATION_LOCKED_PHASE3';
                err.blockers = [`Review status is ${merged.reviewStatus}, must be APPROVED`];
                return next(err);
            }

            if (isOwnerAttestedPortal) {
                const tempInstance = new this.model(merged);
                const check = tempInstance.checkActivationEligibility();
                if (!check.canActivate) {
                    const err = new Error(`SOURCE_ACTIVATION_LOCKED: Live authority activation and scheduling are prohibited without complete, independently verified approval record. Blockers: ${check.blockers.join('; ')}`);
                    err.code = 'ACTIVATION_LOCKED_PHASE3';
                    err.blockers = check.blockers;
                    return next(err);
                }
            }
        }

        // 2. If final merged state is APPROVED, verify authentic maker-checker evidence
        if (merged.reviewStatus === 'APPROVED' && isOwnerAttestedPortal) {
            const userCheck = await AuthoritySourceSettingsSchema.statics.verifyMakerCheckerUsers({
                submitterId: merged.submittedBy,
                approverId: merged.approvedBy,
                reviewerId: merged.reviewedBy,
                approvalReference: merged.approvalReference,
                makerCheckerAuditLogId: merged.makerCheckerAuditLogId,
                authorityCode: merged.authorityCode,
                tenantId: merged.tenantId,
                settingsId: doc._id,
                evidenceVersion: merged.evidenceVersion,
                session: options.session
            });
            if (!userCheck.valid) {
                const err = new Error(`MAKER_CHECKER_APPROVAL_REJECTED: ${userCheck.reason}`);
                err.code = 'MAKER_CHECKER_APPROVAL_REJECTED';
                return next(err);
            }
        }
    }

    // 3. For any other protected field modified via $set without authorized internal workflow
    if (!isAuthorized) {
        if (!isSafeDeactivationReset(set)) {
            for (const k of Object.keys(set)) {
                if (isProtectedPath(k)) {
                    const err = new Error(`PROTECTED_FIELD_UPDATE_PROHIBITED: Direct modification of protected field '${k}' is prohibited without authorized internal workflow.`);
                    err.code = 'PROTECTED_FIELD_UPDATE_PROHIBITED';
                    return next(err);
                }
            }
        }
    }

    next();
});

// Enforce lifecycle protection against insertMany circumvention
AuthoritySourceSettingsSchema.pre('insertMany', async function (next, docs) {
    if (!Array.isArray(docs)) return next();
    const isAuthorized = verifyAuthorizedInternalWorkflow(this?.options, ['ensureDefaults', 'recordOwnerConfirmation']);

    for (const doc of docs) {
        const d = doc || {};
        const targetTenantId = d.tenantId ? String(d.tenantId) : null;
        if (!targetTenantId || targetTenantId !== CANONICAL_ORGANIZATION_ID_STRING) {
            const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Insertion for non-canonical organization ${targetTenantId} is prohibited.`);
            err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
            if (next && typeof next === 'function') return next(err);
            throw err;
        }

        // Generic insertMany without authorized internal workflow must fail closed
        if (!isAuthorized) {
            const err = new Error('DIRECT_INSERT_MANY_PROHIBITED: Generic insertMany for AuthoritySourceSettings is strictly prohibited.');
            err.code = 'DIRECT_INSERT_MANY_PROHIBITED';
            if (next && typeof next === 'function') return next(err);
            throw err;
        }

        // Validate authority code
        if (!d.authorityCode || !AUTHORITY_CODES.includes(d.authorityCode)) {
            const err = new Error(`INVALID_AUTHORITY_CODE: Authority code '${d.authorityCode}' is invalid.`);
            err.code = 'INVALID_AUTHORITY_CODE';
            if (next && typeof next === 'function') return next(err);
            throw err;
        }

        // Even with internal authorization, validate that dangerous active, verified, or approved states cannot be introduced
        if (d.isEnabled === true || d.schedulingEnabled === true ||
            d.reviewStatus === 'APPROVED' || d.reviewStatus === 'REJECTED' ||
            d.commercialUseAuthorized === true || d.termsReviewed === true ||
            d.contractVerificationStatus === 'VERIFIED_CONTRACT' ||
            d.identityRequirements?.verified === true ||
            d.approvedBy || d.reviewedBy || d.submittedBy || d.makerCheckerAuditLogId) {
            const err = new Error('DIRECT_INSERT_MANY_PROHIBITED: insertMany cannot introduce pre-approved, verified, or active state.');
            err.code = 'DIRECT_INSERT_MANY_PROHIBITED';
            if (next && typeof next === 'function') return next(err);
            throw err;
        }
    }
    if (next && typeof next === 'function') next();
});

// Prohibit bulk update attempts from circumventing activation checks
AuthoritySourceSettingsSchema.statics.bulkWrite = async function (ops, options = {}) {
    if (Array.isArray(ops)) {
        const isEnsureDefaults = verifyAuthorizedInternalWorkflow(options, ['ensureDefaults']);

        for (const op of ops) {
            // Delete operations are strictly prohibited
            if (op.deleteOne || op.deleteMany) {
                const err = new Error('BULK_DELETE_PROHIBITED: Arbitrary bulk deletion of AuthoritySourceSettings is strictly prohibited.');
                err.code = 'BULK_DELETE_PROHIBITED';
                throw err;
            }

            if (op.replaceOne) {
                const err = new Error('DIRECT_BULK_WRITE_PROHIBITED: Bulk replacement attempts cannot circumvent activation checks. Generic replacement via bulkWrite is strictly prohibited.');
                err.code = 'DIRECT_BULK_WRITE_PROHIBITED';
                throw err;
            }

            if (op.insertOne) {
                const doc = op.insertOne.document || {};
                const targetTenant = doc.tenantId ? String(doc.tenantId) : null;
                if (!targetTenant || targetTenant !== CANONICAL_ORGANIZATION_ID_STRING) {
                    const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Bulk insertion for non-canonical organization '${targetTenant}' is prohibited.`);
                    err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
                    throw err;
                }
                const hasProtected = Object.keys(doc).some(k => isProtectedPath(k) && doc[k] !== undefined && doc[k] !== null);
                if (hasProtected && !verifyAuthorizedInternalWorkflow(options, ['ensureDefaults', 'recordOwnerConfirmation'])) {
                    const err = new Error('DIRECT_BULK_WRITE_PROHIBITED: Bulk insert attempts cannot circumvent activation checks. Direct insertion of protected fields via bulkWrite is strictly prohibited.');
                    err.code = 'DIRECT_BULK_WRITE_PROHIBITED';
                    throw err;
                }
            }

            const action = op.updateOne || op.updateMany;
            if (action) {
                const filter = action.filter || {};
                validateOrganizationFilter(filter, { isUpsert: Boolean(action.upsert) });

                const u = action.update || {};
                if (Array.isArray(u)) {
                    const err = new Error('UPDATE_PIPELINES_PROHIBITED: Bulk update pipelines are strictly prohibited.');
                    err.code = 'UPDATE_PIPELINES_PROHIBITED';
                    throw err;
                }

                // Check identity immutability in bulk updates
                for (const opName of ['$set', '$unset', '$rename', '$inc', '$mul', '$min', '$max', '$currentDate', '$push', '$addToSet', '$pull', '$pullAll', '$pop']) {
                    if (u[opName] && typeof u[opName] === 'object') {
                        for (const k of Object.keys(u[opName])) {
                            if (isImmutableIdentityPath(k) || (opName === '$rename' && isImmutableIdentityPath(u[opName][k]))) {
                                const err = new Error(`IMMUTABLE_IDENTITY_PROHIBITED: Modification of identity field '${k}' via bulkWrite is strictly prohibited.`);
                                err.code = 'IMMUTABLE_IDENTITY_PROHIBITED';
                                throw err;
                            }
                        }
                    }
                }
                for (const key of Object.keys(u)) {
                    if (!key.startsWith('$') && isImmutableIdentityPath(key)) {
                        const err = new Error(`IMMUTABLE_IDENTITY_PROHIBITED: Modification of identity field '${key}' via bulkWrite is strictly prohibited.`);
                        err.code = 'IMMUTABLE_IDENTITY_PROHIBITED';
                        throw err;
                    }
                }

                // Upsert validation
                if (action.upsert) {
                    if (!extractCanonicalTenantFromFilter(filter)) {
                        const err = new Error(`CANONICAL_ORGANIZATION_REQUIRED: Upsert operations must explicitly include canonical tenantId '${CANONICAL_ORGANIZATION_ID_STRING}' in the filter.`);
                        err.code = 'CANONICAL_ORGANIZATION_REQUIRED';
                        throw err;
                    }
                    const setOnInsert = u.$setOnInsert || {};
                    const set = u.$set || {};
                    const targetTenant = setOnInsert.tenantId || set.tenantId;
                    if (!targetTenant) {
                        const err = new Error(`CANONICAL_ORGANIZATION_REQUIRED: Upsert operations must explicitly include canonical tenantId '${CANONICAL_ORGANIZATION_ID_STRING}' in the update payload ($setOnInsert).`);
                        err.code = 'CANONICAL_ORGANIZATION_REQUIRED';
                        throw err;
                    }
                    if (String(targetTenant) !== CANONICAL_ORGANIZATION_ID_STRING) {
                        const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Bulk upsert for non-canonical organization '${targetTenant}' is prohibited.`);
                        err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
                        throw err;
                    }
                }

                if (!isEnsureDefaults) {
                    // Any direct bulkWrite update touching ANY protected field is prohibited
                    for (const key of Object.keys(u)) {
                        if (!key.startsWith('$') && isProtectedPath(key)) {
                            const err = new Error(`DIRECT_BULK_WRITE_PROHIBITED: Bulk update attempts cannot circumvent activation checks. Direct modification of protected field '${key}' via bulkWrite is strictly prohibited.`);
                            err.code = 'DIRECT_BULK_WRITE_PROHIBITED';
                            throw err;
                        }
                    }
                    for (const opName of ['$set', '$setOnInsert', '$unset', '$rename', '$inc', '$mul', '$min', '$max', '$currentDate', '$push', '$addToSet', '$pull', '$pullAll', '$pop']) {
                        if (u[opName] && typeof u[opName] === 'object') {
                            for (const k of Object.keys(u[opName])) {
                                if (isProtectedPath(k) || (opName === '$rename' && isProtectedPath(u[opName][k]))) {
                                    const err = new Error(`DIRECT_BULK_WRITE_PROHIBITED: Bulk update attempts cannot circumvent activation checks. Direct modification of protected field '${k}' via bulkWrite is strictly prohibited.`);
                                    err.code = 'DIRECT_BULK_WRITE_PROHIBITED';
                                    throw err;
                                }
                            }
                        }
                    }
                } else {
                    // When isEnsureDefaults is true, strictly verify canonical defaults schema
                    const setOnInsert = u.$setOnInsert || {};
                    if (u.$set && Object.keys(u.$set).length > 0) {
                        const err = new Error('DIRECT_BULK_WRITE_PROHIBITED: Initialization via bulkWrite cannot contain $set operations.');
                        err.code = 'DIRECT_BULK_WRITE_PROHIBITED';
                        throw err;
                    }
                    const filterAuth = filter.authorityCode;
                    const setAuth = setOnInsert.authorityCode;
                    if (!filterAuth || !AUTHORITY_CODES.includes(filterAuth) || !setAuth || !AUTHORITY_CODES.includes(setAuth)) {
                        const err = new Error('DIRECT_BULK_WRITE_PROHIBITED: Bulk initialization is only permitted for canonical authorities (HSVP, GMADA, CHD).');
                        err.code = 'DIRECT_BULK_WRITE_PROHIBITED';
                        throw err;
                    }
                    if (setOnInsert.isEnabled === true || setOnInsert.schedulingEnabled === true ||
                        setOnInsert.reviewStatus === 'APPROVED' || setOnInsert.reviewStatus === 'REJECTED' ||
                        setOnInsert.commercialUseAuthorized === true || setOnInsert.termsReviewed === true ||
                        setOnInsert.contractVerificationStatus === 'VERIFIED_CONTRACT' ||
                        setOnInsert.identityRequirements?.verified === true) {
                        const err = new Error('DIRECT_BULK_WRITE_PROHIBITED: Cannot initialize active, verified, or approved state in bulkWrite.');
                        err.code = 'DIRECT_BULK_WRITE_PROHIBITED';
                        throw err;
                    }
                    if (setOnInsert.approvedBy || setOnInsert.reviewedBy || setOnInsert.makerCheckerAuditLogId) {
                        const err = new Error('DIRECT_BULK_WRITE_PROHIBITED: Cannot initialize approval identities in bulkWrite.');
                        err.code = 'DIRECT_BULK_WRITE_PROHIBITED';
                        throw err;
                    }
                    if (setOnInsert.tenantId && String(setOnInsert.tenantId) !== CANONICAL_ORGANIZATION_ID_STRING) {
                        const err = new Error('ORGANIZATION_OVERRIDE_PROHIBITED: Bulk initialization for non-canonical organization is prohibited.');
                        err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
                        throw err;
                    }
                }
            }
        }
    }
    return mongoose.Model.bulkWrite.call(this, ops, options);
};

// ========== Activation Gate ==========
/**
 * Fail-closed activation check.
 * Returns { canActivate: boolean, blockers: string[] }
 */
AuthoritySourceSettingsSchema.methods.checkActivationEligibility = function () {
    const blockers = [];

    if (this.permissionStatus !== 'GRANTED') {
        blockers.push(`Permission status is ${this.permissionStatus}, must be GRANTED`);
    }
    if (this.approvedAccessMethod === 'NONE') {
        blockers.push('No approved access method configured');
    }
    const isOwnerAttested = this.evidenceBasis === 'OWNER_ATTESTED_AUTHORITY_PERMISSION' && this.approvedAccessMethod === 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION';
    const hasEvidence = isOwnerAttested
        ? Boolean(this.ownerAttestation?.attestingParty && this.ownerAttestation?.attestedAt && this.ownerAttestation?.scope)
        : Boolean(
            (this.approvalReference && this.approvalReference.trim()) ||
            (this.permissionArtifactUri && this.permissionArtifactUri.trim()) ||
            (this.secureEvidenceId && this.secureEvidenceId.trim())
        );
    if (!hasEvidence) {
        blockers.push(isOwnerAttested ? 'Incomplete owner attestation: requires attestingParty, attestedAt, and scope' : 'No approval reference/evidence provided');
    }
    if (this.approvalExpiryDate && this.approvalExpiryDate < new Date()) {
        blockers.push('Approval has expired');
    }
    if (this.internalReviewExpiryDate && this.internalReviewExpiryDate < new Date()) {
        blockers.push('Internal maker-checker review has expired');
    }
    if (this.reviewStatus !== 'APPROVED') {
        blockers.push(`Review status is ${this.reviewStatus}, must be APPROVED`);
    }
    const rate = this.ratePolicy || {};
    const hasPolicyRef = Boolean(rate.policySource || rate.policyReference || rate.isInternalSafetyThrottle);
    if (!rate.maxRequestsPerMinute || !rate.maxRequestsPerDay || (!rate.minimumIntervalMs && !rate.minIntervalMs) || !hasPolicyRef) {
        blockers.push('Incomplete rate policy: requires maxRequestsPerMinute, maxRequestsPerDay, minimumIntervalMs, and policySource');
    }
    if (!rate.maxConcurrent || !Number.isInteger(Number(rate.maxConcurrent)) || Number(rate.maxConcurrent) !== 1) {
        blockers.push('Incomplete concurrency policy: requires maxConcurrent equal to 1');
    }
    if (!this.identityRequirements?.verified) {
        blockers.push('Source identity requirements are not verified with real data');
    }
    if (this.contractVerificationStatus !== 'VERIFIED_CONTRACT' && this.contractVerificationStatus !== 'LIVE_VERIFIED') {
        blockers.push(`Source contract is not verified (status: ${this.contractVerificationStatus || 'NOT_VERIFIED'})`);
    }
    if (!this.contractEvidenceReference || !this.contractEvidenceReference.trim()) {
        blockers.push('No source contract evidence reference provided');
    }
    if (!this.permittedFields || this.permittedFields.length === 0) {
        blockers.push('No permitted fields configured');
    }
    if (this.approvedAccessMethod === 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION') {
        if (!this.commercialUseAuthorized) {
            blockers.push('Internal commercial CRM use must be explicitly authorized');
        }
        if (!this.readOnlySearchAuthorized) {
            blockers.push('Read-only search activity must be explicitly authorized');
        }
        if (!this.termsReviewed || !this.termsReference) {
            blockers.push('Portal terms must be reviewed with termsReference');
        }
    }
    // Independent maker-checker verification:
    const submitter = this.submittedBy ? String(this.submittedBy) : null;
    const approver = this.approvedBy ? String(this.approvedBy) : null;
    const reviewer = this.reviewedBy ? String(this.reviewedBy) : null;

    if (submitter && approver && submitter === approver) {
        blockers.push('Independent maker-checker review required: submitter and approver must be distinct authenticated users');
    }
    if (submitter && reviewer && submitter === reviewer && this.reviewStatus === 'APPROVED') {
        blockers.push('Independent maker-checker review required: submitter and reviewer must be distinct authenticated users');
    }
    if (approver && reviewer && approver === reviewer && this.reviewStatus === 'APPROVED') {
        blockers.push('Independent maker-checker review required: approver and reviewer must be distinct authenticated users');
    }

    if (isOwnerAttested && (this.reviewStatus === 'APPROVED' || this.isEnabled || this.schedulingEnabled)) {
        if (!submitter || !approver) {
            blockers.push('Independent maker-checker review required: submitter and approver must both be present.');
        }
        if (!reviewer) {
            blockers.push('Independent maker-checker review required: submitter, approver, and reviewer must all be present.');
        }
        const hasApprovalOrAuditRef = Boolean(
            (this.makerCheckerAuditLogId) ||
            (this.approvalReference && String(this.approvalReference).trim()) ||
            (this.contractEvidenceReference && String(this.contractEvidenceReference).trim()) ||
            (this.ownerAttestation?.scope)
        );
        if (!hasApprovalOrAuditRef) {
            blockers.push('Authentic approval reference or audit event record is required.');
        }
    }

    return {
        canActivate: blockers.length === 0,
        blockers
    };
};

/**
 * Fail-closed internal maker-checker review eligibility check.
 * Verifies authenticated submitter, approver, and reviewer identities, evidence version,
 * and valid authorization basis.
 * Succeeded internal review does NOT activate live HTTP access or scheduling.
 * Returns { canApprove: boolean, eligible: boolean, blockers: string[] }
 */
AuthoritySourceSettingsSchema.methods.checkInternalMakerCheckerReviewEligibility = function () {
    const blockers = [];
    const isOwnerAttested = this.evidenceBasis === 'OWNER_ATTESTED_AUTHORITY_PERMISSION' && this.approvedAccessMethod === 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION';

    if (this.permissionStatus !== 'GRANTED' && this.permissionStatus !== 'PENDING_REVIEW') {
        blockers.push(`Permission status is ${this.permissionStatus}, must be GRANTED or PENDING_REVIEW`);
    }

    const hasEvidence = isOwnerAttested
        ? Boolean(this.ownerAttestation?.attestingParty && this.ownerAttestation?.attestedAt && this.ownerAttestation?.scope)
        : Boolean(
            (this.approvalReference && this.approvalReference.trim()) ||
            (this.permissionArtifactUri && this.permissionArtifactUri.trim()) ||
            (this.secureEvidenceId && this.secureEvidenceId.trim())
        );
    if (!hasEvidence && this.evidenceBasis) {
        blockers.push(isOwnerAttested ? 'Incomplete owner attestation: requires attestingParty, attestedAt, and scope' : 'No approval reference/evidence provided');
    }

    if (this.approvalExpiryDate && this.approvalExpiryDate < new Date()) {
        blockers.push('Approval has expired');
    }
    if (this.internalReviewExpiryDate && this.internalReviewExpiryDate < new Date()) {
        blockers.push('Internal maker-checker review has expired');
    }

    const submitter = this.submittedBy ? String(this.submittedBy) : null;
    const approver = this.approvedBy ? String(this.approvedBy) : null;
    const reviewer = this.reviewedBy ? String(this.reviewedBy) : null;

    if (!submitter) {
        blockers.push('Independent maker-checker review required: submitter must be present');
    }
    if (!approver) {
        blockers.push('Independent maker-checker review required: approver must be present');
    }
    if (!reviewer) {
        blockers.push('Independent maker-checker review required: reviewer must be present');
    }

    if (submitter && approver && submitter === approver) {
        blockers.push('Independent maker-checker review required: submitter and approver must be distinct authenticated users');
    }
    if (submitter && reviewer && submitter === reviewer) {
        blockers.push('Independent maker-checker review required: submitter and reviewer must be distinct authenticated users');
    }
    if (approver && reviewer && approver === reviewer) {
        blockers.push('Independent maker-checker review required: approver and reviewer must be distinct authenticated users');
    }

    if (this.evidenceVersion === undefined || this.evidenceVersion === null || !Number.isInteger(Number(this.evidenceVersion)) || Number(this.evidenceVersion) < 1) {
        blockers.push('Valid positive integer evidenceVersion is required for maker-checker review');
    }

    return {
        canApprove: blockers.length === 0,
        eligible: blockers.length === 0,
        blockers
    };
};

/**
 * Whether this source is effectively active (enabled + no blockers).
 */
AuthoritySourceSettingsSchema.methods.isEffectivelyActive = function () {
    if (!this.isEnabled || this.isPaused) return false;
    return this.checkActivationEligibility().canActivate;
};

// ========== Statics ==========
AuthoritySourceSettingsSchema.statics.getForTenant = function (tenantId, authorityCode) {
    return this.findOne({ tenantId, authorityCode });
};

AuthoritySourceSettingsSchema.statics.getAllForTenant = function (tenantId) {
    return this.find({ tenantId }).sort({ authorityCode: 1 });
};

/**
 * Ensure default settings documents exist for all authorities for a tenant.
 * Safe for repeated calls — uses upsert.
 */
AuthoritySourceSettingsSchema.statics.ensureDefaults = async function (tenantId) {
    const commonFields = [
        'propertyId', 'fileNumber', 'formNumber', 'propertyType', 'propertyCategory',
        'sectorNumber', 'phaseCode', 'blockCode', 'schemeName', 'urbanEstate',
        'estateOffice', 'propertySize', 'propertyAreaValue', 'propertyAreaUnit',
        'allotmentMode', 'allotmentPrice', 'currentDues', 'totalPaid', 'allotmentDate',
        'transferDate', 'possessionDate', 'possessionStatus', 'authorityStatus',
        'buildingPlanApproved', 'occupancyCertificate', 'litigationStatus', 'mortgageStatus',
        'duesStatus', 'leaseRentStatus', 'verificationStatus', 'matchConfidence'
    ];
    const sourceConfigs = {
        HSVP: {
            termsReference: 'https://hsvphry.org.in/Home/Terms',
            claimedAuthorityRole: 'Authorized Broker',
            identityRequirements: {
                required: ['urbanEstate', 'sectorNumber', 'propertyId'],
                optional: ['phaseCode'],
                verified: false
            }
        },
        GMADA: {
            termsReference: 'https://gmadaipms.in/UserExternalPages/Property_Ledger_Report.aspx',
            claimedAuthorityRole: 'Authorized Broker',
            identityRequirements: {
                required: ['location', 'sectors', 'propertyNo'],
                optional: ['usageType', 'propertyType', 'formNo'],
                verified: false
            }
        },
        CHD: {
            termsReference: 'https://estateoffice.chd.gov.in/KnowYourProperty/Search',
            claimedAuthorityRole: 'Authorized Broker',
            identityRequirements: {
                required: ['sectorNumber', 'propertyId'],
                optional: ['fileType', 'fileNumber'],
                verified: false
            }
        }
    };
    if (tenantId && String(tenantId) !== String(CANONICAL_ORGANIZATION_ID)) {
        throw new Error('ORGANIZATION_OVERRIDE_PROHIBITED');
    }
    const effectiveTenantId = CANONICAL_ORGANIZATION_ID;

    const ops = AUTHORITY_CODES.map(code => {
        const cfg = sourceConfigs[code];
        const throttleRef = `INTERNAL_SAFETY_THROTTLE_${code}_1_REQ_PER_MIN`;

        return {
            updateOne: {
                filter: { tenantId: effectiveTenantId, authorityCode: code },
                update: {
                    $setOnInsert: {
                        tenantId: effectiveTenantId,
                        authorityCode: code,
                        permissionStatus: 'GRANTED',
                        evidenceBasis: 'OWNER_ATTESTED_AUTHORITY_PERMISSION',
                        approvedAccessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                        permittedFields: commonFields,
                        approvalReference: null,
                        authorizationScope: 'Read-only public property data retrieval, internal CRM staging and preview only.',
                        commercialUseAuthorized: false,
                        readOnlySearchAuthorized: true,
                        termsReviewed: false,
                        termsReference: cfg.termsReference,
                        contractVerificationStatus: 'NOT_VERIFIED',
                        contractEvidenceReference: null,
                        ownerAttestation: {
                            attestingParty: 'Bharat Properties Owner',
                            attestedAt: new Date('2026-11-06T17:51:10+05:30'),
                            scope: 'Read-only public property data retrieval, internal Bharat Properties CRM processing, staging and preview only. No writes or mutations.',
                            notes: 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized.',
                            claimedAuthorityRole: cfg.claimedAuthorityRole
                        },
                        ratePolicy: {
                            maxRequestsPerMinute: 1,
                            maxRequestsPerHour: 60,
                            maxRequestsPerDay: 1440,
                            minimumIntervalMs: 60000,
                            minIntervalMs: 60000,
                            maxConcurrent: 1,
                            cooldownSeconds: 60,
                            isInternalSafetyThrottle: true,
                            policySource: throttleRef
                        },
                        isEnabled: false,
                        isPaused: false,
                        schedulingEnabled: false,
                        reviewStatus: 'UNDER_REVIEW',
                        identityRequirements: cfg.identityRequirements,
                        userReportedEvidence: {
                            reportedBy: 'Bharat Properties Owner',
                            reportedAt: new Date('2026-11-06T17:51:10+05:30'),
                            claimedAuthorityRole: 'Authorized Broker',
                            notes: 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized. Official written documentation and authority rate policy pending.',
                            verificationStatus: 'PENDING_WRITTEN_REFERENCE'
                        }
                    }
                },
                upsert: true
            }
        };
    });
    return this.bulkWrite(ops, {
        [INTERNAL_WORKFLOW_OPTION]: createAuthorizedInternalWorkflowToken('ensureDefaults', {
            tenantId: effectiveTenantId,
            targetId: 'ENSURE_DEFAULTS_ALL',
            authorityCode: 'HSVP,GMADA,CHD',
            evidenceVersion: 0
        })
    });
};

/**
 * Records or updates explicit owner confirmation in userReportedEvidence.
 */
AuthoritySourceSettingsSchema.statics.recordOwnerConfirmation = async function (tenantId, authorityCode, details = {}) {
    if (tenantId && String(tenantId) !== String(CANONICAL_ORGANIZATION_ID)) {
        const err = new Error('ORGANIZATION_OVERRIDE_PROHIBITED');
        err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
        throw err;
    }
    const effectiveTenantId = CANONICAL_ORGANIZATION_ID;
    return this.findOneAndUpdate(
        { tenantId: effectiveTenantId, authorityCode },
        {
            $set: {
                'userReportedEvidence.reportedBy': details.reportedBy || 'Bharat Properties Owner',
                'userReportedEvidence.reportedAt': details.reportedAt || new Date('2026-11-06T17:51:10+05:30'),
                'userReportedEvidence.claimedAuthorityRole': details.claimedAuthorityRole || 'Authorized Broker',
                'userReportedEvidence.notes': details.notes || 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized. Official written documentation and authority rate policy pending.',
                'userReportedEvidence.verificationStatus': details.verificationStatus || 'PENDING_WRITTEN_REFERENCE'
            },
            $setOnInsert: {
                tenantId: effectiveTenantId,
                authorityCode
            }
        },
        {
            new: true,
            upsert: true,
            [INTERNAL_WORKFLOW_OPTION]: createAuthorizedInternalWorkflowToken('recordOwnerConfirmation', {
                tenantId: effectiveTenantId,
                authorityCode,
                targetId: authorityCode,
                evidenceVersion: 0
            })
        }
    );
};

/**
 * Rigorously verifies maker-checker users, RBAC roles, and genuine AuditLog events
 * against actual database records within the canonical organization.
 */
AuthoritySourceSettingsSchema.statics.verifyMakerCheckerUsers = async function ({
    submitterId,
    approverId,
    reviewerId,
    approvalReference,
    makerCheckerAuditLogId,
    auditLogId,
    authorityCode,
    tenantId,
    settingsId,
    evidenceVersion,
    session
} = {}) {
    // 1. Require connected and verified database — fail closed if disconnected
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        return {
            valid: false,
            reason: 'Database is disconnected; maker-checker user and audit verification requires an active database connection.'
        };
    }

    if (!submitterId || !approverId || !reviewerId) {
        return { valid: false, reason: 'Missing one or more required maker-checker user IDs (submitter, approver, reviewer).' };
    }

    if (!mongoose.isValidObjectId(submitterId) || !mongoose.isValidObjectId(approverId) || !mongoose.isValidObjectId(reviewerId)) {
        return { valid: false, reason: 'Invalid ObjectId format for maker-checker user IDs.' };
    }

    const sStr = String(submitterId);
    const aStr = String(approverId);
    const rStr = String(reviewerId);

    if (sStr === aStr || aStr === rStr || sStr === rStr) {
        return { valid: false, reason: 'Submitter, approver, and reviewer must be three distinct authenticated users (self-approval prohibited).' };
    }

    const { CANONICAL_ORGANIZATION_ID } = await import('../config/canonicalOrganization.js');
    const canonStr = String(CANONICAL_ORGANIZATION_ID);

    // Validate source tenantId strictly against canonical organization ID if provided
    if (tenantId) {
        if (!mongoose.isValidObjectId(tenantId)) {
            return { valid: false, reason: 'Valid source tenantId is required for maker-checker verification.' };
        }
        if (String(tenantId) !== canonStr) {
            return { valid: false, reason: `Source tenantId '${tenantId}' does not match canonical organization ID (${canonStr}).` };
        }
    }

    // Validate authority code if provided
    if (authorityCode && !['HSVP', 'GMADA', 'CHD'].includes(authorityCode)) {
        return { valid: false, reason: `Invalid or unsupported authority code '${authorityCode}'. Must be HSVP, GMADA, or CHD.` };
    }

    if (!approvalReference && !makerCheckerAuditLogId && !auditLogId) {
        return { valid: false, reason: 'Authentic approval reference or audit event record is required.' };
    }

    // 2. Validate User documents with exact organization membership
    const User = mongoose.model('User');
    const userQuery = User.find({ _id: { $in: [submitterId, approverId, reviewerId] } }).populate('role');
    if (session) {
        userQuery.setOptions({ session });
    }
    const users = await userQuery;
    if (users.length < 3) {
        return { valid: false, reason: `Found only ${users.length}/3 registered users in database for maker-checker roles.` };
    }

    const submitter = users.find(u => String(u._id) === sStr);
    const approver = users.find(u => String(u._id) === aStr);
    const reviewer = users.find(u => String(u._id) === rStr);

    for (const [roleName, u] of [['submitter', submitter], ['approver', approver], ['reviewer', reviewer]]) {
        if (!u) {
            return { valid: false, reason: `${roleName} user does not exist in database.` };
        }
        if (!u.tenantId) {
            return { valid: false, reason: `User '${u.email}' (${roleName}) has missing or null tenantId. Exact canonical organization membership is required.` };
        }
        if (String(u.tenantId) !== canonStr) {
            return {
                valid: false,
                reason: `User '${u.email}' belongs to a different organization (${u.tenantId}) and cannot participate in maker-checker approval.`
            };
        }
        if (u.isActive === false || u.status === 'inactive' || u.status === 'suspended') {
            return { valid: false, reason: `User '${u.email}' (${roleName}) is inactive or suspended.` };
        }
    }

    // 4. Approver RBAC authorization: must have manageAuthoritySettings
    const approverRole = approver.role;
    const isApproverAuthorized = Boolean(
        approverRole?.approvalRights?.manageAuthoritySettings === true ||
        approverRole?.name === 'Super Admin' ||
        approver.isSuperAdmin === true ||
        (Array.isArray(approverRole?.permissions) && (approverRole.permissions.includes('authorityVerification.admin') || approverRole.permissions.includes('*')))
    );
    if (!isApproverAuthorized) {
        return { valid: false, reason: 'Approver user does not possess required manageAuthoritySettings approval right or admin permission.' };
    }

    // 5. Reviewer RBAC authorization: must have approveAuthorityChanges
    const reviewerRole = reviewer.role;
    const isReviewerAuthorized = Boolean(
        reviewerRole?.approvalRights?.approveAuthorityChanges === true ||
        reviewerRole?.name === 'Super Admin' ||
        reviewer.isSuperAdmin === true ||
        (Array.isArray(reviewerRole?.permissions) && (reviewerRole.permissions.includes('authorityVerification.approve') || reviewerRole.permissions.includes('*')))
    );
    if (!isReviewerAuthorized) {
        return { valid: false, reason: 'Reviewer user does not possess required approveAuthorityChanges approval right.' };
    }

    // 6. Verify actual AuditLog record
    const effectiveAuditLogId = makerCheckerAuditLogId || auditLogId || (mongoose.isValidObjectId(approvalReference) ? approvalReference : null);

    if (!effectiveAuditLogId) {
        return {
            valid: false,
            reason: `Approval reference '${approvalReference}' is an arbitrary string, not a valid AuditLog ObjectId reference, and makerCheckerAuditLogId is not provided.`
        };
    }

    const AuditLog = mongoose.model('AuditLog');
    const auditQuery = AuditLog.findById(effectiveAuditLogId);
    if (session) {
        auditQuery.setOptions({ session });
    }
    const auditRecord = await auditQuery;
    if (!auditRecord) {
        return {
            valid: false,
            reason: `Referenced AuditLog record '${effectiveAuditLogId}' does not exist in database.`
        };
    }

    // Dimension 1: eventType === 'authority_source_approval_reviewed'
    if (auditRecord.eventType !== 'authority_source_approval_reviewed') {
        return {
            valid: false,
            reason: `AuditLog record has eventType '${auditRecord.eventType}', must be 'authority_source_approval_reviewed'.`
        };
    }

    // Dimension 2: targetType === 'authority_settings'
    if (auditRecord.targetType !== 'authority_settings') {
        return {
            valid: false,
            reason: `AuditLog record has targetType '${auditRecord.targetType}', must be 'authority_settings'.`
        };
    }

    // Dimension 3: targetName or metadata.authorityCode must match authorityCode
    const auditAuthCode = auditRecord.targetName || auditRecord.metadata?.authorityCode || null;
    if (authorityCode) {
        if (!auditAuthCode || auditAuthCode !== authorityCode) {
            return {
                valid: false,
                reason: `AuditLog record belongs to authority '${auditAuthCode || '(missing)'}', not '${authorityCode}'.`
            };
        }
    } else if (!auditAuthCode || !['HSVP', 'GMADA', 'CHD'].includes(auditAuthCode)) {
        return {
            valid: false,
            reason: `AuditLog record does not have a valid authority code in targetName or metadata.`
        };
    }

    // Dimension 4: metadata.tenantId must match canonical organization ID
    const auditOrgId = auditRecord.metadata?.tenantId || auditRecord.metadata?.organizationId || null;
    if (!auditOrgId || String(auditOrgId) !== canonStr) {
        return {
            valid: false,
            reason: `AuditLog record belongs to missing or non-canonical organization (${auditOrgId || '(missing)'}).`
        };
    }

    // Dimension 5: status must be 'success' or 'completed'
    const normStatus = (auditRecord.status || '').toLowerCase();
    if (normStatus !== 'success' && normStatus !== 'completed') {
        return {
            valid: false,
            reason: `AuditLog record status '${auditRecord.status || '(missing)'}' is not successful (must be 'success' or 'completed').`
        };
    }

    // Dimension 6: timestamp must exist, be in the past, and within 30 days
    if (!auditRecord.timestamp) {
        return {
            valid: false,
            reason: 'AuditLog record is missing timestamp.'
        };
    }
    const auditTime = new Date(auditRecord.timestamp).getTime();
    const now = Date.now();
    if (isNaN(auditTime)) {
        return {
            valid: false,
            reason: 'AuditLog record has an invalid timestamp.'
        };
    }
    if (auditTime > now + 60000) {
        return {
            valid: false,
            reason: `AuditLog record '${approvalReference}' has an invalid future timestamp.`
        };
    }
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    if (now - auditTime > maxAgeMs) {
        return {
            valid: false,
            reason: 'AuditLog record is stale (older than 30-day review recency window).'
        };
    }

    // Dimension 7: targetId must match settingsId if provided
    if (settingsId) {
        if (!auditRecord.targetId || String(auditRecord.targetId) !== String(settingsId)) {
            return {
                valid: false,
                reason: `AuditLog targetId '${auditRecord.targetId || '(missing)'}' does not match target settings document ID '${settingsId}'.`
            };
        }
    }

    // Dimension 8: Reviewer identities in AuditLog (unconditionally mandatory)
    if (!auditRecord.actorId) {
        return {
            valid: false,
            reason: 'AuditLog record is missing required actorId (reviewer identity).'
        };
    }
    if (String(auditRecord.actorId) !== rStr) {
        return {
            valid: false,
            reason: `AuditLog actor '${auditRecord.actorId}' does not match verified reviewer '${rStr}'.`
        };
    }
    const auditReviewerId = auditRecord.metadata?.reviewerId || auditRecord.metadata?.reviewedBy;
    if (!auditReviewerId) {
        return {
            valid: false,
            reason: 'AuditLog record metadata is missing required reviewerId/reviewedBy.'
        };
    }
    if (auditRecord.metadata?.reviewerId && String(auditRecord.metadata.reviewerId) !== rStr) {
        return {
            valid: false,
            reason: `AuditLog reviewerId '${auditRecord.metadata.reviewerId}' does not match verified reviewer '${rStr}'.`
        };
    }
    if (auditRecord.metadata?.reviewedBy && String(auditRecord.metadata.reviewedBy) !== rStr) {
        return {
            valid: false,
            reason: `AuditLog reviewedBy '${auditRecord.metadata.reviewedBy}' does not match verified reviewer '${rStr}'.`
        };
    }

    // Dimension 9: Approver identities in AuditLog (unconditionally mandatory)
    if (!auditRecord.userId) {
        return {
            valid: false,
            reason: 'AuditLog record is missing required userId (approver identity).'
        };
    }
    if (String(auditRecord.userId) !== aStr) {
        return {
            valid: false,
            reason: `AuditLog user '${auditRecord.userId}' does not match verified approver '${aStr}'.`
        };
    }
    const auditApproverId = auditRecord.metadata?.approverId || auditRecord.metadata?.approvedBy;
    if (!auditApproverId) {
        return {
            valid: false,
            reason: 'AuditLog record metadata is missing required approverId/approvedBy.'
        };
    }
    if (auditRecord.metadata?.approverId && String(auditRecord.metadata.approverId) !== aStr) {
        return {
            valid: false,
            reason: `AuditLog approverId '${auditRecord.metadata.approverId}' does not match verified approver '${aStr}'.`
        };
    }
    if (auditRecord.metadata?.approvedBy && String(auditRecord.metadata.approvedBy) !== aStr) {
        return {
            valid: false,
            reason: `AuditLog approvedBy '${auditRecord.metadata.approvedBy}' does not match verified approver '${aStr}'.`
        };
    }

    // Dimension 10: Submitter identity in AuditLog (unconditionally mandatory)
    if (!auditRecord.metadata?.submittedBy) {
        return {
            valid: false,
            reason: 'AuditLog record metadata is missing required submittedBy (submitter identity).'
        };
    }
    if (String(auditRecord.metadata.submittedBy) !== sStr) {
        return {
            valid: false,
            reason: `AuditLog submittedBy '${auditRecord.metadata.submittedBy}' does not match verified submitter '${sStr}'.`
        };
    }

    // Dimension 11: Evidence version binding and anti-replay protection
    if (evidenceVersion !== undefined && evidenceVersion !== null) {
        const auditEv = auditRecord.metadata?.evidenceVersion;
        if (auditEv === undefined || auditEv === null) {
            return {
                valid: false,
                reason: 'AuditLog record metadata is missing required evidenceVersion.'
            };
        }
        if (!Number.isInteger(Number(auditEv)) || Number(auditEv) < 1) {
            return {
                valid: false,
                reason: 'AuditLog record metadata has invalid evidenceVersion (must be positive integer).'
            };
        }
        if (Number(auditEv) !== Number(evidenceVersion)) {
            return {
                valid: false,
                reason: `AuditLog evidenceVersion (${auditEv}) does not match expected evidenceVersion (${evidenceVersion}). Replay of stale audit evidence rejected.`
            };
        }
    }

    return {
        valid: true,
        submitter: { id: sStr, email: submitter.email },
        approver: { id: aStr, email: approver.email },
        reviewer: { id: rStr, email: reviewer.email },
        auditLog: { id: String(auditRecord._id), eventType: auditRecord.eventType }
    };
};

/**
 * Auditable application service method to record authentic maker-checker approval.
 */
AuthoritySourceSettingsSchema.statics.recordMakerCheckerApproval = async function ({
    tenantId,
    authorityCode,
    submitterId,
    approverId,
    reviewerId,
    approvalReference,
    makerCheckerAuditLogId,
    auditLogId,
    evidenceVersion,
    session
}) {
    let setting = await this.findOne({ tenantId, authorityCode }).setOptions(session ? { session } : {});
    if (!setting) {
        throw new Error(`SETTINGS_NOT_FOUND: Authority source settings not found for ${authorityCode}`);
    }

    const effectiveAuditLogId = makerCheckerAuditLogId || auditLogId || (mongoose.isValidObjectId(approvalReference) ? approvalReference : null);

    const userCheck = await this.verifyMakerCheckerUsers({
        submitterId,
        approverId,
        reviewerId,
        approvalReference: approvalReference || effectiveAuditLogId,
        makerCheckerAuditLogId: effectiveAuditLogId,
        authorityCode,
        tenantId,
        settingsId: setting._id,
        evidenceVersion: evidenceVersion !== undefined ? evidenceVersion : undefined,
        session
    });

    if (!userCheck.valid) {
        const err = new Error(`MAKER_CHECKER_APPROVAL_REJECTED: ${userCheck.reason}`);
        err.code = 'MAKER_CHECKER_APPROVAL_REJECTED';
        throw err;
    }

    setting.reviewStatus = 'APPROVED';
    setting.submittedBy = submitterId;
    setting.submittedAt = new Date();
    setting.approvedBy = approverId;
    setting.approvedAt = new Date();
    setting.reviewedBy = reviewerId;
    setting.reviewedAt = new Date();
    setting.approvalDate = new Date();
    // Do not represent an application-generated 365-day value as a government approval or authority permit expiry
    setting.approvalExpiryDate = null;
    setting.internalReviewExpiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (effectiveAuditLogId) {
        setting.makerCheckerAuditLogId = effectiveAuditLogId;
    }
    if (approvalReference) {
        setting.approvalReference = String(approvalReference);
    } else if (effectiveAuditLogId && !setting.approvalReference) {
        setting.approvalReference = String(effectiveAuditLogId);
    }

    // CRITICAL: Internal maker-checker approval MUST NEVER be converted into
    // external contract evidence or commercial-use authorization.
    // Preserve separate unverified states until actual external evidence is provided.
    setting.contractVerificationStatus = 'NOT_VERIFIED';
    setting.commercialUseAuthorized = false;
    setting.termsReviewed = false;
    if (setting.identityRequirements) {
        setting.identityRequirements.verified = false;
    }

    if (session) {
        setting.$session(session);
    }
    await setting.save();
    return setting;
};

/**
 * Reconciles owner-attested authority permissions and internal safety throttles
 * for all three sources (HSVP, GMADA, CHD) for a specific tenant without fabricating
 * government letters or official rate policies.
 * 
 * Strict invariant: reconcileOwnerAttestation reconciles OWNER-ATTESTED PERMISSION ONLY.
 * It must NEVER independently grant approval. reviewStatus remains UNDER_REVIEW.
 */
AuthoritySourceSettingsSchema.statics.reconcileOwnerAttestation = async function (tenantId, options = {}) {
    const defaultAttestedAt = options.attestedAt || new Date('2026-11-06T17:51:10+05:30');
    const commonFields = [
        'propertyId', 'fileNumber', 'formNumber', 'propertyType', 'propertyCategory',
        'sectorNumber', 'phaseCode', 'blockCode', 'schemeName', 'urbanEstate',
        'estateOffice', 'propertySize', 'propertyAreaValue', 'propertyAreaUnit',
        'allotmentMode', 'allotmentPrice', 'currentDues', 'totalPaid', 'allotmentDate',
        'transferDate', 'possessionDate', 'possessionStatus', 'authorityStatus',
        'buildingPlanApproved', 'occupancyCertificate', 'litigationStatus', 'mortgageStatus',
        'duesStatus', 'leaseRentStatus', 'verificationStatus', 'matchConfidence'
    ];

    const sourceConfigs = {
        HSVP: {
            termsReference: 'https://hsvphry.org.in/Home/Terms',
            claimedAuthorityRole: 'Authorized Broker',
            identityRequirements: {
                required: ['urbanEstate', 'sectorNumber', 'propertyId'],
                optional: ['phaseCode'],
                verified: true
            }
        },
        GMADA: {
            termsReference: 'https://gmadaipms.in/UserExternalPages/Property_Ledger_Report.aspx',
            claimedAuthorityRole: 'Authorized Broker',
            identityRequirements: {
                required: ['location', 'sectors', 'propertyNo'],
                optional: ['usageType', 'propertyType', 'formNo'],
                verified: true
            }
        },
        CHD: {
            termsReference: 'https://estateoffice.chd.gov.in/KnowYourProperty/Search',
            claimedAuthorityRole: 'Authorized Broker',
            identityRequirements: {
                required: ['sectorNumber', 'propertyId'],
                optional: ['fileType', 'fileNumber'],
                verified: true
            }
        }
    };

    const results = [];
    for (const code of AUTHORITY_CODES) {
        const cfg = sourceConfigs[code];
        const throttleRef = `INTERNAL_SAFETY_THROTTLE_${code}_1_REQ_PER_MIN`;

        let setting = await this.findOne({ tenantId, authorityCode: code });
        if (!setting) {
            setting = new this({ tenantId, authorityCode: code });
        }

        setting.permissionStatus = 'GRANTED';
        setting.evidenceBasis = 'OWNER_ATTESTED_AUTHORITY_PERMISSION';
        setting.approvedAccessMethod = 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION';
        setting.permittedFields = commonFields;
        setting.approvalReference = null;
        setting.authorizationScope = 'Read-only public property data retrieval, internal CRM staging and preview only.';
        setting.commercialUseAuthorized = false;
        setting.readOnlySearchAuthorized = true;
        setting.termsReviewed = false;
        setting.termsReference = cfg.termsReference;
        setting.contractVerificationStatus = 'NOT_VERIFIED';
        setting.contractEvidenceReference = null;
        setting.ownerAttestation = {
            attestingParty: options.attestingParty || 'Bharat Properties Owner',
            attestedAt: defaultAttestedAt,
            scope: options.scope || 'Read-only public property data retrieval, internal Bharat Properties CRM processing, staging and preview only. No writes or mutations.',
            notes: options.notes || 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized.',
            claimedAuthorityRole: cfg.claimedAuthorityRole
        };
        setting.ratePolicy = {
            maxRequestsPerMinute: 1,
            maxRequestsPerHour: 60,
            maxRequestsPerDay: 1440,
            minimumIntervalMs: 60000,
            minIntervalMs: 60000,
            maxConcurrent: 1,
            cooldownSeconds: 60,
            isInternalSafetyThrottle: true,
            policySource: throttleRef
        };
        setting.identityRequirements = cfg.identityRequirements;
        setting.reviewStatus = 'UNDER_REVIEW';
        setting.submittedBy = null;
        setting.submittedAt = null;
        setting.approvedBy = null;
        setting.approvedAt = null;
        setting.reviewedBy = null;
        setting.reviewedAt = null;
        setting.approvalDate = null;
        setting.approvalExpiryDate = null;
        setting.isEnabled = false;
        setting.isPaused = false;
        setting.schedulingEnabled = false;
        setting.scheduleCron = '0 2 * * 0';
        setting.scheduleTimezone = 'Asia/Kolkata';

        await setting.save();
        results.push(setting);
    }

    return results;
};

export function checkActivationEligibility(doc = {}) {
    if (typeof doc?.checkActivationEligibility === 'function') {
        const res = doc.checkActivationEligibility();
        return {
            eligible: res.canActivate,
            canActivate: res.canActivate,
            blockers: res.blockers.map(b => ({
                code: b.includes('maker-checker') ? 'SELF_APPROVAL_PROHIBITED' : (b.includes('terms') ? 'TERMS_NOT_REVIEWED' : 'BLOCKER'),
                message: b
            }))
        };
    }
    const blockers = [];
    if (doc.permissionStatus !== 'GRANTED') {
        blockers.push({ code: 'PERMISSION_NOT_GRANTED', message: `Permission status is ${doc.permissionStatus}` });
    }
    if (doc.reviewStatus !== 'APPROVED') {
        blockers.push({ code: 'REVIEW_NOT_APPROVED', message: `Review status is ${doc.reviewStatus}` });
    }
    const isOwnerAttested = doc.evidenceBasis === 'OWNER_ATTESTED_AUTHORITY_PERMISSION' && doc.approvedAccessMethod === 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION';
    const hasEvidence = isOwnerAttested
        ? Boolean(doc.ownerAttestation?.attestingParty && doc.ownerAttestation?.attestedAt && doc.ownerAttestation?.scope)
        : Boolean(
            (doc.approvalReference && doc.approvalReference.trim()) ||
            (doc.permissionArtifactUri && doc.permissionArtifactUri.trim()) ||
            (doc.secureEvidenceId && doc.secureEvidenceId.trim())
        );
    if (!hasEvidence && doc.evidenceBasis) {
        blockers.push({ code: 'EVIDENCE_MISSING', message: isOwnerAttested ? 'Incomplete owner attestation' : 'No approval reference/evidence provided' });
    }
    if (doc.submittedBy && doc.approvedBy && String(doc.submittedBy) === String(doc.approvedBy)) {
        blockers.push({ code: 'SELF_APPROVAL_PROHIBITED', message: 'Self-approval is prohibited' });
    }
    if (doc.submittedBy && doc.reviewedBy && String(doc.submittedBy) === String(doc.reviewedBy) && doc.reviewStatus === 'APPROVED') {
        blockers.push({ code: 'SELF_APPROVAL_PROHIBITED', message: 'Self-review is prohibited' });
    }
    if (doc.approvedBy && doc.reviewedBy && String(doc.approvedBy) === String(doc.reviewedBy) && doc.reviewStatus === 'APPROVED') {
        blockers.push({ code: 'SELF_APPROVAL_PROHIBITED', message: 'Approver and reviewer must be distinct authenticated users' });
    }
    if (isOwnerAttested && doc.reviewStatus === 'APPROVED') {
        if (!doc.submittedBy || !doc.approvedBy || !doc.reviewedBy) {
            blockers.push({ code: 'MAKER_CHECKER_INCOMPLETE', message: 'Independent maker-checker review required: submitter, approver, and reviewer must all be present.' });
        }
        const hasApprovalOrAuditRef = Boolean(
            (doc.makerCheckerAuditLogId) ||
            (doc.approvalReference && String(doc.approvalReference).trim()) ||
            (doc.contractEvidenceReference && String(doc.contractEvidenceReference).trim()) ||
            (doc.ownerAttestation?.scope)
        );
        if (!hasApprovalOrAuditRef) {
            blockers.push({ code: 'APPROVAL_REFERENCE_MISSING', message: 'Authentic approval reference or audit event record is required.' });
        }
    }
    if (!doc.termsReviewed) {
        blockers.push({ code: 'TERMS_NOT_REVIEWED', message: 'Terms not reviewed' });
    }
    if (doc.identityRequirements && doc.identityRequirements.verified === false) {
        blockers.push({ code: 'IDENTITY_NOT_VERIFIED', message: 'Source identity requirements are not verified with real data' });
    }
    const rate = doc.ratePolicy || {};
    const hasPolicyRef = Boolean(rate.policySource || rate.policyReference || rate.isInternalSafetyThrottle);
    if (!rate.maxRequestsPerMinute || !rate.maxRequestsPerDay || (!rate.minimumIntervalMs && !rate.minIntervalMs) || !hasPolicyRef) {
        blockers.push({ code: 'RATE_POLICY_INCOMPLETE', message: 'Incomplete rate policy: requires maxRequestsPerMinute, maxRequestsPerDay, minimumIntervalMs, and policySource' });
    }
    if (!rate.maxConcurrent || !Number.isInteger(Number(rate.maxConcurrent)) || Number(rate.maxConcurrent) !== 1) {
        blockers.push({ code: 'RATE_POLICY_INCOMPLETE', message: 'Incomplete concurrency policy: requires maxConcurrent equal to 1' });
    }
    if (doc.contractVerificationStatus && doc.contractVerificationStatus !== 'VERIFIED_CONTRACT' && doc.contractVerificationStatus !== 'LIVE_VERIFIED') {
        blockers.push({ code: 'CONTRACT_NOT_VERIFIED', message: `Source contract is not verified (status: ${doc.contractVerificationStatus})` });
    }
    if (doc.contractVerificationStatus && (!doc.contractEvidenceReference || !String(doc.contractEvidenceReference).trim())) {
        blockers.push({ code: 'CONTRACT_EVIDENCE_MISSING', message: 'No source contract evidence reference provided' });
    }
    return {
        eligible: blockers.length === 0,
        canActivate: blockers.length === 0,
        blockers
    };
}

export function checkInternalMakerCheckerReviewEligibility(doc = {}) {
    if (typeof doc?.checkInternalMakerCheckerReviewEligibility === 'function') {
        const res = doc.checkInternalMakerCheckerReviewEligibility();
        return {
            eligible: res.canApprove ?? res.eligible,
            canApprove: res.canApprove ?? res.eligible,
            blockers: res.blockers.map(b => (typeof b === 'string' ? { code: b.includes('maker-checker') ? 'SELF_APPROVAL_PROHIBITED' : 'BLOCKER', message: b } : b))
        };
    }
    const blockers = [];
    const isOwnerAttested = doc.evidenceBasis === 'OWNER_ATTESTED_AUTHORITY_PERMISSION' && doc.approvedAccessMethod === 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION';

    if (doc.permissionStatus !== 'GRANTED' && doc.permissionStatus !== 'PENDING_REVIEW') {
        blockers.push({ code: 'PERMISSION_NOT_GRANTED', message: `Permission status is ${doc.permissionStatus}` });
    }

    const hasEvidence = isOwnerAttested
        ? Boolean(doc.ownerAttestation?.attestingParty && doc.ownerAttestation?.attestedAt && doc.ownerAttestation?.scope)
        : Boolean(
            (doc.approvalReference && doc.approvalReference.trim()) ||
            (doc.permissionArtifactUri && doc.permissionArtifactUri.trim()) ||
            (doc.secureEvidenceId && doc.secureEvidenceId.trim())
        );
    if (!hasEvidence && doc.evidenceBasis) {
        blockers.push({ code: 'EVIDENCE_MISSING', message: isOwnerAttested ? 'Incomplete owner attestation' : 'No approval reference/evidence provided' });
    }

    if (doc.approvalExpiryDate && new Date(doc.approvalExpiryDate) < new Date()) {
        blockers.push({ code: 'APPROVAL_EXPIRED', message: 'Approval has expired' });
    }
    if (doc.internalReviewExpiryDate && new Date(doc.internalReviewExpiryDate) < new Date()) {
        blockers.push({ code: 'REVIEW_EXPIRED', message: 'Internal maker-checker review has expired' });
    }

    const submitter = doc.submittedBy ? String(doc.submittedBy) : null;
    const approver = doc.approvedBy ? String(doc.approvedBy) : null;
    const reviewer = doc.reviewedBy ? String(doc.reviewedBy) : null;

    if (!submitter) {
        blockers.push({ code: 'SUBMITTER_REQUIRED', message: 'Independent maker-checker review required: submitter must be present' });
    }
    if (!approver) {
        blockers.push({ code: 'APPROVER_REQUIRED', message: 'Independent maker-checker review required: approver must be present' });
    }
    if (!reviewer) {
        blockers.push({ code: 'REVIEWER_REQUIRED', message: 'Independent maker-checker review required: reviewer must be present' });
    }

    if (submitter && approver && submitter === approver) {
        blockers.push({ code: 'SELF_APPROVAL_PROHIBITED', message: 'Independent maker-checker review required: submitter and approver must be distinct authenticated users' });
    }
    if (submitter && reviewer && submitter === reviewer) {
        blockers.push({ code: 'SELF_APPROVAL_PROHIBITED', message: 'Independent maker-checker review required: submitter and reviewer must be distinct authenticated users' });
    }
    if (approver && reviewer && approver === reviewer) {
        blockers.push({ code: 'SELF_APPROVAL_PROHIBITED', message: 'Independent maker-checker review required: approver and reviewer must be distinct authenticated users' });
    }

    if (doc.evidenceVersion === undefined || doc.evidenceVersion === null || !Number.isInteger(Number(doc.evidenceVersion)) || Number(doc.evidenceVersion) < 1) {
        blockers.push({ code: 'EVIDENCE_VERSION_REQUIRED', message: 'Valid positive integer evidenceVersion is required for maker-checker review' });
    }

    return {
        eligible: blockers.length === 0,
        canApprove: blockers.length === 0,
        blockers
    };
}

export { AUTHORITY_CODES, PERMISSION_STATUSES, ACCESS_METHODS };
export default mongoose.model('AuthoritySourceSettings', AuthoritySourceSettingsSchema);
