/**
 * Stage History Migration Script
 *
 * Run once to:
 * 1. Diagnose why stage density shows "Unknown"
 * 2. Seed stageHistory[] for all existing leads/deals
 * 3. Set stageChangedAt = createdAt for leads without it
 *
 * Usage:  node seed_stage_history.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) { console.error('❌ No MONGO_URI in .env'); process.exit(1); }

await mongoose.connect(MONGO_URI);
console.log('✅ MongoDB connected');

// --- Inline schemas (avoid circular imports) ---
const lookupSchema = new mongoose.Schema({ lookup_type: String, lookup_value: String });
const Lookup = mongoose.models.Lookup || mongoose.model('Lookup', lookupSchema);

const leadSchema = new mongoose.Schema({
    stage: { type: mongoose.Schema.Types.Mixed },
    stageHistory: [mongoose.Schema.Types.Mixed],
    stageChangedAt: Date,
    lastActivityAt: Date,
    createdAt: Date
}, { strict: false, timestamps: true });
const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

const dealSchema = new mongoose.Schema({
    stage: String,
    stageHistory: [mongoose.Schema.Types.Mixed],
    stageChangedAt: Date,
    createdAt: Date
}, { strict: false, timestamps: true });
const Deal = mongoose.models.Deal || mongoose.model('Deal', dealSchema);

// ─── Step 1: Diagnose stage field format ────────────────────────────────────
console.log('\n📋 STEP 1: Diagnosing Lead stage field format...');
const sampleLeads = await Lead.find({}).select('stage stageHistory stageChangedAt createdAt').limit(5).lean();
console.log(`  Total sample: ${sampleLeads.length} leads`);
sampleLeads.forEach((l, i) => {
    const stageType = typeof l.stage;
    const stageStr = JSON.stringify(l.stage);
    const hasHistory = (l.stageHistory || []).length > 0;
    console.log(`  Lead ${i + 1}: stage=${stageStr} (${stageType}), hasHistory=${hasHistory}`);
});

// ─── Step 2: Build stage ObjectId → label map ────────────────────────────────
console.log('\n📋 STEP 2: Loading Stage lookups...');
const stageLookups = await Lookup.find({ lookup_type: 'Stage' }).lean();
console.log(`  Found ${stageLookups.length} Stage lookups:`, stageLookups.map(l => `${l._id} → ${l.lookup_value}`));

const stageIdToLabel = {};
stageLookups.forEach(l => {
    stageIdToLabel[l._id.toString()] = l.lookup_value;
});

// ─── Step 3: Seed stageHistory for all leads ────────────────────────────────
console.log('\n📋 STEP 3: Seeding stageHistory for existing leads...');
const allLeads = await Lead.find({}).select('stage stageHistory stageChangedAt createdAt').lean();

let seeded = 0, skipped = 0, errors = 0;

for (const lead of allLeads) {
    // Skip if already has history
    if (lead.stageHistory && lead.stageHistory.length > 0) { skipped++; continue; }

    // Resolve stage label
    let stageLabel = 'New';
    if (lead.stage) {
        const stageId = lead.stage._id?.toString() || lead.stage.toString();
        stageLabel = stageIdToLabel[stageId] || (typeof lead.stage === 'string' ? lead.stage : 'New');
    }

    const enteredAt = lead.stageChangedAt || lead.createdAt || new Date();

    try {
        await Lead.findByIdAndUpdate(lead._id, {
            $set: {
                stageChangedAt: enteredAt,
            },
            $push: {
                stageHistory: {
                    stage: stageLabel,
                    enteredAt,
                    triggeredBy: 'import',
                    reason: 'Seeded by migration script'
                }
            }
        });
        seeded++;
    } catch (e) {
        console.error(`  ❌ Lead ${lead._id}: ${e.message}`);
        errors++;
    }
}

console.log(`  ✅ seeded=${seeded}, skipped=${skipped}, errors=${errors}`);

// ─── Step 4: Seed stageHistory for all deals ─────────────────────────────────
console.log('\n📋 STEP 4: Seeding stageHistory for existing deals...');
const allDeals = await Deal.find({}).select('stage stageHistory stageChangedAt createdAt').lean();
let dSeeded = 0, dSkipped = 0;

for (const deal of allDeals) {
    if (deal.stageHistory && deal.stageHistory.length > 0) { dSkipped++; continue; }

    const stage = deal.stage || 'Open';
    const enteredAt = deal.stageChangedAt || deal.createdAt || new Date();

    await Deal.findByIdAndUpdate(deal._id, {
        $set: { stageChangedAt: enteredAt },
        $push: {
            stageHistory: {
                stage,
                enteredAt,
                triggeredBy: 'import',
                reason: 'Seeded by migration script'
            }
        }
    });
    dSeeded++;
}
console.log(`  ✅ deals seeded=${dSeeded}, skipped=${dSkipped}`);

// ─── Step 5: Verify density now resolves correctly ───────────────────────────
console.log('\n📋 STEP 5: Verifying density aggregation...');
const density = await Lead.aggregate([
    {
        $lookup: {
            from: 'lookups',
            localField: 'stage',
            foreignField: '_id',
            as: 'stageInfo'
        }
    },
    {
        $project: {
            stageLabel: { $ifNull: [{ $arrayElemAt: ['$stageInfo.lookup_value', 0] }, 'Unknown'] },
            historyCount: { $size: { $ifNull: ['$stageHistory', []] } }
        }
    },
    {
        $group: {
            _id: '$stageLabel',
            count: { $sum: 1 },
            avgHistory: { $avg: '$historyCount' }
        }
    }
]);
console.log('  Density after migration:', JSON.stringify(density, null, 2));

// ─── Step 6: Check if stage field is string for some leads ───────────────────
const stringStageCount = await Lead.countDocuments({ stage: { $type: 'string' } });
const objectIdStageCount = await Lead.countDocuments({ stage: { $type: 'objectId' } });
console.log(`\n  Stage field types: string=${stringStageCount}, objectId=${objectIdStageCount}`);

if (stringStageCount > 0) {
    console.log('\n⚠️  Some leads have string stage. Converting to Lookup ObjectIds...');
    const stringStageLeads = await Lead.find({ stage: { $type: 'string' } }).lean();
    let converted = 0;
    for (const lead of stringStageLeads) {
        const stageStr = lead.stage;
        let lookup = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: { $regex: new RegExp(`^${stageStr}$`, 'i') } });
        if (!lookup) {
            lookup = await Lookup.create({ lookup_type: 'Stage', lookup_value: stageStr });
            console.log(`  Created lookup for: ${stageStr}`);
        }
        await Lead.findByIdAndUpdate(lead._id, { $set: { stage: lookup._id } });
        converted++;
    }
    console.log(`  ✅ Converted ${converted} leads from string to ObjectId stage`);
}

console.log('\n✅ Migration complete!');
await mongoose.disconnect();
process.exit(0);
