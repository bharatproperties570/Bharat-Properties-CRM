import mongoose from 'mongoose';
import SystemSetting from './models/SystemSetting.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function cleanupOrientations() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const setting = await SystemSetting.findOne({ key: 'master_fields' });
        if (setting && setting.value) {
            console.log("Original master_fields keys:", Object.keys(setting.value));

            // Remove orientation fields
            const newValue = { ...setting.value };
            delete newValue.facings;
            delete newValue.directions;
            delete newValue.roadWidths;
            delete newValue.unitTypes;

            setting.value = newValue;
            await setting.save();
            console.log("Cleaned orientation fields from 'master_fields' in SystemSettings.");
            console.log("New master_fields keys:", Object.keys(setting.value));
        } else {
            console.log("'master_fields' not found or has no value.");
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Cleanup Error:', error);
    }
}

cleanupOrientations();
