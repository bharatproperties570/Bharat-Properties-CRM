import mongoose from 'mongoose';
import Deal from './models/Deal.js';
import dotEnv from 'dotenv';

dotEnv.config({ path: './.env' });

async function checkDeals() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        
        const sampleDeals = await Deal.find({}).limit(10).lean();
        sampleDeals.forEach(deal => {
            console.log(`Deal ${deal._id} (${deal.unitNo}):`);
            console.log(`  owner:`, deal.owner);
            console.log(`  ownerName:`, deal.ownerName);
            console.log(`  inventoryId:`, deal.inventoryId);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('Check failed:', err);
    }
}

checkDeals();
