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
        const deals = await Deal.find({}).lean();
        console.log(`Found ${deals.length} deals in database:`);
        deals.forEach(d => {
            console.log(`- ID: ${d._id}, Project: "${d.projectName}", Unit: "${d.unitNo}", Price: ${d.price || d.quotePrice}, Location: ${d.location || 'null'}, Intent: ${d.intent || 'null'}, Category: ${d.category || 'null'}, PropertyType: ${d.propertyType || 'null'}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

show();
