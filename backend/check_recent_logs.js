import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const AutomationLog = mongoose.model('AutomationLog', new mongoose.Schema({}, { strict: false }));
    const logs = await AutomationLog.find({ ruleType: 'AutomatedAction' }).sort({ createdAt: -1 }).limit(5).lean();
    console.log(JSON.stringify(logs, null, 2));
    process.exit(0);
}
run();
