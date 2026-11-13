import mongoose from 'mongoose';

// A reservation is retained for the entire policy period, including ambiguous
// provider outcomes. This prevents cross-campaign repeat contact on retries.
const OwnerOutreachPeriodReservationSchema = new mongoose.Schema({
    endpointHash: { type: String, required: true },
    channel: { type: String, enum: ['whatsapp', 'sms', 'rcs', 'email'], required: true },
    periodKey: { type: String, required: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'OwnerOutreachCampaign', required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'OwnerOutreachRecipient', required: true },
    state: { type: String, enum: ['RESERVED', 'SENT', 'FAILED_CONFIRMED', 'DELIVERY_UNKNOWN'], default: 'RESERVED' }
}, { timestamps: true, strict: 'throw' });

OwnerOutreachPeriodReservationSchema.index(
    { endpointHash: 1, channel: 1, periodKey: 1 },
    { unique: true, name: 'uniq_owner_outreach_endpoint_period' }
);
OwnerOutreachPeriodReservationSchema.index({ campaignId: 1, createdAt: -1 });

export default mongoose.models.OwnerOutreachPeriodReservation ||
    mongoose.model('OwnerOutreachPeriodReservation', OwnerOutreachPeriodReservationSchema);
