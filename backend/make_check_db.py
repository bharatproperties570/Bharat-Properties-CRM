code = """
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const Deal = mongoose.model('Deal');
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, {strict: false}), 'lookups');
    
    // Let's find ANY active deals in Sahibzada Ajit Singh Nagar for Buy Residential
    const buyIntents = await Lookup.find({ lookup_type: 'Intent', lookup_value: { \$regex: /buy|sale|sell/i } }).lean();
    const resCats = await Lookup.find({ lookup_type: 'Category', lookup_value: { \$regex: /residential/i } }).lean();
    
    const intentIds = buyIntents.map(l => l._id);
    const catIds = resCats.map(l => l._id);
    
    console.log('Buy Intents:', intentIds.length);
    console.log('Res Cats:', catIds.length);
    
    const pipeline = [
        { \$match: { isActive: true, stage: { \$nin: ['Cancelled', 'Closed Lost', 'Sold Out', 'Closed (Lost)', 'Closed Won', 'Closed (Won)', 'Lost', 'Closed', 'Junk'] } } },
        { \$lookup: { from: 'inventories', localField: 'inventoryId', foreignField: '_id', as: 'inventoryId' } },
        { \$unwind: { path: '\$inventoryId', preserveNullAndEmptyArrays: true } },
        { \$addFields: { 
            activeCategory: { \$ifNull: ['\$category', '\$inventoryId.category'] },
            activeIntent: { \$ifNull: ['\$intent', '\$inventoryId.intent'] }
        }},
        { \$match: { activeIntent: { \$in: intentIds }, activeCategory: { \$in: catIds } } }
    ];
    
    const res = await Deal.aggregate(pipeline);
    console.log('Total Active Buy/Res Deals:', res.length);
    
    process.exit(0);
}
run();
"""
with open('check_db_matches.js', 'w') as f:
    f.write(code)
