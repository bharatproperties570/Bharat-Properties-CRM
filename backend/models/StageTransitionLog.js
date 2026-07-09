import mongoose from 'mongoose';

const StageTransitionLogSchema = new mongoose.Schema({
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity' },
    activityType: { type: String, required: true },
    purpose: { type: String, default: '' },
    outcome: { type: String, required: true },
    reason: { type: String, default: '' },
    status: { 
        type: String, 
        enum: ['pending', 'success', 'matched', 'no_rule', 'missing_fields', 'already_in_stage', 'regression_blocked'], 
        required: true 
    },
    matchedRuleId: { type: String, default: null },
    newStage: { type: String, default: null },
    failureReason: { type: String, default: null },
    triggeredByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
    timestamps: true
});

// Index for querying recent logs efficiently
StageTransitionLogSchema.index({ createdAt: -1 });
StageTransitionLogSchema.index({ leadId: 1 });
StageTransitionLogSchema.index({ status: 1 });

export default mongoose.model('StageTransitionLog', StageTransitionLogSchema);
