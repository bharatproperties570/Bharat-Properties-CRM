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
import MergeAudit from '../models/MergeAudit.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';

async function runAudit() {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    console.log("Connected to MongoDB for Read-Only Audit.");

    // 1. LEGACY BSON NORMALIZATION READINESS
    const totalContacts = await Contact.countDocuments({});
    
    // Check for isDeleted / isMerged existence
    const missingIsDeleted = await Contact.countDocuments({ isDeleted: { $exists: false } });
    const nullIsDeleted = await Contact.countDocuments({ isDeleted: null });
    const missingIsMerged = await Contact.countDocuments({ isMerged: { $exists: false } });
    const nullIsMerged = await Contact.countDocuments({ isMerged: null });
    
    // Active contacts
    const activeQuery = {
        $and: [
            { isDeleted: { $ne: true } },
            { isMerged: { $ne: true } }
        ]
    };
    const activeContacts = await Contact.countDocuments(activeQuery);
    
    console.log(`TOTAL CONTACTS: ${totalContacts}`);
    console.log(`ACTIVE CONTACTS: ${activeContacts}`);
    console.log(`MISSING isDeleted: ${missingIsDeleted} | NULL isDeleted: ${nullIsDeleted}`);
    console.log(`MISSING isMerged: ${missingIsMerged} | NULL isMerged: ${nullIsMerged}`);

    // Find documents with empty string phones or emails which could bypass normalization
    const emptyPhones = await Contact.countDocuments({ ...activeQuery, "phones.number": "" });
    const nullPhones = await Contact.countDocuments({ ...activeQuery, "phones.number": null });
    console.log(`EMPTY STRING PHONES: ${emptyPhones} | NULL PHONES: ${nullPhones}`);

    // 2. DUPLICATE DISCOVERY (READ-ONLY)
    console.log("\nDiscovering Duplicate Groups by Phone...");
    const phoneDuplicates = await Contact.aggregate([
        { $match: activeQuery },
        { $unwind: { path: "$phones", preserveNullAndEmptyArrays: false } },
        { $match: { "phones.number": { $type: "string", $regex: /^[^\s]/ } } }, // Match valid string phones
        { $project: { phone: { $trim: { input: "$phones.number" } }, docId: "$_id", createdAt: 1, name: 1, emails: 1 } },
        { $match: { phone: { $gt: "" } } }, // Exclude empty strings
        { $group: {
            _id: "$phone",
            count: { $sum: 1 },
            ids: { $addToSet: "$docId" },
            docs: { $push: { _id: "$docId", createdAt: "$createdAt", name: "$name", emails: "$emails" } }
        }},
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } }
    ]);
    
    let totalDupGroups = phoneDuplicates.length;
    let totalDupRecords = 0;
    
    for (const group of phoneDuplicates) {
        totalDupRecords += group.ids.length;
    }
    
    console.log(`Duplicate Groups (Phone): ${totalDupGroups}`);
    console.log(`Duplicate Records (Phone): ${totalDupRecords}`);

    // Discover by Email
    console.log("\nDiscovering Duplicate Groups by Email...");
    const emailDuplicates = await Contact.aggregate([
        { $match: activeQuery },
        { $unwind: { path: "$emails", preserveNullAndEmptyArrays: false } },
        { $match: { "emails.address": { $type: "string" } } },
        { $project: { email: { $toLower: { $trim: { input: "$emails.address" } } }, docId: "$_id" } },
        { $match: { email: { $gt: "" } } }, // Exclude empty strings
        { $group: {
            _id: "$email",
            count: { $addToSet: "$docId" }
        }},
        { $project: { _id: 1, count: { $size: "$count" }, ids: "$count" } },
        { $match: { count: { $gt: 1 } } }
    ]);

    console.log(`Duplicate Groups (Email): ${emailDuplicates.length}`);

    // 3. CANONICAL SURVIVOR ANALYSIS (Sample first 5 groups)
    console.log("\nSample Canonical Survivor Analysis (Top 5 Groups):");
    const sample = phoneDuplicates.slice(0, 5);
    for (const group of sample) {
        console.log(`\nGroup Phone: ${group._id} (Count: ${group.count})`);
        // Sort by createdAt ascending (earliest first)
        group.docs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        const canonical = group.docs[0];
        console.log(`  Canonical Survivor Candidate: ${canonical._id} (Created: ${canonical.createdAt})`);
        
        let safeToMerge = true;
        let conflictFlags = [];
        
        for (let i = 1; i < group.docs.length; i++) {
            const doc = group.docs[i];
            console.log(`  Duplicate: ${doc._id} (Created: ${doc.createdAt})`);
            
            // Check Name Conflict
            if (doc.name && canonical.name && doc.name.trim().toLowerCase() !== canonical.name.trim().toLowerCase()) {
                // Heuristic: If one is a substring of the other, maybe ok, otherwise conflict
                if (!doc.name.includes(canonical.name) && !canonical.name.includes(doc.name)) {
                    conflictFlags.push(`Name Conflict: "${canonical.name}" vs "${doc.name}"`);
                    safeToMerge = false;
                }
            }
        }
        
        if (safeToMerge) {
            console.log("  => SAFE TO MERGE");
        } else {
            console.log("  => AMBIGUOUS / CONFLICTS:");
            conflictFlags.forEach(f => console.log(`     - ${f}`));
        }
    }

    // 4. REFERENCE INTEGRITY AUDIT
    console.log("\nReference Integrity Summary:");
    const leadCount = await Lead.countDocuments({ associatedContact: { $exists: true, $ne: null } });
    const dealCount = await Deal.countDocuments({ associatedContact: { $exists: true, $ne: null } });
    console.log(`Leads linking to Contacts: ${leadCount}`);
    console.log(`Deals linking to Contacts: ${dealCount}`);

    // Check if MergeAudit schema exists
    console.log("\nMergeAudit Schema Check:");
    const maKeys = Object.keys(MergeAudit.schema.paths);
    console.log(`Fields: ${maKeys.join(', ')}`);

    console.log("\nAUDIT COMPLETE. Exiting.");
    process.exit(0);
}

runAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
