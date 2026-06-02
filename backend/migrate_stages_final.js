import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority";

const lookupSchema = new mongoose.Schema({
    lookup_type: String,
    lookup_value: String,
    order: Number,
    metadata: mongoose.Schema.Types.Mixed
}, { strict: false, timestamps: true });
const Lookup = mongoose.models.Lookup || mongoose.model('Lookup', lookupSchema);

const leadSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

async function runMigration() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    const STAGES = [
        { lookup_value: 'Incoming', order: 1, metadata: { color: '#94a3b8', probability: 5 } },
        { lookup_value: 'Prospect', order: 2, metadata: { color: '#3b82f6', probability: 10 } },
        { lookup_value: 'Opportunity', order: 3, metadata: { color: '#f59e0b', probability: 40 } },
        { lookup_value: 'Negotiation', order: 4, metadata: { color: '#f97316', probability: 65 } },
        { lookup_value: 'Stalled', order: 5, metadata: { color: '#78716c', probability: 20 } },
        { lookup_value: 'Dormant', order: 6, metadata: { color: '#64748b', probability: 0 } },
        { lookup_value: 'Closed Won', order: 7, metadata: { color: '#22c55e', probability: 100 } },
        { lookup_value: 'Closed Lost', order: 8, metadata: { color: '#ef4444', probability: 0 } }
    ];

    const stageMap = {}; // mapping new stage label to Object ID
    
    // 1. Create or get target stages
    for (const stageData of STAGES) {
        let existing = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: { $regex: new RegExp(`^${stageData.lookup_value}$`, 'i') } });
        if (!existing) {
            existing = await Lookup.create({ lookup_type: 'Stage', ...stageData });
            console.log(`✅ Created Target Stage: ${stageData.lookup_value}`);
        } else {
            // Update order and color
            existing.order = stageData.order;
            existing.metadata = stageData.metadata;
            existing.lookup_value = stageData.lookup_value; // enforce case
            await existing.save();
        }
        stageMap[stageData.lookup_value] = existing._id;
    }

    // 2. Fetch all old stages to map
    const lookups = await Lookup.find({ lookup_type: 'Stage' });
    const oldStageMap = {};
    for (const l of lookups) {
        oldStageMap[l.lookup_value.toLowerCase()] = l;
    }

    const mappingRules = {
        'new': 'Incoming',
        'qualified': 'Prospect',
        'booked': 'Negotiation',
    };

    let totalUpdated = 0;

    // 3. Migrate leads
    for (const [oldLabel, newLabel] of Object.entries(mappingRules)) {
        const oldStage = oldStageMap[oldLabel];
        if (oldStage) {
            const newStageId = stageMap[newLabel];
            
            // Update current stage
            const res = await Lead.updateMany(
                { stage: oldStage._id },
                { $set: { stage: newStageId } }
            );
            
            if (res.modifiedCount > 0) {
                console.log(`➡️ Migrated ${res.modifiedCount} leads from '${oldStage.lookup_value}' to '${newLabel}'`);
                totalUpdated += res.modifiedCount;
            }

            // Also rewrite history so dashboard stats are not broken
            const resHistory = await Lead.updateMany(
                { 'stageHistory.stage': oldStage.lookup_value },
                { $set: { 'stageHistory.$[elem].stage': newLabel } },
                { arrayFilters: [{ 'elem.stage': oldStage.lookup_value }] }
            );
            if (resHistory.modifiedCount > 0) {
                console.log(`  ↪ Rewrote history records for ${resHistory.modifiedCount} leads (${oldStage.lookup_value} -> ${newLabel})`);
            }
        }
    }

    // 4. Delete obsolete lookups
    const toDelete = ['new', 'qualified', 'booked'];
    const deleteIds = [];
    for (const d of toDelete) {
        if (oldStageMap[d]) deleteIds.push(oldStageMap[d]._id);
    }
    
    if (deleteIds.length > 0) {
        const delRes = await Lookup.deleteMany({ _id: { $in: deleteIds } });
        console.log(`🗑️ Deleted ${delRes.deletedCount} obsolete stage lookups.`);
    }

    console.log(`\n🎉 Migration Complete. Total leads updated: ${totalUpdated}`);
    process.exit(0);
}

runMigration().catch(console.error);
