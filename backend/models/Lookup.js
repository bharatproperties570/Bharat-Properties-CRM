import mongoose from "mongoose";

const LookupSchema = new mongoose.Schema({
    category: { type: String, required: true, index: true },
    label: { type: String, required: true },
    value: { type: String, required: true },
    parentValue: String
}, { timestamps: true });

export default mongoose.model("Lookup", LookupSchema);
