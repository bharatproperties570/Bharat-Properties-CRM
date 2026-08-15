import mongoose from 'mongoose';

const ExecutionLogSchema = new mongoose.Schema({
    stepId: { type: String, required: true },
    stepNumber: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'success', 'failed', 'skipped'], default: 'pending' },
    executedAt: { type: Date },
    error: { type: String },
    actionType: { type: String }
}, { _id: false });

const SequenceEnrollmentSchema = new mongoose.Schema({
    sequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sequence', required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Lead or Deal ID
    module: { type: String, enum: ['leads', 'deals', 'contacts'], required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    status: { 
        type: String, 
        enum: ['active', 'paused', 'completed', 'exited', 'failed'], 
        default: 'active' 
    },
    currentStepNumber: { type: Number, default: 1 },
    nextExecutionAt: { type: Date, required: true },
    exitReason: { type: String },
    executionLogs: [ExecutionLogSchema]
}, { timestamps: true });

// Compound index to ensure an entity isn't enrolled in the same sequence multiple times simultaneously
SequenceEnrollmentSchema.index({ sequenceId: 1, entityId: 1 }, { unique: true });
SequenceEnrollmentSchema.index({ companyId: 1, status: 1, nextExecutionAt: 1 }); // For the cron job picking up enrollments

export default mongoose.model('SequenceEnrollment', SequenceEnrollmentSchema);
