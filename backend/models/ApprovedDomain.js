import mongoose from 'mongoose';

const auditHistorySchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['approved', 'revoked', 'pending_review'],
        required: true
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    changedByEmail: {
        type: String,
        trim: true
    },
    changedByRole: {
        type: String,
        trim: true
    },
    reason: {
        type: String,
        trim: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { _id: true });

const approvedDomainSchema = new mongoose.Schema({
    domain: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    status: {
        type: String,
        required: true,
        enum: ['approved', 'revoked', 'pending_review'],
        default: 'pending_review',
        index: true
    },
    operatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    operatorEmail: {
        type: String,
        trim: true
    },
    operatorRole: {
        type: String,
        trim: true
    },
    approvedAt: {
        type: Date
    },
    approvalReason: {
        type: String,
        trim: true
    },
    revokedAt: {
        type: Date
    },
    revokedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    revokedByEmail: {
        type: String,
        trim: true
    },
    revokedByRole: {
        type: String,
        trim: true
    },
    revocationReason: {
        type: String,
        trim: true
    },
    notes: {
        type: String,
        trim: true
    },
    auditHistory: [auditHistorySchema]
}, {
    timestamps: true
});

const ApprovedDomain = mongoose.model('ApprovedDomain', approvedDomainSchema);

export default ApprovedDomain;
