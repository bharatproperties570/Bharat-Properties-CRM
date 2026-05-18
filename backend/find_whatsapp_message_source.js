import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crm";

async function run() {
    console.log("Connecting to:", mongoUri);
    await mongoose.connect(mongoUri);
    console.log("Connected to DB!");

    const collections = await mongoose.connection.db.listCollections().toArray();
    
    // Ignore transactional/log/large user collections to isolate templates/rules
    const ignoredCollections = ['activities', 'leads', 'contacts', 'inventories', 'users', 'deals', 'auditlogs'];

    for (const col of collections) {
        if (ignoredCollections.includes(col.name)) continue;

        const collection = mongoose.connection.db.collection(col.name);
        const docs = await collection.find({}).toArray();

        for (const doc of docs) {
            const strDoc = JSON.stringify(doc);
            if (
                strDoc.includes("discuss") || 
                strDoc.includes("buy ya sell") || 
                strDoc.includes("Namaste") || 
                strDoc.includes("Properties se") ||
                strDoc.includes("karna chahte ho")
            ) {
                console.log(`\n=========================================`);
                console.log(`MATCH FOUND in Collection: ${col.name}`);
                console.log(`Document ID: ${doc._id}`);
                console.log(JSON.stringify(doc, null, 2));
            }
        }
    }

    await mongoose.disconnect();
    console.log("Done.");
}

run().catch(console.error);
