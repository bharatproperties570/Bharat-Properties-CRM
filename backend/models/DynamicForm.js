import mongoose from "mongoose";

const FieldSchema = new mongoose.Schema({
    id: { type: String },
    label: { type: String, required: true },
    type: {
        type: String,
        enum: ['text', 'phone', 'email', 'select', 'multi-select', 'budget-slider', 'radio', 'checkbox', 'date', 'time', 'datetime', 'rating', 'nps', 'hidden', 'file'],
        required: true
    },
    required: { type: Boolean, default: false },
    placeholder: { type: String },
    defaultValue: { type: String },
    helpText: { type: String },
    options: [String], // for select/radio
    dynamicSource: { type: String, enum: [null, 'projects', 'inventory', 'users'], default: null }, // 🚀 Dynamic data source
    mappingField: { type: String }, // Optional: maps to a lead/deal field
    order: { type: Number, default: 0 }
});

const SectionSchema = new mongoose.Schema({
    id: { type: String },
    title: { type: String, required: true },
    fields: [FieldSchema]
});

const DynamicFormSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    category: { 
        type: String, 
        enum: ['site_visit', 'lead_capture', 'deal_capture', 'feedback', 'custom'], 
        default: 'custom' 
    },
    description: { type: String },
    sections: [SectionSchema],
    settings: {
        successMessage: { type: String, default: "Thank you! Your submission has been received." },
        redirectUrl: { type: String },
        autoAssignTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        autoTags: [String],
        theme: {
            primaryColor: { type: String, default: "#3b82f6" },
            layout: { type: String, enum: ['single', 'multi-step'], default: 'single' }
        },
        notificationEmails: [String]
    },
    analytics: {
        views: { type: Number, default: 0 },
        submissions: { type: Number, default: 0 }
    }
}, { timestamps: true });

export default mongoose.model("DynamicForm", DynamicFormSchema);
