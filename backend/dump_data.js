import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import Lead from './models/Lead.js';
import Deal from './models/Deal.js';
import Inventory from './models/Inventory.js';
import Lookup from './models/Lookup.js';

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const lead = await Lead.findOne({ firstName: { $regex: 'Vinod', $options: 'i' }, phone: '9416482592' }).lean();
        console.log('--- LEAD DATA ---');
        console.log(JSON.stringify(lead, null, 2));

        let deal = await Deal.findOne({ unitNo: '1412' }).populate('inventoryId').lean();
        if (!deal) deal = await Deal.findOne({ unitNumber: '1412' }).populate('inventoryId').lean();
        if (!deal) {
            const deals = await Deal.find({}).limit(5).lean();
            console.log("Found deals instead:", deals.map(d => d.unitNo));
        } else {
             console.log('--- DEAL DATA ---');
             console.log(JSON.stringify(deal, null, 2));
        }

        // Fetch lookups used in the deal/lead
        const lookupsToFetch = [];
        if (lead.sizeConfig) lookupsToFetch.push(lead.sizeConfig);
        if (deal && deal.sizeConfig) lookupsToFetch.push(deal.sizeConfig);
        if (deal && deal.inventoryId && deal.inventoryId.sizeConfig) lookupsToFetch.push(deal.inventoryId.sizeConfig);
        if (lead.location) lookupsToFetch.push(lead.location);
        
        if (lookupsToFetch.length > 0) {
             const lookups = await Lookup.find({ _id: { $in: lookupsToFetch } }).lean();
             console.log('--- LOOKUPS ---');
             console.log(JSON.stringify(lookups, null, 2));
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
run();
