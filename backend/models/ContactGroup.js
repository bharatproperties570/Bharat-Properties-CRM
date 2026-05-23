import mongoose from "mongoose";

const ContactGroupSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    category: { type: String, default: "General" },
    color: { type: String, default: "#6366f1" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isSystem: { type: Boolean, default: false } // To prevent deletion of core groups
}, { timestamps: true });

export default mongoose.model("ContactGroup", ContactGroupSchema);
