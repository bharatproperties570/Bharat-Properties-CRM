
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

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
            // Check if it's an object and has keys
            if (typeof propertyConfig.value === 'object') {
                console.log(`Category keys: ${Object.keys(propertyConfig.value).join(', ')}`);
            } else {
                console.log('Value is not an object:', typeof propertyConfig.value);
            }
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
