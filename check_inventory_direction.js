import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function check() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bharat-properties-crm');
    const InventorySchema = new mongoose.Schema({
        unitNo: String,
        unitNumber: String,
        direction: mongoose.Schema.Types.Mixed,
        facing: mongoose.Schema.Types.Mixed,
        orientation: mongoose.Schema.Types.Mixed
    }, { collection: 'inventories', strict: false });
    const Inv = mongoose.model('InventoryRaw', InventorySchema);

    const data = await Inv.find({}).sort({ createdAt: -1 }).limit(5).exec();
    console.log("Recent 5 inventories:");
    console.log(JSON.stringify(data, null, 2));

    const withOrientation = await Inv.find({ orientation: { $exists: true } }).limit(2).exec();
    console.log("With orientation field explicitly:");
    console.log(JSON.stringify(withOrientation, null, 2));

    const withDirection = await Inv.find({ direction: { $exists: true, $ne: null } }).sort({ createdAt: -1 }).limit(2).exec();
    console.log("With direction field explicitly:");
    console.log(JSON.stringify(withDirection, null, 2));

    mongoose.disconnect();
}

check().catch(console.error);
