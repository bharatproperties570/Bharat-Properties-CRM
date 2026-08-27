import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = mongoose.connection.collection('leads');
    const lead = await Lead.find({}).sort({createdAt:-1}).limit(1).toArray();
    console.log(JSON.stringify(lead[0], null, 2));
    process.exit(0);
}
run();
