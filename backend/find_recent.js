
import mongoose from 'mongoose';

const mongoUri1 = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';
const mongoUri2 = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties';

async function checkRecent(uri, dbName) {
    try {
        const conn = await mongoose.createConnection(uri).asPromise();
        console.log(`✅ Connected to ${dbName}`);
        const db = conn.db;
        const collections = await db.listCollections().toArray();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        for (const coll of collections) {
            const count = await db.collection(coll.name).countDocuments({
                createdAt: { $gte: oneHourAgo }
            });
            if (count > 0) {
                console.log(`🎯 [${dbName}] Found ${count} RECENT records in: ${coll.name}`);
                const sample = await db.collection(coll.name).find({ createdAt: { $gte: oneHourAgo } }).limit(1).toArray();
                console.log(`Sample:`, JSON.stringify(sample[0], null, 2));
            }
        }
        await conn.close();
    } catch (err) {
        console.error(`❌ Error ${dbName}:`, err.message);
    }
}

async function run() {
    await checkRecent(mongoUri1, 'bharatproperties1');
    await checkRecent(mongoUri2, 'bharatproperties');
}

run();
