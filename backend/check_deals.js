import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import Deal from './models/Deal.js';

async function run() {
    await mongoose.connect('mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority');
    
    const deals = await Deal.find({}).populate('location', 'lookup_value').populate('subCategory', 'lookup_value').lean();
    console.log("Deals Count:", deals.length);
    deals.forEach(d => {
        let loc = d.location;
        if (typeof loc === 'object' && loc?.lookup_value) loc = loc.lookup_value;
        let sub = d.subCategory;
        if (typeof sub === 'object' && sub?.lookup_value) sub = sub.lookup_value;
        if (loc === 'Sector 32' && sub === 'Plot') {
            console.log("Found matched deal! Price:", d.price, "Size:", d.size, "RPU:", d.ratePerUnit);
        }
    });
    process.exit(0);
}
run();
