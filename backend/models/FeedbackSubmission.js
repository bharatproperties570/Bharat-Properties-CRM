import mongoose from "mongoose";

const FeedbackSubmissionSchema = new mongoose.Schema({
    form: { type: mongoose.Schema.Types.ObjectId, ref: 'FeedbackForm', required: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }, // Optional: link to existing lead
    activity: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity', index: true }, // 🛡️ CRITICAL-01: Linked Activity
    inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' }, // 🌟 NEW: Link to inventory
    department: { type: String, index: true }, 
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }],
    responses: mongoose.Schema.Types.Mixed, // { fieldId: value }
    rating: { type: Number }, // Primary rating if applicable
    idempotencyKey: { type: String }, // 🛡️ CRITICAL-01: Stable request identity / deduplication key
    sourceMeta: {
        ip: String,
        userAgent: String,
        referrer: String
    }
}, { timestamps: true });

// 🛡️ CRITICAL-01: Unique partial index to guarantee idempotency without colliding on legacy records
FeedbackSubmissionSchema.index(
    { idempotencyKey: 1 },
    {
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: "string" } }
    }
);

export default mongoose.model("FeedbackSubmission", FeedbackSubmissionSchema);
