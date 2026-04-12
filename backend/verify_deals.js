import mongoose from 'mongoose';
import Deal from './models/Deal.js';
import Lookup from './models/Lookup.js';
import Inventory from './models/Inventory.js';
import dotEnv from 'dotenv';
import path from 'path';

dotEnv.config({ path: './.env' });

async function verify() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        console.log('Connected.');

        const deals = await Deal.find({})
            .populate({ path: 'category', select: 'lookup_value', model: 'Lookup' })
            .populate({ path: 'subCategory', select: 'lookup_value', model: 'Lookup' })
            .limit(5)
            .lean();

        if (deals.length === 0) {
            console.log('No deals found to verify.');
        } else {
            console.log(`Found ${deals.length} deals. Checking first one for population:`);
            const deal = deals.find(d => d.category || d.subCategory) || deals[0];
            console.log(JSON.stringify(deal, (key, value) => key === 'stageHistory' ? undefined : value, 2));
            
            if (deal.category && typeof deal.category === 'object') {
                console.log('SUCCESS: Category is populated.');
            } else if (deal.category) {
                console.log('FAILURE: Category is NOT populated (still an ID or string).');
            } else {
                console.log('NOTE: Category is null (this is normal if not set).');
            }

            if (deal.subCategory && typeof deal.subCategory === 'object') {
                console.log('SUCCESS: SubCategory is populated.');
            }
        }

        await mongoose.disconnect();
        console.log('Disconnected.');
    } catch (err) {
        console.error('Verification failed:', err);
    }
}

verify();
