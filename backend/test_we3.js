import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Trigger = (await import('./models/Trigger.js')).default;
    const { WorkflowEngine } = await import('./src/utils/WorkflowEngine.js');
    
    const trigger = await Trigger.findById('6a815e9a3a5e94539fddb33b');
    
    // Pick the automated action
    const action = trigger.actions.find(a => a.type === 'fire_automated_action');
    
    console.log('Action type:', action.type);
    console.log('Action automatedActionId:', action.automatedActionId);
    console.log('Condition for execution:', action.type === 'fire_automated_action' && !!action.automatedActionId);
    
    // We will just do what WorkflowEngine does up to enqueue
    const AutomatedAction = (await import('./models/AutomatedAction.js')).default;
    const autoAction = await AutomatedAction.findById(action.automatedActionId);
    console.log('Auto action name:', autoAction?.name);
    console.log('Auto action delay:', autoAction?.delay);
    
    const entityData = { createdAt: new Date() };
    const relativeDate = new Date(entityData['createdAt']);
    let offsetMs = 10 * 60 * 1000;
    const targetDate = new Date(relativeDate.getTime() + offsetMs);
    const delayMs = targetDate.getTime() - Date.now();
    
    console.log('Delay Ms:', delayMs);
    console.log('Will enqueue?', delayMs > 0);
    
    process.exit(0);
}
run();
