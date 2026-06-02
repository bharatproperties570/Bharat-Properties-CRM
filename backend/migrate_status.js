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

    // 1. Setup Status Lookups
    const STATUSES = [
        { lookup_value: 'New', order: 1, metadata: { color: '#3b82f6' } },
        { lookup_value: 'Contacted', order: 2, metadata: { color: '#8b5cf6' } },
        { lookup_value: 'Working', order: 3, metadata: { color: '#f59e0b' } },
        { lookup_value: 'Stalled', order: 4, metadata: { color: '#78716c' } },
        { lookup_value: 'Dormant', order: 5, metadata: { color: '#64748b' } }
    ];

    const statusMap = {};
    for (const st of STATUSES) {
        let existing = await Lookup.findOne({ lookup_type: 'Status', lookup_value: { $regex: new RegExp(`^${st.lookup_value}$`, 'i') } });
        if (!existing) {
            existing = await Lookup.create({ lookup_type: 'Status', ...st });
            console.log(`✅ Created Status: ${st.lookup_value}`);
        }
        statusMap[st.lookup_value.toLowerCase()] = existing._id;
    }

    // 2. Setup Stage lookups to ensure we can assign fallbacks
    const STAGES = ['Incoming', 'Prospect', 'Opportunity', 'Negotiation', 'Closed Won', 'Closed Lost'];
    const stageMap = {};
    for (const st of STAGES) {
        let existing = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: { $regex: new RegExp(`^${st}$`, 'i') } });
        if (existing) {
            stageMap[st.toLowerCase()] = existing._id;
        }
    }

    // 3. Find old Stalled/Dormant Stage lookups
    const stalledStage = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: { $regex: /^Stalled$/i } });
    const dormantStage = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: { $regex: /^Dormant$/i } });

    const targetStageIds = [];
    if (stalledStage) targetStageIds.push(stalledStage._id);
    if (dormantStage) targetStageIds.push(dormantStage._id);

    let updatedCount = 0;

    if (targetStageIds.length > 0) {
        // Find leads in these stages
        const leads = await Lead.find({ stage: { $in: targetStageIds } }).lean();
        console.log(`Found ${leads.length} leads in Stalled/Dormant stages.`);

        for (const lead of leads) {
            const isStalled = stalledStage && lead.stage.toString() === stalledStage._id.toString();
            const newStatusId = isStalled ? statusMap['stalled'] : statusMap['dormant'];

            // Determine rollback stage from history
            let previousStageLabel = 'Prospect'; // Default fallback
            if (lead.stageHistory && lead.stageHistory.length > 1) {
                // The last entry is probably the transition into Stalled/Dormant.
                // We want the entry *before* that.
                // Reverse the array and look for the first stage that is not Stalled/Dormant.
                const historyRev = [...lead.stageHistory].reverse();
                for (const h of historyRev) {
                    if (h.stage && !h.stage.toLowerCase().includes('stalled') && !h.stage.toLowerCase().includes('dormant')) {
                        previousStageLabel = h.stage;
                        break;
                    }
                }
            }
            
            // Map old labels if they exist in history
            if (previousStageLabel.toLowerCase() === 'new') previousStageLabel = 'Incoming';
            if (previousStageLabel.toLowerCase() === 'qualified') previousStageLabel = 'Prospect';
            if (previousStageLabel.toLowerCase() === 'booked') previousStageLabel = 'Negotiation';

            const newStageId = stageMap[previousStageLabel.toLowerCase()] || stageMap['prospect'];

            await Lead.findByIdAndUpdate(lead._id, {
                $set: {
                    stage: newStageId,
                    status: newStatusId
                }
            });
            updatedCount++;
        }
    }
    console.log(`✅ Migrated ${updatedCount} leads to Status flags.`);

    // 4. Delete the old Stage Lookups
    if (targetStageIds.length > 0) {
        await Lookup.deleteMany({ _id: { $in: targetStageIds } });
        console.log('🗑️ Deleted old Stalled and Dormant Stage Lookups.');
    }
    
    // 5. Update ALL Incoming leads without a status to have 'New' status
    const incomingStageId = stageMap['incoming'];
    if (incomingStageId) {
        const res = await Lead.updateMany(
            { 
                stage: incomingStageId, 
                $or: [{ status: { $exists: false } }, { status: null }] 
            },
            { $set: { status: statusMap['new'] } }
        );
        console.log(`✅ Assigned 'New' status to ${res.modifiedCount} Incoming leads.`);
    }

    console.log('\n🎉 Migration Complete.');
    process.exit(0);
}

runMigration().catch(console.error);
