import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkPropertyConfigs() {
    try {
        console.log('Connecting to:', process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);

        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
            key: String,
            value: mongoose.Schema.Types.Mixed,
            category: String
        }, { collection: 'systemsettings' }));

        const keysToCheck = ['propertyConfig', 'property_config', 'masterFields', 'master_fields', 'dynamic_projects'];

        for (const key of keysToCheck) {
            const setting = await SystemSetting.findOne({ key }).lean();
            console.log(`\n--- Key: ${key} ---`);
            if (setting) {
                console.log('Found in Category:', setting.category);
                console.log('Value Type:', typeof setting.value);
                if (setting.value && typeof setting.value === 'object') {
                    console.log('Keys in value:', Object.keys(setting.value));
                } else {
                    console.log('Value:', setting.value);
                }
            } else {
                console.log('NOT FOUND');
            }
        }

        // Check Lookups
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String,
            is_active: Boolean
        }, { collection: 'lookups' }));

        const lookupTypes = ['Category', 'SubCategory', 'PropertyType', 'Facing', 'Direction', 'Size'];
        for (const type of lookupTypes) {
            const count = await Lookup.countDocuments({ lookup_type: type });
            console.log(`\nLookup Type: ${type}, Count: ${count}`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkPropertyConfigs();
