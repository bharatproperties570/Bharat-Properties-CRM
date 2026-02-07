import mongoose from "mongoose";

const LookupSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        index: true
        // Examples: 'LeadSource', 'PropertyType', 'LeadStatus', 'ContactSource', etc.
    },
    label: { type: String, required: true },
    value: { type: String, required: true },
    parentValue: { type: String }, // For hierarchical lookups (e.g., PropertyType -> SubType)
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    color: { type: String }, // For UI display (e.g., status colors)
    icon: { type: String }, // For UI display
    metadata: { type: mongoose.Schema.Types.Mixed } // Additional custom data
}, { timestamps: true });

// Compound index for efficient queries
LookupSchema.index({ type: 1, active: 1, order: 1 });
LookupSchema.index({ type: 1, parentValue: 1 });

export default mongoose.models.Lookup || mongoose.model("Lookup", LookupSchema);
