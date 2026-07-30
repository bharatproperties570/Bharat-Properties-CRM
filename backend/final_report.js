import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import Contact from './models/Contact.js';
import Inventory from './models/Inventory.js';

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        
        // Find contacts with tag Sec2Kur
        const contacts = await Contact.find({
            tags: { $regex: /^Sec2Kur_/i }
        }).select('_id name tags personalAddress phones').lean();
        
        const contactIds = contacts.map(c => c._id);
        
        const invs = await Inventory.find({
            $or: [
                { owners: { $in: contactIds } },
                { 'ownerDetails': { $in: contactIds } }
            ]
        }).select('_id unitNo projectName owners address').lean();
        
        let missingPhones = 0;
        let missingNames = 0;
        
        for (const c of contacts) {
            if (!c.phones || c.phones.length === 0) missingPhones++;
            if (!c.name || c.name === 'Unknown Owner' || c.name.trim() === '') missingNames++;
        }
        
        console.log(`--- SECTOR 2 KURUKSHETRA IMPORT REPORT ---`);
        console.log(`Total Inventories Imported & Linked: ${invs.length}`);
        console.log(`Total Property Owners Created: ${contacts.length}`);
        console.log(`Owners missing Phone Numbers: ${missingPhones}`);
        console.log(`Owners missing Names: ${missingNames}`);
        console.log(`\nSample Data:`);
        if (contacts.length > 0) console.log(`Owner: ${contacts[0].name}, Tag: ${contacts[0].tags.find(t => t.startsWith('Sec2Kur_'))}`);
        if (invs.length > 0) console.log(`Inventory: Project '${invs[0].projectName}', Unit '${invs[0].unitNo}'`);

        // Check if there are any inventories for "Sec 2" created yesterday that have NO owners
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 3);
        
        const orphanedInvs = await Inventory.find({
            createdAt: { $gte: yesterday },
            projectName: { $regex: /sector\s*2/i },
            owners: { $size: 0 }
        }).lean();
        
        console.log(`\nInventories imported recently for Sector 2 with NO owners linked: ${orphanedInvs.length}`);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
