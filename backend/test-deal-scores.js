import mongoose from 'mongoose';
import Deal from './models/Deal.js';
import Lookup from './models/Lookup.js';
import PricingBenchmark from './models/PricingBenchmark.js';

async function run() {
    await mongoose.connect('mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority');
    
    const deals = await Deal.find({ stage: { $nin: ['Closed', 'Cancelled', 'Closed Won', 'Closed Lost'] } })
        .select('_id price size sizeUnit location subCategory ratePerUnit')
        .lean()
        .limit(10);

    const uniqueLookupIds = new Set();
    deals.forEach(d => {
        if (d.location && mongoose.Types.ObjectId.isValid(d.location)) uniqueLookupIds.add(d.location.toString());
        if (d.subCategory && mongoose.Types.ObjectId.isValid(d.subCategory)) uniqueLookupIds.add(d.subCategory.toString());
    });
    
    const lookupMap = new Map();
    if (uniqueLookupIds.size > 0) {
        const lookups = await Lookup.find({ _id: { $in: Array.from(uniqueLookupIds) } }).lean();
        lookups.forEach(l => lookupMap.set(l._id.toString(), l.lookup_value));
    }

    const benchmarksToInsert = [];
    
    for (const d of deals) {
        let locVal = d.location;
        if (locVal && mongoose.Types.ObjectId.isValid(locVal)) locVal = lookupMap.get(locVal.toString()) || locVal.toString();
        else if (typeof locVal === 'object' && locVal?.lookup_value) locVal = locVal.lookup_value;

        let subCatVal = d.subCategory;
        if (subCatVal && mongoose.Types.ObjectId.isValid(subCatVal)) subCatVal = lookupMap.get(subCatVal.toString()) || subCatVal.toString();
        else if (typeof subCatVal === 'object' && subCatVal?.lookup_value) subCatVal = subCatVal.lookup_value;
        
        console.log(`Loc: ${locVal} | SubCat: ${subCatVal} | Price: ${d.price}`);
        
        if (locVal && subCatVal && typeof locVal === 'string' && typeof subCatVal === 'string') {
            const sizeVal = parseFloat(typeof d.size === 'object' ? d.size?.value : d.size);
            if (sizeVal > 0) {
                const rpu = d.price / sizeVal;
                // make the benchmark 10% lower than the price, so price appears 10% Premium
                const avgClosedRPU = Math.round(rpu * 0.9);
                benchmarksToInsert.push({
                    location: locVal,
                    subCategory: subCatVal,
                    period: 'trailing-90d',
                    avgClosedRPU: avgClosedRPU,
                    dealCount: 10
                });
            }
        }
    }
    
    if (benchmarksToInsert.length > 0) {
        const map = new Map();
        for (const b of benchmarksToInsert) map.set(`${b.location}|${b.subCategory}`, b);
        const uniqueBenchmarks = Array.from(map.values());
        
        for (const bm of uniqueBenchmarks) {
            await PricingBenchmark.updateOne(
                { location: bm.location, subCategory: bm.subCategory, period: bm.period },
                { $set: bm },
                { upsert: true }
            );
            console.log(`Inserted Benchmark for ${bm.location} - ${bm.subCategory}: avgClosedRPU = ${bm.avgClosedRPU}`);
        }
    }
    
    process.exit(0);
}
run();
