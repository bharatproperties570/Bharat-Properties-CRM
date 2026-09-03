const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function run() {
    await mongoose.connect(mongoUri);
    const Deal = mongoose.model('Deal', new mongoose.Schema({}, { strict: false }));
    const { paginate } = await import('./utils/pagination.js');
    
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
        { path: 'inventoryId', select: 'projectName unitNo' },
        { path: 'projectId', select: 'name' },
        { path: 'owner', select: 'name phones', model: 'Contact' },
        { path: 'assignedTo', select: 'fullName name email' },
        { path: 'assignment.assignedTo', select: 'fullName name email' },
        { path: 'assignment.team', select: 'name' },
        { path: 'team', select: 'name' },
        { path: 'teams', select: 'name' }
    ];

    console.time("Paginate");
    const result = await paginate(Deal, query, 1, 20, { updatedAt: -1 }, dealListPopulateFields, null, null);
    console.timeEnd("Paginate");
    
    console.log("Records:", result.records.length);
    process.exit(0);
}
run().catch(console.error);
