import mongoose from 'mongoose';

const MONGODB_URI = "mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority";

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');
        
        const inventorySchema = new mongoose.Schema({}, { strict: false });
        const Inventory = mongoose.model('Inventory', inventorySchema, 'inventories');
        
        const doc = await Inventory.findOne({ roadWidth: { $exists: true } });
        console.log('Sample Inventory with roadWidth:');
        console.log(JSON.stringify(doc, null, 2));
        
        const doc2 = await Inventory.findOne().sort({ createdAt: -1 });
        console.log('Latest Inventory:');
        console.log(JSON.stringify(doc2, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
