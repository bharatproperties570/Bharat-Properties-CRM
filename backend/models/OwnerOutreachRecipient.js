import mongoose from 'mongoose';

const OwnerOutreachRecipientSchema = new mongoose.Schema({
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'OwnerOutreachCampaign', required: true, index: true },
    channel: { type: String, enum: ['whatsapp', 'sms', 'rcs', 'email'], required: true },
    endpointHash: { type: String, required: true },
    maskedEndpoint: { type: String, required: true },
    contactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    inventoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' }],
    relationships: [{ type: String }],
    consentState: { type: String, enum: ['CONSENTED', 'UNKNOWN', 'OPTED_OUT'], default: 'UNKNOWN' },
    eligibility: { type: String, enum: ['ELIGIBLE', 'CONSENT_REQUIRED', 'SUPPRESSED_OPTOUT', 'SUPPRESSED_INVALID'], default: 'CONSENT_REQUIRED', index: true },
    dispatchState: { type: String, enum: ['PENDING', 'QUEUED', 'DISPATCHING', 'ACCEPTED', 'DELIVERED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'DELIVERY_UNKNOWN', 'SUPPRESSED'], default: 'PENDING', index: true },
    lastAttemptAt: { type: Date },
    deliveredAt: { type: Date }
}, { timestamps: true, strict: 'throw' });

OwnerOutreachRecipientSchema.index({ campaignId: 1, channel: 1, endpointHash: 1 }, { unique: true, name: 'uniq_owner_outreach_campaign_endpoint' });
OwnerOutreachRecipientSchema.index({ campaignId: 1, dispatchState: 1, _id: 1 });

export default mongoose.models.OwnerOutreachRecipient || mongoose.model('OwnerOutreachRecipient', OwnerOutreachRecipientSchema);
