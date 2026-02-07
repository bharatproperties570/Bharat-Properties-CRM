import mongoose from "mongoose";

const LookupSchema = new mongoose.Schema({
    lookup_type: { type: String, required: true, index: true }, // Replaces category
    lookup_value: { type: String, required: true }, // Replaces value/label
    code: { type: String, default: null }, // For Country Code or other coded lookups
    parent_lookup_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', default: null },
    parent_lookup_value: { type: String, default: null }, // Match legacy frontend logic
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model("Lookup", LookupSchema);
