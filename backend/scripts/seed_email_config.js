import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const SystemSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    active: { type: Boolean, default: true }
}, { timestamps: true });

const SystemSetting = mongoose.models.SystemSetting || mongoose.model("SystemSetting", SystemSettingSchema);

async function seedEmailConfig() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const emailConfig = {
            email: 'bharatproperties570@gmail.com',
            provider: 'Google',
            imapHost: 'imap.gmail.com',
            imapPort: '993',
            smtpHost: 'smtp.gmail.com',
            smtpPort: '465',
            securityType: 'SSL/TLS',
            syncEmail: true,
            syncContacts: true,
            syncCalendar: true,
            lastSynced: new Date()
        };

        const result = await SystemSetting.findOneAndUpdate(
            { key: 'email_config' },
            {
                key: 'email_config',
                category: 'email',
                value: emailConfig,
                active: true
            },
            { upsert: true, new: true }
        );

        console.log('Email configuration seeded successfully:', result);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error seeding email config:', error);
        process.exit(1);
    }
}

seedEmailConfig();
