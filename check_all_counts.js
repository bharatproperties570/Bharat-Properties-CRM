import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env from backend/.env
dotenv.config({ path: './backend/.env' });

const uri = process.env.MONGODB_URI || "mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1";

async function checkCounts() {
    try {
        await mongoose.connect(uri);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        console.log("\n--- Collection Counts ---");
        for (const col of collections) {
            const count = await db.collection(col.name).countDocuments();
            console.log(`${col.name.padEnd(20)}: ${count}`);
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

checkCounts();
