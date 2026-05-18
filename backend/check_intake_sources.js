import mongoose from "mongoose";
import dotenv from "dotenv";
import AutomatedIntakeSource from "./models/AutomatedIntakeSource.js";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crm";

async function run() {
    await mongoose.connect(mongoUri);
    console.log("Connected to DB!");

    const sources = await AutomatedIntakeSource.find({}).lean();
    console.log(`Found ${sources.length} automated intake sources:`);
    for (const src of sources) {
        console.log(`\nSource ID: ${src._id}`);
        console.log(`  Source Name: ${src.source}`);
        console.log(`  URL: ${src.url}`);
        console.log(`  Frequency: ${src.frequency}`);
        console.log(`  Cron: ${src.schedule_cron}`);
        console.log(`  Active: ${src.is_active}`);
        console.log(`  Last Run At: ${src.last_run_at}`);
        console.log(`  Last Status: ${src.last_run_status}`);
        console.log(`  Deactivation Reason: ${src.deactivation_reason}`);
    }

    await mongoose.disconnect();
}

run().catch(console.error);
