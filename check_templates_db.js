import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

const SystemSettingSchema = new mongoose.Schema({
    key: String,
    category: String,
    value: mongoose.Schema.Types.Mixed,
    isPublic: Boolean
}, { collection: 'settings', timestamps: true });

const SystemSetting = mongoose.model('SystemSetting', SystemSettingSchema);

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const setting = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' });
        if (setting) {
            console.log('crm_whatsapp_templates value:', JSON.stringify(setting.value, null, 2));
        } else {
            console.log('crm_whatsapp_templates not found');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
