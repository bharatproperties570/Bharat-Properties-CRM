import mongoose from 'mongoose';

const WhatsAppDispatchSchema = new mongoose.Schema({
    idempotencyKey: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    recipient: {
        type: String,
        required: true,
        index: true
    },
    channel: {
        type: String,
        enum: ['WHATSAPP', 'SMS', 'EMAIL'],
        default: 'WHATSAPP'
    },
    provider: {
        type: String,
        enum: ['META', 'BAILEYS', 'MOCK', 'GUPSHUP', 'POLICY'],
        default: 'META'
    },
    messageType: {
        type: String,
        enum: ['text', 'template', 'image', 'document', 'video', 'audio', 'location', 'contacts'],
        default: 'text'
    },
    status: {
        type: String,
        enum: ['CLAIMED', 'DISPATCHED', 'FAILED', 'AMBIGUOUS_TIMEOUT'],
        default: 'CLAIMED',
        index: true
    },
    isAmbiguous: {
        type: Boolean,
        default: false,
        index: true
    },
    claimGeneration: {
        type: Number,
        default: 1,
        index: true
    },
    claimedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    claimWorkerId: {
        type: String
    },
    dispatchedAt: {
        type: Date
    },
    providerMessageId: {
        type: String,
        index: true
    },
    requestPayloadHash: {
        type: String,
        index: true
    },
    requestPayload: {
        type: mongoose.Schema.Types.Mixed
    },
    responsePayload: {
        type: mongoose.Schema.Types.Mixed
    },
    errorDetails: {
        type: mongoose.Schema.Types.Mixed
    },
    correlationId: {
        type: String,
        index: true
    },
    deliveryStatus: {
        type: String,
        index: true
    },
    deliveryStatusAt: {
        type: Date
    },
    reconciledAt: {
        type: Date
    },
    reconciledBy: {
        type: String
    },
    reconciliationReason: {
        type: String
    },
    reconciliationStatus: {
        type: String,
        enum: ['NONE', 'RECONCILED', 'MANUAL_RECONCILIATION_REQUIRED'],
        default: 'NONE',
        index: true
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        index: true
    }
}, {
    timestamps: true
});

// TTL index to automatically purge old dispatch records after 30 days
WhatsAppDispatchSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const WhatsAppDispatch = mongoose.models.WhatsAppDispatch || mongoose.model('WhatsAppDispatch', WhatsAppDispatchSchema);

export default WhatsAppDispatch;
