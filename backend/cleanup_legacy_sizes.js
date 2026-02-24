import mongoose from 'mongoose';
import SystemSetting from './models/SystemSetting.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const deleted = await SystemSetting.findOneAndDelete({ key: 'property_sizes' });
        if (deleted) {
            console.log("Legacy 'property_sizes' key deleted successfully from SystemSettings.");
        } else {
            console.log("Legacy 'property_sizes' key not found or already deleted.");
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Cleanup Error:', error);
    }
}

cleanup();
