import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Deal = mongoose.connection.db.collection('deals');
    const Lookup = mongoose.connection.db.collection('lookups');
    
    const pipeline = [
        { $match: { stage: { $nin: ['Cancelled', 'Closed Lost', 'Sold Out', 'Closed (Lost)', 'Closed Won', 'Closed (Won)', 'Lost', 'Closed', 'Junk'] } } },
        { $lookup: { from: 'inventories', localField: 'inventoryId', foreignField: '_id', as: 'inventoryId' } },
        { $unwind: { path: '$inventoryId', preserveNullAndEmptyArrays: true } },
        { $addFields: { 
            activePrice: {
                $max: [
                    { $convert: { input: '$price', to: 'double', onError: 0, onNull: 0 } },
                    { $convert: { input: '$quotePrice', to: 'double', onError: 0, onNull: 0 } },
                    { $convert: { input: '$inventoryId.price', to: 'double', onError: 0, onNull: 0 } }
                ]
            },
            activeIntent: { $ifNull: ['$intent', '$inventoryId.intent'] }
        }},
        { $match: { activePrice: { $gte: 4000000, $lte: 12000000 } } },
        { $group: { _id: '$activeIntent', count: { $sum: 1 } } }
    ];
    
    const dist = await Deal.aggregate(pipeline).toArray();
    console.log('Intent Distribution for 40L-1.2Cr deals:');
    for(const d of dist) {
        let name = String(d._id);
        if(d._id && mongoose.Types.ObjectId.isValid(String(d._id))) {
            const l = await Lookup.findOne({_id: new mongoose.Types.ObjectId(String(d._id))});
            if(l) name = l.lookup_value;
        }
        console.log(`- ${name}: ${d.count}`);
    }
    
    process.exit(0);
}
run();
