import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Trigger = mongoose.model('Trigger', new mongoose.Schema({}, { strict: false, collection: 'automation_rules' }));
    const triggers = await Trigger.find({}).lean();
    console.log(JSON.stringify(triggers, null, 2));
    process.exit(0);
}
run();
