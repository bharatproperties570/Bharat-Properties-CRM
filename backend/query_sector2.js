import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import Inventory from './models/Inventory.js';
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        
        // 1. Find Sector 2 lookup or city kurukshetra lookup
        const cityLookup = await Lookup.findOne({ lookup_value: { $regex: /kurukshetra/i }, lookup_type: 'City' });
        console.log("City Kurukshetra:", cityLookup ? cityLookup._id : 'Not found');
        
        // 2. Query inventories
        const query = {
            $or: [
                { sector: { $regex: /sector\s*2/i } },
                { 'address.sector': { $regex: /sector\s*2/i } },
                { project: { $regex: /sector\s*2/i } },
                { sizeLabel: { $regex: /sector\s*2/i } }
            ]
        };
        
        const invs = await Inventory.find(query).limit(10).populate('owners');
        console.log(`Found ${invs.length} inventories specifically for Sector 2`);
        
        if (invs.length > 0) {
            console.log("Sample:", invs[0]._id, "Owners:", invs[0].owners);
        }
        
        // What about Contacts created yesterday?
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2);
        
        const recentContacts = await Contact.find({ createdAt: { $gte: yesterday } }).lean();
        console.log(`Found ${recentContacts.length} contacts created recently`);
        
        const sector2Contacts = recentContacts.filter(c => {
            const str = JSON.stringify(c).toLowerCase();
            return str.includes('sector 2') || str.includes('sector-2');
        });
        
        console.log(`Of those, ${sector2Contacts.length} mention sector 2`);
        if (sector2Contacts.length > 0) {
            console.log("Sample Contact:", sector2Contacts[0]);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
