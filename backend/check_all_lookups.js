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
        
        const subCats = await Lookup.find({ lookup_type: 'SubCategory' });
        
        const counts = {};
        subCats.forEach(s => {
            counts[s.lookup_value] = (counts[s.lookup_value] || 0) + 1;
        });
        
        for (const [name, count] of Object.entries(counts)) {
            if (count > 1) {
                console.log(`Duplicate SubCategory found: ${name} (count: ${count})`);
            }
        }
        
        const cats = await Lookup.find({ lookup_type: 'Category' });
        const catCounts = {};
        cats.forEach(c => {
            catCounts[c.lookup_value] = (catCounts[c.lookup_value] || 0) + 1;
        });
        for (const [name, count] of Object.entries(catCounts)) {
            if (count > 1) {
                console.log(`Duplicate Category found: ${name} (count: ${count})`);
            }
        }
        console.log("Check complete.");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
