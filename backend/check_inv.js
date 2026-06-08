import mongoose from 'mongoose';
import Inventory from './models/Inventory.js';
async function run() {
    await mongoose.connect('mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority');
    const inv = await Inventory.findOne({}).select('builtupType possessionStatus furnishType').lean();
    console.log("Sample Inventory:", inv);
    process.exit(0);
}
run();
