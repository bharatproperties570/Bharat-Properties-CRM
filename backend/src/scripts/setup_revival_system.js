import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import SystemSetting from "../../src/modules/systemSettings/system.model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function setupRevivalSystem() {
    try {
        console.log("🚀 Initializing Lead Revival System Configuration...");
        const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/bharatproperties1";
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");

        const setting = await SystemSetting.findOne({ key: 'activityMasterFields' });
        if (!setting) {
            console.error("❌ Could not find activityMasterFields setting. Please ensure system is initialized.");
            process.exit(1);
        }

        const config = setting.value;
        if (!config.activities) config.activities = [];

        // 1. Ensure "Call" activity has "Revival / Re-engagement" purpose
        let callAct = config.activities.find(a => a.name === "Call");
        if (!callAct) {
            console.log("➕ Call activity not found, creating baseline...");
            callAct = { name: "Call", icon: "phone-alt", purposes: [] };
            config.activities.push(callAct);
        }

        const revivalPurpose = {
            name: "Revival / Re-engagement",
            outcomes: [
                { label: "Re-qualified / Interested", stage: "Prospect", score: 50 },
                { label: "Still Busy / Follow-up", stage: "Dormant", score: 5 },
                { label: "Not Interested / Dead", stage: "Closed Lost", score: 0 }
            ]
        };

        const existingPurposeIdx = callAct.purposes.findIndex(p => p.name === revivalPurpose.name);
        if (existingPurposeIdx > -1) {
            console.log("🔄 Updating existing Revival purpose...");
            callAct.purposes[existingPurposeIdx] = revivalPurpose;
        } else {
            console.log("➕ Adding new Revival purpose...");
            callAct.purposes.push(revivalPurpose);
        }

        // 2. Add explicit mapping rule if it doesn't exist
        if (!config.stageMappingRules) config.stageMappingRules = [];
        const revivalRule = {
            activityType: "Call",
            purpose: "Revival / Re-engagement",
            outcome: "Re-qualified / Interested",
            stage: "Prospect",
            isActive: true,
            priority: 1
        };

        const existingRuleIdx = config.stageMappingRules.findIndex(r => r.purpose === revivalRule.purpose);
        if (existingRuleIdx > -1) {
            config.stageMappingRules[existingRuleIdx] = revivalRule;
        } else {
            config.stageMappingRules.push(revivalRule);
        }

        // 3. Seed Revival SMS Template
        const templateData = {
            name: "Lead Revival Welcome",
            body: "Hello {{Name}}, we've reactivated your property requirement. Our team will contact you shortly to discuss new options. Thank you! - Bharat Properties",
            category: "Transactional",
            isActive: true
        };

        const SmsTemplate = mongoose.model('SmsTemplate', new mongoose.Schema({}, { strict: false }));
        const existingTemplate = await SmsTemplate.findOne({ name: templateData.name });
        if (!existingTemplate) {
            console.log("➕ Seeding Lead Revival SMS Template...");
            await SmsTemplate.create(templateData);
        } else {
            console.log("🔄 Lead Revival SMS Template already exists, skipping...");
        }

        // 4. Save modified config
        await SystemSetting.findOneAndUpdate(
            { key: 'activityMasterFields' },
            { $set: { value: config } }
        );

        console.log("✨ Lead Revival System Configured Successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Configuration Failed:", err);
        process.exit(1);
    }
}

setupRevivalSystem();
