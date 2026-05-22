import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const contact = await db.collection('contacts').findOne({ _id: new mongoose.Types.ObjectId('69d74ba1c3bed8ca2f6b8bb9') });
    console.log("CONTACT ALL FIELDS:", JSON.stringify(contact, null, 2));
    process.exit(0);
}
inspect();
