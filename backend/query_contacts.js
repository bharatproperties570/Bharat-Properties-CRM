import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import Lookup from './models/Lookup.js';
import Contact from './models/Contact.js';
import Inventory from './models/Inventory.js';

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        
        // Find Sector 2 lookups
        const sectorLookup = await Lookup.find({ lookup_value: { $regex: /sector\s*2/i } });
        const ids = sectorLookup.map(l => l._id);
        
        // Find contacts with those IDs
        const contacts = await Contact.find({
            $or: [
                { 'personalAddress.location': { $in: ids } },
                { 'personalAddress.area': { $in: ids } },
                { 'personalAddress.locality': { $in: ids } }
            ]
        }).limit(10);
        
        console.log(`Found ${contacts.length} contacts referencing Sector 2 IDs.`);
        
        // Find contacts created yesterday mentioning kurukshetra or sector 2 in raw format (if any)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2);
        
        // Also check if any inventory was imported yesterday
        const recentInvs = await Inventory.countDocuments({ createdAt: { $gte: yesterday } });
        console.log(`Recent inventories created: ${recentInvs}`);
        
        // Let's see the most recently imported Property Owners (Tags include 'Property Owner')
        const recentOwners = await Contact.find({
            tags: 'Property Owner',
            createdAt: { $gte: yesterday }
        }).populate('personalAddress.location personalAddress.area').limit(5);
        
        console.log(`Recent Property Owners created: ${recentOwners.length}`);
        if(recentOwners.length > 0) {
            console.log("Sample recent owner address:", recentOwners[0].personalAddress);
            console.log("Sample tags:", recentOwners[0].tags);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
