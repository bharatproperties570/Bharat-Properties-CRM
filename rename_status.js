import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function runQuery() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const result = await db.collection('lookups').updateMany(
            { lookup_type: 'Status', lookup_value: 'New' },
            { $set: { lookup_value: 'Incoming' } }
        );
        console.log(`Updated ${result.modifiedCount} lookups from 'New' to 'Incoming'`);
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
runQuery();
