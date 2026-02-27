/**
 * Seed Stage Lookups + Assign Default Stage to All Leads
 *
 * Run after seed_stage_history.js if stage=undefined was found.
 * 1. Creates all Stage lookup entries (New, Prospect, Qualified, Opportunity, Negotiation, Booked, Closed Won, Closed Lost, Stalled)
 * 2. Assigns 'New' stage to all leads missing a stage
 *
 * Usage: node seed_stage_lookups.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
await mongoose.connect(MONGO_URI);
console.log('✅ MongoDB connected');

const lookupSchema = new mongoose.Schema({
    lookup_type: String,
    lookup_value: String,
    order: Number,
    metadata: mongoose.Schema.Types.Mixed
}, { strict: false, timestamps: true });
const Lookup = mongoose.models.Lookup || mongoose.model('Lookup', lookupSchema);

const leadSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

// ─── Step 1: Create Stage Lookups ────────────────────────────────────────────
console.log('\n📋 STEP 1: Seeding Stage lookup values...');

const STAGES = [
    { lookup_value: 'New', order: 1, metadata: { color: '#94a3b8', probability: 5 } },
    { lookup_value: 'Prospect', order: 2, metadata: { color: '#3b82f6', probability: 10 } },
    { lookup_value: 'Qualified', order: 3, metadata: { color: '#8b5cf6', probability: 25 } },
    { lookup_value: 'Opportunity', order: 4, metadata: { color: '#f59e0b', probability: 40 } },
    { lookup_value: 'Negotiation', order: 5, metadata: { color: '#f97316', probability: 65 } },
    { lookup_value: 'Booked', order: 6, metadata: { color: '#10b981', probability: 85 } },
    { lookup_value: 'Closed Won', order: 7, metadata: { color: '#22c55e', probability: 100 } },
    { lookup_value: 'Closed Lost', order: 8, metadata: { color: '#ef4444', probability: 0 } },
    { lookup_value: 'Stalled', order: 9, metadata: { color: '#78716c', probability: 20 } },
];

const stageMap = {}; // stage label → ObjectId

for (const stageData of STAGES) {
    let existing = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: stageData.lookup_value });
    if (!existing) {
        existing = await Lookup.create({ lookup_type: 'Stage', ...stageData });
        console.log(`  ✅ Created: ${stageData.lookup_value} → ${existing._id}`);
    } else {
        console.log(`  ⏭️  Exists:  ${stageData.lookup_value} → ${existing._id}`);
    }
    stageMap[stageData.lookup_value] = existing._id;
}

console.log('\n📋 STEP 2: Assigning default stage to leads missing stage...');
const leadsWithoutStage = await Lead.find({
    $or: [
        { stage: { $exists: false } },
        { stage: null }
    ]
}).select('_id stageHistory').lean();

console.log(`  Found ${leadsWithoutStage.length} leads without stage`);

const newStageId = stageMap['New'];
let assigned = 0;

for (const lead of leadsWithoutStage) {
    // Update stageHistory entry label if it was set to 'New' by previous script
    const updateOps = {
        $set: { stage: newStageId, stageChangedAt: new Date() }
    };

    // Fix the first history entry label if already seeded
    if (lead.stageHistory?.length > 0 && lead.stageHistory[0].stage === 'New') {
        // Already correct label, just ensure the stage ref is set
    }

    await Lead.findByIdAndUpdate(lead._id, updateOps);
    assigned++;
}
console.log(`  ✅ Assigned 'New' stage to ${assigned} leads`);

// ─── Step 3: Verify density ──────────────────────────────────────────────────
console.log('\n📋 STEP 3: Verifying density aggregation...');
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
            stageLabel: { $ifNull: [{ $arrayElemAt: ['$stageInfo.lookup_value', 0] }, 'Unknown'] }
        }
    },
    {
        $group: { _id: '$stageLabel', count: { $sum: 1 } }
    }
]);
console.log('  Density result:', JSON.stringify(density));

// ─── Step 4: Summary ──────────────────────────────────────────────────────────
console.log('\n📋 STEP 4: Stage Lookup Summary:');
console.log('  Stage ID Map:', Object.entries(stageMap).map(([k, v]) => `${k}: ${v}`).join('\n    '));

console.log('\n✅ Done! Backend restart not needed — lookups are in DB immediately.');
await mongoose.disconnect();
process.exit(0);
