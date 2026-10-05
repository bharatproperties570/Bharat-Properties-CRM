import mongoose from 'mongoose';

const AutomationLogSchema = new mongoose.Schema({
    ruleType: { type: String, enum: ['Trigger', 'Sequence', 'AutomatedAction', 'ScoringRule', 'TimeBasedTrigger', 'IdempotencyLock', 'DomainEvent'], required: true },
    ruleId: { type: mongoose.Schema.Types.ObjectId, required: function() { return this.ruleType !== 'IdempotencyLock' && this.ruleType !== 'DomainEvent'; } },
    targetEntityId: { type: mongoose.Schema.Types.ObjectId, required: function() { return this.ruleType !== 'IdempotencyLock'; } }, // e.g. Lead ID, Deal ID
    targetModule: { type: String, required: function() { return this.ruleType !== 'IdempotencyLock'; } },
    status: { type: String, enum: ['success', 'failed', 'pending'], default: 'success' },
    details: mongoose.Schema.Types.Mixed, // Stores error messages or execution results
    idempotencyKey: { type: String, unique: true, sparse: true, index: true }, // Prevents duplicate execution
    executedAt: { type: Date, default: Date.now },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
});

export default mongoose.model('AutomationLog', AutomationLogSchema);
