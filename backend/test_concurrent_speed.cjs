const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function run() {
    await mongoose.connect(mongoUri);
    await import('./models/Lookup.js');
    await import('./models/Contact.js');
    await import('./models/Deal.js');
    const Deal = mongoose.model('Deal');
    const Lookup = mongoose.model('Lookup');
    
    // Warmup
    await Deal.findOne();

    const query = {
        $and: [
            {
               isVisible: { $ne: false },
               stage: { $nin: ['Closed Won', 'Closed Lost', 'Cancelled', 'Closed', 'Sold Out'] },
               $or: [
                    { dealId: { $regex: 'test', $options: 'i' } },
                    { unitNo: { $regex: 'test', $options: 'i' } },
                    { location: { $regex: 'test', $options: 'i' } },
                    { projectName: { $regex: 'test', $options: 'i' } }
               ]
            }
        ]
    };
    
    const dealListPopulateFields = [
        { path: 'inventoryId', select: 'projectName unitNo' }
    ];

    console.time("Concurrent All");
    
    const categoryStatsPromise = Deal.aggregate([
        { $match: query },
        {
            $lookup: {
                from: 'inventories',
                localField: 'inventoryId',
                foreignField: '_id',
                pipeline: [{ $project: { category: 1 } }],
                as: 'inventory'
            }
        },
        { $unwind: { path: '$inventory', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                activeCategory: { $ifNull: ["$category", "$inventory.category"] }
            }
        },
        {
            $group: {
                _id: "$activeCategory",
                count: { $sum: 1 }
            }
        }
    ]);

    const findPromise = Deal.find(query).sort({ updatedAt: -1 }).skip(0).limit(20).populate(dealListPopulateFields).lean();
    const countPromise = Deal.countDocuments(query);
    const lookupPromise = Lookup.find({}).limit(5).lean();

    await Promise.all([findPromise, countPromise, categoryStatsPromise, lookupPromise]);
    
    console.timeEnd("Concurrent All");
    
    process.exit(0);
}
run().catch(console.error);
