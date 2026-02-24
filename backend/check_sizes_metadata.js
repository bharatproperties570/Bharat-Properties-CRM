import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkSizeLookups() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const sizes = await Lookup.find({ lookup_type: 'size' }).lean();
        console.log(`Found ${sizes.length} sizes.`);
        if (sizes.length > 0) {
            console.log("Sample Size Metadata:", JSON.stringify(sizes[0].metadata, null, 2));
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkSizeLookups();
