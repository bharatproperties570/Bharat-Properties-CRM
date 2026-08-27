const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function runExplain() {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    
    const query = {
        $and: [
            {
               $or: [
                   { 'visibleTo': 'Everyone' },
                   { 'assignment.visibleTo': 'Everyone' },
                   { 'visibleTo': 'Team', 'teams': new mongoose.Types.ObjectId('6991ad69e07eb3dd7dd46681') },
                   { 'assignment.visibleTo': 'Team', 'assignment.team': new mongoose.Types.ObjectId('6991ad69e07eb3dd7dd46681') },
                   { 'owner': new mongoose.Types.ObjectId('69c4be0fd8c5cd0d6c90e999') },
                   { 'assignment.assignedTo': new mongoose.Types.ObjectId('69c4be0fd8c5cd0d6c90e999') }
               ]
            },
            {
               isVisible: { $ne: false },
               stage: { $nin: ['Closed Won', 'Closed Lost', 'Cancelled', 'Closed', 'Sold Out'] },
               $or: [
                    { dealId: { $regex: 'villa', $options: 'i' } },
                    { unitNo: { $regex: 'villa', $options: 'i' } },
                    { location: { $regex: 'villa', $options: 'i' } },
                    { projectName: { $regex: 'villa', $options: 'i' } }
               ]
            }
        ]
    };

    console.log("=== EXPLAIN AGGREGATE ===");
    const aggExplain = await db.collection('deals').aggregate([
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
    ], { explain: true }).toArray();
    
    console.log(JSON.stringify(aggExplain, null, 2));
    
    process.exit(0);
}
runExplain().catch(console.error);
