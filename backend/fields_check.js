import mongoose from 'mongoose';

const MONGODB_URI = (() => { throw new Error('CRITICAL: Hardcoded production credential removed. Use MONGODB_URI env var.') })();

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');
        
        const inventorySchema = new mongoose.Schema({}, { strict: false });
        const Inventory = mongoose.model('Inventory', inventorySchema, 'inventories');
        
        const doc = await Inventory.findOne({ roadWidth: { $exists: true } });
        console.log('Sample Inventory with roadWidth:');
        console.log(JSON.stringify(doc, null, 2));
        
        const doc2 = await Inventory.findOne().sort({ createdAt: -1 });
        console.log('Latest Inventory:');
        console.log(JSON.stringify(doc2, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
