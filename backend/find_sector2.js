import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import Lookup from './models/Lookup.js';
import Inventory from './models/Inventory.js';
import Contact from './models/Contact.js';

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        
        // Find Sector 2 lookup
        const sectorLookup = await Lookup.find({ lookup_value: { $regex: /sector\s*2/i } });
        console.log("Sector Lookups:", sectorLookup.map(l => ({ id: l._id, val: l.lookup_value, type: l.lookup_type })));
        
        if (sectorLookup.length > 0) {
            const ids = sectorLookup.map(l => l._id);
            // Search Inventory where sector or location or locality is one of these IDs
            const invs = await Inventory.find({
                $or: [
                    { sector: { $in: ids } },
                    { 'address.sector': { $in: ids } },
                    { 'address.locality': { $in: ids } },
                    { 'address.location': { $in: ids } },
                    { 'address.area': { $in: ids } }
                ]
            }).limit(5).populate('owners');
            console.log(`Found ${invs.length} inventories using Sector 2 IDs`);
            
            if (invs.length > 0) {
                console.log("Sample Owners:", invs[0].owners);
            }
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
