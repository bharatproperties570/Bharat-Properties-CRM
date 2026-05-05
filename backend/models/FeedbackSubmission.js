import mongoose from "mongoose";

const FeedbackSubmissionSchema = new mongoose.Schema({
    form: { type: mongoose.Schema.Types.ObjectId, ref: 'FeedbackForm', required: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }, // Optional: link to existing lead
    inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' }, // 🌟 NEW: Link to inventory
    department: { type: String, index: true }, 
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }],
    responses: mongoose.Schema.Types.Mixed, // { fieldId: value }
    rating: { type: Number }, // Primary rating if applicable
    sourceMeta: {
        ip: String,
        userAgent: String,
        referrer: String
    }
}, { timestamps: true });

export default mongoose.model("FeedbackSubmission", FeedbackSubmissionSchema);
