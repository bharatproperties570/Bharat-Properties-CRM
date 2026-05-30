import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    console.log("Checking deals collection...");
    const dealsCount = await db.collection('deals').countDocuments();
    console.log(`Deals count: ${dealsCount}`);
    const deals = await db.collection('deals').find({
        $or: [
            { "images.url": { $regex: /google/i } },
            { "documents.url": { $regex: /google/i } },
            { "inventoryImages.url": { $regex: /google/i } }
        ]
    }).toArray();
    console.log(`Matching deals: ${deals.length}`);

    console.log("Checking inventories collection...");
    const invCount = await db.collection('inventories').countDocuments();
    console.log(`Inventories count: ${invCount}`);
    const inventories = await db.collection('inventories').find({
        $or: [
            { "inventoryImages.url": { $regex: /google/i } },
            { "inventoryVideos.url": { $regex: /google/i } }
        ]
    }).toArray();
    console.log(`Matching inventories: ${inventories.length}`);
    for (const inv of inventories) {
        console.log(`Inventory ID: ${inv._id}, images:`, inv.inventoryImages, `videos:`, inv.inventoryVideos);
    }

    process.exit(0);
}
inspect();
