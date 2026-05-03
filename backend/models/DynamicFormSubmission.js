import mongoose from "mongoose";

const DynamicFormSubmissionSchema = new mongoose.Schema({
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'DynamicForm', required: true },
    data: { type: Map, of: mongoose.Schema.Types.Mixed },
    metadata: {
        ip: String,
        userAgent: String,
        referrer: String,
        utm_source: String,
        utm_medium: String,
        utm_campaign: String
    },
    status: { type: String, enum: ['new', 'processed', 'archived'], default: 'new' }
}, { timestamps: true });

export default mongoose.model("DynamicFormSubmission", DynamicFormSubmissionSchema);
