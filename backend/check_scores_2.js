import mongoose from 'mongoose';
import { getDealScores } from './controllers/stage.controller.js';
import Deal from './models/Deal.js';
import Lookup from './models/Lookup.js';
import PricingBenchmark from './models/PricingBenchmark.js';
import Activity from './models/Activity.js';

async function run() {
    await mongoose.connect('mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority');
    
    // Register SystemSetting if not exists
    try { mongoose.model('SystemSetting'); } catch { mongoose.model('SystemSetting', new mongoose.Schema({}, {strict: false})); }
    
    const req = { user: { role: 'admin' }, query: {} };
    const res = {
        json: (data) => {
            const gapDeals = Object.entries(data.scores).filter(([id, s]) => s.marketGapPct != null);
            console.log("Deals with marketGapPct:", gapDeals.length);
            console.log("Samples:", gapDeals.slice(0, 3));
            process.exit(0);
        },
        status: (code) => ({ json: (d) => console.log(code, d) })
    };
    
    // Polyfill getVisibilityFilter which is missing
    global.getVisibilityFilter = async () => ({});
    
    await getDealScores(req, res);
}
run();
