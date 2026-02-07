import mongoose from "mongoose";

const FieldRuleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    module: {
        type: String,
        required: true,
        enum: ['leads', 'contacts', 'properties', 'deals', 'activities']
    },
    context: {
        type: String,
        enum: ['create', 'edit', 'view', 'all'],
        default: 'all'
    },
    condition: {
        field: String,
        operator: String, // equals, notEquals, contains, greaterThan, lessThan, in, notIn, isEmpty, isNotEmpty
        value: mongoose.Schema.Types.Mixed
    },
    action: {
        type: String,
        enum: ['hide', 'show', 'makeReadonly', 'makeEditable', 'makeRequired', 'makeOptional', 'setError', 'setValue'],
        field: String,
        value: mongoose.Schema.Types.Mixed,
        message: String
    },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true }
}, { timestamps: true });

// Index for efficient queries
FieldRuleSchema.index({ module: 1, active: 1, priority: 1 });

export default mongoose.models.FieldRule || mongoose.model("FieldRule", FieldRuleSchema);
