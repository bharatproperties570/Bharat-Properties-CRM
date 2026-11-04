import mongoose from 'mongoose';

const marketingDeliverySchema = new mongoose.Schema({
    jobId: { type: String, required: true },
    recipientId: { type: String, required: true },
    channel: { type: String, required: true },
    campaignRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignRun' },
    campaignName: { type: String },
    status: { 
        type: String, 
        enum: [
            'IN_PROGRESS', 
            'QUEUED', 
            'ACCEPTED', 
            'SENT', 
            'DELIVERED', 
            'READ', 
            'DELIVERY_UNKNOWN', 
            'FAILED_RETRYABLE', 
            'FAILED_FINAL', 
            'SKIPPED_DUPLICATE', 
            'SUPPRESSED_OPTOUT'
        ],
        default: 'IN_PROGRESS' 
    },
    provider: { type: String, enum: ['META', 'BAILEYS', 'MOCK'], default: 'BAILEYS' },
    providerMessageId: { type: String },
    error: { type: String },
    attempts: { type: Number, default: 1 },
    retryClaimed: { type: Boolean, default: false },
    retryCampaignId: { type: String },
    lastAttemptAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// The core idempotency boundary
marketingDeliverySchema.index({ jobId: 1, recipientId: 1, channel: 1 }, { unique: true });

// For selection of delivery on inbound events
marketingDeliverySchema.index({ recipientId: 1, status: 1, lastAttemptAt: -1 }, { name: 'idx_delivery_selection' });

// Fast lookup for retry candidate selection and atomic claims
marketingDeliverySchema.index({ jobId: 1, retryClaimed: 1, status: 1 });

// Fast lookup by providerMessageId for webhook status callbacks
marketingDeliverySchema.index({ providerMessageId: 1 }, { sparse: true });

export default mongoose.model('MarketingDelivery', marketingDeliverySchema);
