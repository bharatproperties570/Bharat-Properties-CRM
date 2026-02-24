import mongoose from "mongoose";

const ProspectEnrichmentRuleSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['KEYWORD', 'FORMULA', 'CLASSIFICATION', 'MARGIN'],
        required: true
    },
    name: { type: String, required: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("ProspectEnrichmentRule", ProspectEnrichmentRuleSchema);
