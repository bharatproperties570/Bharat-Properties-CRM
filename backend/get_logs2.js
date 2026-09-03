import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const AutomationLog = mongoose.model('AutomationLog', new mongoose.Schema({}, { strict: false }));
    const logs = await AutomationLog.find({ targetEntityId: '6a8703203a327c63243a44c9' }).lean();
    console.log(JSON.stringify(logs, null, 2));
    process.exit(0);
}
run();
