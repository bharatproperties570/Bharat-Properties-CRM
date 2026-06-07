import mongoose from 'mongoose';

const automatedIntakeSourceSchema = new mongoose.Schema({
    url: { type: String, required: true },
    source: { type: String, default: 'Automated Monitor' },
    frequency: { type: String, default: 'daily', enum: ['hourly', 'daily', 'weekly'] },
    schedule_cron: { type: String, default: '0 0 * * *' }, // Default: Daily at midnight
    is_active: { type: Boolean, default: true },
    last_run_at: { type: Date },
    last_run_status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
    error_log: [{
        timestamp: { type: Date, default: Date.now },
        message: String
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    }
}, {
    timestamps: true
});

// Ensure a tenant doesn't monitor the same URL twice
automatedIntakeSourceSchema.index({ url: 1, tenantId: 1 }, { unique: true });

const AutomatedIntakeSource = mongoose.model('AutomatedIntakeSource', automatedIntakeSourceSchema);

export default AutomatedIntakeSource;
