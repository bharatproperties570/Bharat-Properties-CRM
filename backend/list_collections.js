
import mongoose from 'mongoose';

const mongoUri = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

async function listCollections() {
    try {
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log("Collections in bharatproperties1:");
        collections.forEach(c => console.log(`- ${c.name}`));

        // Also check document counts for likely candidates
        for (const coll of collections) {
            const count = await db.collection(coll.name).countDocuments();
            console.log(`  Count for ${coll.name}: ${count}`);
        }

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
    }
}

listCollections();
