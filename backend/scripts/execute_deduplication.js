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
import { classifyGroup, previewMerge, executeMerge } from '../services/contactMerge.service.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'primary' });
    
    const isPreview = process.argv.includes('--preview') || !process.argv.includes('--execute');
    
    if (isPreview) {
        mongoose.set('debug', (coll, method) => {
            if (['update', 'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'insert', 'insertOne', 'insertMany', 'delete', 'deleteOne', 'deleteMany', 'bulkWrite'].includes(method)) {
                console.error(`FORBIDDEN WRITE DETECTED IN PREVIEW MODE: ${coll}.${method}`);
                process.exit(1);
            }
        });
    }

    const activeQuery = { isDeleted: { $ne: true }, isMerged: { $ne: true } };
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
    for (const [phone, group] of Object.entries(phoneGroups)) {
        if (group.length > 1) duplicates.push({ type: 'phone', key: phone, docs: group });
    }
    for (const [email, group] of Object.entries(emailGroups)) {
        if (group.length > 1) duplicates.push({ type: 'email', key: email, docs: group });
    }
    
    let safeCount = 0;
    let reviewCount = 0;
    let doNotMergeCount = 0;
    
    const report = {
        totalCandidateGroups: duplicates.length,
        SAFE_AUTO_MERGE: [],
        REVIEW_REQUIRED: [],
        DO_NOT_MERGE: [],
        totalRewires: 0
    };
    
    for (const group of duplicates) {
        const classified = classifyGroup(group.docs);
        if (classified.classification === 'SAFE_AUTO_MERGE') {
            safeCount++;
            let groupRewires = 0;
            const duplicatePreviews = [];
            
            for (const dup of classified.duplicates) {
                const p = await previewMerge(classified.canonical, dup);
                groupRewires += p.referenceRewires.length;
                duplicatePreviews.push({
                    duplicateId: dup._id,
                    fieldChanges: p.fieldChanges,
                    referenceRewires: p.referenceRewires,
                    consolidatedFields: p.consolidatedFields
                });
                
                if (!isPreview) {
                    await executeMerge(classified.canonical._id, dup._id, p);
                    console.log(`Merged ${dup._id} into ${classified.canonical._id}`);
                }
            }
            
            report.totalRewires += groupRewires;
            report.SAFE_AUTO_MERGE.push({
                canonicalId: classified.canonical._id,
                duplicateCount: classified.duplicates.length,
                totalRewires: groupRewires,
                duplicatePreviews
            });
            
        } else if (classified.classification === 'REVIEW_REQUIRED') {
            reviewCount++;
            report.REVIEW_REQUIRED.push({
                canonicalId: classified.canonical._id,
                duplicates: classified.duplicates.map(d => d._id),
                reasons: classified.reasons
            });
        } else {
            doNotMergeCount++;
            report.DO_NOT_MERGE.push({
                canonicalId: classified.canonical._id,
                duplicates: classified.duplicates.map(d => d._id),
                reasons: classified.reasons
            });
        }
    }
    
    console.log(`TOTAL CANDIDATE GROUPS: ${report.totalCandidateGroups}`);
    console.log(`SAFE_AUTO_MERGE: ${safeCount} groups`);
    console.log(`REVIEW_REQUIRED: ${reviewCount} groups`);
    console.log(`DO_NOT_MERGE: ${doNotMergeCount} groups`);
    console.log(`TOTAL REFERENCE REWIRES CALCULATED: ${report.totalRewires}`);
    
    fs.writeFileSync('migration_preview_report_fixed.json', JSON.stringify(report, null, 2));
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
