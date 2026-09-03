import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = (await import('./models/Lead.js')).default;
    const Trigger = (await import('./models/Trigger.js')).default;
    const { enqueueAction } = await import('./services/automationQueue/automationQueue.js');
    
    const lead = await Lead.findById('6a87ac053a327c63243ad29f').lean();
    if (!lead) return console.log('Lead not found!');
    
    const trigger = await Trigger.findById('6a815e9a3a5e94539fddb33b').lean();
    if (!trigger) return console.log('Trigger not found!');
    
    const action = trigger.actions.find(a => a.type === 'fire_automated_action');
    if (!action) return console.log('Action not found!');
    
    console.log('Enqueueing immediately...');
    // We enqueue with 1000ms delay so it runs almost immediately
    const result = await enqueueAction({ action, entityData: lead, trigger, companyId: trigger.companyId }, 1000);
    console.log('Result:', result);
    process.exit(0);
}
run();
