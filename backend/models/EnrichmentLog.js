import mongoose from "mongoose";

const EnrichmentLogSchema = new mongoose.Schema({
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    ruleId: { type: mongoose.Schema.Types.ObjectId, refPath: 'ruleType' },
    ruleType: { type: String, enum: ['ProspectEnrichmentRule', 'IntentKeywordRule'] },
    ruleName: String,
    triggerType: { type: String, enum: ['KEYWORD', 'FORMULA', 'CLASSIFICATION', 'MARGIN'] },
    appliedTags: [String],
    oldIntentIndex: Number,
    newIntentIndex: Number,
    details: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("EnrichmentLog", EnrichmentLogSchema);
