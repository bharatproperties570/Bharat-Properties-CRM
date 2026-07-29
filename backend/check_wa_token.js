import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const systemSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
    description: String,
    category: { type: String, default: 'General' },
    isPublic: { type: Boolean, default: false },
}, { timestamps: true });

const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting', systemSettingSchema);

async function check() {
    const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
    console.log("DB Setting:", setting);

    const isPlaceholder = (val) => !val || val.includes('YOUR_') || val.includes('SYSTEM_USER');
    if (setting && setting.value?.token) {
        console.log("isPlaceholder evaluated to:", isPlaceholder(setting.value.token));
    }
    process.exit(0);
}

check();
