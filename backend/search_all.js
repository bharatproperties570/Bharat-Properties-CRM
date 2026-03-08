
import mongoose from 'mongoose';

const mongoUri = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

async function searchAll() {
    try {
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const searchTerm = "Sector 32";

        for (const coll of collections) {
            const collection = db.collection(coll.name);
            // Search in all fields is hard, let's try a few common ones or just find any document
            // A simple way is to use $text if indexes exist, but they might not.
            // Let's just try to find documents where ANY field contains the term (limited search)

            // We'll check common fields like projectName, project, name, address, block
            const query = {
                $or: [
                    { projectName: new RegExp(searchTerm, 'i') },
                    { project: new RegExp(searchTerm, 'i') },
                    { name: new RegExp(searchTerm, 'i') },
                    { "address.area": new RegExp(searchTerm, 'i') },
                    { "propertyDetails.block": new RegExp(searchTerm, 'i') },
                    { unitNo: new RegExp(searchTerm, 'i') }
                ]
            };

            const count = await collection.countDocuments(query);
            if (count > 0) {
                console.log(`🎯 Found ${count} matches in collection: ${coll.name}`);
                const sample = await collection.find(query).limit(1).toArray();
                console.log(`Sample:`, JSON.stringify(sample[0], null, 2));
            }
        }

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
    }
}

searchAll();
