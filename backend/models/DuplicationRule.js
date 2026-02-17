import mongoose from "mongoose";

const DuplicationRuleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    entityType: {
        type: String,
        required: true,
        enum: ["Contact", "Lead", "Project", "Inventory"],
        default: "Contact"
    },
    fields: [{ type: String, required: true }], // e.g. ["name", "phones.number", "emails.address"]
    matchType: {
        type: String,
        enum: ["and", "or", "all"], // 'all' means match all selected fields
        default: "or"
    },
    actionType: {
        type: String,
        enum: ["Warning", "Block"],
        default: "Warning"
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model("DuplicationRule", DuplicationRuleSchema);
