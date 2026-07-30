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
        
        const agri = await Lookup.findOne({ lookup_type: 'Category', lookup_value: 'Agricultural' });
        console.log('Agricultural Category ID:', agri._id);
        
        const subCats = await Lookup.find({ lookup_type: 'SubCategory', parent_lookup_id: agri._id });
        console.log('Agricultural SubCategories:');
        subCats.forEach(s => console.log(`- ${s.lookup_value} (ID: ${s._id})`));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
