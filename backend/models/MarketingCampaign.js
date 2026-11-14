import mongoose from 'mongoose';
import softDeletePlugin from '../plugins/softDelete.plugin.js';

const marketingCampaignSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Campaign name is required'],
        trim: true
    },
    archetype: {
        type: String,
        enum: ['NEW_LAUNCH', 'INVENTORY_BLAST', 'SITE_VISIT_DRIVE', 'FESTIVAL_OFFER', 'COLD_REVIVAL', 'BROKER_BROADCAST', 'CUSTOM'],
        default: 'INVENTORY_BLAST'
    },
    channel: {
        type: String,
        enum: ['wa', 'email', 'sms', 'rcs', 'omnichannel'],
        default: 'wa'
    },
    status: {
        type: String,
        enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED'],
        default: 'DRAFT'
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        index: true
    },
    targetAudience: {
        source: { type: String, default: 'Lead' },
        segment: { type: String, default: 'all' },
        filters: { type: mongoose.Schema.Types.Mixed, default: {} },
        recipientCount: { type: Number, default: 0 }
    },
    content: {
        templateName: { type: String, default: '' },
        templateId: { type: String, default: '' },
        subject: { type: String, default: '' },
        body: { type: String, default: '' },
        mediaUrl: { type: String, default: '' },
        variablesMapping: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    schedule: {
        isScheduled: { type: Boolean, default: false },
        scheduledAt: { type: Date },
        frequency: { type: String, default: 'once' }
    },
    budget: {
        type: Number,
        default: 0,
        min: 0
    },
    actualCost: {
        type: Number,
        default: 0,
        min: 0
    },
    metrics: {
        targeted: { type: Number, default: 0 },
        sent: { type: Number, default: 0 },
        delivered: { type: Number, default: 0 },
        read: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        inboundReplies: { type: Number, default: 0 },
        leadsGenerated: { type: Number, default: 0 },
        dealsClosed: { type: Number, default: 0 },
        attributedRevenue: { type: Number, default: 0 }
    },
    dealId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deal',
        default: null
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: null
    },
    jobId: {
        type: String,
        default: null
    },
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    objectives: {
        type: String,
        trim: true
    },
    auditLog: [{
        action: { type: String },
        performedBy: { type: String },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String }
    }]
}, {
    timestamps: true
});

marketingCampaignSchema.plugin(softDeletePlugin);

// Fast indexing for campaign queries
marketingCampaignSchema.index({ status: 1, createdAt: -1 });
marketingCampaignSchema.index({ archetype: 1 });
marketingCampaignSchema.index({ channel: 1 });

export default mongoose.model('MarketingCampaign', marketingCampaignSchema);
