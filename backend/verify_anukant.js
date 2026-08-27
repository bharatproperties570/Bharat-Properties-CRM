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
            activeCategory: { $ifNull: ['$category', '$inventoryId.category'] },
            activeIntent: { $ifNull: ['$intent', '$inventoryId.intent'] }
        }}
    ];
    
    const deals = await Deal.aggregate(pipeline).toArray();
    let count = 0;
    
    for(const d of deals) {
        // Intent Check
        const iStr = String(d.activeIntent);
        const isSell = iStr.includes('699c1e5b5ab8add9a6c59cad') || iStr.includes('Sell') || iStr.includes('69a99b7d3a56674b285e1b51') || iStr.includes('For Sale');
        const isNullIntent = !d.activeIntent;
        
        // Category Check
        const cStr = String(d.activeCategory);
        const isRes = cStr.includes('6995e15f74ec320348f2319c') || cStr.includes('Residential');
        const isNullCat = !d.activeCategory;
        
        // Budget Check
        const p = d.activePrice;
        const isBudget = (p >= 4000000 && p <= 12000000) || p === 0 || !p;
        
        if ((isSell || isNullIntent) && (isRes || isNullCat) && isBudget) {
            count++;
            console.log('MATCH:', d.projectName || d.inventoryId?.projectName, '| Price:', p, '| Intent:', d.activeIntent, '| Cat:', d.activeCategory);
        }
    }
    
    console.log('Total Manual Matches:', count);
    
    process.exit(0);
}
run();
