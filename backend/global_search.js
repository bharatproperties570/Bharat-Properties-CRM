import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function globalSearch() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        for (const colInfo of collections) {
            const name = colInfo.name;
            const coll = db.collection(name);
            const docs = await coll.find({}).toArray();

            for (const doc of docs) {
                const str = JSON.stringify(doc);
                if (str.includes("relationship") && str.includes("Brother")) {
                    console.log(`FOUND IN COLLECTION: ${name}, DOC ID: ${doc._id}`);
                    console.log("FULL DOC:", JSON.stringify(doc, null, 2));
                }
            }
        }

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

globalSearch();
