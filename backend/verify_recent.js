import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function checkRecentDb() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Inventory = (await import('./models/Inventory.js')).default;

        const recent = await Inventory.find().sort({ _id: -1 }).limit(5).lean();
        console.log(`Found ${recent.length} recent records.`);
        recent.forEach(r => {
            console.log(`ID: ${r._id}`);
            console.log(`Project: ${r.projectName}`);
            console.log(`UnitNo: ${r.unitNo}`);
            console.log(`UnitNumber: ${r.unitNumber}`);
            console.log('---');
        });

        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
        await mongoose.disconnect();
    }
}
checkRecentDb();
