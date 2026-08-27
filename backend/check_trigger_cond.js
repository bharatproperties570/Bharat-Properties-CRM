import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Trigger = (await import('./models/Trigger.js')).default;
    const trigger = await Trigger.findById('6a815e9a3a5e94539fddb33b').lean();
    console.log(JSON.stringify(trigger.conditions, null, 2));
    process.exit(0);
}
run();
