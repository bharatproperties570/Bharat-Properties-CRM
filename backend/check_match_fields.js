import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
        
        // Let's find one lead that has matches or some requirements
        const lead = await Lead.findOne({}).lean();
        if (!lead) {
            console.log("No leads found.");
            process.exit(0);
        }
        console.log("Using lead ID:", lead._id);

        // We can simulate the match controller logic
        const Deal = mongoose.model('Deal', new mongoose.Schema({}, { strict: false }));
        // Let's check a deal that has inventoryId populated or is matched
        const dealWithInv = await Deal.findOne({ inventoryId: { $ne: null } }).populate({ path: 'inventoryId', strictPopulate: false }).lean();
        if (dealWithInv) {
            console.log("Found Deal with populated inventoryId:", dealWithInv._id);
            console.log("  Deal keys:", Object.keys(dealWithInv));
            console.log("  Deal unitType:", dealWithInv.unitType, typeof dealWithInv.unitType);
            console.log("  Deal subCategory:", dealWithInv.subCategory, typeof dealWithInv.subCategory);
            
            if (dealWithInv.inventoryId) {
                console.log("  Inventory keys:", Object.keys(dealWithInv.inventoryId));
                console.log("    Inventory unitType:", dealWithInv.inventoryId.unitType, typeof dealWithInv.inventoryId.unitType);
                console.log("    Inventory subCategory:", dealWithInv.inventoryId.subCategory, typeof dealWithInv.inventoryId.subCategory);
                console.log("    Inventory builtupType:", dealWithInv.inventoryId.builtupType, typeof dealWithInv.inventoryId.builtupType);
                console.log("    Inventory roadWidth:", dealWithInv.inventoryId.roadWidth, typeof dealWithInv.inventoryId.roadWidth);
            }
        } else {
            console.log("No populated deals found.");
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
