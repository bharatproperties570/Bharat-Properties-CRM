import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const deal = await mongoose.connection.db.collection('deals').findOne({ _id: new mongoose.Types.ObjectId('6a0ad751ee8126a476a15553') });
    console.log("DEAL IMAGES & DOCUMENTS:", {
        images: deal.images,
        documents: deal.documents,
        websiteMetadata: deal.websiteMetadata
    });
    process.exit(0);
}
inspect();
