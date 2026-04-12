import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const SystemSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    category: { type: String },
    active: { type: Boolean, default: true }
}, { timestamps: true });

const SystemSetting = mongoose.model('SystemSetting', SystemSettingSchema);

async function checkLinkedInConfig() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const setting = await SystemSetting.findOne({ key: 'linkedin_integration' });
        if (!setting) {
            console.log('No LinkedIn configuration found in database.');
        } else {
            console.log('LinkedIn Configuration:');
            console.log(JSON.stringify(setting.value, null, 2));
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkLinkedInConfig();
