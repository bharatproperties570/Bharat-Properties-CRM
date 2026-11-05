import mongoose from 'mongoose';

const ReconciliationGroupSchema = new mongoose.Schema({
    fingerprint: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    phoneNumber: {
        type: String,
        required: true,
        index: true
    },
    phoneMasked: {
        type: String,
        required: true
    },
    primaryClassification: {
        type: String,
        enum: ['SAFE_AUTO_MERGE', 'REVIEW_REQUIRED', 'DO_NOT_MERGE'],
        required: true,
        index: true
    },
    confidence: {
        type: String,
        enum: ['HIGH', 'MEDIUM', 'LOW'],
        default: 'HIGH'
    },
    reasonCodes: [{
        type: String
    }],
    evidence: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    contactIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact'
    }],
    suggestedCanonicalMasterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact'
    },
    suggestedDuplicateIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact'
    }],
    selectedCanonicalMasterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact'
    },
    approvedFingerprint: {
        type: String,
        default: null,
        index: true
    },
    status: {
        type: String,
        enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXECUTED', 'ROLLED_BACK', 'DISASSOCIATED'],
        default: 'PENDING_REVIEW',
        index: true
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: {
        type: Date
    },
    reviewNotes: {
        type: String
    },
    executedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    executedAt: {
        type: Date
    },
    mergeOperationId: {
        type: String,
        index: true
    },
    phoneDisassociationPlan: {
        type: mongoose.Schema.Types.Mixed
    },
    phoneDisassociationResult: {
        type: mongoose.Schema.Types.Mixed
    },
    dryRunPlan: {
        type: mongoose.Schema.Types.Mixed
    },
    migrationReadinessStatus: {
        type: String,
        enum: ['PENDING', 'RESOLVED', 'BLOCKED'],
        default: 'PENDING',
        index: true
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        default: null
    }
}, {
    timestamps: true
});

export default mongoose.model('ReconciliationGroup', ReconciliationGroupSchema);
