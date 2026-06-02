import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
const MONGODB_URI = "mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority";

async function run() {
    await mongoose.connect(MONGODB_URI);
    const types = await Lookup.distinct('lookup_type');
    console.log("Lookup Types:", types);
    
    const stages = await Lookup.find({ lookup_type: { $in: ['Stage', 'LeadStage', 'Lead Stage'] } }).lean();
    console.log("Stages:", stages.map(s => s.lookup_value));
    mongoose.connection.close();
}
run();
