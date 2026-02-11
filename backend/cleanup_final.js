import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';
import Deal from './models/Deal.js';

dotenv.config();

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;

        console.log("--- CLEANING INVENTORY ---");
        // Clear owners array if it contains invalid strings/objects
        const invs = await Inventory.find({});
        for (const inv of invs) {
            if (inv.owners && inv.owners.length > 0) {
                const validOwners = inv.owners.filter(o => mongoose.Types.ObjectId.isValid(o));
                if (validOwners.length !== inv.owners.length) {
                    console.log(`Cleaning owners for: ${inv._id}`);
                    inv.owners = validOwners;
                    await inv.save();
                }
            }
        }

        console.log("--- CLEANING DEALS ---");
        const deals = await Deal.find({});
        for (const deal of deals) {
            let updated = false;
            if (deal.owner && !mongoose.Types.ObjectId.isValid(deal.owner)) {
                console.log(`Clearing invalid owner for deal: ${deal._id}`);
                deal.owner = null;
                updated = true;
            }
            if (deal.associatedContact && !mongoose.Types.ObjectId.isValid(deal.associatedContact)) {
                console.log(`Clearing invalid associate for deal: ${deal._id}`);
                deal.associatedContact = null;
                updated = true;
            }
            if (updated) await deal.save();
        }

        console.log("Cleanup complete!");
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

cleanup();
