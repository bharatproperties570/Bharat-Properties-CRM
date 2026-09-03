import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Trigger = (await import('./models/Trigger.js')).default;
    const activeTriggers = await Trigger.find({
        module: 'leads',
        event: 'lead_created',
        isActive: true
    }).sort({ priority: 1 });
    
    for (const t of activeTriggers) {
        if (t._id.toString() === '6a815e9a3a5e94539fddb33b') {
            console.log('Trigger ID:', t._id);
            for (const a of t.actions) {
                console.log('Action type:', a.type);
                console.log('Action automatedActionId:', a.automatedActionId);
                console.log('Is valid?', a.type === 'fire_automated_action' && !!a.automatedActionId);
            }
        }
    }
    process.exit(0);
}
run();
