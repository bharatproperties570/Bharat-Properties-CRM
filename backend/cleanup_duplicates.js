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
        
        console.log('Finding all lookups...');
        const allLookups = await Lookup.find({});
        
        // Group by type + parent_id + lowercase value
        const groups = {};
        for (const l of allLookups) {
            const pid = l.parent_lookup_id ? String(l.parent_lookup_id) : 'null';
            const val = l.lookup_value.trim().toLowerCase();
            const key = `${l.lookup_type}_${pid}_${val}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(l);
        }
        
        for (const [key, items] of Object.entries(groups)) {
            if (items.length > 1) {
                console.log(`Found ${items.length} duplicates for ${key}`);
                
                // Keep the oldest one
                items.sort((a, b) => a.createdAt - b.createdAt);
                
                const keeper = items[0];
                const dupes = items.slice(1);
                
                for (const dupe of dupes) {
                    console.log(`  Removing dupe ID ${dupe._id}, pointing children to ${keeper._id}`);
                    await Lookup.updateMany(
                        { parent_lookup_id: dupe._id },
                        { $set: { parent_lookup_id: keeper._id } }
                    );
                    
                    await Lookup.findByIdAndDelete(dupe._id);
                }
            }
        }
        
        console.log('Cleanup complete.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
