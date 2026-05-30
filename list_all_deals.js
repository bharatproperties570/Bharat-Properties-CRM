import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const deals = await db.collection('deals').find({}).toArray();
    for (const d of deals) {
        console.log(`DEAL ID: ${d._id}`, {
            slug: d.websiteMetadata?.slug,
            title: d.websiteMetadata?.title,
            projectName: d.projectName,
            unitNo: d.unitNo
        });
    }

    process.exit(0);
}
inspect();
