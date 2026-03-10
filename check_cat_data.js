import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

const InventorySchema = new mongoose.Schema({}, { strict: false });
const DealSchema = new mongoose.Schema({}, { strict: false });
const LookupSchema = new mongoose.Schema({}, { strict: false });

const Inventory = mongoose.model('InventoryDiag', InventorySchema, 'inventories');
const Deal = mongoose.model('DealDiag', DealSchema, 'deals');
const Lookup = mongoose.model('LookupDiag', LookupSchema, 'lookups');

async function checkData() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties');
    console.log('Connected to MongoDB');

    const lookups = await Lookup.find({ lookup_type: 'Category' }).lean();
    console.log('\n--- Categories in Lookups ---');
    lookups.forEach(l => console.log(`${l.lookup_value} (ID: ${l._id})`));

    const inventoryCount = await Inventory.countDocuments();
    console.log(`\nTotal Inventory: ${inventoryCount}`);

    const sampleInventory = await Inventory.find({ category: { $exists: true } }).limit(5).lean();
    console.log('\n--- Sample Inventory Categories ---');
    sampleInventory.forEach(i => {
        console.log(`ID: ${i._id}, Unit: ${i.unitNo || i.unitNumber}, Category: ${JSON.stringify(i.category)} (Type: ${typeof i.category})`);
    });

    const dealCount = await Deal.countDocuments();
    console.log(`\nTotal Deals: ${dealCount}`);

    const sampleDeals = await Deal.find({ category: { $exists: true } }).limit(5).lean();
    console.log('\n--- Sample Deal Categories ---');
    sampleDeals.forEach(d => {
        console.log(`ID: ${d._id}, DealID: ${d.dealId}, Category: ${JSON.stringify(d.category)} (Type: ${typeof d.category})`);
    });

    if (lookups.length > 0) {
        const testId = lookups[0]._id;
        const testLabel = lookups[0].lookup_value;

        const countById = await Inventory.countDocuments({ category: testId });
        const countByLabel = await Inventory.countDocuments({ category: testLabel });
        const countByObjId = await Inventory.countDocuments({ category: new mongoose.Types.ObjectId(testId) });

        console.log(`\nTest Count for Inventory [${testLabel}]:`);
        console.log(`- By String ID: ${countById}`);
        console.log(`- By Label: ${countByLabel}`);
        console.log(`- By ObjectId: ${countByObjId}`);
    }

    await mongoose.disconnect();
}

checkData().catch(console.error);
