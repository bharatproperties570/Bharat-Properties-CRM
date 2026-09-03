import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const { WorkflowEngine } = await import('./src/utils/WorkflowEngine.js');
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const Trigger = mongoose.model('Trigger', new mongoose.Schema({}, { strict: false }));
    
    const entityData = await Lead.findById('6a8703203a327c63243a44c9').lean();
    const trigger = await Trigger.findById('6a815e9a3a5e94539fddb33b').lean();
    
    const action = trigger.actions.find(a => a.type === 'fire_automated_action');
    
    console.log('Action found:', action);
    console.log('Simulating executeAction...');
    
    await WorkflowEngine.executeAction(action, entityData, trigger, entityData.companyId);
    
    console.log('Done!');
    process.exit(0);
}
run();
