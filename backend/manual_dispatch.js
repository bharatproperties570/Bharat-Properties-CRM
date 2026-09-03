import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const { WorkflowEngine } = await import('./src/utils/WorkflowEngine.js');
    const Lead = mongoose.models.Lead || mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const Trigger = mongoose.models.Lead || mongoose.model('Trigger', new mongoose.Schema({}, { strict: false }));
    
    const entityData = await Lead.findById('6a870e983a327c63243a94b1').lean();
    const trigger = await Trigger.findById('6a815e9a3a5e94539fddb33b').lean();
    
    const action = trigger.actions.find(a => a.type === 'fire_automated_action');
    
    console.log('Manually simulating delayed worker for lead 6a870e983a327c63243a94b1...');
    // Pass isDelayedExecution = true so it executes immediately without re-enqueuing
    await WorkflowEngine.executeAction(action, entityData, trigger, entityData.companyId, true);
    
    console.log('Dispatch successfully sent to marketingQueue!');
    process.exit(0);
}
run();
