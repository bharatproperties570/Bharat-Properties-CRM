import mongoose from "mongoose";
import "dotenv/config";
import Inventory from "../models/Inventory.js";
import Lookup from "../models/Lookup.js";

async function normalizeInventoryStatus() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Database connected.");

        // Find all Inventory documents
        const inventories = await Inventory.find({}).select("status").lean();
        console.log(`Checking ${inventories.length} inventory documents...`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const item of inventories) {
            if (typeof item.status === "string" && mongoose.Types.ObjectId.isValid(item.status)) {
                // It is a string matching an ObjectId pattern. Update it to a real ObjectId.
                await Inventory.updateOne(
                    { _id: item._id },
                    { $set: { status: new mongoose.Types.ObjectId(item.status) } }
                );
                updatedCount++;
            } else {
                skippedCount++;
            }
        }

        console.log(`Normalization complete!`);
        console.log(`Updated: ${updatedCount} records`);
        console.log(`Skipped: ${skippedCount} records`);

        process.exit(0);
    } catch (error) {
        console.error("Error during normalization:", error);
        process.exit(1);
    }
}

normalizeInventoryStatus();
