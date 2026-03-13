import mongoose from "mongoose";

const FieldSchema = new mongoose.Schema({
    id: { type: String },
    label: { type: String, required: true },
    type: {
        type: String,
        enum: ['text', 'phone', 'email', 'select', 'budget-slider', 'radio', 'checkbox', 'date', 'rating', 'nps', 'hidden'],
        required: true
    },
    required: { type: Boolean, default: false },
    placeholder: { type: String },
    defaultValue: { type: String },
    helpText: { type: String },
    options: [String], // for select/radio
    weight: { type: Number, default: 0 },
    order: { type: Number, default: 0 }
});

const SectionSchema = new mongoose.Schema({
    id: { type: String },
    title: { type: String, required: true },
    fields: [FieldSchema]
});

const FeedbackFormSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    description: { type: String },
    sections: [SectionSchema],
    settings: {
        successMessage: { type: String, default: "Thank you for your feedback! It helps us serve you better." },
        redirectUrl: { type: String },
        autoTags: [String],
        theme: {
            primaryColor: { type: String, default: "#3b82f6" }, // Professional Blue
            layout: { type: String, enum: ['single', 'multi-step'], default: 'single' }
        }
    },
    analytics: {
        views: { type: Number, default: 0 },
        submissions: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0 }
    }
}, { timestamps: true });

export default mongoose.model("FeedbackForm", FeedbackFormSchema);
