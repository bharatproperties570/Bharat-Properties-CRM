import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.connection.db.collection('lookups');
    const l = await Lookup.findOne({_id: new mongoose.Types.ObjectId('69916f09de4b290e4bde4eba')});
    console.log('Anukant Req:', l);
    process.exit(0);
}
run();
