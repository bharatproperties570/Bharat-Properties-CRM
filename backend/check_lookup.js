import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
async function run() {
    await mongoose.connect('mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority');
    const f = await Lookup.findOne({ _id: '69999d8331d19e8a9538ee1e' });
    console.log("Lookup:", f);
    process.exit(0);
}
run();
