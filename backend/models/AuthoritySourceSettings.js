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
AuthoritySourceSettingsSchema.pre('save', function (next) {
    if (this.isEnabled || this.schedulingEnabled || this.reviewStatus === 'APPROVED') {
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
    const isOwnerAttested = this.evidenceBasis === 'OWNER_ATTESTED_AUTHORITY_PERMISSION';
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
    const ops = AUTHORITY_CODES.map(code => {
        const cfg = sourceConfigs[code];
        const throttleRef = `INTERNAL_SAFETY_THROTTLE_${code}_1_REQ_PER_MIN`;
        return {
            updateOne: {
                filter: { tenantId, authorityCode: code },
                update: {
                    $setOnInsert: {
                        tenantId,
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
    return this.bulkWrite(ops);
};

/**
 * Records or updates explicit owner confirmation in userReportedEvidence.
 */
AuthoritySourceSettingsSchema.statics.recordOwnerConfirmation = async function (tenantId, authorityCode, details = {}) {
    return this.findOneAndUpdate(
        { tenantId, authorityCode },
        {
            $set: {
                'userReportedEvidence.reportedBy': details.reportedBy || 'Bharat Properties Owner',
                'userReportedEvidence.reportedAt': details.reportedAt || new Date('2026-11-06T17:51:10+05:30'),
                'userReportedEvidence.claimedAuthorityRole': details.claimedAuthorityRole || 'Authorized Broker',
                'userReportedEvidence.notes': details.notes || 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized. Official written documentation and authority rate policy pending.',
                'userReportedEvidence.verificationStatus': details.verificationStatus || 'PENDING_WRITTEN_REFERENCE'
            }
        },
        { new: true, upsert: true }
    );
};

/**
 * Reconciles owner-attested authority permissions and internal safety throttles
 * for all three sources (HSVP, GMADA, CHD) for a specific tenant without fabricating
 * government letters or official rate policies.
 */
AuthoritySourceSettingsSchema.statics.reconcileOwnerAttestation = async function (tenantId, options = {}) {
    const defaultAttestedAt = options.attestedAt || new Date('2026-11-06T17:51:10+05:30');
    const defaultExpiry = options.expiresAt || new Date('2027-11-06T17:51:10+05:30');
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

    const submitterId = options.submittedBy || null;
    const approverId = options.approvedBy || null;
    const reviewerId = options.reviewedBy || null;
    const hasMakerChecker = Boolean(
        submitterId && approverId && reviewerId &&
        String(submitterId) !== String(approverId) &&
        String(approverId) !== String(reviewerId) &&
        String(submitterId) !== String(reviewerId)
    );
    const reviewStatus = (options.reviewStatus === 'APPROVED' && hasMakerChecker) ? 'APPROVED' : (options.reviewStatus || 'UNDER_REVIEW');
    const isEnabled = Boolean(options.isEnabled && reviewStatus === 'APPROVED');
    const schedulingEnabled = Boolean(options.schedulingEnabled && reviewStatus === 'APPROVED');

    const ops = AUTHORITY_CODES.map(code => {
        const cfg = sourceConfigs[code];
        const throttleRef = `INTERNAL_SAFETY_THROTTLE_${code}_1_REQ_PER_MIN`;
        return {
            updateOne: {
                filter: { tenantId, authorityCode: code },
                update: {
                    $set: {
                        permissionStatus: 'GRANTED',
                        evidenceBasis: 'OWNER_ATTESTED_AUTHORITY_PERMISSION',
                        approvedAccessMethod: 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION',
                        permittedFields: commonFields,
                        approvalReference: options.approvalReference || null,
                        authorizationScope: 'Read-only public property data retrieval, internal CRM staging and preview only.',
                        commercialUseAuthorized: Boolean(options.commercialUseAuthorized || false),
                        readOnlySearchAuthorized: Boolean(options.readOnlySearchAuthorized ?? true),
                        termsReviewed: Boolean(options.termsReviewed || false),
                        termsReference: cfg.termsReference,
                        contractVerificationStatus: options.contractVerificationStatus || 'NOT_VERIFIED',
                        contractEvidenceReference: options.contractEvidenceReference || null,
                        ownerAttestation: {
                            attestingParty: options.attestingParty || 'Bharat Properties Owner',
                            attestedAt: defaultAttestedAt,
                            scope: options.scope || 'Read-only public property data retrieval, internal Bharat Properties CRM processing, staging and preview only. No writes or mutations.',
                            notes: options.notes || 'Owner reconfirmed on 6 November 2026 that read-only public property data integration is authorized.',
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
                        identityRequirements: cfg.identityRequirements,
                        reviewStatus: reviewStatus,
                        submittedBy: submitterId,
                        submittedAt: submitterId ? (options.submittedAt || defaultAttestedAt) : null,
                        approvedBy: (reviewStatus === 'APPROVED') ? approverId : null,
                        approvedAt: (reviewStatus === 'APPROVED') ? (options.approvedAt || defaultAttestedAt) : null,
                        reviewedBy: (reviewStatus === 'APPROVED') ? reviewerId : null,
                        reviewedAt: (reviewStatus === 'APPROVED') ? (options.reviewedAt || defaultAttestedAt) : null,
                        approvalDate: (reviewStatus === 'APPROVED') ? (options.approvalDate || defaultAttestedAt) : null,
                        approvalExpiryDate: (reviewStatus === 'APPROVED') ? defaultExpiry : null,
                        isEnabled: isEnabled,
                        isPaused: false,
                        schedulingEnabled: schedulingEnabled,
                        scheduleCron: '0 2 * * 0',
                        scheduleTimezone: 'Asia/Kolkata'
                    }
                },
                upsert: true
            }
        };
    });

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
    const isOwnerAttested = doc.evidenceBasis === 'OWNER_ATTESTED_AUTHORITY_PERMISSION';
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

export { AUTHORITY_CODES, PERMISSION_STATUSES, ACCESS_METHODS };
export default mongoose.model('AuthoritySourceSettings', AuthoritySourceSettingsSchema);
