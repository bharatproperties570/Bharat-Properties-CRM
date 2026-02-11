import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const db = mongoose.connection.db;
        const collection = db.collection('lookups');

        const docs = await collection.find({}).limit(20).toArray();
        console.log('Raw docs:', JSON.stringify(docs, null, 2));

        const keys = new Set();
        docs.forEach(doc => Object.keys(doc).forEach(k => keys.add(k)));
        console.log('All keys present in first 20 docs:', Array.from(keys));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

test();
