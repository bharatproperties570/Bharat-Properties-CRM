import mongoose from 'mongoose';

const EffectExecutionSchema = new mongoose.Schema({
    eventId: { type: String, required: true },
    effectKey: { type: String, required: true },
    stableKey: { type: String, default: null },
    aggregateType: { type: String, required: true },
    aggregateId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'AMBIGUOUS'], default: 'PENDING', required: true },
    attempts: { type: Number, default: 0, required: true },
    workerId: { type: String, default: null },
    executionId: { type: String, default: null },
    lockedUntil: { type: Date, default: null },
    lastError: { type: String, default: null }
}, { timestamps: true });

EffectExecutionSchema.index({ eventId: 1, effectKey: 1 }, { unique: true });
EffectExecutionSchema.index(
    { stableKey: 1 },
    {
        unique: true,
        partialFilterExpression: { stableKey: { $type: 'string' } },
        name: 'unique_effect_execution_stable_key'
    }
);
EffectExecutionSchema.index({ status: 1, lockedUntil: 1 });
EffectExecutionSchema.index({ aggregateType: 1, aggregateId: 1 });

export default mongoose.model('EffectExecution', EffectExecutionSchema);
