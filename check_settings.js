
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './backend/.env' });

const SystemSettingSchema = new mongoose.Schema({
    key: String,
    category: String,
    value: mongoose.Schema.Types.Mixed,
    isPublic: Boolean
}, { timestamps: true });

const SystemSetting = mongoose.model('SystemSetting', SystemSettingSchema);

async function checkSettings() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const settings = await SystemSetting.find({});
        console.log(`Found ${settings.length} system settings.`);

        settings.forEach(s => {
            console.log(`Key: ${s.key}, Category: ${s.category}, Last Updated: ${s.updatedAt}`);
        });

        const propertyConfig = settings.find(s => s.key === 'property_config');
        if (propertyConfig) {
            console.log('\nProperty Config found:');
            console.log(JSON.stringify(propertyConfig.value, null, 2).substring(0, 500) + '...');
        } else {
            console.log('\nproperty_config NOT found in system settings.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSettings();
