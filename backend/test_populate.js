import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';

import { paginate } from './utils/pagination.js';

dotenv.config();

async function testPopulate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const populateFields = [
            { path: "category" },
            { path: "subCategory" },
            { path: "status" },
            { path: "unitType" } // This field is missing from schema
        ];

        console.log("Testing direct populate on Inventory.findOne()...");
        const item = await Inventory.findOne({
            $or: [{ unitNo: "123" }, { unitNumber: "123" }, { unitNo: "101" }, { unitNumber: "101" }]
        }).populate(populateFields).lean();

        if (item) {
            console.log("Populated Item Results:");
            console.log("Category:", typeof item.category, item.category?.lookup_value || item.category);
            console.log("SubCategory:", typeof item.subCategory, item.subCategory?.lookup_value || item.subCategory);
            console.log("Status:", typeof item.status, item.status?.lookup_value || item.status);
            console.log("UnitType:", typeof item.unitType, item.unitType?.lookup_value || item.unitType);
        } else {
            console.log("No item found to test");
        }

        console.log("\nTesting via paginate utility...");
        const paginated = await paginate(Inventory, {}, 1, 1, {}, populateFields);
        if (paginated.records && paginated.records.length > 0) {
            const first = paginated.records[0];
            console.log("First Paginated Record:");
            console.log("Category:", typeof first.category, first.category?.lookup_value || first.category);
            console.log("SubCategory:", typeof first.subCategory, first.subCategory?.lookup_value || first.subCategory);
            console.log("Status:", typeof first.status, first.status?.lookup_value || first.status);
            console.log("UnitType:", typeof first.unitType, first.unitType?.lookup_value || first.unitType);
        }

        process.exit();
    } catch (error) {
        console.error("Test failed:", error);
        process.exit(1);
    }
}

testPopulate();
