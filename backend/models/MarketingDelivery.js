import mongoose from 'mongoose';

const marketingDeliverySchema = new mongoose.Schema({
    jobId: { type: String, required: true },
    recipientId: { type: String, required: true },
    channel: { type: String, required: true },
    campaignRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignRun' },
    campaignName: { type: String },
    status: { 
        type: String, 
        enum: ['IN_PROGRESS', 'SENT', 'FAILED_RETRYABLE', 'FAILED_FINAL'],
        default: 'IN_PROGRESS' 
    },
    providerMessageId: { type: String },
    error: { type: String },
    attempts: { type: Number, default: 1 },
    lastAttemptAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// The core idempotency boundary
marketingDeliverySchema.index({ jobId: 1, recipientId: 1, channel: 1 }, { unique: true });

// For selection of delivery on inbound events
marketingDeliverySchema.index({ recipientId: 1, status: 1, lastAttemptAt: -1 }, { name: 'idx_delivery_selection' });

export default mongoose.model('MarketingDelivery', marketingDeliverySchema);
