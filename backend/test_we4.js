import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Trigger = (await import('./models/Trigger.js')).default;
    const trigger = await Trigger.findById('6a815e9a3a5e94539fddb33b');
    const action = trigger.actions.find(a => a.type === 'fire_automated_action');
    
    console.log('Importing enqueueAction...');
    const { enqueueAction } = await import('./services/automationQueue/automationQueue.js');
    console.log('Enqueueing...');
    
    // Create a mock entityData with a fake ID so we can track it
    const entityData = { _id: new mongoose.Types.ObjectId(), name: 'Test User' };
    
    const result = await enqueueAction({ action, entityData, trigger, companyId: trigger.companyId }, 10000); // 10s delay
    console.log('Enqueue result:', result);
    process.exit(0);
}
run();
