import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Lookup from './models/Lookup.js';
import Inventory from './models/Inventory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function checkToday() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const recent = await Inventory.find({ createdAt: { $gte: today } })
            .populate('category subCategory status unitType');

        console.log(`Found ${recent.length} records created today.`);
        recent.slice(0, 10).forEach(r => {
            console.log(`- ID: ${r._id}, UnitNo: ${r.unitNo || r.unitNumber}, ProjectName: ${r.projectName}, Status: ${r.status?.lookup_value || r.status}, Category: ${r.category?.lookup_value || r.category}`);
        });

        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
        await mongoose.disconnect();
    }
}
checkToday();
