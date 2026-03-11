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
    weight: { type: Number, default: 0 },
    mappingField: { type: String }, // Maps to Deal model field (e.g., 'projectName', 'price', etc.)
    order: { type: Number, default: 0 }
});

const SectionSchema = new mongoose.Schema({
    id: { type: String },
    title: { type: String, required: true },
    fields: [FieldSchema]
});

const DealFormSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    description: { type: String },
    sections: [SectionSchema],
    settings: {
        successMessage: { type: String, default: "Deal captured successfully! Our team will get back to you." },
        redirectUrl: { type: String },
        autoAssignTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        autoTags: [String],
        enableUTMTracking: { type: Boolean, default: true },
        theme: {
            primaryColor: { type: String, default: "#3b82f6" }, // Blue for Deals
            layout: { type: String, enum: ['single', 'multi-step'], default: 'single' }
        }
    },
    analytics: {
        views: { type: Number, default: 0 },
        submissions: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 }
    }
}, { timestamps: true });

export default mongoose.model("DealForm", DealFormSchema);
