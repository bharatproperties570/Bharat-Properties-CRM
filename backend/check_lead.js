import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const lead = await Lead.findById('6a87ac053a327c63243ad29f').lean();
    console.log('Lead createdAt:', lead.createdAt);
    console.log('Is Date?', lead.createdAt instanceof Date);
    process.exit(0);
}
run();
