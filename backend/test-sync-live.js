/**
 * Live DB Test: Lead ↔ Deal Sync Engine
 * Tests the resolveMultiLeadDealStage logic directly against real DB data
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Lead from './models/Lead.js';
import Deal from './models/Deal.js';
import SystemSetting from './src/modules/systemSettings/system.model.js';

const RE_OUTCOME_PRIORITY = [
    'Closed Won', 'Closed (Won)', 'Booked', 'Token Given', 'Final Deal',
    'Negotiation', 'Quote', 'Opportunity', 'Prospect', 'Open', 'Incoming'
];

const resolveMultiLeadDealStage = (leadStages = [], syncRules = [], hasOwnerWithdrawal = false) => {
    if (leadStages.length === 0) return { stage: 'Open', reason: 'No linked leads' };
    const activeRules = [...syncRules].filter(r => r.isActive).sort((a, b) => a.priority - b.priority);
    for (const rule of activeRules) {
        if (rule.condition === 'ACTIVITY' && rule.conditionActivity === 'Owner Withdrawal' && hasOwnerWithdrawal) return { stage: rule.dealStage, reason: rule.dealReason || rule.label };
        if (rule.condition === 'ANY_LEAD' && leadStages.some(s => s === rule.conditionStage)) return { stage: rule.dealStage, reason: rule.label };
        if (rule.condition === 'ALL_LEADS' && leadStages.length > 0 && leadStages.every(s => s === rule.conditionStage)) return { stage: rule.dealStage, reason: rule.label };
    }
    const normalize = s => (s || '').toLowerCase().trim();
    let highestIdx = -1, highestStage = 'Open';
    for (const ls of leadStages) {
        const idx = RE_OUTCOME_PRIORITY.findIndex(p => normalize(p) === normalize(ls));
        if (idx !== -1 && (highestIdx === -1 || idx < highestIdx)) { highestIdx = idx; highestStage = RE_OUTCOME_PRIORITY[idx]; }
    }
    return { stage: highestStage, reason: `Conflict resolution: highest commercial outcome among ${leadStages.length} leads` };
};

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties');
        console.log('\n=== LIVE DB: Lead ↔ Deal Sync Test ===\n');

        // 1. Check if syncRules exist in SystemSetting
        const syncSetting = await SystemSetting.findOne({ key: 'syncRules' }).lean();
        console.log('📋 Admin syncRules in DB:', syncSetting ? `Found (${(syncSetting.value || []).length} rules)` : '❌ NOT FOUND — will use enterprise defaults');
        if (syncSetting?.value) {
            console.log('   Rules:', JSON.stringify(syncSetting.value, null, 2));
        }
        const liveSyncRules = Array.isArray(syncSetting?.value) ? syncSetting.value : [];

        // 2. Fetch a sample of active deals that have linked leads
        const deals = await Deal.find({
            stage: { $nin: ['Closed Won', 'Closed (Won)', 'Closed Lost', 'Closed (Lost)'] },
            leads: { $exists: true, $not: { $size: 0 } }
        }).select('_id stage leads projectName').limit(5).lean();

        console.log(`\n🔍 Found ${deals.length} active deals with linked leads to test:\n`);

        for (const deal of deals) {
            const linkedLeadIds = (deal.leads || []).filter(id => mongoose.Types.ObjectId.isValid(String(id)));
            if (linkedLeadIds.length === 0) continue;

            const linkedLeads = await Lead.find({ _id: { $in: linkedLeadIds } })
                .select('stage firstName lastName')
                .populate('stage', 'lookup_value')
                .lean();

            const leadStages = linkedLeads.map(l =>
                typeof l.stage === 'object' ? l.stage?.lookup_value : l.stage
            ).filter(Boolean);

            if (leadStages.length === 0) continue;

            const { stage: correctStage, reason } = resolveMultiLeadDealStage(leadStages, liveSyncRules, false);
            const inSync = correctStage === deal.stage;

            console.log(`Deal: ${deal.projectName || deal._id}`);
            console.log(`  Current Deal Stage  : ${deal.stage}`);
            console.log(`  Linked Lead Stages  : [${leadStages.join(', ')}]`);
            console.log(`  Computed Correct Stage: ${correctStage}`);
            console.log(`  Resolution Rule     : ${reason}`);
            console.log(`  Status: ${inSync ? '✅ IN SYNC' : '⚠️  OUT OF SYNC — would be corrected by bulk-sync'}`);
            console.log('');
        }

        // 3. Count total out-of-sync deals
        const allDeals = await Deal.find({
            stage: { $nin: ['Closed Won', 'Closed (Won)', 'Closed Lost', 'Closed (Lost)'] }
        }).select('_id stage leads').lean();

        let outOfSyncCount = 0;
        for (const deal of allDeals) {
            const linkedLeadIds = (deal.leads || []).filter(id => mongoose.Types.ObjectId.isValid(String(id)));
            if (linkedLeadIds.length === 0) continue;
            const linkedLeads = await Lead.find({ _id: { $in: linkedLeadIds } }).select('stage').populate('stage', 'lookup_value').lean();
            const leadStages = linkedLeads.map(l => typeof l.stage === 'object' ? l.stage?.lookup_value : l.stage).filter(Boolean);
            if (leadStages.length === 0) continue;
            const { stage: correctStage } = resolveMultiLeadDealStage(leadStages, liveSyncRules, false);
            if (correctStage !== deal.stage) outOfSyncCount++;
        }

        console.log(`\n📊 SUMMARY:`);
        console.log(`  Total Active Deals Scanned  : ${allDeals.length}`);
        console.log(`  Deals Out-of-Sync           : ${outOfSyncCount}`);
        console.log(`  Deals Correctly Synced      : ${allDeals.length - outOfSyncCount}`);
        console.log(`\n💡 Run POST /api/stage-engine/deals/bulk-sync to auto-correct ${outOfSyncCount} deals.\n`);

        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
};
run();
