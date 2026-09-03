import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env')));
for (const k in envConfig) process.env[k] = envConfig[k];

import '../models/User.js';
import '../models/Team.js';
import '../models/Contact.js';
import '../models/Activity.js';
import '../models/SystemSetting.js';
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import { addDeal } from '../controllers/deal.controller.js';

async function runTest() {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    
    const availableLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Available' }).lean();
    const activeLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Active' }).lean();
    
    const createInv = async (statusId, uNo) => {
        const inv = new Inventory({ projectName: 'TEST_INV', block: 'A', unitNo: uNo, status: statusId });
        await inv.save();
        return inv;
    };
    
    const createMockRes = () => {
        let resolve;
        const p = new Promise(r => resolve = r);
        const res = {
            statusVal: 200,
            jsonVal: null,
            status(s) { this.statusVal = s; return this; },
            json(j) { this.jsonVal = j; resolve(this); return this; },
            send(s) { this.jsonVal = s; resolve(this); return this; },
            _promise: p
        };
        return res;
    };

    console.log("=== A. ACTIVE INVENTORY SUCCESS TEST ===");
    const invA = await createInv(activeLookup._id, '1A');
    const reqA = { body: { inventoryId: invA._id, intent: 'Sell', stage: 'Open', projectName: 'TEST_INV', unitNo: '1A' }, user: { id: new mongoose.Types.ObjectId() } };
    const resA = createMockRes();
    await addDeal(reqA, resA);
    await resA._promise;
    if (resA.statusVal !== 201) throw new Error("A failed: " + JSON.stringify(resA.jsonVal));
    const postInvA = await Inventory.findById(invA._id);
    if (postInvA.status.toString() !== activeLookup._id.toString()) throw new Error("A failed status");
    console.log("PASS A");

    console.log("=== B. AVAILABLE INVENTORY TEST ===");
    const invB = await createInv(availableLookup._id, '1B');
    const reqB = { body: { inventoryId: invB._id, intent: 'Sell', stage: 'Open', projectName: 'TEST_INV', unitNo: '1B' }, user: { id: new mongoose.Types.ObjectId() } };
    const resB = createMockRes();
    await addDeal(reqB, resB);
    await resB._promise;
    if (resB.statusVal !== 201) throw new Error("B failed: " + JSON.stringify(resB.jsonVal));
    const postInvB = await Inventory.findById(invB._id);
    if (postInvB.status.toString() !== activeLookup._id.toString()) throw new Error("B failed status");
    console.log("PASS B");

    console.log("=== C. DUPLICATE DEAL TEST (and Test 6 Abort verify) ===");
    const reqC = { body: { inventoryId: invA._id, intent: 'Sell', stage: 'Open', projectName: 'TEST_INV', unitNo: '1A' }, user: { id: new mongoose.Types.ObjectId() } };
    const resC = createMockRes();
    await addDeal(reqC, resC);
    await resC._promise;
    if (resC.statusVal !== 400 || !resC.jsonVal.error.includes("DUPLICATE DEAL DETECTED")) {
        throw new Error("C failed: " + JSON.stringify(resC.jsonVal));
    }
    
    // TEST 6 Verification: Aborted transaction leaves no trace
    const postInvA_abort = await Inventory.findById(invA._id).lean();
    if (postInvA_abort.hasOwnProperty('_tempTxnLock') || postInvA_abort.hasOwnProperty('_dealConcurrencyLock')) {
        throw new Error("TEST 6 FAILED: Temporary lock field leaked on aborted transaction!");
    }
    console.log("PASS C (and Test 6 Abort)");

    console.log("=== D. CONCURRENT DEAL TEST (and Test 5 Success verify) ===");
    const invD = await createInv(availableLookup._id, '1D');
    const reqD1 = { body: { inventoryId: invD._id, intent: 'Sell', stage: 'Open', projectName: 'TEST_INV', unitNo: '1D' }, user: { id: new mongoose.Types.ObjectId() } };
    const reqD2 = { body: { inventoryId: invD._id, intent: 'Sell', stage: 'Open', projectName: 'TEST_INV', unitNo: '1D' }, user: { id: new mongoose.Types.ObjectId() } };
    const resD1 = createMockRes();
    const resD2 = createMockRes();
    
    await Promise.all([
        addDeal(reqD1, resD1),
        addDeal(reqD2, resD2)
    ]);
    await Promise.all([resD1._promise, resD2._promise]);
    
    const successes = [resD1, resD2].filter(r => r.statusVal === 201).length;
    const duplicates = [resD1, resD2].filter(r => r.statusVal === 400 && (r.jsonVal.error || '').includes("DUPLICATE DEAL")).length;
    
    if (successes !== 1 || duplicates !== 1) {
        console.log(resD1.jsonVal);
        console.log(resD2.jsonVal);
        throw new Error("D failed: successes=" + successes + ", duplicates=" + duplicates);
    }
    
    // TEST 5 Verification: Successful transaction leaves no trace
    const postInvD_success = await Inventory.findById(invD._id).lean();
    if (postInvD_success.hasOwnProperty('_tempTxnLock') || postInvD_success.hasOwnProperty('_dealConcurrencyLock')) {
        throw new Error("TEST 5 FAILED: Temporary lock field leaked on successful transaction!");
    }
    
    console.log("PASS D (and Test 5 Success)");

    await Inventory.deleteMany({ projectName: 'TEST_INV' });
    await Deal.deleteMany({ projectName: 'TEST_INV' });
    
    process.exit(0);
}

runTest().catch(console.error);
