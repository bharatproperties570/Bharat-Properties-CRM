import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = (await import('./models/Lead.js')).default;
    const { WorkflowEngine } = await import('./src/utils/WorkflowEngine.js');
    
    const lead = await Lead.findById('6a87ac053a327c63243ad29f');
    console.log('Firing lead_created for', lead.name);
    
    // Override console.log to see EVERYTHING
    const originalLog = console.log;
    console.log = (...args) => {
        originalLog('[Intercepted]', ...args);
    };
    
    await WorkflowEngine.fireEvent('leads', 'lead_created', lead, lead.companyId);
    
    console.log = originalLog;
    console.log('Done!');
    process.exit(0);
}
run();
