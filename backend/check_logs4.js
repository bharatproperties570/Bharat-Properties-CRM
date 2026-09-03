import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const AutomationLog = mongoose.model('AutomationLog', new mongoose.Schema({}, { strict: false }));
    const logs = await AutomationLog.find({ targetEntityId: new mongoose.Types.ObjectId('6a87ac053a327c63243ad29f') }).lean();
    console.log(logs.map(l => ({ ruleType: l.ruleType, ruleId: l.ruleId })));
    process.exit(0);
}
run();
