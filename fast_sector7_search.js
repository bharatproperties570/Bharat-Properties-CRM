import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const inventories = await db.collection('inventories').find({
        projectName: "Sector 7 Kurukshetra",
        unitNo: "1171"
    }).toArray();

    console.log(`Found ${inventories.length} exact match inventories:`);
    for (const inv of inventories) {
        console.log(`ID: ${inv._id}, project: "${inv.projectName}", block: "${inv.block}", unit: "${inv.unitNo || inv.unitNumber}"`);
        console.log(`  images:`, inv.inventoryImages);
        console.log(`  videos:`, inv.inventoryVideos);
    }
    process.exit(0);
}
inspect();
