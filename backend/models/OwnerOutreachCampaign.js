import mongoose from 'mongoose';
import softDeletePlugin from '../plugins/softDelete.plugin.js';

const OwnerOutreachCampaignSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ['DRAFT', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'], default: 'DRAFT', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    audience: {
        inventoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' }],
        filters: { type: mongoose.Schema.Types.Mixed, default: {} },
        includeOwners: { type: Boolean, default: true },
        includeAssociates: { type: Boolean, default: false },
        excludeBrokers: { type: Boolean, default: true },
        frozenAt: { type: Date }
    },
    channels: [{ type: String, enum: ['whatsapp', 'sms', 'rcs', 'email'] }],
    messageBody: { type: String, required: true, trim: true, maxlength: 4096 },
    providerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppIntegration', required: true },
    channelStrategy: { type: String, enum: ['PRIMARY_ONLY', 'PRIMARY_WITH_FALLBACK', 'SEQUENCE'], default: 'PRIMARY_ONLY' },
    frequency: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], required: true },
    batchSize: { type: Number, required: true, min: 50, max: 2000 },
    startAt: { type: Date, required: true },
    endAt: { type: Date },
    timezone: { type: String, default: 'Asia/Kolkata' },
    dispatchWindow: {
        start: { type: String, default: '10:00' },
        end: { type: String, default: '18:00' }
    },
    totals: {
        uniquePeople: { type: Number, default: 0 },
        uniqueEndpoints: { type: Number, default: 0 },
        recipients: { type: Number, default: 0 },
        consentRequired: { type: Number, default: 0 },
        suppressed: { type: Number, default: 0 }
    },
    nextRunAt: { type: Date, default: null, index: true },
    lastRunAt: { type: Date, default: null },
    approvedAt: { type: Date },
    completedAt: { type: Date },
    cancellationReason: { type: String, maxlength: 500 }
}, { timestamps: true, strict: 'throw' });

OwnerOutreachCampaignSchema.plugin(softDeletePlugin);
OwnerOutreachCampaignSchema.index({ status: 1, nextRunAt: 1 });
OwnerOutreachCampaignSchema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.models.OwnerOutreachCampaign || mongoose.model('OwnerOutreachCampaign', OwnerOutreachCampaignSchema);
