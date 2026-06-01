import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const ids = ['69a96e243a56674b285e0100', '69d5f061f6f81d802814426c', '699beeb0ee5159cfdb8f3ed2'];
        
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        
        for (const col of collections) {
            const colName = col.name;
            for (const id of ids) {
                try {
                    const doc = await db.collection(colName).findOne({ _id: new mongoose.Types.ObjectId(id) });
                    if (doc) {
                        console.log(`Found ID ${id} in collection ${colName}:`, JSON.stringify(doc, null, 2));
                    }
                } catch (e) {
                    // Ignore invalid id format error if any
                }
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
