import mongoose from 'mongoose';

/**
 * Durable, auditable unit of recurring Owner Outreach work.
 * This model deliberately records batch intent only; it does not enqueue or
 * dispatch messages. A later worker must claim batches with a lease and
 * revalidate consent/provider readiness immediately before dispatch.
 */
const OwnerOutreachBatchSchema = new mongoose.Schema({
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'OwnerOutreachCampaign', required: true, index: true },
    sequence: { type: Number, required: true, min: 1 },
    status: {
        type: String,
        enum: ['SCHEDULED', 'CLAIMED', 'READY', 'DISPATCHING', 'COMPLETED', 'PARTIAL', 'CANCELLED', 'RECONCILIATION_REQUIRED'],
        default: 'SCHEDULED',
        index: true
    },
    scheduledAt: { type: Date, required: true, index: true },
    recipientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OwnerOutreachRecipient' }],
    counts: {
        selected: { type: Number, default: 0, min: 0 },
        consentBlocked: { type: Number, default: 0, min: 0 },
        suppressed: { type: Number, default: 0, min: 0 },
        accepted: { type: Number, default: 0, min: 0 },
        delivered: { type: Number, default: 0, min: 0 },
        failedConfirmed: { type: Number, default: 0, min: 0 },
        deliveryUnknown: { type: Number, default: 0, min: 0 }
    },
    claim: {
        owner: { type: String, default: null },
        token: { type: String, default: null },
        claimedAt: { type: Date, default: null },
        leaseExpiresAt: { type: Date, default: null }
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    lastErrorCode: { type: String, maxlength: 100 }
}, { timestamps: true, strict: 'throw' });

OwnerOutreachBatchSchema.index({ campaignId: 1, sequence: 1 }, { unique: true, name: 'uniq_owner_outreach_campaign_batch_sequence' });
OwnerOutreachBatchSchema.index({ status: 1, scheduledAt: 1, 'claim.leaseExpiresAt': 1 });
OwnerOutreachBatchSchema.index({ campaignId: 1, status: 1, sequence: 1 });

export default mongoose.models.OwnerOutreachBatch || mongoose.model('OwnerOutreachBatch', OwnerOutreachBatchSchema);
