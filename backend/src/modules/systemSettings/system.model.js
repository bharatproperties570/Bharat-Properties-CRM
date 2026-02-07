import mongoose from "mongoose";

const SystemSettingSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        index: true
        // Examples: 'smtp_config', 'whatsapp_config', 'voice_api', 'sms_config', etc.
    },
    category: {
        type: String,
        enum: ['email', 'messaging', 'voice', 'integration', 'general', 'security'],
        required: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
        // Can be object, string, number, boolean, etc.
    },
    description: { type: String },
    isEncrypted: { type: Boolean, default: false }, // For sensitive data like API keys
    isPublic: { type: Boolean, default: false }, // Can be accessed by frontend
    active: { type: Boolean, default: true }
}, { timestamps: true });

// Index for efficient queries
SystemSettingSchema.index({ category: 1, active: 1 });

export default mongoose.models.SystemSetting || mongoose.model("SystemSetting", SystemSettingSchema);
