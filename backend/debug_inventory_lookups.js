import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';


dotenv.config();

async function debug() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        // Use findOne to get a representative item
        const sample = await Inventory.findOne({
            $or: [
                { unitNo: "123" },
                { unitNumber: "123" },
                { unitNo: "101" },
                { unitNumber: "101" }
            ]
        }).lean();

        if (!sample) {
            console.log("No inventory item found with unit 123 or 101");
            const any = await Inventory.findOne().lean();
            if (any) {
                console.log("Sample ID from any item:", any._id, "Unit:", any.unitNo || any.unitNumber);
                await inspect(any);
            }
            process.exit();
        }

        await inspect(sample);
        process.exit();
    } catch (error) {
        console.error("Debug failed:", error);
        process.exit(1);
    }
}

async function inspect(sample) {
    console.log("--- Sample Inventory Item ---");
    console.log("ID:", sample._id);
    console.log("Unit:", sample.unitNo || sample.unitNumber);

    const fields = ['category', 'subCategory', 'unitType', 'status'];

    for (const field of fields) {
        const value = sample[field];
        console.log(`\nField: ${field}`);
        console.log(`Value in DB:`, value);
        console.log(`Type in DB:`, typeof value);

        if (value && mongoose.Types.ObjectId.isValid(value)) {
            const lookup = await mongoose.model('Lookup').findById(value).lean();
            if (lookup) {
                console.log(`Lookup Found: "${lookup.lookup_value}" (Type: ${lookup.lookup_type})`);
            } else {
                console.log(`Lookup NOT FOUND in DB for ID: ${value}`);
            }
        } else if (value) {
            console.log(`Value is NOT a valid ObjectId string/object`);
        } else {
            console.log(`Field is empty`);
        }
    }
}

debug();
