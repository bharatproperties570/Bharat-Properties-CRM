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
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';

const controllerCode = fs.readFileSync(path.join(__dirname, '../controllers/deal.controller.js'), 'utf-8');
const syncMatch = controllerCode.match(/const syncInventoryStatus = async \(deal, opts = \{\}, forceTransition = false\) => \{(.*?)\n\};/s);
const syncBody = syncMatch[1];
const syncInventoryStatus = async (deal, opts = {}, forceTransition = false) => {
    return await eval(`(async () => { ${syncBody} })()`);
};

async function test() {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    
    const availableLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Available' }).lean();
    const activeLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Active' }).lean();
    const bookedLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Booked' }).lean();
    const soldLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Sold Out' }).lean();

    const createInv = async (statusId) => {
        const inv = new Inventory({ projectName: 'TEST_INV', block: 'A', unitNo: '1', status: statusId });
        await inv.save();
        return inv;
    };
    
    console.log("TEST 1: Create Open Deal on Available inventory -> SUCCESS");
    const inv1 = await createInv(availableLookup._id);
    await withMongoTransaction(async (session) => {
        const d1 = new Deal({ projectName: 'T', inventoryId: inv1._id, stage: 'Open', owner: new mongoose.Types.ObjectId() });
        await d1.save({session});
        await syncInventoryStatus(d1, {session}, true);
    });
    const check1 = await Inventory.findById(inv1._id);
    if (check1.status.toString() !== activeLookup._id.toString()) throw new Error("Test 1 failed");
    console.log("PASS 1");
    
    console.log("TEST 2: Create Booked Deal on Available inventory -> SUCCESS");
    const inv2 = await createInv(availableLookup._id);
    await withMongoTransaction(async (session) => {
        const d2 = new Deal({ projectName: 'T', inventoryId: inv2._id, stage: 'Booked', owner: new mongoose.Types.ObjectId() });
        await d2.save({session});
        await syncInventoryStatus(d2, {session}, true);
    });
    const check2 = await Inventory.findById(inv2._id);
    const blockedLookup = await Lookup.findOne({ lookup_type: 'Status', lookup_value: 'Blocked' }).lean();
    if (check2.status.toString() !== blockedLookup._id.toString()) throw new Error("Test 2 failed");
    console.log("PASS 2");
    
    console.log("TEST 3: Create Deal on Booked inventory -> BLOCKED");
    const inv3 = await createInv(bookedLookup._id);
    let caught3 = false;
    try {
        await withMongoTransaction(async (session) => {
            const d3 = new Deal({ projectName: 'T', inventoryId: inv3._id, stage: 'Open', owner: new mongoose.Types.ObjectId() });
            await d3.save({session});
            await syncInventoryStatus(d3, {session}, true);
        });
    } catch(e) {
        if (e.code === 'INVENTORY_UNAVAILABLE') caught3 = true;
    }
    if (!caught3) throw new Error("Test 3 failed");
    console.log("PASS 3");
    
    console.log("TEST 4: Create Deal when another active Deal already owns inventory -> BLOCKED");
    const inv4 = await createInv(activeLookup._id); 
    let caught4 = false;
    try {
        await withMongoTransaction(async (session) => {
            const d4 = new Deal({ projectName: 'T', inventoryId: inv4._id, stage: 'Open', owner: new mongoose.Types.ObjectId() });
            await d4.save({session});
            await syncInventoryStatus(d4, {session}, true);
        });
    } catch(e) {
        if (e.code === 'INVENTORY_UNAVAILABLE') caught4 = true;
    }
    if (!caught4) throw new Error("Test 4 failed");
    console.log("PASS 4");
    
    console.log("TEST 5: Cancel Deal -> inventory becomes eligible");
    await withMongoTransaction(async (session) => {
        const d1 = await Deal.findOne({ inventoryId: inv1._id });
        d1.stage = 'Cancelled';
        await d1.save({session});
        await syncInventoryStatus(d1, {session}, false);
    });
    const check5 = await Inventory.findById(inv1._id);
    if (check5.status.toString() !== availableLookup._id.toString()) throw new Error("Test 5 failed");
    console.log("PASS 5");

    await Inventory.deleteMany({ projectName: 'TEST_INV' });
    await Deal.deleteMany({ projectName: 'T' });
    
    process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
