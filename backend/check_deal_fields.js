import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));
        const Deal = mongoose.model('Deal', new mongoose.Schema({}, { strict: false }));
        
        const invs = await Inventory.find({}).limit(3).lean();
        console.log("=== INVENTORIES ===");
        invs.forEach(inv => {
            console.log("Inv ID:", inv._id);
            console.log("  unitType:", inv.unitType, typeof inv.unitType);
            console.log("  subCategory:", inv.subCategory, typeof inv.subCategory);
            console.log("  builtupType:", inv.builtupType, typeof inv.builtupType);
            console.log("  roadWidth:", inv.roadWidth, typeof inv.roadWidth);
        });

        const deals = await Deal.find({}).limit(3).lean();
        console.log("=== DEALS ===");
        deals.forEach(deal => {
            console.log("Deal ID:", deal._id);
            console.log("  unitType:", deal.unitType, typeof deal.unitType);
            console.log("  subCategory:", deal.subCategory, typeof deal.subCategory);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
