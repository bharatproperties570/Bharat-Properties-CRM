import mongoose from 'mongoose';

async function run() {
    await mongoose.connect('mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority');
    
    // Create connection and check benchmark collection
    const PricingBenchmark = mongoose.model('PricingBenchmark', new mongoose.Schema({}, { strict: false }));
    const bms = await PricingBenchmark.find({}).lean();
    console.log("Benchmarks:", bms.map(b => `${b.location}|${b.subCategory} RPU=${b.avgClosedRPU}`));
    process.exit(0);
}
run();
