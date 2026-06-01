import mongoose from 'mongoose';

const MONGODB_URI = "mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority";

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');
        
        const counts = await Lookup.aggregate([
            { $group: { _id: "$lookup_type", count: { $sum: 1 } } }
        ]);
        console.log('Lookup types in DB:');
        console.log(counts);
        
        const roadWidths = await Lookup.find({ lookup_type: 'RoadWidth' }).lean();
        console.log('RoadWidth lookups in DB:');
        console.log(roadWidths);
    } catch(e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
