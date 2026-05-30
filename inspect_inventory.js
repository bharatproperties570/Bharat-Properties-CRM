import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const inventory = await mongoose.connection.db.collection('inventories').findOne({ _id: new mongoose.Types.ObjectId('6a07046d742d2975995fa6d1') });
    console.log("INVENTORY ALL FIELDS:", JSON.stringify(inventory, null, 2));
    process.exit(0);
}
inspect();
