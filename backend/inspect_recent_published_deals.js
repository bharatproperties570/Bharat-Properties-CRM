import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const deals = await db.collection('deals').find({ isPublished: true }).sort({ updatedAt: -1 }).limit(10).toArray();
    console.log("RECENT PUBLISHED DEALS:");
    for (const d of deals) {
        console.log(`\n========================================`);
        console.log(`DEAL ID: ${d._id}`);
        console.log(`projectName: "${d.projectName}", unitNo: "${d.unitNo}", updatedAt: ${d.updatedAt}`);
        console.log(`featuredImage: "${d.websiteMetadata?.featuredImage}"`);
        console.log(`images:`, d.images);
        console.log(`propertyImages:`, d.propertyImages);
        console.log(`imagesDetail:`, d.imagesDetail);
        
        // Find if there is an associated inventory
        if (d.inventoryId) {
            const inv = await db.collection('inventories').findOne({ _id: d.inventoryId });
            if (inv) {
                console.log(`Inventory found. inventoryImages:`, inv.inventoryImages);
            } else {
                console.log(`Inventory not found in DB for ID: ${d.inventoryId}`);
            }
        } else {
            console.log(`No inventoryId linked.`);
        }
    }
    process.exit(0);
}
inspect();
