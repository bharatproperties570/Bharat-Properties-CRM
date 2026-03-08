import mongoose from 'mongoose';
import axios from 'axios';
import 'dotenv/config';

const API_BASE = 'http://localhost:4000/api';

async function runVerification() {
    console.log("Starting verification of mobile call sync...");

    const testLeadNumber = "9876543210";
    const testUnmatchedNumber = "9988776655";

    // 0. Cleanup existing test data first
    console.log("Pre-cleanup...");
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Activity = mongoose.model('Activity', new mongoose.Schema({}, { strict: false }));
        const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
        await Activity.deleteMany({ "details.platform": 'Mobile' });
        await Lead.deleteOne({ mobile: testLeadNumber });
        console.log("Cleanup done.");
    } catch (e) {
        console.log("Cleanup error (ignoring):", e.message);
    }

    // 1. Create a test lead
    const testLead = {
        firstName: "Test",
        lastName: "SyncLead",
        mobile: testLeadNumber,
        salutation: "Mr."
    };

    try {
        console.log("Creating test lead...");
        const leadRes = await axios.post(`${API_BASE}/leads`, testLead);
        console.log("Lead created:", leadRes.data.success);

        // 2. Sync calls (one matched, one unmatched)
        const callsToSync = {
            calls: [
                {
                    number: testLeadNumber, // Matched
                    name: "Test SyncLead",
                    duration: 120,
                    timestamp: Date.now(),
                    type: "INCOMING",
                    id: "test_call_matched_" + Date.now()
                },
                {
                    number: testUnmatchedNumber, // Unmatched
                    name: "Truly Unknown",
                    duration: 45,
                    timestamp: Date.now() - 3600000,
                    type: "OUTGOING",
                    id: "test_call_unmatched_" + Date.now()
                }
            ]
        };

        console.log("Syncing calls...");
        const syncRes = await axios.post(`${API_BASE}/activities/mobile-sync`, callsToSync);
        console.log("Sync result:", syncRes.data.success, "Count:", syncRes.data.syncedCount);

        // 3. Verify in Activities
        const activitiesRes = await axios.get(`${API_BASE}/activities`);
        const synced = activitiesRes.data.data.filter(a => a.details?.platform === 'Mobile');

        console.log("\nVerification Results:");
        synced.forEach(a => {
            console.log(`- Call: ${a.participants[0].mobile} | Matched: ${a.details.isMatched} | Entity: ${a.entityType}`);
        });

        // Final Cleanup
        console.log("\nFinal cleaning up...");
        await mongoose.model('Lead').deleteOne({ mobile: testLeadNumber });
        await mongoose.model('Activity').deleteMany({ "details.platform": 'Mobile' });
        await mongoose.disconnect();

        console.log("Verification complete.");

    } catch (error) {
        console.error("Verification failed:", error.response?.data || error.message);
        try { await mongoose.disconnect(); } catch (e) { }
    }
}

runVerification();
house
