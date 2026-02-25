import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/.env' });

const InventorySchema = new mongoose.Schema({}, { strict: false });
const Inventory = mongoose.model('Inventory', InventorySchema, 'inventories');

async function inspect() {
    await mongoose.connect(process.env.MONGODB_URI);
    const item = await Inventory.findOne({ owners: { $exists: true, $not: { $size: 0 } } }).lean();
    console.log("Sample Inventory Item:", JSON.stringify(item, null, 2));
    process.exit(0);
}

inspect();
