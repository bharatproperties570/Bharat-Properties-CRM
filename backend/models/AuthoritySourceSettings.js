import mongoose from 'mongoose';

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
        policySource: { type: String, default: null }  // Reference to authority's rate policy document
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
        verified: { type: Boolean, default: false }   // Are these requirements confirmed with real data?
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
AuthoritySourceSettingsSchema.pre('save', function (next) {
    if (this.isEnabled || this.schedulingEnabled || this.reviewStatus === 'APPROVED' || this.permissionStatus === 'GRANTED') {
        const check = this.checkActivationEligibility();
        if (!check.canActivate) {
            const err = new Error(`SOURCE_ACTIVATION_LOCKED: Live authority activation, approvals, and scheduling are prohibited without complete, independently verified Phase 4.4.4 approval record. Blockers: ${check.blockers.join('; ')}`);
            err.code = 'ACTIVATION_LOCKED_PHASE3';
            err.blockers = check.blockers;
            return next(err);
        }
    }
    next();
});

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
    const hasEvidence = Boolean(
        (this.approvalReference && this.approvalReference.trim()) ||
        (this.permissionArtifactUri && this.permissionArtifactUri.trim()) ||
        (this.secureEvidenceId && this.secureEvidenceId.trim())
    );
    if (!hasEvidence) {
        blockers.push('No approval reference/evidence provided');
    }
    if (this.approvalExpiryDate && this.approvalExpiryDate < new Date()) {
        blockers.push('Approval has expired');
    }
    if (this.reviewStatus !== 'APPROVED') {
        blockers.push(`Review status is ${this.reviewStatus}, must be APPROVED`);
    }
    const rate = this.ratePolicy || {};
    const hasPolicyRef = Boolean(rate.policySource || rate.policyReference);
    if (!rate.maxRequestsPerMinute || !rate.maxRequestsPerDay || (!rate.minimumIntervalMs && !rate.minIntervalMs) || !hasPolicyRef) {
        blockers.push('Incomplete rate policy: requires maxRequestsPerMinute, maxRequestsPerDay, minimumIntervalMs, and policySource');
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

    return {
        canActivate: blockers.length === 0,
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
    const ops = AUTHORITY_CODES.map(code => ({
        updateOne: {
            filter: { tenantId, authorityCode: code },
            update: {
                $setOnInsert: {
                    tenantId,
                    authorityCode: code,
                    permissionStatus: 'NOT_OBTAINED',
                    approvedAccessMethod: 'NONE',
                    isEnabled: false,
                    isPaused: false,
                    schedulingEnabled: false,
                    reviewStatus: 'NOT_REVIEWED'
                }
            },
            upsert: true
        }
    }));
    return this.bulkWrite(ops);
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
    if (doc.submittedBy && doc.approvedBy && String(doc.submittedBy) === String(doc.approvedBy)) {
        blockers.push({ code: 'SELF_APPROVAL_PROHIBITED', message: 'Self-approval is prohibited' });
    }
    if (doc.submittedBy && doc.reviewedBy && String(doc.submittedBy) === String(doc.reviewedBy) && doc.reviewStatus === 'APPROVED') {
        blockers.push({ code: 'SELF_APPROVAL_PROHIBITED', message: 'Self-review is prohibited' });
    }
    if (!doc.termsReviewed) {
        blockers.push({ code: 'TERMS_NOT_REVIEWED', message: 'Terms not reviewed' });
    }
    if (doc.identityRequirements && doc.identityRequirements.verified === false) {
        blockers.push({ code: 'IDENTITY_NOT_VERIFIED', message: 'Source identity requirements are not verified with real data' });
    }
    const rate = doc.ratePolicy || {};
    const hasPolicyRef = Boolean(rate.policySource || rate.policyReference);
    if (!rate.maxRequestsPerMinute || !rate.maxRequestsPerDay || (!rate.minimumIntervalMs && !rate.minIntervalMs) || !hasPolicyRef) {
        blockers.push({ code: 'RATE_POLICY_INCOMPLETE', message: 'Incomplete rate policy: requires maxRequestsPerMinute, maxRequestsPerDay, minimumIntervalMs, and policySource' });
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

export { AUTHORITY_CODES, PERMISSION_STATUSES, ACCESS_METHODS };
export default mongoose.model('AuthoritySourceSettings', AuthoritySourceSettingsSchema);
