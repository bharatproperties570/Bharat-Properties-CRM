import mongoose from 'mongoose';
import Deal from './models/Deal.js';
import Inventory from './models/Inventory.js';
import Contact from './models/Contact.js';
import dotEnv from 'dotenv';

dotEnv.config({ path: './.env' });

async function verify() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        console.log('Connected.');

        const deals = await Deal.find({}).limit(5).lean();
        console.log(`Found ${deals.length} deals.`);

        const inventoryIdsToFetch = [...new Set(deals.map(d => d.inventoryId).filter(Boolean))];
        console.log(`Inventory IDs to fetch: ${inventoryIdsToFetch}`);

        const inventoryMap = new Map();
        if (inventoryIdsToFetch.length > 0) {
            const inventories = await Inventory.find({ _id: { $in: inventoryIdsToFetch } })
                .populate('owners')
                .lean();
            console.log(`Fetched ${inventories.length} inventories.`);
            inventories.forEach(inv => {
                inventoryMap.set(String(inv._id), inv);
                console.log(`Inventory ${inv._id} owners:`, JSON.stringify(inv.owners));
            });
        }

        const enriched = deals.map(deal => {
            const dealObj = { ...deal };
            if (dealObj.inventoryId) {
                const inventory = inventoryMap.get(String(dealObj.inventoryId));
                if (inventory && inventory.owners && inventory.owners.length > 0) {
                    dealObj.owner = inventory.owners[0];
                }
            }
            return dealObj;
        });

        console.log('Enriched Deal Owner Sample:');
        enriched.forEach((d, i) => {
            console.log(`Deal ${i} Owner:`, JSON.stringify(d.owner));
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('Verification failed:', err);
    }
}

verify();
