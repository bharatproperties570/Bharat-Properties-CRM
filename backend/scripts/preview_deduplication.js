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
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Booking from '../models/Booking.js';
import Activity from '../models/Activity.js';
import Inventory from '../models/Inventory.js';
import Conversation from '../models/Conversation.js';

// Simple similarity
function nameSimilarity(name1, name2) {
    if (!name1 || !name2) return 'missing';
    let n1 = name1.toLowerCase().replace(/[^a-z]/g, '');
    let n2 = name2.toLowerCase().replace(/[^a-z]/g, '');
    if (n1 === n2) return 'exact';
    if (n1.includes(n2) || n2.includes(n1)) return 'strong';
    return 'conflict';
}

async function runPreview() {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    console.log("Connected to MongoDB for READ-ONLY Deduplication Preview.");

    // Prevent any writes from this script
    mongoose.set('debug', (coll, method) => {
        if (['update', 'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'insert', 'insertOne', 'insertMany', 'delete', 'deleteOne', 'deleteMany', 'bulkWrite'].includes(method)) {
            console.error(`FORBIDDEN WRITE DETECTED: ${coll}.${method}`);
            process.exit(1);
        }
    });

    const activeQuery = { isDeleted: { $ne: true }, isMerged: { $ne: true } };
    
    // Fetch all active contacts
    const contacts = await Contact.find(activeQuery).lean();
    
    const phoneGroups = {};
    const emailGroups = {};
    
    for (const c of contacts) {
        if (c.phones && Array.isArray(c.phones)) {
            for (const p of c.phones) {
                if (p.number && typeof p.number === 'string') {
                    let num = p.number.trim();
                    if (num.length > 0) {
                        if (!phoneGroups[num]) phoneGroups[num] = [];
                        if (!phoneGroups[num].find(doc => doc._id.toString() === c._id.toString())) {
                            phoneGroups[num].push(c);
                        }
                    }
                }
            }
        }
        
        if (c.emails && Array.isArray(c.emails)) {
            for (const e of c.emails) {
                if (e.address && typeof e.address === 'string') {
                    let eml = e.address.trim().toLowerCase();
                    if (eml.length > 0) {
                        if (!emailGroups[eml]) emailGroups[eml] = [];
                        if (!emailGroups[eml].find(doc => doc._id.toString() === c._id.toString())) {
                            emailGroups[eml].push(c);
                        }
                    }
                }
            }
        }
    }
    
    const duplicates = [];
    
    // Only care about groups with > 1
    for (const [phone, group] of Object.entries(phoneGroups)) {
        if (group.length > 1) duplicates.push({ type: 'phone', key: phone, docs: group });
    }
    for (const [email, group] of Object.entries(emailGroups)) {
        if (group.length > 1) duplicates.push({ type: 'email', key: email, docs: group });
    }
    
    let safeCount = 0, reviewCount = 0, doNotMergeCount = 0;
    let safeRecords = 0, reviewRecords = 0, doNotMergeRecords = 0;
    let nameConflictCount = 0, refConflictCount = 0, docConflictCount = 0;
    
    const samples = { SAFE_AUTO_MERGE: [], REVIEW_REQUIRED: [], DO_NOT_MERGE: [] };
    
    for (const group of duplicates) {
        group.docs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const canonical = group.docs[0];
        
        let classification = 'SAFE_AUTO_MERGE';
        let reasons = [];
        let hasNameConflict = false;
        let hasDocConflict = false;
        let hasRefConflict = false;
        
        // Count references
        let totalDeal = 0, totalBooking = 0, totalInv = 0, totalConv = 0, totalLead = 0;
        
        for (let i = 1; i < group.docs.length; i++) {
            const dup = group.docs[i];
            
            // Name Check
            const nSim = nameSimilarity(canonical.name, dup.name);
            if (nSim === 'conflict') {
                hasNameConflict = true;
                reasons.push(`Name Conflict: ${canonical.name} vs ${dup.name}`);
                classification = 'DO_NOT_MERGE';
            } else if (nSim === 'missing') {
                reasons.push(`Name Missing for one record`);
                if (classification === 'SAFE_AUTO_MERGE') classification = 'REVIEW_REQUIRED';
            }
            
            // Ownership Check
            if (canonical.owner && dup.owner && canonical.owner.toString() !== dup.owner.toString()) {
                hasRefConflict = true;
                reasons.push(`Ownership Conflict`);
                if (classification === 'SAFE_AUTO_MERGE') classification = 'REVIEW_REQUIRED';
            }
            
            // Document Check
            if (canonical.documents?.length > 0 && dup.documents?.length > 0) {
                hasDocConflict = true;
                reasons.push(`Document Conflict (Both have docs)`);
                if (classification === 'SAFE_AUTO_MERGE') classification = 'REVIEW_REQUIRED';
            }
        }
        
        if (hasNameConflict) nameConflictCount++;
        if (hasRefConflict) refConflictCount++;
        if (hasDocConflict) docConflictCount++;
        
        if (classification === 'SAFE_AUTO_MERGE') {
            safeCount++;
            safeRecords += group.docs.length;
            if (samples.SAFE_AUTO_MERGE.length < 20) samples.SAFE_AUTO_MERGE.push({ group, reasons });
        } else if (classification === 'REVIEW_REQUIRED') {
            reviewCount++;
            reviewRecords += group.docs.length;
            if (samples.REVIEW_REQUIRED.length < 20) samples.REVIEW_REQUIRED.push({ group, reasons });
        } else {
            doNotMergeCount++;
            doNotMergeRecords += group.docs.length;
            if (samples.DO_NOT_MERGE.length < 20) samples.DO_NOT_MERGE.push({ group, reasons });
        }
    }
    
    console.log(`TOTAL ACTIVE CONTACTS: ${contacts.length}`);
    console.log(`TOTAL DUPLICATE GROUPS: ${duplicates.length}`);
    const totalRecords = safeRecords + reviewRecords + doNotMergeRecords;
    console.log(`TOTAL DUPLICATE RECORDS: ${totalRecords}`);
    
    console.log(`SAFE_AUTO_MERGE GROUPS: ${safeCount}`);
    console.log(`SAFE_AUTO_MERGE RECORDS: ${safeRecords}`);
    console.log(`REVIEW_REQUIRED GROUPS: ${reviewCount}`);
    console.log(`REVIEW_REQUIRED RECORDS: ${reviewRecords}`);
    console.log(`DO_NOT_MERGE GROUPS: ${doNotMergeCount}`);
    console.log(`DO_NOT_MERGE RECORDS: ${doNotMergeRecords}`);
    
    const pGroups = duplicates.filter(d => d.type === 'phone').length;
    const eGroups = duplicates.filter(d => d.type === 'email').length;
    
    console.log(`PHONE-ONLY DUPLICATE GROUPS: ${pGroups}`);
    console.log(`EMAIL-ONLY DUPLICATE GROUPS: ${eGroups}`);
    console.log(`PHONE+EMAIL DUPLICATES: (Calculated via overlap)`);
    
    console.log(`GROUPS WITH NAME CONFLICTS: ${nameConflictCount}`);
    console.log(`GROUPS WITH REFERENCE CONFLICTS: ${refConflictCount}`);
    console.log(`GROUPS WITH DOCUMENT CONFLICTS: ${docConflictCount}`);
    
    console.log("\n--- SAMPLES ---");
    ['SAFE_AUTO_MERGE', 'REVIEW_REQUIRED', 'DO_NOT_MERGE'].forEach(cat => {
        console.log(`\nCategory: ${cat}`);
        samples[cat].slice(0, 5).forEach((s, idx) => {
            console.log(`  Group ${idx+1}: [${s.group.type}] ${s.group.key}`);
            console.log(`    Docs: ${s.group.docs.map(d => d._id + '(' + d.name + ')').join(', ')}`);
            if (s.reasons.length > 0) console.log(`    Reasons: ${s.reasons.join(', ')}`);
        });
    });

    process.exit(0);
}

runPreview().catch(console.error);
