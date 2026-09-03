import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = (await import('./models/Lead.js')).default;
    const lead = await Lead.findById('6a87ac053a327c63243ad29f').lean();
    console.log(lead);
    process.exit(0);
}
run();
