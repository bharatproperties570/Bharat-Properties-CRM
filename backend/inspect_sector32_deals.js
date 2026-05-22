import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const ids = [new mongoose.Types.ObjectId('69b6e9826d0569c4a4a36c64'), new mongoose.Types.ObjectId('69b6e9826d0569c4a4a36c65')];
    const deals = await db.collection('deals').find({ inventoryId: { $in: ids } }).toArray();
    console.log(`Found ${deals.length} deals linked to Google Drive inventories:`);
    for (const d of deals) {
        console.log(`DEAL ID: ${d._id}, slug: ${d.websiteMetadata?.slug}, title: ${d.websiteMetadata?.title}`);
    }
    process.exit(0);
}
inspect();
