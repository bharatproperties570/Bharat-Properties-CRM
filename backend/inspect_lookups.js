import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const deal = await mongoose.connection.db.collection('deals').findOne({ _id: new mongoose.Types.ObjectId('6a0ad751ee8126a476a15553') });
    console.log("DEAL:", {
        _id: deal._id,
        category: deal.category,
        subCategory: deal.subCategory,
        inventoryId: deal.inventoryId
    });

    const inventory = await mongoose.connection.db.collection('inventories').findOne({ _id: new mongoose.Types.ObjectId('6a07046d742d2975995fa6d1') });
    console.log("INVENTORY:", {
        _id: inventory._id,
        category: inventory.category,
        subCategory: inventory.subCategory
    });

    const lookups = await mongoose.connection.db.collection('lookups').find({
        _id: { $in: [deal.category, deal.subCategory, inventory.category, inventory.subCategory].filter(Boolean) }
    }).toArray();
    console.log("LOOKUPS:", lookups);

    process.exit(0);
}
inspect();
