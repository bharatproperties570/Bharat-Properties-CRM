import mongoose from 'mongoose';

const FailedJobLogSchema = new mongoose.Schema({
    queueName: { type: String, required: true },
    jobId: { type: String, required: true },
    jobName: { type: String, required: true },
    attemptsMade: { type: Number, required: true },
    maxAttempts: { type: Number, required: true },
    firstFailureAt: { type: Date, required: true },
    terminalFailureAt: { type: Date, required: true },
    errorType: { type: String, required: true },
    errorCode: { type: String },
    errorMessage: { type: String, maxlength: 2000 },
    retryable: { type: Boolean, required: true },
    correlationId: { type: String },
    entityId: { type: mongoose.Schema.Types.Mixed },
    entityType: { type: String },
    eventId: { type: String },
    payloadRef: {
        type: { type: String, enum: ['identifier', 'redacted', 'reference'] },
        ref: { type: String }
    },
    status: { 
        type: String, 
        enum: ['TERMINAL', 'ACKNOWLEDGED', 'REPLAYED'], 
        default: 'TERMINAL' 
    },
    replayMetadata: { type: mongoose.Schema.Types.Mixed }
}, {
    timestamps: true
});


// Unique sparse index on jobId to ensure idempotency across multiple worker processes racing
FailedJobLogSchema.index({ jobId: 1 }, { unique: true, sparse: true });

// Required C9 Dashboard/Observability Indexes
FailedJobLogSchema.index({ queueName: 1, terminalFailureAt: -1 });
FailedJobLogSchema.index({ status: 1, terminalFailureAt: -1 });
FailedJobLogSchema.index({ entityId: 1, entityType: 1 });


export default mongoose.models.FailedJobLog || mongoose.model('FailedJobLog', FailedJobLogSchema);
