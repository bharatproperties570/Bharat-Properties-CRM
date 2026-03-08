
import mongoose from 'mongoose';
import Inventory from './models/Inventory.js';
import Lookup from './models/Lookup.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        // Find the last 5 inventory items
        const results = await Inventory.find().sort({ createdAt: -1 }).limit(5).lean();

        for (const item of results) {
            console.log(`\n--- Inventory: ${item.unitNo} ---`);
            console.log(`SubCategory ID: ${item.subCategory}`);
            console.log(`UnitType ID: ${item.unitType}`);
            console.log(`SizeConfig ID: ${item.sizeConfig}`);
            console.log(`Width: ${item.width}, Length: ${item.length}`);

            if (item.subCategory) {
                const subCat = await Lookup.findById(item.subCategory);
                console.log(`SubCategory Value: ${subCat?.lookup_value} (Type: ${subCat?.lookup_type})`);
            }
            if (item.unitType) {
                const ut = await Lookup.findById(item.unitType);
                console.log(`UnitType Value: ${ut?.lookup_value} (Type: ${ut?.lookup_type})`);
            }
            if (item.sizeConfig) {
                const sc = await Lookup.findById(item.sizeConfig);
                console.log(`SizeConfig Value: ${sc?.lookup_value} (Type: ${sc?.lookup_type})`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugData();
