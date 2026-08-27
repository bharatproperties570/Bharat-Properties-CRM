import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const fs = await import('fs');
    const path = await import('path');
    const modelsDir = '/home/ubuntu/bharat-properties-crm/backend/models';
    const files = fs.readdirSync(modelsDir);
    for (const file of files) {
        if (file.endsWith('.js')) {
            await import('file://' + path.join(modelsDir, file));
        }
    }
    
    const Deal = mongoose.model('Deal');
    const Lookup = mongoose.model('Lookup');
    
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
            }
        }}
    ];
    
    const deals = await Deal.aggregate(pipeline);
    
    let countInBudget = 0;
    let countEmpty = 0;
    let countBelow = 0;
    let countAbove = 0;
    
    const minB = 5000000 * 0.8; // 4,000,000
    const maxB = 10000000 * 1.2; // 12,000,000
    
    for (const d of deals) {
        const p = d.activePrice;
        if (!p || p === 0) countEmpty++;
        else if (p >= minB && p <= maxB) countInBudget++;
        else if (p < minB) countBelow++;
        else countAbove++;
    }
    
    console.log('Total Active:', deals.length);
    console.log('Empty Price:', countEmpty);
    console.log('In Budget (40L - 1.2Cr):', countInBudget);
    console.log('Below Budget (< 40L):', countBelow);
    console.log('Above Budget (> 1.2Cr):', countAbove);
    
    process.exit(0);
}
run();
