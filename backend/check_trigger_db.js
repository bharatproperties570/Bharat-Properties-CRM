import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const trigger = await db.collection('triggers').findOne({ _id: new mongoose.Types.ObjectId('6a815e9a3a5e94539fddb33b') });
    console.log(JSON.stringify(trigger.actions, null, 2));
    process.exit(0);
}
run();
