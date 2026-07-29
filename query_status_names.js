import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function runQuery() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const lookups = await db.collection('lookups').find({ lookup_type: 'Status' }).toArray();
        console.log("Current Statuses:", lookups.map(l => l.lookup_value).filter(val => !val.match(/^[0-9a-fA-F]{24}$/)).join(", "));
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
runQuery();
