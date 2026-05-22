import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const deals = await db.collection('deals').find({}).toArray();
    for (const d of deals) {
        console.log(`DEAL ID: ${d._id} (${d.websiteMetadata?.slug}):`);
        console.log(`  projectName: "${d.projectName}", unitNo: "${d.unitNo}"`);
        console.log(`  images:`, d.images);
        console.log(`  documents:`, d.documents);
        console.log(`  websiteMetadata.featuredImage:`, d.websiteMetadata?.featuredImage);
        console.log(`  inventoryId:`, d.inventoryId);
    }
    process.exit(0);
}
inspect();
