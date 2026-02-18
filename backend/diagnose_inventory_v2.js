import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config();

const mongoUri = process.env.MONGODB_URI;

async function run() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const inventoryId = '69951f8d5bddd21b7a7dc776';
        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));

        const item = await Inventory.findById(inventoryId).lean();

        if (!item) {
            console.log('Inventory item not found');
            process.exit(0);
        }

        console.log('--- Inventory Item ---');
        console.log('ID:', item._id);
        console.log('ProjectName:', item.projectName);
        console.log('ProjectId:', JSON.stringify(item.projectId, null, 2));
        console.log('Category:', JSON.stringify(item.category, null, 2));
        console.log('SubCategory:', JSON.stringify(item.subCategory, null, 2));
        console.log('Owners:', JSON.stringify(item.owners, null, 2));
        console.log('Associates:', JSON.stringify(item.associates, null, 2));

        console.log('\n--- Checking all inventory for dirty data ---');
        const allItems = await Inventory.find({}).lean();
        let dirtyCount = 0;

        for (const it of allItems) {
            let isDirty = false;
            if (it.owners && Array.isArray(it.owners)) {
                if (it.owners.some(o => typeof o === 'object' && o !== null && !o._bsontype && !mongoose.Types.ObjectId.isValid(o))) {
                    isDirty = true;
                }
            }
            if (it.associates && Array.isArray(it.associates)) {
                if (it.associates.some(a => typeof a === 'object' && a !== null && !a._bsontype && !mongoose.Types.ObjectId.isValid(a))) {
                    isDirty = true;
                }
            }
            if (isDirty) dirtyCount++;
        }

        console.log('Total Inventory items:', allItems.length);
        console.log('Dirty items count:', dirtyCount);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
