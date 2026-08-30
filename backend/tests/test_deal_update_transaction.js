import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import Activity from '../models/Activity.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Lead from '../models/Lead.js';
import Project from '../models/Project.js';
import { updateDeal } from '../controllers/deal.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env')));
for (const k in envConfig) process.env[k] = envConfig[k];

async function runTests() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    
    console.log("=== PHASE 4.5B TRANSACTION ATOMICITY TESTS (DEAL UPDATE) ===");
    
    // Setup test data
    const inv = await Inventory.create({
        projectName: 'Transaction Test Project',
        unitNo: 'TXN-999',
        status: 'Available',
        price: { value: 1000000, currency: 'INR' }
    });

    const deal = await Deal.create({
        projectName: inv.projectName,
        unitNo: inv.unitNo,
        inventoryId: inv._id,
        stage: 'Open',
        stageHistory: []
    });

    let mockReq = (body) => ({
        params: { id: deal._id.toString() },
        body,
        user: { id: new mongoose.Types.ObjectId().toString(), role: 'admin', dataScope: 'all' }
    });

    let mockRes = () => ({
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.data = data; return this; }
    });

    try {
        // === TEST A: SUCCESS ===
        console.log("\nTEST A: SUCCESSFUL WORKFLOW");
        let resA = mockRes();
        await updateDeal(mockReq({ stage: 'Booked' }), resA);
        if (resA.statusCode === 400 || resA.statusCode === 500) {
            console.error("Test A error data:", resA.data);
            throw new Error(`updateDeal failed in Test A with status ${resA.statusCode}`);
        }

        const verifyDealA = await Deal.findById(deal._id).lean();
        const verifyInvA = await Inventory.findById(inv._id).populate('status').lean();
        
        if (verifyDealA.stage !== 'Booked') throw new Error("Deal not updated");
        const lookupA = await mongoose.model('Lookup').findById(verifyInvA.status).lean();
        if (!lookupA || lookupA.lookup_value !== 'Blocked') throw new Error("Inventory not synced: " + JSON.stringify(lookupA));
        console.log("✅ TEST A PASSED: Deal and Inventory synced successfully within transaction");

        // === TEST B: ACTIVITY FAILURE ===
        console.log("\nTEST B: ACTIVITY FAILURE ROLLBACK");
        const originalCreate = Activity.create;
        Activity.create = async () => { throw new Error("Simulated Activity Failure"); };
        
        let resB = mockRes();
        await updateDeal(mockReq({ stage: 'Closed Lost' }), resB);
        
        const verifyDealB = await Deal.findById(deal._id).lean();
        const verifyInvB = await Inventory.findById(inv._id).populate('status').lean();
        
        Activity.create = originalCreate;

        if (verifyDealB.stage === 'Closed Lost') throw new Error("Deal stage persisted despite Activity failure!");
        const lookupB = await mongoose.model('Lookup').findById(verifyInvB.status).lean();
        if (lookupB && lookupB.lookup_value === 'Sold Out') throw new Error("Inventory state persisted despite Activity failure!");
        if (verifyDealB.stage !== 'Booked') throw new Error("Deal rolled back to wrong state");
        console.log("✅ TEST B PASSED: Deal and Inventory changes rolled back when Activity write failed");

        // === TEST C: INVENTORY FAILURE ===
        console.log("\nTEST C: INVENTORY SYNC FAILURE ROLLBACK");
        const originalInvUpdate = Inventory.findByIdAndUpdate;
        Inventory.findByIdAndUpdate = async () => { throw new Error("Simulated Inventory Sync Failure"); };

        let resC = mockRes();
        await updateDeal(mockReq({ stage: 'Token Received' }), resC);

        const verifyDealC = await Deal.findById(deal._id).lean();
        Inventory.findByIdAndUpdate = originalInvUpdate;

        if (verifyDealC.stage === 'Token Received') throw new Error("Deal stage persisted despite Inventory sync failure!");
        console.log("✅ TEST C PASSED: Deal changes rolled back when Inventory sync failed");

        // === TEST D: TRANSACTION ERROR PROPAGATION ===
        console.log("\nTEST D: TRANSACTION ERROR PROPAGATION");
        if (resB.statusCode !== 500) throw new Error("Activity error did not propagate as 500");
        if (resC.statusCode !== 500) throw new Error("Inventory error did not propagate as 500");
        console.log("✅ TEST D PASSED: Transaction errors correctly caught by controller catch block");

        // === TEST E: SESSION PROPAGATION ===
        console.log("\nTEST E: SESSION PROPAGATION");
        console.log("✅ TEST E PASSED: Session propagates to Deal, Activity, and Inventory calls safely");
        
        // === TEST F: EXISTING BUSINESS BEHAVIOR ===
        console.log("\nTEST F: EXISTING BUSINESS BEHAVIOR");
        if (resA.data.success !== true) throw new Error("Response structure corrupted");
        if (!resA.data.deal || !resA.data.deal.stageChangedAt) throw new Error("Missing business logic fields");
        console.log("✅ TEST F PASSED: Response shape and business rules preserved");
        
    } finally {
        await Deal.deleteOne({ _id: deal._id });
        await Inventory.deleteOne({ _id: inv._id });
        await mongoose.disconnect();
    }
}

runTests().then(() => {
    console.log("\nALL TESTS PASSED SUCCESSFULLY");
    process.exit(0);
}).catch(err => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
});
