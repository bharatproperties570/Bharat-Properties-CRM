import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './backend/models/Inventory.js';
import Deal from './backend/models/Deal.js';

dotenv.config();

async function diagnose() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const inventoryCount = await Inventory.countDocuments();
        console.log("Total Inventory Items:", inventoryCount);
        if (inventoryCount > 0) {
            const sampleInventory = await Inventory.findOne().lean();
            console.log("Sample Inventory:", JSON.stringify(sampleInventory, null, 2));
        }

        const dealCount = await Deal.countDocuments();
        console.log("Total Deals:", dealCount);
        if (dealCount > 0) {
            const sampleDeal = await Deal.findOne().lean();
            console.log("Sample Deal:", JSON.stringify(sampleDeal, null, 2));
        }

        process.exit();
    } catch (error) {
        console.error("Diagnosis failed:", error);
        process.exit(1);
    }
}

diagnose();
