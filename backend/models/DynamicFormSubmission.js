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
        utm_campaign: String,
        isExistingLeadUpdate: { type: Boolean, default: false },
        hasRefToken: { type: Boolean, default: false },
        authorizedLeadId: String
    },
    status: { type: String, enum: ['new', 'processed', 'archived'], default: 'new' }
}, { timestamps: true });

DynamicFormSubmissionSchema.index(
    { formId: 1, idempotencyKey: 1 },
    {
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } }
    }
);

export default mongoose.models.DynamicFormSubmission || mongoose.model("DynamicFormSubmission", DynamicFormSubmissionSchema);
