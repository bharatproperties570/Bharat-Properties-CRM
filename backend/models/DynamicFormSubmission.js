import mongoose from "mongoose";

const DynamicFormSubmissionSchema = new mongoose.Schema({
    formId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
    idempotencyKey: { type: String },
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

DynamicFormSubmissionSchema.index(
    { idempotencyKey: 1 },
    {
        unique: true,
        sparse: true,
        partialFilterExpression: { idempotencyKey: { $type: "string" } }
    }
);

export default mongoose.models.DynamicFormSubmission || mongoose.model("DynamicFormSubmission", DynamicFormSubmissionSchema);
