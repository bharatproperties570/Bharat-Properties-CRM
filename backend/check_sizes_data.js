import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import SystemSetting from './models/SystemSetting.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkData() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in .env');
        }
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const lookupSizes = await Lookup.find({ lookup_type: 'size' }).lean();
        console.log(`Lookup Sizes Found: ${lookupSizes.length}`);
        if (lookupSizes.length > 0) {
            console.log('First Lookup Size:', JSON.stringify(lookupSizes[0], null, 2));
        }

        const systemSettingSize = await SystemSetting.findOne({ key: 'property_sizes' }).lean();
        if (systemSettingSize) {
            console.log(`System Setting 'property_sizes' Found. Value count: ${systemSettingSize.value?.length || 0}`);
            if (systemSettingSize.value?.length > 0) {
                console.log('First System Setting Size:', JSON.stringify(systemSettingSize.value[0], null, 2));
            }
        } else {
            console.log("System Setting 'property_sizes' NOT Found.");
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkData();
