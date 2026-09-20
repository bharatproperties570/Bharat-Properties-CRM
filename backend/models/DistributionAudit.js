import mongoose from 'mongoose';

const DistributionAuditSchema = new mongoose.Schema({
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    modelName: { type: String, required: true },
    cycleId: { type: String, required: true },
    triggerEvent: { type: String, required: true },
    status: { type: String, enum: ['COMPLETED', 'SKIPPED', 'FAILED'], required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ruleName: { type: String },
    reason: { type: String },
    attempt: { type: Number, default: 1 },
    completedAt: { type: Date, default: Date.now }
});

// Indexes for cycle lookups and reporting
DistributionAuditSchema.index({ cycleId: 1 });
DistributionAuditSchema.index({ entityId: 1, modelName: 1 });

// Prevent duplicate COMPLETED audits for the same cycle
DistributionAuditSchema.index({ cycleId: 1, status: 1 }, { 
    unique: true, 
    name: 'unique_completed_cycle', partialFilterExpression: { status: 'COMPLETED' } 
});

// Prevent duplicate FAILED terminal audits for the same cycle
DistributionAuditSchema.index({ cycleId: 1, status: 1 }, { 
    unique: true, 
    name: 'unique_failed_cycle', partialFilterExpression: { status: 'FAILED' } 
});

export default mongoose.model('DistributionAudit', DistributionAuditSchema);
