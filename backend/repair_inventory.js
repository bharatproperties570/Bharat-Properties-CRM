import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load env
dotenv.config();

const mongoUri = process.env.MONGODB_URI;

async function run() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));

        const allItems = await Inventory.find({}).lean();
        let repairCount = 0;

        for (const item of allItems) {
            let needsUpdate = false;
            let updatedOwners = [];
            let updatedAssociates = [];

            if (item.owners && Array.isArray(item.owners)) {
                updatedOwners = item.owners.map(o => {
                    if (typeof o === 'object' && o !== null && o.id) {
                        needsUpdate = true;
                        return o.id;
                    }
                    return o;
                });
            }

            if (item.associates && Array.isArray(item.associates)) {
                updatedAssociates = item.associates.map(a => {
                    if (typeof a === 'object' && a !== null && a.id) {
                        needsUpdate = true;
                        return a.id;
                    }
                    return a;
                });
            }

            if (needsUpdate) {
                await Inventory.findByIdAndUpdate(item._id, {
                    owners: updatedOwners,
                    associates: updatedAssociates
                });
                repairCount++;
                console.log(`Repaired Inventory item: ${item._id}`);
            }
        }

        console.log(`Successfully repaired ${repairCount} items.`);
        process.exit(0);
    } catch (error) {
        console.error('Error during repair:', error);
        process.exit(1);
    }
}

run();
