import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';
import Lookup from './models/Lookup.js';

dotenv.config();

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const items = await Inventory.find({}).lean();
        let fixedCount = 0;

        for (const item of items) {
            let needsUpdate = false;
            const updateFlags = {};

            const fields = ['category', 'subCategory', 'unitType', 'status'];

            for (const field of fields) {
                const val = item[field];
                if (val && typeof val === 'string' && !mongoose.Types.ObjectId.isValid(val)) {
                    console.log(`Searching ID for ${field}: "${val}"`);
                    // Try to find a lookup with this value
                    const lookup = await Lookup.findOne({ lookup_value: val }).lean();
                    if (lookup) {
                        console.log(`Found ID for "${val}": ${lookup._id}`);
                        updateFlags[field] = lookup._id;
                        needsUpdate = true;
                    } else {
                        console.warn(`Could not find ID for label "${val}" in field ${field}`);
                    }
                }
            }

            if (needsUpdate) {
                await Inventory.updateOne({ _id: item._id }, { $set: updateFlags });
                fixedCount++;
            }
        }

        console.log(`Finished. Fixed ${fixedCount} records.`);
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

cleanup();
