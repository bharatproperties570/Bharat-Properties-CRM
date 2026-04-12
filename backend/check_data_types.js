import mongoose from 'mongoose';
import Deal from './models/Deal.js';
import Inventory from './models/Inventory.js';
import dotEnv from 'dotenv';

dotEnv.config({ path: './.env' });

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        
        console.log('Checking Inventories for non-ObjectId owners...');
        const problematicInventories = await Inventory.find({
            owners: { $elemMatch: { $not: { $type: "objectId" } } }
        }).limit(10).lean();

        problematicInventories.forEach(inv => {
            console.log(`Inventory ${inv._id} (${inv.unitNo}) has owners:`, inv.owners);
        });

        console.log('\nChecking Deals for non-ObjectId categories...');
        const problematicDeals = await Deal.find({
            category: { $not: { $type: "objectId" }, $ne: null }
        }).limit(10).lean();

        problematicDeals.forEach(deal => {
            console.log(`Deal ${deal._id} category:`, deal.category, `(${typeof deal.category})`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('Check failed:', err);
    }
}

checkData();
