import mongoose from 'mongoose';

const dispatchJobSchema = new mongoose.Schema({
    leadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true }],
    dealIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true }],
    toggles: {
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        whatsapp: { type: Boolean, default: false }
    },
    hidePrice: { type: Boolean, default: false },
    matchContext: { type: String, enum: ['perfect', 'top'], default: 'perfect' },
    scheduledAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    errorLog: { type: String }
}, {
    timestamps: true
});

// Index for efficient querying by the cron job
dispatchJobSchema.index({ status: 1, scheduledAt: 1 });

const DispatchJob = mongoose.model('DispatchJob', dispatchJobSchema);

export default DispatchJob;
