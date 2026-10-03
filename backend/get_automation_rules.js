import mongoose from "mongoose";
import dotenv from "dotenv";
import SystemSetting from "./src/modules/systemSettings/system.model.js";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || (() => { throw new Error('CRITICAL: MONGODB_URI environment variable is required. Hardcoded fallbacks removed.') })();

async function run() {
    await mongoose.connect(mongoUri);
    console.log("Connected to DB!");

    const rules = await SystemSetting.findOne({ key: 'unified_automation_rules' }).lean();
    console.log("Unified Automation Rules:\n", JSON.stringify(rules, null, 2));

    await mongoose.disconnect();
}

run().catch(console.error);
