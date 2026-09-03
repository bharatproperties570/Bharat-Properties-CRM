import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const leads = await Lead.find({}).sort({createdAt: -1}).limit(2).lean();
    console.log(JSON.stringify(leads, null, 2));
    process.exit(0);
}
run();
