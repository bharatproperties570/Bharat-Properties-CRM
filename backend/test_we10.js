import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = (await import('./models/Lead.js')).default;
    const { WorkflowEngine } = await import('./src/utils/WorkflowEngine.js');
    
    // Find the real lead
    const lead = await Lead.findById('6a87c9f6671adb2439392697').populate('status').lean();
    if (!lead) return console.log('Lead not found');
    console.log('Lead Status:', lead.status);
    
    const originalLog = console.log;
    console.log = (...args) => {
        originalLog('[Intercepted]', ...args);
    };
    
    await WorkflowEngine.fireEvent('leads', 'lead_created', lead, lead.companyId);
    
    console.log = originalLog;
    console.log('Done firing event.');
    process.exit(0);
}
run();
