import mongoose from 'mongoose';
import assert from 'assert';
import DistributionRule from '../models/DistributionRule.js';

async function runTest() {
    console.log("Running Trigger Query Test...");

    // This requires a MongoDB connection. I'll mock it if I can't connect,
    // but the prompt says "Add an actual DistributionRule query test proving..."
    // Let me try to connect to the test db.
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/test-crm');
        
        await DistributionRule.deleteMany({});
        
        await DistributionRule.create({
            name: "Multi Trigger",
            module: "leads",
            distributionType: "roundRobin",
            triggerEvent: ["onCreate", "onWebCapture"]
        });

        // 1. Query onCreate
        const onCreateMatch = await DistributionRule.findOne({ triggerEvent: "onCreate" });
        assert(onCreateMatch, "Array must match single string 'onCreate' query");

        // 2. Query onWebCapture
        const onWebMatch = await DistributionRule.findOne({ triggerEvent: "onWebCapture" });
        assert(onWebMatch, "Array must match single string 'onWebCapture' query");

        // 3. Query onImport (should not match)
        const onImportMatch = await DistributionRule.findOne({ triggerEvent: "onImport" });
        assert(!onImportMatch, "Array must NOT match missing string 'onImport'");

        console.log("Trigger Query Test Passed.");
    } catch (e) {
        console.error("Test error:", e);
    } finally {
        await mongoose.disconnect();
    }
}
runTest();
