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
    'GRANTED',           // Written permission obtained
    'EXPIRED',           // Previously granted but expired
    'REVOKED',           // Previously granted but revoked
    'SUSPENDED'          // Temporarily suspended
];

const ACCESS_METHODS = [
    'NONE',              // No approved method
    'PUBLIC_API',        // Official public API
    'AUTHORIZED_PORTAL', // Authorized portal access with credentials
    'DATA_SHARING_MOU',  // Formal data-sharing agreement
    'RTI_RESPONSE'       // Information obtained via RTI
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

    // ========== Approval Evidence ==========
    approvalReference: {
        type: String,
        default: null  // e.g. 'Letter ref: HSVP/IT/2024/1234'
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
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },

    // ========== Rate & Concurrency Policy ==========
    // These are NOT guessed — they must come from the authority's terms
    ratePolicy: {
        maxRequestsPerMinute: { type: Number, default: null },
        maxRequestsPerHour: { type: Number, default: null },
        maxRequestsPerDay: { type: Number, default: null },
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
        enum: ['SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED', null],
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
    if (!this.approvalReference) {
        blockers.push('No approval reference/evidence provided');
    }
    if (this.approvalExpiryDate && this.approvalExpiryDate < new Date()) {
        blockers.push('Approval has expired');
    }
    if (this.reviewStatus !== 'APPROVED') {
        blockers.push(`Review status is ${this.reviewStatus}, must be APPROVED`);
    }
    if (!this.ratePolicy.maxRequestsPerDay && !this.ratePolicy.maxRequestsPerHour) {
        blockers.push('No rate policy configured — cannot guess limits');
    }
    if (!this.identityRequirements.verified) {
        blockers.push('Source identity requirements are not verified with real data');
    }
    if (this.permittedFields.length === 0) {
        blockers.push('No permitted fields configured');
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

export { AUTHORITY_CODES, PERMISSION_STATUSES, ACCESS_METHODS };
export default mongoose.model('AuthoritySourceSettings', AuthoritySourceSettingsSchema);
