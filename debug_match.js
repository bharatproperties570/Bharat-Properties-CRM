import 'dotenv/config';
import mongoose from 'mongoose';
import Lead from './backend/models/Lead.js';

async function debugMatch() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // 2. Find Lead
    const lead = await Lead.findOne({ name: { $regex: /mehar singh/i } }).lean();
    if (!lead) {
        console.log("Lead not found!");
        process.exit(1);
    }
    
    console.log("=== LEAD REQUIREMENTS ===");
    console.log("ID:", lead._id.toString());
    console.log("Intent:", lead.requirement);
    console.log("Categories:", lead.propertyType);
    console.log("Sub-Categories:", lead.subType);
    console.log("Size Type (unitType):", lead.unitType);
    console.log("Size Type (sizeType):", lead.sizeType);
    console.log("Budget:", lead.budgetMin, "-", lead.budgetMax);
    console.log("Area:", lead.areaMin, "-", lead.areaMax, lead.areaMetric);
    console.log("Location:", lead.locCity, lead.locArea, lead.sector);
    
    process.exit(0);
}
debugMatch().catch(console.error);
