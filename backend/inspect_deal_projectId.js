import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const deals = await db.collection('deals').find({}).toArray();
    console.log("DEALS IN DATABASE:");
    for (const d of deals) {
        console.log(`DEAL ID: ${d._id}, projectName: "${d.projectName}", projectId: ${d.projectId}, inventoryId: ${d.inventoryId}`);
    }

    process.exit(0);
}
inspect();
