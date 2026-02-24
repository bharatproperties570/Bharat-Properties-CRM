
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

async function checkDeals() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const Deal = mongoose.model('Deal', new mongoose.Schema({}, { strict: false }));

        const deal = await Deal.findOne().sort({ createdAt: -1 });
        if (!deal) {
            console.log('No deals found');
            return;
        }

        console.log('Latest Deal Structure:');
        console.log(JSON.stringify(deal.toObject(), null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkDeals();
