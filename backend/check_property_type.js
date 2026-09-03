import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const sizeTypes = await mongoose.connection.db.collection('lookups').find({ lookup_type: 'PropertyType' }).limit(5).toArray();
    console.log(JSON.stringify(sizeTypes, null, 2));
    process.exit(0);
}
run();
