import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function countInventory() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Inventory = (await import('./models/Inventory.js')).default;
        const Lookup = (await import('./models/Lookup.js')).default;

        const count = await Inventory.countDocuments();
        console.log(`Total inventory records in DB: ${count}`);

        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
        await mongoose.disconnect();
    }
}
countInventory();
