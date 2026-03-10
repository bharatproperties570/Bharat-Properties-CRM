import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const InventorySchema = new mongoose.Schema({
    category: mongoose.Schema.Types.Mixed
}, { strict: false });
const DealSchema = new mongoose.Schema({
    category: mongoose.Schema.Types.Mixed
}, { strict: false });
const LookupSchema = new mongoose.Schema({
    lookup_type: String,
    lookup_value: String
}, { strict: false });

const Inventory = mongoose.model('InventoryDiagV2', InventorySchema, 'inventories');
const Deal = mongoose.model('DealDiagV2', DealSchema, 'deals');
const Lookup = mongoose.model('LookupDiagV2', LookupSchema, 'lookups');

async function checkData() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties');
    console.log('Connected to MongoDB');

    const lookups = await Lookup.find({ lookup_type: 'Category' }).lean();
    console.log('\n--- Categories in Lookups ---');
    lookups.forEach(l => console.log(`${l.lookup_value} (ID: ${l._id})`));

    const inventoryCount = await Inventory.countDocuments();
    console.log(`\nTotal Inventory: ${inventoryCount}`);

    // Check distribution manually
    const invDistribution = await Inventory.aggregate([
        { $match: { category: { $exists: true } } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    console.log('\n--- Inventory Category Distribution ---');
    for (const item of invDistribution) {
        console.log(`Category: ${JSON.stringify(item._id)} (Type: ${typeof item._id}), Count: ${item.count}`);
    }

    const dealCount = await Deal.countDocuments();
    console.log(`\nTotal Deals: ${dealCount}`);

    const dealDistribution = await Deal.aggregate([
        { $match: { category: { $exists: true } } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    console.log('\n--- Deal Category Distribution ---');
    for (const item of dealDistribution) {
        console.log(`Category: ${JSON.stringify(item._id)} (Type: ${typeof item._id}), Count: ${item.count}`);
    }

    if (lookups.length > 0) {
        console.log('\n--- Testing count logic used in controller ---');
        for (const cat of lookups) {
            const count = await Inventory.countDocuments({
                $or: [
                    { category: cat._id },
                    { category: cat.lookup_value }
                ]
            });
            console.log(`[${cat.lookup_value}]: Count=${count}`);
        }
    }

    await mongoose.disconnect();
}

checkData().catch(console.error);
