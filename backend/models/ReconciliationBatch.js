import mongoose from 'mongoose';

const ReconciliationBatchSchema = new mongoose.Schema({
    batchId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    targetClassification: {
        type: String,
        enum: ['SAFE_AUTO_MERGE', 'REVIEW_REQUIRED', 'DO_NOT_MERGE', 'ALL'],
        default: 'SAFE_AUTO_MERGE'
    },
    groupFingerprints: [{
        type: String
    }],
    totalGroups: {
        type: Number,
        default: 0
    },
    successfulOperations: {
        type: Number,
        default: 0
    },
    failedOperations: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['CREATED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL'],
        default: 'CREATED',
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    completedAt: {
        type: Date
    },
    batchErrors: [{
        fingerprint: String,
        error: String,
        timestamp: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

export default mongoose.model('ReconciliationBatch', ReconciliationBatchSchema);
