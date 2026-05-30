import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const mongoUri = process.env.MONGODB_URI;

const DealSchema = new mongoose.Schema({}, { strict: false });
const Deal = mongoose.models.Deal || mongoose.model('Deal', DealSchema, 'deals');

async function show() {
    try {
        await mongoose.connect(mongoUri);
        const deal = await Deal.findById('6a0ad751ee8126a476a15553');
        if (!deal) {
            console.log("Deal not found");
            process.exit(0);
        }

        console.log("--- DEAL FIELDS ---");
        const obj = deal.toObject();
        for (const [key, value] of Object.entries(obj)) {
            console.log(`${key}: ${JSON.stringify(value)}`);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

show();
