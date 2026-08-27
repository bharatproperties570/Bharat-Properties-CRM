import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Activity = mongoose.model('Activity', new mongoose.Schema({}, { strict: false }));
    const acts = await Activity.find({ entityId: '6a86f784dc69abb10bb5c547' }).lean();
    console.log(JSON.stringify(acts, null, 2));
    process.exit(0);
}
run();
