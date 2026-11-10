import mongoose from 'mongoose';

const SystemServiceReplayLedgerSchema = new mongoose.Schema({
    signature: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    nonce: { 
        type: String, 
        required: true, 
        index: true 
    },
    serviceId: { 
        type: String, 
        required: true,
        index: true
    },
    entityId: { 
        type: String, 
        default: null 
    },
    documentId: { 
        type: String, 
        default: null 
    },
    idempotencyKey: { 
        type: String, 
        default: null,
        index: true
    },
    claimToken: {
        type: String,
        default: null
    },
    leaseExpiresAt: {
        type: Date,
        default: null
    },
    inTransaction: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['CONSUMED', 'COMMITTED', 'FAILED'],
        default: 'CONSUMED',
        index: true
    },
    attempts: {
        type: Number,
        default: 1
    },
    consumedAt: { 
        type: Date, 
        required: true, 
        default: Date.now 
    },
    committedAt: {
        type: Date,
        default: null
    },
    failedAt: {
        type: Date,
        default: null
    },
    failureReason: {
        type: String,
        default: null
    },
    expiresAt: { 
        type: Date, 
        required: true, 
        index: { expires: 0 }
    }
}, {
    timestamps: true
});

// Compound unique index on serviceId + nonce to ensure nonce uniqueness per service
SystemServiceReplayLedgerSchema.index({ serviceId: 1, nonce: 1 }, { unique: true });

const SystemServiceReplayLedger = mongoose.models.SystemServiceReplayLedger || 
                                  mongoose.model('SystemServiceReplayLedger', SystemServiceReplayLedgerSchema);

/**
 * Ensures all required unique and TTL indexes exist on the SystemServiceReplayLedger collection.
 * Application startup or test suites invoke this to fail closed if indexes cannot be verified.
 * 
 * @returns {Promise<boolean>}
 */
export async function ensureReplayIndexes() {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
        await SystemServiceReplayLedger.createIndexes();
        const indexes = await SystemServiceReplayLedger.collection.indexes();
        const hasSignatureIndex = indexes.some(idx => idx.unique && idx.key && idx.key.signature === 1);
        const hasServiceNonceIndex = indexes.some(idx => idx.unique && idx.key && idx.key.serviceId === 1 && idx.key.nonce === 1);
        const hasTTLIndex = indexes.some(idx => idx.key && idx.key.expiresAt === 1);
        
        if (!hasSignatureIndex || !hasServiceNonceIndex || !hasTTLIndex) {
            throw new Error('REPLAY_LEDGER_INDEXES_MISSING: Required unique or TTL indexes are missing from SystemServiceReplayLedger.');
        }
        return true;
    }
    return false;
}

export default SystemServiceReplayLedger;
