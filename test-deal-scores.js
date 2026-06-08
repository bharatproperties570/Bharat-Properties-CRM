import mongoose from 'mongoose';
import { Deal } from './backend/models/Deal.js';
import { PricingBenchmark } from './backend/models/PricingBenchmark.js';
import { Lookup } from './backend/models/Lookup.js';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const deals = await Deal.find({ stage: { $nin: ['Closed', 'Cancelled', 'Closed Won', 'Closed Lost'] } })
        .select('_id price size sizeUnit location subCategory ratePerUnit')
        .populate('subCategory', 'lookup_value')
        .populate('location', 'lookup_value')
        .lean()
        .limit(5);

    console.log(`Found ${deals.length} deals`);
    
    for (const d of deals) {
        console.log(`\nDeal ID: ${d._id}`);
        const locObj = d.location;
        const locVal = (locObj && locObj.lookup_value) ? locObj.lookup_value : locObj;
        const subCatObj = d.subCategory;
        const subCatVal = (subCatObj && subCatObj.lookup_value) ? subCatObj.lookup_value : subCatObj;
        
        console.log(`  Location: ${locVal} | SubCat: ${subCatVal}`);
        console.log(`  Price: ${d.price} | Size: ${typeof d.size === 'object' ? d.size?.value : d.size}`);
        
        if (locVal && subCatVal) {
            const bm = await PricingBenchmark.findOne({ location: locVal, subCategory: subCatVal, period: 'trailing-90d' });
            if (bm) {
                console.log(`  -> Found Benchmark: avgClosedRPU = ${bm.avgClosedRPU}`);
            } else {
                console.log(`  -> NO BENCHMARK FOUND for ${locVal} | ${subCatVal}`);
            }
        }
    }
    
    process.exit(0);
}
run();
