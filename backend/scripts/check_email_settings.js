import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const SystemSettingSchema = new mongoose.Schema({
    key: String,
    category: String,
    value: mongoose.Schema.Types.Mixed,
    active: Boolean
}, { timestamps: true });

const SystemSetting = mongoose.models.SystemSetting || mongoose.model("SystemSetting", SystemSettingSchema);

async function checkSettings() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const emailSettings = await SystemSetting.find({ category: 'email' });
        console.log('Email Settings found:', JSON.stringify(emailSettings, null, 2));

        if (emailSettings.length === 0) {
            console.log('No email settings found. Checking all settings...');
            const allSettings = await SystemSetting.find({});
            console.log('All Settings (keys):', allSettings.map(s => s.key));
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error checking settings:', error);
        process.exit(1);
    }
}

checkSettings();
