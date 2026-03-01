import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './backend/.env' });

async function debug() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));

        const sample = await Inventory.findOne({ unitNo: "123" }).lean();
        if (!sample) {
            console.log("No inventory item found with unitNo 123");
            const any = await Inventory.findOne().lean();
            console.log("Sample ID from any item:", any?._id);
            process.exit();
        }

        console.log("--- Sample Inventory Item ---");
        console.log("ID:", sample._id);
        console.log("Unit:", sample.unitNo || sample.unitNumber);
        console.log("Category ID:", sample.category);
        console.log("SubCategory ID:", sample.subCategory);
        console.log("UnitType ID:", sample.unitType);
        console.log("Status ID:", sample.status);

        const checkLookup = async (id, fieldName) => {
            if (!id) {
                console.log(`${fieldName}: No ID present`);
                return;
            }
            const lookup = await Lookup.findById(id).lean();
            if (lookup) {
                console.log(`${fieldName} Found:`, lookup.lookup_value, `(Type: ${lookup.lookup_type})`);
            } else {
                console.log(`${fieldName} NOT FOUND in Lookups for ID:`, id);
            }
        };

        await checkLookup(sample.category, "Category");
        await checkLookup(sample.subCategory, "SubCategory");
        await checkLookup(sample.unitType, "UnitType");
        await checkLookup(sample.status, "Status");

        process.exit();
    } catch (error) {
        console.error("Debug failed:", error);
        process.exit(1);
    }
}

debug();
