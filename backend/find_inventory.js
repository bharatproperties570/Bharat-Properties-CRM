
import mongoose from 'mongoose';
import Inventory from './models/Inventory.js';
import Project from './models/Project.js';

const mongoUri = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

async function checkInventory() {
    try {
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");

        const totalInv = await Inventory.countDocuments({});
        console.log(`Total Inventory Records: ${totalInv}`);

        console.log("🔍 Fetching latest 50 inventory records globally...");
        const allInv = await Inventory.find({}).sort({ createdAt: -1 }).limit(50);

        console.log("Recent Records:");
        allInv.forEach((inv, i) => {
            console.log(`${i + 1}. ID: ${inv._id}, Unit: ${inv.unitNo}, Project: ${inv.projectName}, Block: ${inv.propertyDetails?.block}, SubBlock: ${inv.propertyDetails?.subBlock}, Status: ${inv.status}, Created: ${inv.createdAt}`);
        });

        console.log("🔍 Project Check:");
        const projects = await Project.find({}).limit(20);
        projects.forEach(p => console.log(`- Project: ${p.name}, ID: ${p._id}`));

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
    }
}

checkInventory();
