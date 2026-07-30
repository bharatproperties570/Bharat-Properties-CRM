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
        }).select('_id name tags personalAddress').lean();
        
        console.log(`Found ${contacts.length} contacts with tag Sec2Kur_...`);
        
        // Find inventories that have these contacts as owners
        const contactIds = contacts.map(c => c._id);
        
        const invs = await Inventory.find({
            $or: [
                { owners: { $in: contactIds } },
                { 'ownerDetails': { $in: contactIds } }
            ]
        }).select('_id unitNo projectName owners address').lean();
        
        console.log(`Found ${invs.length} inventories linked to these Sec2Kur contacts.`);
        
        if (contacts.length > 0 && invs.length === 0) {
            console.log("\nWARNING: Property owners were imported, but they were NOT linked to any inventories!");
            console.log("This usually means:");
            console.log("1. The import was run as 'Contacts Import' instead of 'Inventory Import'.");
            console.log("2. Or the Inventory Import failed to create inventories but created contacts.");
            console.log("3. Or the tag was generated differently.");
            
            // Check if there are ANY inventories with projectName: "Sec 2 Kurukshetra" or similar
            const allRecentInvs = await Inventory.find({
                createdAt: { $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
            }).select('projectName unitNo owners').limit(5).lean();
            
            console.log("Some recent inventories:", allRecentInvs);
        } else if (invs.length > 0) {
            console.log("Sample Linked Inventory:", invs[0]);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
