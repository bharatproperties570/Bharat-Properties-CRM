import 'dotenv/config';
import mongoose from 'mongoose';
import Lead from './models/Lead.js';
import Deal from './models/Deal.js';
import Lookup from './models/Lookup.js';

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
    
    const resolveLookup = async (id) => {
        if (!id) return null;
        const lookup = await Lookup.findById(id).lean();
        return lookup ? lookup.lookup_value : id;
    }
    
    console.log("Categories:", await Promise.all((lead.propertyType || []).map(resolveLookup)));
    console.log("Sub-Categories:", await Promise.all((lead.subType || []).map(resolveLookup)));
    console.log("Size Type (unitType):", await Promise.all((lead.unitType || []).map(resolveLookup)));
    console.log("Size Type (sizeType):", await Promise.all((lead.sizeType || []).map(resolveLookup)));
    console.log("Budget:", lead.budgetMin, "-", lead.budgetMax);
    console.log("Area:", lead.areaMin, "-", lead.areaMax, lead.areaMetric);
    console.log("Location:", lead.locCity, lead.locArea, lead.sector);
    
    process.exit(0);
}
debugMatch().catch(console.error);
