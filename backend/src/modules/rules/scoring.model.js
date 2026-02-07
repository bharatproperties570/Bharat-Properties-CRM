import mongoose from "mongoose";

const ScoringRuleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    attribute: {
        type: String,
        required: true
        // Examples: 'source', 'budget', 'location', 'timeline', etc.
    },
    condition: {
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed
    },
    weight: { type: Number, required: true, min: -100, max: 100 },
    active: { type: Boolean, default: true },
    category: {
        type: String,
        enum: ['demographic', 'behavioral', 'firmographic', 'engagement', 'custom'],
        default: 'custom'
    }
}, { timestamps: true });

// Index for efficient queries
ScoringRuleSchema.index({ active: 1, category: 1 });

export default mongoose.models.ScoringRule || mongoose.model("ScoringRule", ScoringRuleSchema);
