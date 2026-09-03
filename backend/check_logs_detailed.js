import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const lead = await Lead.findOne({ firstName: 'Surya Partap' }).sort({ createdAt: -1 });
    
    const AutomationLog = mongoose.model('AutomationLog', new mongoose.Schema({}, { strict: false }));
    const logs = await AutomationLog.find({ targetEntityId: lead._id }).lean();
    console.log(JSON.stringify(logs, null, 2));
    process.exit(0);
}
run();
