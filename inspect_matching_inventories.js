import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const ids = [new mongoose.Types.ObjectId('69b6e9826d0569c4a4a36c64'), new mongoose.Types.ObjectId('69b6e9826d0569c4a4a36c65')];
    const inventories = await db.collection('inventories').find({ _id: { $in: ids } }).toArray();
    for (const inv of inventories) {
        console.log(`Inventory ID: ${inv._id}:`, {
            projectName: inv.projectName,
            block: inv.block,
            unitNo: inv.unitNo,
            unitNumber: inv.unitNumber,
            images: inv.inventoryImages
        });
    }

    process.exit(0);
}
inspect();
