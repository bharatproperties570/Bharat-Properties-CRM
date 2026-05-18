import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crm";

async function run() {
    console.log("Connecting to:", mongoUri);
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB!");

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`Found ${collections.length} collections.`);

    for (const col of collections) {
        const collection = mongoose.connection.db.collection(col.name);
        const results = await collection.find({
            $or: [
                { name: { $regex: /Namaste|Suraj|Properties se|discuss karna/i } },
                { body: { $regex: /Namaste|Suraj|Properties se|discuss karna/i } },
                { content: { $regex: /Namaste|Suraj|Properties se|discuss karna/i } },
                { systemPrompt: { $regex: /Namaste|Suraj|Properties se|discuss karna/i } },
                { lookup_value: { $regex: /Namaste|Suraj|Properties se|discuss karna/i } },
                { subject: { $regex: /Namaste|Suraj|Properties se|discuss karna/i } },
                { message: { $regex: /Namaste|Suraj|Properties se|discuss karna/i } },
                { value: { $regex: /Namaste|Suraj|Properties se|discuss karna/i } },
                { "value.Lead Created.whatsapp.body": { $regex: /Namaste|Suraj|Properties se|discuss karna/i } }
            ]
        }).toArray();

        if (results.length > 0) {
            console.log(`\n--- Matches in collection: ${col.name} ---`);
            console.log(JSON.stringify(results, null, 2));
        }
    }

    await mongoose.disconnect();
    console.log("Disconnected.");
}

run().catch(console.error);
