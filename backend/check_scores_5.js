import mongoose from 'mongoose';
import { getDealScores } from './controllers/stage.controller.js';
import Deal from './models/Deal.js';
import Lookup from './models/Lookup.js';
import PricingBenchmark from './models/PricingBenchmark.js';
import Activity from './models/Activity.js';

async function run() {
    await mongoose.connect('mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority');
    try { mongoose.model('SystemSetting'); } catch { mongoose.model('SystemSetting', new mongoose.Schema({}, {strict: false})); }
    global.getVisibilityFilter = async () => ({});
    
    // Test for a specific deal
    const req = { user: { role: 'admin' }, query: { dealId: '6a05799a9839fe10f1966d93' } };
    const res = {
        json: (data) => {
            console.log("Response:", JSON.stringify(data, null, 2));
            process.exit(0);
        },
        status: (code) => ({ json: (d) => console.log(code, d) })
    };
    
    await getDealScores(req, res);
}
run();
