import mongoose from 'mongoose';
import Deal from './models/Deal.js';
import dotEnv from 'dotenv';

dotEnv.config({ path: './.env' });

async function checkDeals() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        
        const deals = await Deal.find({}).lean();
        console.log(`Checking ${deals.length} deals...`);
        
        const summary = {
            hasOwnerObj: 0,
            hasOwnerName: 0,
            hasInventory: 0,
            total: deals.length
        };

        deals.forEach(deal => {
            if (deal.owner) summary.hasOwnerObj++;
            if (deal.ownerName) summary.hasOwnerName++;
            if (deal.inventoryId) summary.hasInventory++;
            
            if (deal.ownerName && !deal.owner) {
                console.log(`Deal ${deal._id} has ownerName: "${deal.ownerName}" but owner field is null.`);
            }
        });

        console.log('Summary:', summary);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Check failed:', err);
    }
}

checkDeals();
