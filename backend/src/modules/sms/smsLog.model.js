import mongoose from 'mongoose';

const SmsLogSchema = new mongoose.Schema({
    to: {
        type: String,
        required: true,
        index: true
    },
    message: {
        type: String,
        required: true
    },
    provider: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Sent', 'Delivered', 'Failed'],
        default: 'Pending',
        index: true
    },
    entityType: {
        type: String,
        enum: ['Lead', 'Deal', 'Contact', 'System'],
        default: 'System'
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    providerId: {
        type: String,
        index: true
    },
    error: {
        type: String
    },
    sentAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

export default mongoose.model('SmsLog', SmsLogSchema);
