import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const tr = await mongoose.connection.db.collection('triggers').find({}).sort({createdAt: -1}).limit(2).toArray();
    console.log(JSON.stringify(tr, null, 2));
    process.exit(0);
}
run();
