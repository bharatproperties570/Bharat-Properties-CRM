import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const triggers = await mongoose.connection.collection('automation_rules').find({}).toArray();
    console.log(JSON.stringify(triggers, null, 2));
    process.exit(0);
}
run();
