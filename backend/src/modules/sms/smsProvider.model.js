import mongoose from 'mongoose';

const SmsProviderSchema = new mongoose.Schema({
    provider: {
        type: String,
        enum: ['Twilio', 'SMSGatewayHub', 'Custom HTTP'],
        required: true,
        unique: true
    },
    config: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
        default: {}
    },
    isActive: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['Connected', 'Not Connected', 'Error'],
        default: 'Not Connected'
    },
    lastTestedAt: {
        type: Date
    }
}, { timestamps: true });

// Ensure only one provider is active at a time
SmsProviderSchema.pre('save', async function (next) {
    if (this.isActive) {
        await this.constructor.updateMany(
            { _id: { $ne: this._id } },
            { $set: { isActive: false } }
        );
    }
    next();
});

export default mongoose.models.SmsProvider || mongoose.model('SmsProvider', SmsProviderSchema);
