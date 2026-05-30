import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const matches = await db.collection('activities').find({
        $or: [
            { "note": { $regex: /google/i } },
            { "details.note": { $regex: /google/i } }
        ]
    }).toArray();

    console.log(`Found ${matches.length} matching activities:`);
    for (const m of matches) {
        console.log(`ID: ${m._id}, dealId: ${m.dealId}, note: "${m.note}"`);
    }
    process.exit(0);
}
inspect();
