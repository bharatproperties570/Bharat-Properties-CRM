import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const inventories = await db.collection('inventories').find({
        $or: [
            { projectName: /Sector 7/i },
            { unitNo: "1171" },
            { unitNumber: "1171" }
        ]
    }).toArray();

    console.log(`Found ${inventories.length} inventories for Sector 7 or Unit 1171:`);
    for (const inv of inventories) {
        console.log(`ID: ${inv._id}, project: "${inv.projectName}", block: "${inv.block}", unit: "${inv.unitNo || inv.unitNumber}"`);
        const str = JSON.stringify(inv);
        if (str.includes("drive.google.com") || str.includes("google.com")) {
            console.log(`  -> HAS GOOGLE DRIVE LINK!`);
            console.log(`  images:`, inv.inventoryImages);
        }
    }
    process.exit(0);
}
inspect();
