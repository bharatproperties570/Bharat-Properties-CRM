import mongoose from 'mongoose';

const MONGODB_URI = "mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority";

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        const lookupSchema = new mongoose.Schema({}, { strict: false });
        const Lookup = mongoose.model('Lookup', lookupSchema, 'lookups');
        
        const ids = ['69a587c5b63c87c513f81a85', '699beeb0ee5159cfdb8f3ed2'];
        for (const id of ids) {
            const doc = await Lookup.findById(id);
            console.log(`ID: ${id}`);
            console.log(JSON.stringify(doc, null, 2));
            console.log('--------------------');
        }
    } catch(e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
