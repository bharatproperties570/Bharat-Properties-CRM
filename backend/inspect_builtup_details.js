import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const deal = await db.collection('deals').findOne({ _id: new mongoose.Types.ObjectId('6a159dfc1ca821d843364cce') });
    console.log("DEAL ID: 6a159dfc1ca821d843364cce");
    console.log("builtupDetails:", JSON.stringify(deal.builtupDetails, null, 2));
    
    if (deal.inventoryId) {
        const inv = await db.collection('inventories').findOne({ _id: deal.inventoryId });
        console.log("Inventory builtupDetails:", JSON.stringify(inv?.builtupDetails, null, 2));
    }
    process.exit(0);
}
inspect();
