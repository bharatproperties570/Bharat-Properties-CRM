import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Trigger = mongoose.model('Trigger', new mongoose.Schema({}, { strict: false }));
    const trigger = await Trigger.findById('6a815e9a3a5e94539fddb33b').lean();
    console.log('Event:', trigger.event);
    process.exit(0);
}
run();
