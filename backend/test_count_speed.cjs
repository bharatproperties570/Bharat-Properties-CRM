const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function runSpeedTest() {
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

    console.time("CountDocuments");
    const countResult = await db.collection('deals').countDocuments(query);
    console.timeEnd("CountDocuments");
    
    console.log("Count is:", countResult);
    process.exit(0);
}
runSpeedTest().catch(console.error);
