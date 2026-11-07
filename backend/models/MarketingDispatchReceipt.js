import mongoose from 'mongoose';

const MarketingDispatchReceiptSchema = new mongoose.Schema({
    dispatchKey: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    jobName: {
        type: String,
        required: true
    },
    eventId: {
        type: String,
        index: true
    },
    status: {
        type: String,
        enum: ['QUEUED', 'DISPATCHING', 'COMPLETED', 'FAILED', 'AMBIGUOUS', 'SKIPPED_DUPLICATE'],
        default: 'QUEUED',
        index: true
    },
    result: {
        type: mongoose.Schema.Types.Mixed
    },
    error: {
        type: String
    },
    dispatchedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date
    }
}, { timestamps: true });

const MarketingDispatchReceipt = mongoose.models.MarketingDispatchReceipt || mongoose.model('MarketingDispatchReceipt', MarketingDispatchReceiptSchema);

export default MarketingDispatchReceipt;
