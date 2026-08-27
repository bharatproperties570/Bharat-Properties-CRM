
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
        { \$lookup: { from: 'inventories', localField: 'inventoryId', foreignField: '_id', as: 'inventoryId' } },
        { \$unwind: { path: '\$inventoryId', preserveNullAndEmptyArrays: true } },
        { \$addFields: { 
            activeCategory: { \$ifNull: ['\$category', '\$inventoryId.category'] },
            activeIntent: { \$ifNull: ['\$intent', '\$inventoryId.intent'] }
        }},
        { \$group: { 
            _id: { intent: '\$activeIntent', category: '\$activeCategory' },
            count: { \$sum: 1 }
        }}
    ];
    
    const dist = await Deal.aggregate(pipeline);
    
    for (const group of dist) {
        let intentName = 'Null';
        if (group._id.intent) {
            const l = await Lookup.findById(group._id.intent).lean();
            intentName = l ? l.lookup_value : group._id.intent;
        }
        let catName = 'Null';
        if (group._id.category) {
            const l = await Lookup.findById(group._id.category).lean();
            catName = l ? l.lookup_value : group._id.category;
        }
        console.log(`Intent: ${intentName}, Category: ${catName} -> ${group.count} deals`);
    }
    
    process.exit(0);
}
run();
