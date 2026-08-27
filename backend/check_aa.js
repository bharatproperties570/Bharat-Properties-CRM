import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const aa = await mongoose.connection.collection('automatedactions').findOne({ _id: new mongoose.Types.ObjectId('6a86da1edfe02deaf054138e') });
    console.log(JSON.stringify(aa, null, 2));
    process.exit(0);
}
run();
