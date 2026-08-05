import mongoose from 'mongoose';

const SystemSettingSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        label: {
            type: String,
            default: '',
        },
        description: {
            type: String,
            default: '',
        },
        category: {
            type: String,
            default: 'general',
        },
        isPublic: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        collection: 'system_settings',
    }
);

const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting', SystemSettingSchema);

export default SystemSetting;
