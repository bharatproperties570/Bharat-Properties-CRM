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
    status: {
        type: String,
        enum: ['CONSUMED', 'COMMITTED', 'FAILED'],
        default: 'CONSUMED',
        index: true
    },
    consumedAt: { 
        type: Date, 
        required: true, 
        default: Date.now 
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

export default SystemServiceReplayLedger;
