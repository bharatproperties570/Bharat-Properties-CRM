import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const lead = await Lead.findById('6a86e71bdfe02deaf054e05c').lean();
    console.log(JSON.stringify(lead, null, 2));
    process.exit(0);
}
run();
