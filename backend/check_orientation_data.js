import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import SystemSetting from './models/SystemSetting.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkOrientationData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const orientationTypes = ['Facing', 'Direction', 'RoadWidth', 'UnitType'];
        for (const type of orientationTypes) {
            const lookups = await Lookup.find({ lookup_type: type }).lean();
            console.log(`Lookup '${type}' Found: ${lookups.length}`);
            if (lookups.length > 0) {
                console.log(`First ${type}:`, lookups[0].lookup_value);
            }
        }

        const masterFieldsSetting = await SystemSetting.findOne({ key: 'master_fields' }).lean();
        if (masterFieldsSetting) {
            console.log("System Setting 'master_fields' Found.");
            console.log("Facings in SystemSettings:", masterFieldsSetting.value.facings);
        } else {
            console.log("System Setting 'master_fields' NOT Found.");
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkOrientationData();
