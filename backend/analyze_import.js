import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import Inventory from './models/Inventory.js';
// Check if there is a PropertyOwner model or if it's stored in Contacts or Inventory directly
// We can use mongoose.modelNames() to find relevant models

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        
        console.log("Models available:", mongoose.modelNames());
        
        // Let's search inventory for sector 2
        // Assuming there are fields like address.sector, location, etc.
        // We will just do a text search or regex on common fields
        
        const sector2Inventories = await Inventory.find({
            $or: [
                { 'location.name': { $regex: /sector\s*2/i } },
                { 'address.sector': { $regex: /sector\s*2/i } },
                { 'project.name': { $regex: /sector\s*2/i } },
                { 'project': { $regex: /sector\s*2/i } }
            ]
        }).populate('owner propertyOwner ownerDetails contacts').limit(50);
        
        console.log(`Found ${sector2Inventories.length} inventories matching 'sector 2'`);
        
        let validOwners = 0;
        let missingOwners = 0;
        let duplicateOwners = 0;
        
        const ownerIds = new Set();
        const duplicateOwnerIds = new Set();

        sector2Inventories.forEach((inv, index) => {
            // Check where owner data is stored
            let ownerId = inv.owner || inv.propertyOwner || (inv.ownerDetails && inv.ownerDetails._id);
            
            if (ownerId) {
                validOwners++;
                const idStr = String(ownerId);
                if (ownerIds.has(idStr)) {
                    duplicateOwners++;
                    duplicateOwnerIds.add(idStr);
                } else {
                    ownerIds.add(idStr);
                }
            } else {
                missingOwners++;
                if (index < 5) console.log(`Inventory ${inv._id} is missing owner data.`);
            }
        });
        
        console.log('--- Import Stats for Sector 2 ---');
        console.log(`Total Inventories Checked: ${sector2Inventories.length}`);
        console.log(`Valid Owner References: ${validOwners}`);
        console.log(`Missing Owner References: ${missingOwners}`);
        console.log(`Inventories sharing same owner (potential duplicates or valid multi-property owners): ${duplicateOwners}`);
        
        if (sector2Inventories.length > 0) {
            console.log("\nSample Inventory Owner Data Structure:");
            const sample = sector2Inventories[0];
            console.log("Owner fields:", {
                owner: sample.owner,
                propertyOwner: sample.propertyOwner,
                ownerDetails: sample.ownerDetails,
                ownerContact: sample.ownerContact
            });
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
