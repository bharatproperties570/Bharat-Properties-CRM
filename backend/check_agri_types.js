import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import Lookup from './models/Lookup.js';

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        
        const types = await Lookup.find({ lookup_type: 'PropertyType' });
        
        types.forEach(s => {
            if (s.lookup_value.toLowerCase().includes('crop') || s.lookup_value.toLowerCase().includes('wood')) {
                console.log(`PropertyType: ${s.lookup_value} (ID: ${s._id}, parent_id: ${s.parent_lookup_id})`);
            }
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
