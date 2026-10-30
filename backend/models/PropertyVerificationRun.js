import mongoose from 'mongoose';

/**
 * PropertyVerificationRun
 * 
 * Tracks a verification run request — single or bulk.
 * A run groups multiple RunItems. The run itself does NOT fetch data;
 * live adapters are a later phase.
 */

const RUN_MODES = [
    'SINGLE',      // Single property verification
    'BULK_MANUAL', // Manually triggered bulk verification
    'BULK_SCHEDULED' // Triggered by weekly schedule (future)
];

const RUN_STATUSES = [
    'CREATED',      // Run record created, not yet started
    'QUEUED',       // Submitted to queue for processing
    'PROCESSING',   // Actively being processed
    'PAUSED',       // Temporarily paused at batch boundary
    'COMPLETED',    // All items processed
    'PARTIAL',      // Some items succeeded, some failed
    'FAILED',       // Run-level failure (e.g., source disabled)
    'CANCELLED',    // Cancelled by user or system
    'POLICY_REJECTED' // Rejected by activation gate
];

const PropertyVerificationRunSchema = new mongoose.Schema({
    // ========== Identity ==========
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    authorityCode: {
        type: String,
        required: true,
        enum: ['HSVP', 'CHD', 'GMADA'],
        index: true
    },

    // ========== Requester ==========
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    requestedAt: {
        type: Date,
        default: Date.now
    },

    // ========== Run Configuration ==========
    runMode: {
        type: String,
        required: true,
        enum: RUN_MODES
    },
    policyVersion: {
        type: String,
        default: null  // Policy version at time of request
    },
    isFixtureMode: {
        type: Boolean,
        default: false
    },
    provenance: {
        type: String,
        enum: ['LIVE', 'SYNTHETIC_FIXTURE']
    },

    // ========== Lifecycle ==========
    status: {
        type: String,
        required: true,
        enum: RUN_STATUSES,
        default: 'CREATED',
        index: true
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },

    // ========== Pause Tracking ==========
    pausedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    pausedAt: {
        type: Date,
        default: null
    },
    pauseReason: {
        type: String,
        default: null
    },

    // ========== Counters ==========
    totalItems: {
        type: Number,
        default: 0
    },
    processedItems: {
        type: Number,
        default: 0
    },
    succeededItems: {
        type: Number,
        default: 0
    },
    failedItems: {
        type: Number,
        default: 0
    },
    skippedItems: {
        type: Number,
        default: 0
    },

    // ========== Cancellation ==========
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    cancelledAt: {
        type: Date,
        default: null
    },
    cancellationReason: {
        type: String,
        default: null
    },

    // ========== Error Summary ==========
    errorSummary: {
        type: String,
        default: null
    },
    policyRejectionReasons: {
        type: [String],
        default: []
    }
}, {
    timestamps: true,
    collection: 'property_verification_runs'
});

// ========== Indexes ==========
PropertyVerificationRunSchema.index({ tenantId: 1, status: 1 });
PropertyVerificationRunSchema.index({ tenantId: 1, runMode: 1, createdAt: -1 });
PropertyVerificationRunSchema.index({ tenantId: 1, authorityCode: 1, createdAt: -1 });
PropertyVerificationRunSchema.index({ requestedBy: 1, createdAt: -1 });

// ========== Methods ==========
PropertyVerificationRunSchema.methods.markPolicyRejected = function (reasons) {
    this.status = 'POLICY_REJECTED';
    this.policyRejectionReasons = reasons;
    this.completedAt = new Date();
    return this.save();
};

PropertyVerificationRunSchema.methods.toSummary = function () {
    return {
        _id: this._id,
        authorityCode: this.authorityCode,
        runMode: this.runMode,
        isFixtureMode: Boolean(this.isFixtureMode),
        provenance: this.provenance || (this.isFixtureMode ? 'SYNTHETIC_FIXTURE' : undefined),
        status: this.status,
        totalItems: this.totalItems,
        processedItems: this.processedItems,
        succeededItems: this.succeededItems,
        failedItems: this.failedItems,
        skippedItems: this.skippedItems,
        requestedAt: this.requestedAt,
        completedAt: this.completedAt,
        pausedAt: this.pausedAt,
        pauseReason: this.pauseReason,
        policyRejectionReasons: this.policyRejectionReasons
    };
};

// ========== Statics ==========
PropertyVerificationRunSchema.statics.getRecentForTenant = function (tenantId, limit = 20) {
    return this.find({ tenantId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('requestedBy', 'fullName email');
};

export { RUN_MODES, RUN_STATUSES };
export default mongoose.model('PropertyVerificationRun', PropertyVerificationRunSchema);
