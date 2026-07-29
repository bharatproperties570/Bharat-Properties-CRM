import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function runQuery() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        
        // Check if At Risk already exists
        const existing = await db.collection('lookups').findOne({ lookup_type: 'Status', lookup_value: 'At Risk' });
        
        if (!existing) {
            const result = await db.collection('lookups').insertOne({
                lookup_type: 'Status',
                lookup_value: 'At Risk',
                isActive: true,
                order: 98,
                metadata: { color: '#dc2626' },
                createdAt: new Date(),
                updatedAt: new Date(),
                __v: 0
            });
            console.log(`Inserted 'At Risk' status with ID: ${result.insertedId}`);
        } else {
            console.log("'At Risk' status already exists.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
runQuery();
