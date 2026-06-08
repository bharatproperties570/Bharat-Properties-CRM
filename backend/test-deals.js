import mongoose from 'mongoose';
import Deal from './models/Deal.js';
import PricingBenchmark from './models/PricingBenchmark.js';

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/bharat_properties');
    const deals = await Deal.find({}).limit(5).populate('location').populate('subCategory').lean();
    console.log("Found deals:", deals.length);
    if(deals.length > 0) {
        const d = deals[0];
        console.log("Sample deal:", d.dealId, "Price:", d.price, "Location:", d.location?.lookup_value, "SubCat:", d.subCategory?.lookup_value);
    }
    const bms = await PricingBenchmark.find({}).limit(5).lean();
    console.log("Benchmarks found:", bms.length);
    if(bms.length > 0) {
        console.log("Sample BM:", bms[0].location, bms[0].subCategory, bms[0].avgClosedRPU);
    }
    process.exit(0);
}
run();
