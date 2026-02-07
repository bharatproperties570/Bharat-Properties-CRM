import mongoose from "mongoose";

const FieldRuleSchema = new mongoose.Schema({
    module: { type: String, required: true, index: true },
    ruleName: { type: String, required: true },
    field: { type: String, required: true },
    ruleType: { type: String, enum: ['MANDATORY', 'READONLY', 'HIDDEN', 'VALIDATION'], required: true },
    isActive: { type: Boolean, default: true },
    conditions: [{
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed
    }],
    message: String,
    matchType: { type: String, enum: ['AND', 'OR'], default: 'AND' }
}, { timestamps: true });

export default mongoose.model("FieldRule", FieldRuleSchema);
