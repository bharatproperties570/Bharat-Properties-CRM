import mongoose from 'mongoose';

const AutomationLogSchema = new mongoose.Schema({
    ruleType: {
        type: String,
        enum: [
            'Trigger',
            'Sequence',
            'AutomatedAction',
            'ScoringRule',
            'TimeBasedTrigger',
            'IdempotencyLock',
            'DomainEvent',
            'LeadCreationRequest',
            'TriggerDistribution',
            'IdentityConflict'
        ],
        required: true
    },
    ruleId: {
        type: mongoose.Schema.Types.ObjectId,
        required: function() {
            return !['IdempotencyLock', 'DomainEvent', 'LeadCreationRequest', 'TriggerDistribution', 'IdentityConflict'].includes(this.ruleType);
        }
    },
    targetEntityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: function() {
            return !['IdempotencyLock', 'DomainEvent', 'LeadCreationRequest', 'TriggerDistribution', 'IdentityConflict'].includes(this.ruleType);
        }
    }, // e.g. Lead ID, Deal ID
    targetModule: {
        type: String,
        required: function() {
            return !['IdempotencyLock', 'DomainEvent', 'LeadCreationRequest', 'TriggerDistribution', 'IdentityConflict'].includes(this.ruleType);
        }
    },
    status: { type: String, enum: ['success', 'failed', 'pending', 'processing'], default: 'success' },
    details: mongoose.Schema.Types.Mixed, // Stores error messages or execution results
    idempotencyKey: { type: String, unique: true, sparse: true, index: true }, // Prevents duplicate execution
    claimToken: { type: String }, // E.3-C.1 Ownership Lease Fields
    leaseUntil: { type: Date },
    tenantId: { type: mongoose.Schema.Types.ObjectId, index: true, default: null },
    executedAt: { type: Date, default: Date.now },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
});

AutomationLogSchema.index({ tenantId: 1, executedAt: -1 }, { background: true });
AutomationLogSchema.index({ claimToken: 1, leaseUntil: 1 }, { background: true });

export default mongoose.model('AutomationLog', AutomationLogSchema);
