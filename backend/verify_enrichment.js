import mongoose from "mongoose";
import Lead from "./models/Lead.js";
import IntentKeywordRule from "./models/IntentKeywordRule.js";
import connectDB from "./src/config/db.js";
import { runFullLeadEnrichment } from "./src/utils/enrichmentEngine.js";

const verify = async () => {
    try {
        await connectDB();
        console.log("Connected to DB");

        // 1. Check existing rules
        const rules = await IntentKeywordRule.find({ isActive: true });
        console.log(`Found ${rules.length} active keyword rules.`);
        if (rules.length === 0) {
            console.log("No active rules found. Creating a test rule...");
            await IntentKeywordRule.create({
                keyword: "Commercial Investment",
                autoTag: "Investor",
                roleType: "Investor",
                intentImpact: 30,
                isActive: true
            });
        }

        // 2. Create a Lead with matching keyword
        const testLead = await Lead.create({
            firstName: "Enrichment",
            lastName: "Test",
            mobile: "9999999999",
            description: "I am interested in Commercial Investment opportunities."
        });
        console.log(`Created test lead: ${testLead._id}`);

        // 3. Trigger enrichment (should be automatic now, but let's call it to be sure or check if it was already called)
        // Since we are running in the same process, we can check if it's already enriched
        let leadAfterCreation = await Lead.findById(testLead._id);
        console.log("Lead after creation (Intent Index):", leadAfterCreation.intent_index);
        console.log("Lead after creation (Classification):", leadAfterCreation.lead_classification);
        console.log("Lead after creation (Tags):", leadAfterCreation.intent_tags);

        if (leadAfterCreation.intent_index > 0) {
            console.log("✅ Auto-enrichment on creation successful!");
        } else {
            console.log("❌ Auto-enrichment on creation failed. Manual run starting...");
            await runFullLeadEnrichment(testLead._id);
            leadAfterCreation = await Lead.findById(testLead._id);
            console.log("Lead after manual enrichment (Intent Index):", leadAfterCreation.intent_index);
        }

        // Cleanup
        await Lead.findByIdAndDelete(testLead._id);
        console.log("Test lead deleted.");

        process.exit(0);
    } catch (error) {
        console.error("Verification failed:", error);
        process.exit(1);
    }
};

verify();
