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
import Contact from '../models/Contact.js';
import Inventory from '../models/Inventory.js';
import Activity from '../models/Activity.js';
import Deal from '../models/Deal.js';
import MergeAudit from '../models/MergeAudit.js';
import { executeMerge, rollbackMerge } from '../services/contactMerge.service.js';

async function test() {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    
    // Clear test data
    await Contact.deleteMany({ firstName: 'TEST_REWIRE' });
    await Inventory.deleteMany({ projectName: 'TEST_REWIRE_INV' });
    
    const mas = await Contact.create({ name: 'TEST_REWIRE', firstName: 'TEST_REWIRE', lastName: 'Mas', phones: [{ number: '111', type: 'Personal' }] });
    const dup = await Contact.create({ name: 'TEST_REWIRE', firstName: 'TEST_REWIRE', lastName: 'Dup', phones: [{ number: '222', type: 'Personal' }] });
    const other = await Contact.create({ name: 'TEST_REWIRE', firstName: 'TEST_REWIRE', lastName: 'Oth', phones: [{ number: '333', type: 'Personal' }] });

    const masId = mas._id;
    const dupId = dup._id;
    const othId = other._id;

    // SCENARIO 1: Array with ONLY duplicate
    const inv1 = await Inventory.create({ projectName: 'TEST_REWIRE_INV', block: '1', unitNo: '1', owners: [dupId] });
    
    // SCENARIO 2: Array with duplicate and other
    const inv2 = await Inventory.create({ projectName: 'TEST_REWIRE_INV', block: '1', unitNo: '2', owners: [othId, dupId] });

    // SCENARIO 3: Array with both duplicate and master (should deduplicate during merge)
    const inv3 = await Inventory.create({ projectName: 'TEST_REWIRE_INV', block: '1', unitNo: '3', owners: [dupId, masId] });

    // SCENARIO 4: Empty array (no dup, this won't be in reference rewires normally, but just to be safe)
    const inv4 = await Inventory.create({ projectName: 'TEST_REWIRE_INV', block: '1', unitNo: '4', owners: [] });
    
    // SCENARIO 5: Associates array (object array)
    const inv5 = await Inventory.create({ 
        projectName: 'TEST_REWIRE_INV', block: '1', unitNo: '5',
        associates: [{ contact: dupId, role: 'Broker' }, { contact: othId, role: 'Broker' }] 
    });

    const previewData = {
        fieldChanges: [],
        consolidatedFields: { $set: {}, $addToSet: {} },
        referenceRewires: [
            { collectionName: 'Inventory', documentId: inv1._id, field: 'owners', oldValue: dupId, newValue: masId },
            { collectionName: 'Inventory', documentId: inv2._id, field: 'owners', oldValue: dupId, newValue: masId },
            { collectionName: 'Inventory', documentId: inv3._id, field: 'owners', oldValue: dupId, newValue: masId },
            { collectionName: 'Inventory', documentId: inv5._id, field: 'associates.contact', oldValue: dupId, newValue: masId }
        ]
    };

    console.log("Executing Merge...");
    const audit = await executeMerge(masId, dupId, previewData, { userId: null });
    
    console.log("Merge completed! Audit ID:", audit.mergeOperationId);

    // Verify 1
    const check1 = await Inventory.findById(inv1._id).lean();
    if (check1.owners.length !== 1 || check1.owners[0].toString() !== masId.toString()) throw new Error("SCENARIO 1 FAILED");
    console.log("SCENARIO 1 PASS: Duplicate replaced by survivor");

    // Verify 2
    const check2 = await Inventory.findById(inv2._id).lean();
    if (check2.owners.length !== 2) throw new Error("SCENARIO 2 FAILED");
    if (!check2.owners.some(id => id.toString() === othId.toString())) throw new Error("SCENARIO 2 FAILED: other lost");
    if (!check2.owners.some(id => id.toString() === masId.toString())) throw new Error("SCENARIO 2 FAILED: mas not added");
    console.log("SCENARIO 2 PASS: Other owner preserved, duplicate replaced");

    // Verify 3
    const check3 = await Inventory.findById(inv3._id).lean();
    if (check3.owners.length !== 1 || check3.owners[0].toString() !== masId.toString()) throw new Error("SCENARIO 3 FAILED: Duplicate not properly collapsed into survivor");
    console.log("SCENARIO 3 PASS: Duplicate and survivor collapsed correctly");

    // Verify 5
    const check5 = await Inventory.findById(inv5._id).lean();
    if (check5.associates.length !== 2) throw new Error("SCENARIO 5 FAILED");
    if (check5.associates[0].contact.toString() !== masId.toString()) throw new Error("SCENARIO 5 FAILED: master not replaced");
    if (check5.associates[1].contact.toString() !== othId.toString()) throw new Error("SCENARIO 5 FAILED: other lost");
    console.log("SCENARIO 5 PASS: Associates object array rewritten perfectly");

    console.log("Rolling back...");
    await rollbackMerge(audit.mergeOperationId);

    // Verify Rollback
    const r1 = await Inventory.findById(inv1._id).lean();
    if (r1.owners[0].toString() !== dupId.toString()) throw new Error("R1 FAILED");
    
    const r2 = await Inventory.findById(inv2._id).lean();
    if (!r2.owners.some(id => id.toString() === dupId.toString())) throw new Error("R2 FAILED");
    if (!r2.owners.some(id => id.toString() === othId.toString())) throw new Error("R2 FAILED");

    const r3 = await Inventory.findById(inv3._id).lean();
    if (r3.owners.length !== 2) throw new Error("R3 FAILED");
    if (!r3.owners.some(id => id.toString() === dupId.toString())) throw new Error("R3 FAILED");
    if (!r3.owners.some(id => id.toString() === masId.toString())) throw new Error("R3 FAILED");
    console.log("ROLLBACK 3 PASS: original array with both dup and mas was completely perfectly restored without loss!");

    const r5 = await Inventory.findById(inv5._id).lean();
    if (r5.associates[0].contact.toString() !== dupId.toString()) throw new Error("R5 FAILED");
    console.log("ROLLBACK 5 PASS: Associates restored");

    await Contact.deleteMany({ firstName: 'TEST_REWIRE' });
    await Inventory.deleteMany({ projectName: 'TEST_REWIRE_INV' });

    console.log("ALL REFERENCE REWIRE TESTS PASSED!");
    process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
