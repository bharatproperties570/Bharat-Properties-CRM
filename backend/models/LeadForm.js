import mongoose from "mongoose";

const FieldSchema = new mongoose.Schema({
    id: { type: String },
    label: { type: String, required: true },
    type: {
        type: String,
        enum: ['text', 'phone', 'email', 'select', 'multi-select', 'budget-slider', 'radio', 'checkbox', 'date', 'timeline', 'hidden'],
        required: true
    },
    required: { type: Boolean, default: false },
    placeholder: { type: String },
    defaultValue: { type: String },
    helpText: { type: String },
    options: [String], // for select/radio
    weight: { type: Number, default: 0 }, // weight for pre-score
    conditionalLogic: {
        type: {
            fieldId: String,
            operator: { type: String, enum: ['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan'] },
            value: mongoose.Schema.Types.Mixed
        },
        default: null
    },
    validationRules: mongoose.Schema.Types.Mixed,
    mappingField: { type: String }, // Maps to Lead model field (e.g., 'mobile', 'budgetMin', etc.)
    order: { type: Number, default: 0 }
});

const SectionSchema = new mongoose.Schema({
    id: { type: String },
    title: { type: String, required: true },
    fields: [FieldSchema]
});

const LeadFormSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    description: { type: String },
    sections: [SectionSchema],
    settings: {
        successMessage: { type: String, default: "Thank you for your interest! We will contact you soon." },
        redirectUrl: { type: String },
        autoAssignTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        autoTags: [String],
        enableUTMTracking: { type: Boolean, default: true },
        theme: {
            primaryColor: { type: String, default: "#10b981" },
            layout: { type: String, enum: ['single', 'multi-step'], default: 'single' }
        }
    },
    analytics: {
        views: { type: Number, default: 0 },
        submissions: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 }
    }
}, { timestamps: true });

export default mongoose.model("LeadForm", LeadFormSchema);
