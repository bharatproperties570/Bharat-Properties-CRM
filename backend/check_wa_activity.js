import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const acts = await mongoose.connection.db.collection('activities').find({ type: 'WhatsApp' }).sort({createdAt:-1}).limit(5).toArray();
    console.log(JSON.stringify(acts, null, 2));
    process.exit(0);
}
run();
