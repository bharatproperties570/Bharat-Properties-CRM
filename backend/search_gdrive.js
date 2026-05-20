import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const deals = await mongoose.connection.db.collection('deals').find({}).toArray();
    console.log("DEALS WITH GDRIVE:");
    for (const d of deals) {
        const str = JSON.stringify(d);
        if (str.includes("drive.google.com") || str.includes("google.com")) {
            console.log(`Deal ID: ${d._id}, title: ${d.websiteMetadata?.title}`);
        }
    }

    const inventories = await mongoose.connection.db.collection('inventories').find({}).toArray();
    console.log("INVENTORIES WITH GDRIVE:");
    for (const inv of inventories) {
        const str = JSON.stringify(inv);
        if (str.includes("drive.google.com") || str.includes("google.com")) {
            console.log(`Inventory ID: ${inv._id}, project: ${inv.projectName}`);
        }
    }
    process.exit(0);
}
inspect();
