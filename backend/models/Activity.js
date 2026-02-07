import mongoose from "mongoose";

const ActivitySchema = new mongoose.Schema({
    type: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true }, // Lead, Contact, Deal
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    content: String,
    performedBy: String,
    performedAt: { type: Date, default: Date.now },
    status: String
}, { timestamps: true });

export default mongoose.model("Activity", ActivitySchema);
