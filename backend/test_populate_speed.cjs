const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function run() {
    await mongoose.connect(mongoUri);
    // dynamically import the ES modules
    await import('./models/Lookup.js');
    await import('./models/Contact.js');
    await import('./models/Deal.js');
    const Deal = mongoose.model('Deal');

    // Warmup
    await Deal.findOne();

    const query = {
        $and: [
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
    
    const dealListPopulateFields = [
        { path: 'inventoryId', select: 'projectName unitNo' },
        { path: 'projectId', select: 'name' },
        { path: 'owner', select: 'name phones', model: 'Contact' },
        { path: 'assignedTo', select: 'fullName name email' },
        { path: 'assignment.assignedTo', select: 'fullName name email' },
        { path: 'assignment.team', select: 'name' },
        { path: 'team', select: 'name' },
        { path: 'teams', select: 'name' }
    ];

    console.time("Find with Populate");
    const res = await Deal.find(query).sort({ updatedAt: -1 }).skip(0).limit(20).populate(dealListPopulateFields).lean();
    console.timeEnd("Find with Populate");
    console.log("Returned deals:", res.length);
    
    console.time("Count");
    await Deal.countDocuments(query);
    console.timeEnd("Count");

    process.exit(0);
}
run().catch(console.error);
