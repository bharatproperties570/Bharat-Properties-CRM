import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crm";

async function run() {
    await mongoose.connect(mongoUri);
    console.log("Connected to DB!");

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections:");
    console.log(collections.map(c => c.name));

    await mongoose.disconnect();
}

run().catch(console.error);
