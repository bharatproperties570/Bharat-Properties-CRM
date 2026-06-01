import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const collection = mongoose.connection.db.collection('lookups');
        const doc = await collection.findOne({ _id: new mongoose.Types.ObjectId('69999d8331d19e8a9538ee1e') });
        console.log('Lookup document for 69999d8331d19e8a9538ee1e:', doc);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
