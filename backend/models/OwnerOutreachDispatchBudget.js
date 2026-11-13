import mongoose from 'mongoose';

// Atomic daily quota bucket. One global and one per-channel counter per local day.
const OwnerOutreachDispatchBudgetSchema = new mongoose.Schema({
    bucketKey: { type: String, required: true },
    scope: { type: String, enum: ['GLOBAL', 'whatsapp', 'sms', 'rcs', 'email'], required: true },
    cap: { type: Number, required: true, min: 1 },
    reservedCount: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: true, strict: 'throw' });

OwnerOutreachDispatchBudgetSchema.index(
    { bucketKey: 1, scope: 1 },
    { unique: true, name: 'uniq_owner_outreach_daily_budget' }
);

export default mongoose.models.OwnerOutreachDispatchBudget ||
    mongoose.model('OwnerOutreachDispatchBudget', OwnerOutreachDispatchBudgetSchema);
