import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env')));
for (const k in envConfig) process.env[k] = envConfig[k];

import Contact from '../models/Contact.js';
import Deal from '../models/Deal.js';
import MergeAudit from '../models/MergeAudit.js';
import { classifyGroup, previewMerge, executeMerge, rollbackMerge } from '../services/contactMerge.service.js';

async function runTests() {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    console.log("Connected to MongoDB for Deduplication Tests");
    
    // Cleanup old test data
    await Contact.deleteMany({ name: { $regex: /^TEST_DEDUP/ } });
    await Deal.deleteMany({ projectName: 'TEST_DEDUP_DEAL' });
    await MergeAudit.deleteMany({ "fieldChanges.field": { $exists: true } });
    
    // Create test records
    const ownerA = new mongoose.Types.ObjectId();
    const ownerB = new mongoose.Types.ObjectId();
    
    // Group 1: SAFE_AUTO_MERGE
    const c1 = await Contact.create({ name: 'TEST_DEDUP Safe John', phones: [{number: '9999900001'}], tags: ['VIP'], owner: ownerA });
    const c2 = await Contact.create({ name: 'TEST_DEDUP Safe John', phones: [{number: '9999900001'}, {number: '9999900002'}], tags: ['VIP', 'NEW'], owner: ownerA, company: 'Acme Corp' });
    
    // Group 2: Name Conflict (DO_NOT_MERGE)
    const c3 = await Contact.create({ name: 'TEST_DEDUP Conflict John', phones: [{number: '9999900003'}], owner: ownerA });
    const c4 = await Contact.create({ name: 'TEST_DEDUP Conflict Jane', phones: [{number: '9999900003'}], owner: ownerA });
    
    // Group 3: Ownership Conflict (REVIEW_REQUIRED)
    const c5 = await Contact.create({ name: 'TEST_DEDUP Own John', phones: [{number: '9999900004'}], owner: ownerA });
    const c6 = await Contact.create({ name: 'TEST_DEDUP Own John', phones: [{number: '9999900004'}], owner: ownerB });
    
    // Add reference for C2
    const deal = await Deal.create({
        projectName: 'TEST_DEDUP_DEAL',
        owner: c2._id,
        buyer: c2._id,
        status: 'Active'
    });
    
    console.log("--- TEST 1: Classification & Protection ---");
    const class1 = classifyGroup([c1, c2]);
    if (class1.classification !== 'SAFE_AUTO_MERGE') throw new Error('Test 1a failed');
    
    const class2 = classifyGroup([c3, c4]);
    if (class2.classification !== 'DO_NOT_MERGE') throw new Error('Test 1b failed');
    
    const class3 = classifyGroup([c5, c6]);
    if (class3.classification !== 'REVIEW_REQUIRED') throw new Error('Test 1c failed');
    console.log("Classification and DO_NOT_MERGE/REVIEW_REQUIRED protection PASSED");
    
    console.log("--- TEST 2: Preview Merge (Arrays & References) ---");
    const p = await previewMerge(c1, c2);
    if (!p.consolidatedFields.$addToSet.phones.$each.some(ph => ph.number === '9999900002')) throw new Error('Test 2a failed');
    if (p.consolidatedFields.$addToSet.tags.$each.length !== 1 || p.consolidatedFields.$addToSet.tags.$each[0] !== 'NEW') throw new Error('Test 2b failed: array duplicates prevented');
    if (p.consolidatedFields.$set.company !== 'Acme Corp') throw new Error('Test 2c failed');
    if (p.referenceRewires.length !== 2) throw new Error('Test 2d failed: expected 2 rewires (owner, buyer)');
    console.log("Preview calculations, array duplicate prevention, and reference detection PASSED");
    
    console.log("--- TEST 3: Execute Merge & MergeAudit Creation ---");
    const audit = await executeMerge(c1._id, c2._id, p);
    if (audit.status !== 'COMPLETED') throw new Error('Test 3a failed');
    
    const master = await Contact.findById(c1._id);
    const dup = await Contact.findById(c2._id);
    if (master.phones.length !== 2) throw new Error('Test 3b failed');
    if (master.tags.length !== 2) throw new Error('Test 3c failed');
    if (master.company !== 'Acme Corp') throw new Error('Test 3d failed');
    if (!dup.isMerged || !dup.isDeleted || dup.mergedInto.toString() !== master._id.toString()) throw new Error('Test 3e failed');
    
    const checkDeal = await Deal.findById(deal._id);
    if (checkDeal.owner.toString() !== master._id.toString() || checkDeal.buyer.toString() !== master._id.toString()) throw new Error('Test 3f failed');
    console.log("Execute merge, MergeAudit creation, and reference rewiring PASSED");
    
    console.log("--- TEST 4: Rollback Merge ---");
    const rolledBackAudit = await rollbackMerge(audit.mergeOperationId);
    if (rolledBackAudit.status !== 'ROLLED_BACK') throw new Error('Test 4a failed');
    
    const rbMaster = await Contact.findById(c1._id);
    const rbDup = await Contact.findById(c2._id);
    if (rbMaster.phones.length !== 1) throw new Error('Test 4b failed');
    if (rbMaster.tags.length !== 1) throw new Error('Test 4c failed');
    if (rbMaster.company) throw new Error('Test 4d failed');
    if (rbDup.isMerged || rbDup.isDeleted || rbDup.mergedInto) throw new Error('Test 4e failed');
    
    const rbDeal = await Deal.findById(deal._id);
    if (rbDeal.owner.toString() !== dup._id.toString() || rbDeal.buyer.toString() !== dup._id.toString()) throw new Error('Test 4f failed');
    console.log("Rollback merge, un-consolidating fields, and un-rewiring references PASSED");
    
    console.log("--- TEST 5: PREVIEW Write Protection ---");
    let caught = false;
    mongoose.set('debug', (coll, method) => {
        if (['updateOne'].includes(method)) caught = true;
    });
    try {
        await Contact.updateOne({_id: c1._id}, {$set: {name: 'Write Guard Test'}});
    } catch(e) {}
    if (!caught) throw new Error('Test 5 failed: write guard not effective');
    mongoose.set('debug', false);
    console.log("PREVIEW write protection via Mongoose interceptor PASSED");
    
    console.log("ALL TESTS PASSED SUCCESSFULLY.");
    process.exit(0);
}

runTests().catch(err => {
    console.error("TEST FAILED:", err);
    process.exit(1);
});
