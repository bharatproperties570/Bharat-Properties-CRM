
import mongoose from 'mongoose';

const mongoUri1 = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';
const mongoUri2 = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties';

async function listAllWithCounts(uri, dbName) {
    try {
        const conn = await mongoose.createConnection(uri).asPromise();
        console.log(`\n--- DB: ${dbName} ---`);
        const db = conn.db;
        const collections = await db.listCollections().toArray();
        for (const coll of collections) {
            const count = await db.collection(coll.name).countDocuments();
            if (count > 0) {
                console.log(`- "${coll.name}": ${count}`);
                // If it's a potential inventory collection, show a sample
                if (/inv|unit|prop|block|part|kohinoor/i.test(coll.name)) {
                    const sample = await db.collection(coll.name).findOne({});
                    console.log(`  Sample from ${coll.name}:`, JSON.stringify(sample, null, 2).substring(0, 200) + "...");
                }
            } else if (coll.name.trim() !== coll.name) {
                console.log(`- "${coll.name}" [EMPTY but has spaces]`);
            }
        }
        await conn.close();
    } catch (err) {
        console.error(`❌ Error ${dbName}:`, err.message);
    }
}

async function run() {
    await listAllWithCounts(mongoUri1, 'bharatproperties1');
    await listAllWithCounts(mongoUri2, 'bharatproperties');
}

run();
