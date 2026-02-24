import mongoose from 'mongoose';
import SystemSetting from './models/SystemSetting.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkPropertyConfig() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const config = await SystemSetting.findOne({ key: 'property_config' }).lean();
        if (config) {
            console.log("Property Config Found.");
            // Print a sample to see hierarchy
            const sampleCat = Object.keys(config.value)[0];
            console.log(`Sample Category: ${sampleCat}`);
            const sampleSub = config.value[sampleCat]?.subCategories?.[0];
            console.log(`Sample SubCategory: ${sampleSub?.name}`);
            const sampleType = sampleSub?.types?.[0];
            console.log(`Sample Type: ${sampleType?.name}`);
            console.log(`Sample BuiltupTypes:`, sampleType?.builtupTypes);
        } else {
            console.log("Property Config NOT Found.");
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkPropertyConfig();
