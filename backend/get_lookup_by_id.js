import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
        const collection = mongoose.connection.db.collection('lookups');
        const doc = await collection.findOne({ _id: new mongoose.Types.ObjectId('69955276a08eee85d64611a3') });
        console.log('Lookup document:', doc);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
