import mongoose from 'mongoose';
import { getDealScores } from './controllers/stage.controller.js';
import Deal from './models/Deal.js';
import Lookup from './models/Lookup.js';
import PricingBenchmark from './models/PricingBenchmark.js';
import Activity from './models/Activity.js';

async function run() {
    await mongoose.connect('mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority');
    try { mongoose.model('SystemSetting'); } catch { mongoose.model('SystemSetting', new mongoose.Schema({}, {strict: false})); }
    
    // Polyfill getVisibilityFilter which is missing
    global.getVisibilityFilter = async () => ({});
    
    // Inject console logs into getDealScores by overriding console.log temporarily? No, easier to just check benchmarkMap.
    const uniqueLookupIds = new Set();
    const deals = await Deal.find({ _id: '6a05799a9839fe10f1966d93' }).lean();
    console.log("Deal Loc:", deals[0].location, "Sub:", deals[0].subCategory, "Price:", deals[0].price);
    
    const lookups = await Lookup.find({ _id: { $in: [deals[0].location, deals[0].subCategory] } }).lean();
    console.log("Lookups found:", lookups.map(l => l.lookup_value));
    
    const locVal = lookups.find(l => l._id.toString() === deals[0].location.toString())?.lookup_value;
    const subVal = lookups.find(l => l._id.toString() === deals[0].subCategory.toString())?.lookup_value;
    console.log("locVal:", locVal, "subVal:", subVal);
    
    const bm = await PricingBenchmark.findOne({ location: locVal, subCategory: subVal }).lean();
    console.log("Benchmark:", bm ? bm.avgClosedRPU : "Not found");
    
    if (bm) {
        const dealSizeVal = typeof deals[0].size === 'object' ? deals[0].size?.value : deals[0].size;
        console.log("Deal size val:", dealSizeVal);
        let dealRPU = deals[0].price / parseFloat(dealSizeVal);
        console.log("Calculated RPU:", dealRPU);
        
        const diff = dealRPU - bm.avgClosedRPU;
        const marketGapPct = Math.round((diff / bm.avgClosedRPU) * 100);
        console.log("MarketGapPct:", marketGapPct);
    }
    
    process.exit(0);
}
run();
