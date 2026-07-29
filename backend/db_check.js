import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bharat-properties-crm');

const Activity = mongoose.model('Activity', new mongoose.Schema({}, { strict: false }));
const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));

const check = async () => {
    // Get last added lead
    const lastLead = await Lead.findOne().sort({ createdAt: -1 }).lean();
    console.log("Last Lead Added:", lastLead?._id, lastLead?.firstName, lastLead?.createdAt);
    
    // Get last activities for this lead
    if (lastLead) {
        const activities = await Activity.find({ leadId: lastLead._id }).sort({ createdAt: -1 }).limit(5).lean();
        console.log("Activities for this lead:");
        activities.forEach(a => console.log(a.type, a.action, a.description, a.createdAt));
    }
    process.exit(0);
};

check();
