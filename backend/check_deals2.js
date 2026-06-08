import mongoose from 'mongoose';
import Deal from './models/Deal.js';
import Lookup from './models/Lookup.js';

async function run() {
    await mongoose.connect('mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority');
    
    const deals = await Deal.find({ price: { $exists: true, $ne: null } }).populate('location', 'lookup_value').populate('subCategory', 'lookup_value').limit(3).lean();
    deals.forEach(d => {
        let loc = d.location;
        if (typeof loc === 'object' && loc?.lookup_value) loc = loc.lookup_value;
        let sub = d.subCategory;
        if (typeof sub === 'object' && sub?.lookup_value) sub = sub.lookup_value;
        console.log(`Deal ID: ${d._id}, Loc: ${loc}, Sub: ${sub}, Price: ${d.price}, Size: ${d.size}, RPU: ${d.ratePerUnit}`);
    });
    process.exit(0);
}
run();
