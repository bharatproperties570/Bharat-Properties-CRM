import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const sizeTypes = await mongoose.connection.db.collection('lookups').find({ lookup_type: 'PropertyType' }).toArray();
    console.log('Total PropertyType lookups:', sizeTypes.length);
    console.log(sizeTypes.map(s => s.lookup_value));
    process.exit(0);
}
run();
