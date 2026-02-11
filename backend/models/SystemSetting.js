import mongoose from "mongoose";

const SystemSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true }, // e.g., 'property_config', 'master_fields'
    category: { type: String, default: 'general', index: true }, // e.g., 'property', 'sales_config'
    value: { type: mongoose.Schema.Types.Mixed, required: true }, // Can be Object, Array, String, etc.
    description: { type: String },
    isPublic: { type: Boolean, default: false }, // If true, accessible without auth (if needed)
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model("SystemSetting", SystemSettingSchema);
