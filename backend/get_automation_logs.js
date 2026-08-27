import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const AutomationLog = mongoose.model('AutomationLog', new mongoose.Schema({}, { strict: false }));
    const logs = await AutomationLog.find({}).sort({createdAt: -1}).limit(5).lean();
    console.log('--- AutomationLogs ---');
    console.log(JSON.stringify(logs, null, 2));
    
    const Activity = mongoose.model('Activity', new mongoose.Schema({}, { strict: false }));
    const acts = await Activity.find({}).sort({createdAt: -1}).limit(5).lean();
    console.log('--- Activities ---');
    console.log(JSON.stringify(acts, null, 2));
    process.exit(0);
}
run();
