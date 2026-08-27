import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Activity = mongoose.model('Activity', new mongoose.Schema({}, { strict: false }));
    const acts = await Activity.find({ entityId: '6a87ac053a327c63243ad29f' }).lean();
    console.log(acts.map(a => a.subject));
    process.exit(0);
}
run();
