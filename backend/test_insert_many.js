import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function directInsertTest() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Inventory = (await import('./models/Inventory.js')).default;

        const payload = [{
            projectName: 'Direct Test',
            unitNo: 'A-102',
            unitNumber: 'A-102',
            team: 'Sales' // Invalid ObjectId
        }];

        try {
            const result = await Inventory.insertMany(payload, { ordered: false });
            console.log("insertMany result:", result);
            const found = await Inventory.findOne({ unitNumber: 'A-102' });
            console.log("Found in DB:", found ? 'Yes' : 'No');
        } catch (err) {
            console.error("insertMany threw an error:", err.name, err.message);
        }

        await mongoose.disconnect();
    } catch (e) {
        console.error("Test failed:", e);
        await mongoose.disconnect();
    }
}
directInsertTest();
