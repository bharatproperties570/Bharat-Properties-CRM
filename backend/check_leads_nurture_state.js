import mongoose from "mongoose";
import dotenv from "dotenv";
import Lead from "./models/Lead.js";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crm";

async function run() {
    await mongoose.connect(mongoUri);
    console.log("Connected to DB!");

    const activeLeads = await Lead.find({
        'customFields.nurtureState': { $exists: true }
    })
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();

    console.log(`Found ${activeLeads.length} leads in nurture flow:`);
    for (const lead of activeLeads) {
        console.log(`\nLead: ${lead.firstName} ${lead.lastName || ''} (${lead.mobile})`);
        console.log(`  State: ${lead.customFields.nurtureState}`);
        console.log(`  Started At: ${lead.customFields.nurtureStartedAt}`);
        console.log(`  Last Advanced At: ${lead.customFields.nurtureLastAdvancedAt}`);
        console.log(`  Created At: ${lead.createdAt}`);
        console.log(`  Updated At: ${lead.updatedAt}`);
    }

    await mongoose.disconnect();
}

run().catch(console.error);
