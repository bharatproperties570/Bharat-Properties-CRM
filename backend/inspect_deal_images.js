import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const deals = await db.collection('deals').find({ isPublished: true }).toArray();
    console.log("PUBLISHED DEALS IN DATABASE:");
    for (const d of deals) {
        console.log(`\n========================================`);
        console.log(`DEAL ID: ${d._id}`);
        console.log(`projectName: "${d.projectName}", unitNo: "${d.unitNo}", title: "${d.websiteMetadata?.title}"`);
        console.log(`isPublished: ${d.isPublished}`);
        console.log(`websiteMetadata:`, d.websiteMetadata);
        console.log(`propertyImages:`, d.propertyImages);
        console.log(`imagesDetail:`, d.imagesDetail);
        console.log(`images:`, d.images);
        console.log(`inventoryImages:`, d.inventoryImages);
        if (d.inventoryId) {
            const inv = await db.collection('inventories').findOne({ _id: d.inventoryId });
            if (inv) {
                console.log(`inventoryImages on Inventory:`, inv.inventoryImages);
            }
        }
    }

    process.exit(0);
}
inspect();
