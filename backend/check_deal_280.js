import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deal from './models/Deal.js';
import Lookup from './models/Lookup.js';

dotenv.config(); // Loads .env from backend/

async function checkDeal() {
    try {
        const uri = process.env.MONGODB_URI;
        await mongoose.connect(uri);
        console.log("Connected to MongoDB");

        // Find deals matching unitNo "280"
        const deals = await Deal.find({ unitNo: "280" }).lean();
        console.log(`Found ${deals.length} deals matching unitNo "280"`);

        for (const deal of deals) {
            console.log("\n==================================================");
            console.log(`Deal ID: ${deal._id} | Project: ${deal.projectName} | Unit: ${deal.unitNo} | Location: ${deal.location}`);
            console.log("Category Raw:", deal.category, typeof deal.category);
            console.log("SubCategory Raw:", deal.subCategory, typeof deal.subCategory);

            // Resolve Category Lookup
            if (deal.category) {
                const catLookup = await Lookup.findById(deal.category).lean();
                console.log("Category Lookup Resolved:", catLookup);
            } else {
                console.log("Category is empty or undefined");
            }

            // Resolve SubCategory Lookup
            if (deal.subCategory) {
                const subLookup = await Lookup.findById(deal.subCategory).lean();
                console.log("SubCategory Lookup Resolved:", subLookup);
            } else {
                console.log("SubCategory is empty or undefined");
            }
            console.log("==================================================");
        }

        process.exit();
    } catch (err) {
        console.error("Error checking deal:", err);
        process.exit(1);
    }
}

checkDeal();
