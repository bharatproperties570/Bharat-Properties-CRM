import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';


dotenv.config({ path: './.env' });

async function backfillDirection() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('--- Starting Direction Backfill ---');

        // Find items that have 'facing' but NO 'direction'
        const items = await Inventory.find({
            facing: { $exists: true, $ne: null },
            $or: [
                { direction: { $exists: false } },
                { direction: null }
            ]
        });

        console.log(`Found ${items.length} items missing 'direction' but having 'facing'.`);

        let updatedCount = 0;
        for (const item of items) {
            item.direction = item.facing;
            await item.save(); // This will trigger the pre-save hook to resolve lookup
            updatedCount++;
        }

        console.log(`Successfully backfilled direction for ${updatedCount} items.`);

    } catch (err) {
        console.error('Backfill Error:', err);
    } finally {
        process.exit(0);
    }
}
backfillDirection();
