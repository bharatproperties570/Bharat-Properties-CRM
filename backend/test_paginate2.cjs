const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function run() {
    await mongoose.connect(mongoUri);
    const Deal = mongoose.model('Deal', new mongoose.Schema({}, { strict: false }));
    
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
    
    console.time("Raw Find");
    await Deal.find(query).sort({ updatedAt: -1 }).skip(0).limit(20).lean();
    console.timeEnd("Raw Find");
    
    console.time("Count");
    await Deal.countDocuments(query);
    console.timeEnd("Count");

    process.exit(0);
}
run().catch(console.error);
