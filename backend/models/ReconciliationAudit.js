import mongoose from 'mongoose';

const ReconciliationAuditSchema = new mongoose.Schema({
    operationId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    groupFingerprint: {
        type: String,
        required: true,
        index: true
    },
    operationType: {
        type: String,
        enum: ['AUTO_MERGE', 'MANUAL_MERGE', 'PHONE_DISASSOCIATION', 'ROLLBACK'],
        required: true,
        index: true
    },
    canonicalMasterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact'
    },
    duplicateContactIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact'
    }],
    phoneMasked: {
        type: String,
        required: true
    },
    beforeSnapshots: [{
        contactId: mongoose.Schema.Types.ObjectId,
        snapshot: mongoose.Schema.Types.Mixed
    }],
    afterSnapshots: [{
        contactId: mongoose.Schema.Types.ObjectId,
        snapshot: mongoose.Schema.Types.Mixed
    }],
    fieldChanges: [{
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed
    }],
    referenceRewires: [{
        collectionName: String,
        documentId: mongoose.Schema.Types.ObjectId,
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed
    }],
    operator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'ROLLED_BACK'],
        default: 'SUCCESS',
        index: true
    },
    rollbackAvailable: {
        type: Boolean,
        default: true
    },
    rollbackOperationId: {
        type: String
    },
    error: {
        type: String
    }
}, {
    timestamps: true
});

export default mongoose.model('ReconciliationAudit', ReconciliationAuditSchema);
