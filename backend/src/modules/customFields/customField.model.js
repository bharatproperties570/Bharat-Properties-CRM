import mongoose from "mongoose";

const CustomFieldSchema = new mongoose.Schema({
    module: {
        type: String,
        required: true,
        enum: ['leads', 'contacts', 'properties', 'deals', 'activities'],
        index: true
    },
    label: { type: String, required: true },
    fieldName: { type: String, required: true }, // Internal field name (e.g., 'custom_field_1')
    fieldType: {
        type: String,
        required: true,
        enum: ['text', 'number', 'email', 'phone', 'date', 'dropdown', 'multiselect', 'checkbox', 'textarea', 'url']
    },
    options: [String], // For dropdown/multiselect
    defaultValue: { type: mongoose.Schema.Types.Mixed },
    required: { type: Boolean, default: false },
    unique: { type: Boolean, default: false },
    validation: {
        min: Number,
        max: Number,
        pattern: String,
        message: String
    },
    placeholder: { type: String },
    helpText: { type: String },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    section: { type: String } // Group fields into sections
}, { timestamps: true });

// Compound index for efficient queries
CustomFieldSchema.index({ module: 1, active: 1, order: 1 });
CustomFieldSchema.index({ module: 1, fieldName: 1 }, { unique: true });

export default mongoose.models.CustomField || mongoose.model("CustomField", CustomFieldSchema);
