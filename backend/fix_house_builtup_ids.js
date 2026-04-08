import mongoose from 'mongoose';
import dotenv from 'dotenv';
import './models/Inventory.js';
import './models/Lookup.js';

dotenv.config();

async function fix() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';
        await mongoose.connect(uri);
        const Inventory = mongoose.model('Inventory');
        const Lookup = mongoose.model('Lookup');

        // 2. Find inventory items with problematic builtupDetails (Any sub-category)
        const problematicItems = await Inventory.find({
            $or: [
                { "builtupDetails": { $exists: true, $elemMatch: { _id: { $exists: false } } } },
                { "builtupDetails.0": { $exists: true } } // General check to be safe
            ]
        });

        console.log(`Checking ${problematicItems.length} items for missing ObjectIDs in builtupDetails...`);

        let fixedCount = 0;
        for (const item of problematicItems) {
            let changed = false;
            
            if (item.builtupDetails && item.builtupDetails.length > 0) {
                item.builtupDetails.forEach(detail => {
                    if (!detail._id) {
                        detail._id = new mongoose.Types.ObjectId();
                        changed = true;
                    }
                });
            }

            if (changed) {
                item.markModified('builtupDetails');
                await item.save();
                fixedCount++;
            }
        }

        console.log(`Successfully fixed ${fixedCount} items.`);

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await mongoose.disconnect();
    }
}

fix();
