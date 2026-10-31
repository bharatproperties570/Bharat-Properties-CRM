import mongoose from 'mongoose';

const broadcastCampaignSchema = new mongoose.Schema({
    campaignId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    dealId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deal',
        index: true
    },
    dealIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deal'
    }],
    dealTitle: {
        type: String,
        default: 'Broadcast Deal'
    },
    status: {
        type: String,
        enum: ['INITIALIZING', 'ACTIVE', 'COOLDOWN', 'PAUSED', 'CANCELLED', 'COMPLETED', 'FAILED'],
        default: 'INITIALIZING',
        index: true
    },
    totalRecipients: {
        type: Number,
        default: 0
    },
    processedRecipients: {
        type: Number,
        default: 0
    },
    currentIndex: {
        type: Number,
        default: 0
    },
    channels: [{
        type: String,
        default: 'whatsapp'
    }],
    isBaileys: {
        type: Boolean,
        default: false
    },
    provider: {
        type: String,
        enum: ['META', 'BAILEYS', 'HYBRID'],
        default: 'META'
    },
    isCooldown: {
        type: Boolean,
        default: false
    },
    nextDispatchAt: {
        type: Date
    },
    cooldownUntil: {
        type: Date
    },
    delayMs: {
        type: Number,
        default: 0
    },
    stats: {
        sent: { type: Number, default: 0 },
        accepted: { type: Number, default: 0 },
        delivered: { type: Number, default: 0 },
        read: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        unknown: { type: Number, default: 0 },
        suppressed: { type: Number, default: 0 },
        skipped: { type: Number, default: 0 }
    },
    auditLog: [{
        action: {
            type: String,
            enum: ['CREATED', 'PAUSED', 'RESUMED', 'CANCELLED', 'RETRY_INITIATED', 'COMPLETED'],
            required: true
        },
        performedBy: {
            type: String,
            default: 'System'
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        reason: {
            type: String
        }
    }],
    campaignParams: {
        type: mongoose.Schema.Types.Mixed
    },
    retryLock: {
        active: { type: Boolean, default: false },
        lockedAt: { type: Date },
        lockedBy: { type: String }
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date
    }
}, {
    timestamps: true
});

broadcastCampaignSchema.index({ status: 1, createdAt: -1 });
broadcastCampaignSchema.index({ dealId: 1, createdAt: -1 });

export default mongoose.model('BroadcastCampaign', broadcastCampaignSchema);
