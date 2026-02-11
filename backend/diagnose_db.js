import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';
import Deal from './models/Deal.js';
import Contact from './models/Contact.js';

dotenv.config();

async function diagnose() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const inv = await Inventory.findOne().lean();
        console.log("FULL INVENTORY:", JSON.stringify(inv, null, 2));

        const deal = await Deal.findOne().lean();
        console.log("FULL DEAL:", JSON.stringify(deal, null, 2));

        const contact = await Contact.findOne().lean();
        console.log("SAMPLE CONTACT:", JSON.stringify(contact, null, 2));

        process.exit();
    } catch (error) {
        console.error("Diagnosis failed:", error);
        process.exit(1);
    }
}

diagnose();
