import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = (await import('./models/Lead.js')).default;
    const AutomationLog = mongoose.model('AutomationLog', new mongoose.Schema({}, { strict: false }));
    
    const newLeads = await Lead.find({}).sort({ createdAt: -1 }).limit(3).lean();
    
    if (newLeads.length === 0) {
        console.log('No leads found.');
        process.exit(0);
    }
    
    const targetLead = newLeads[0];
    console.log('Latest Lead ID:', targetLead._id, '| CreatedAt:', targetLead.createdAt, '| Name:', targetLead.firstName, targetLead.lastName);
    
    const logs = await AutomationLog.find({ targetEntityId: targetLead._id }).sort({ createdAt: 1 }).lean();
    console.log('\n--- Automation Logs ---');
    console.log(logs.map(l => ({ type: l.ruleType, status: l.status, time: l.createdAt || l.executedAt, details: l.details })));
    
    process.exit(0);
}
run();
