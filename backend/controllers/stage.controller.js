/**
 * Stage Engine Controller — MongoDB Integration
 *
 * All endpoints read/write real MongoDB data.
 * No mock/dummy data anywhere.
 *
 * Routes mounted at: /api/stage-engine
 */

import Lead from '../models/Lead.js';
import Deal from "../models/Deal.js";
import Activity from "../models/Activity.js";
import Lookup from '../models/Lookup.js';
import AuditLog from '../models/AuditLog.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import mongoose from 'mongoose';
import { getVisibilityFilter } from "../utils/visibility.js";
import { toSqFt } from '../utils/pricingUtils.js';

// ── Enterprise: Real-Estate Multi-Lead Priority Matrix ────────────────────────
// In real estate, commercial outcomes (Token Given, Booked) always win.
// This is separate from the admin-configurable sync rules and acts as a
// hard enforcement layer to prevent incorrect deal stage computation.
const RE_OUTCOME_PRIORITY = [
    'Closed Won', 'Closed (Won)', 'Booked', 'Token Given', 'Final Deal',
    'Negotiation', 'Quote', 'Opportunity', 'Prospect', 'Open', 'Incoming'
];

/**
 * Real-Estate Enterprise: Resolves the correct deal stage from multiple lead stages.
 * Uses admin syncRules first, falls back to RE_OUTCOME_PRIORITY matrix.
 */
const resolveMultiLeadDealStage = (leadStages = [], syncRules = [], hasOwnerWithdrawal = false) => {
    if (leadStages.length === 0) return { stage: 'Open', reason: 'No linked leads' };

    // Step 1: Check admin-configured rules (priority order)
    const activeRules = [...syncRules].filter(r => r.isActive).sort((a, b) => a.priority - b.priority);
    for (const rule of activeRules) {
        if (rule.condition === 'ACTIVITY' && rule.conditionActivity === 'Owner Withdrawal' && hasOwnerWithdrawal) {
            return { stage: rule.dealStage, reason: rule.dealReason || rule.label, ruleId: rule.id };
        }
        if (rule.condition === 'ANY_LEAD' && leadStages.some(s => s === rule.conditionStage)) {
            return { stage: rule.dealStage, reason: rule.label, ruleId: rule.id };
        }
        if (rule.condition === 'ALL_LEADS' && leadStages.length > 0 && leadStages.every(s => s === rule.conditionStage)) {
            return { stage: rule.dealStage, reason: rule.label, ruleId: rule.id };
        }
    }

    // Step 2: Fallback to RE priority matrix (highest commercial outcome wins)
    const normalize = s => (s || '').toLowerCase().trim();
    let highestIdx = -1;
    let highestStage = 'Open';
    for (const ls of leadStages) {
        const idx = RE_OUTCOME_PRIORITY.findIndex(p => normalize(p) === normalize(ls));
        if (idx !== -1 && (highestIdx === -1 || idx < highestIdx)) {
            highestIdx = idx;
            highestStage = RE_OUTCOME_PRIORITY[idx];
        }
    }
    return { stage: highestStage, reason: `Conflict resolution: highest commercial outcome among ${leadStages.length} leads`, ruleId: null };
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve a stage string to Lookup ObjectId (for Lead model compatibility).
 * Lead.stage is a Lookup ref; Deal.stage is a plain string.
 */
const resolveStageId = async (stageName) => {
    if (!stageName) return null;
    if (mongoose.Types.ObjectId.isValid(stageName)) return stageName;
    let lookup = await Lookup.findOne({
        lookup_type: 'Stage',
        lookup_value: { $regex: new RegExp(`^${stageName}$`, 'i') }
    });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: 'Stage', lookup_value: stageName });
    }
    return lookup._id;
};

/**
 * Resolve a status string to Lookup ObjectId (for Lead model compatibility).
 */
const resolveStatusId = async (statusName) => {
    if (!statusName) return null;
    if (mongoose.Types.ObjectId.isValid(statusName)) return statusName;
    let lookup = await Lookup.findOne({
        lookup_type: 'Status',
        lookup_value: { $regex: new RegExp(`^${statusName}$`, 'i') }
    });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: 'Status', lookup_value: statusName });
    }
    return lookup._id;
};

/**
 * Get the string value of a stage, whether it's a Lookup ref or a plain string.
 */
const resolveStageValue = async (stageField) => {
    if (!stageField) return 'New';
    if (typeof stageField === 'string') return stageField;
    // It's an ObjectId or populated object
    if (stageField.lookup_value) return stageField.lookup_value;
    if (mongoose.Types.ObjectId.isValid(stageField)) {
        const lookup = await Lookup.findById(stageField).select('lookup_value').lean();
        return lookup?.lookup_value || 'New';
    }
    return String(stageField);
};

/**
 * Write a stage history entry to a Lead or Deal.
 * Closes the previous open entry (sets exitedAt + daysInStage).
 */
const writeStageHistory = async (Model, docId, newStageStr, opts = {}) => {
    const doc = await Model.findById(docId).select('stageHistory stageChangedAt').lean();
    if (!doc) return;

    const now = new Date();
    const historyPatch = [];

    // Close the last open entry (no exitedAt)
    if (doc.stageHistory?.length > 0) {
        const lastEntry = doc.stageHistory[doc.stageHistory.length - 1];
        if (!lastEntry.exitedAt) {
            const enteredAt = new Date(lastEntry.enteredAt || doc.stageChangedAt || doc.createdAt || now);
            const daysInStage = Math.floor((now - enteredAt) / 86400000);
            historyPatch.push({
                $set: { [`stageHistory.${doc.stageHistory.length - 1}.exitedAt`]: now }
            });
            historyPatch.push({
                $set: { [`stageHistory.${doc.stageHistory.length - 1}.daysInStage`]: daysInStage }
            });
        }
    }

    // Push new entry
    const newEntry = {
        stage: newStageStr,
        enteredAt: now,
        triggeredBy: opts.triggeredBy || 'activity',
        activityType: opts.activityType || null,
        outcome: opts.outcome || null,
        reason: opts.reason || null,
        activityId: opts.activityId ? new mongoose.Types.ObjectId(opts.activityId) : null,
        triggeredByUser: opts.userId ? new mongoose.Types.ObjectId(opts.userId) : null,
    };

    await Model.findByIdAndUpdate(docId, {
        $push: { stageHistory: newEntry },
        $set: { stageChangedAt: now }
    });
};

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * PUT /api/stage-engine/leads/:id/stage
 *
 * Update lead stage with full history tracking.
 * Accepts: { stage, triggeredBy, activityType, outcome, activityId, reason, userId }
 */
export const updateLeadStage = async (req, res) => {
    try {
        const { id } = req.params;
        const { stage: newStage, triggeredBy, activityType, outcome, activityId, reason, userId } = req.body;

        if (!newStage) return res.status(400).json({ success: false, error: 'stage is required' });
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, error: 'Invalid lead ID' });

        const lead = await Lead.findById(id).select('stage status stageHistory stageChangedAt').lean();
        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

        // Handle terminal states properly
        let targetStage = newStage;
        let targetStatus = null;
        
        const terminalStatuses = ['Won', 'Lost', 'Unqualified'];
        // If the newStage is actually a terminal status, the real pipeline stage is "Closed".
        if (terminalStatuses.includes(newStage)) {
            targetStage = 'Closed';
            targetStatus = newStage;
        }

        // Resolve the incoming stage string to a Lookup ObjectId
        const stageId = await resolveStageId(targetStage);
        
        // Resolve status ID if we mapped to a terminal status
        let statusId = undefined;
        if (targetStatus) {
            statusId = await resolveStatusId(targetStatus);
        }

        // Get current stage string (for history label)
        const currentStageValue = await resolveStageValue(lead.stage);

        // Write stage history before applying the update
        await writeStageHistory(Lead, id, targetStage, {
            triggeredBy: triggeredBy || 'activity',
            activityType,
            outcome,
            activityId,
            reason: reason || (targetStatus ? `Moved to terminal status: ${targetStatus}` : null),
            userId
        });
        
        // Build the update query
        const updateSet = {
            stage: stageId,
            stageChangedAt: new Date(),
            lastActivityAt: outcome ? new Date() : undefined
        };
        
        if (statusId) {
            updateSet.status = statusId;
        }

        // Update the stage itself + stageChangedAt
        const updated = await Lead.findByIdAndUpdate(
            id,
            { $set: updateSet },
            { new: true }
        ).populate([
            { path: 'stage', select: 'lookup_value' },
            { path: 'status', select: 'lookup_value' },
            { path: 'stageHistory.activityId' }
        ]);

        if (currentStageValue !== targetStage) {
            await AuditLog.logEntityUpdate(
                'stage_changed',
                'lead',
                id,
                `${lead.firstName || ''} ${lead.lastName || ''}`,
                userId,
                { before: currentStageValue, after: targetStage },
                `Lead stage shifted from ${currentStageValue} to ${targetStage}${reason ? ' - ' + reason : ''}`
            );
        }

        res.json({
            success: true,
            previousStage: currentStageValue,
            stage: targetStage,
            status: targetStatus,
            stageChangedAt: updated.stageChangedAt,
            stageHistoryCount: updated.stageHistory?.length || 0,
            lead: updated
        });
    } catch (err) {
        console.error('[StageEngine] updateLeadStage error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * Internal helper to sync deal stage from its linked leads' stages.
 * Applies conflict rules: highest lead stage wins; if any lead is Qualified+ → Deal moves up.
 */
export const internalSyncDealStage = async (dealId, leadStages = [], opts = {}) => {
    const { reason, userId, explicitStage, hasOwnerWithdrawal = false } = opts;

    if (!mongoose.Types.ObjectId.isValid(dealId)) return { success: false, error: 'Invalid deal ID' };

    const deal = await Deal.findById(dealId).select('stage stageHistory stageChangedAt').lean();
    if (!deal) return { success: false, error: 'Deal not found' };

    // ── Enterprise Fix: Fetch live admin syncRules from SystemSettings ──
    let liveSyncRules = [];
    try {
        const syncSetting = await SystemSetting.findOne({ key: 'syncRules' }).lean();
        if (Array.isArray(syncSetting?.value)) liveSyncRules = syncSetting.value;
    } catch (e) {
        console.warn('[StageEngine] Could not fetch syncRules from SystemSetting, using defaults.', e.message);
    }

    // ── Enterprise Fix: Use multi-lead priority matrix instead of hardcoded map ──
    let computedDealStage = explicitStage || deal.stage || 'Open';
    let syncReason = reason;

    if (leadStages.length > 0) {
        const { stage: resolved, reason: resolvedReason } = resolveMultiLeadDealStage(
            leadStages,
            liveSyncRules,
            hasOwnerWithdrawal
        );
        computedDealStage = resolved;
        syncReason = reason || resolvedReason;
    }

    // No-op if stage unchanged
    if (computedDealStage === deal.stage) {
        return { success: true, changed: false, stage: computedDealStage, reason: 'Stage unchanged' };
    }

    // Write deal stage history
    await writeStageHistory(Deal, dealId, computedDealStage, {
        triggeredBy: 'system',
        reason: syncReason || `Synced from lead stages: [${leadStages.join(', ')}]`,
        userId
    });

    const updated = await Deal.findByIdAndUpdate(
        dealId,
        {
            $set: {
                stage: computedDealStage,
                stageChangedAt: new Date(),
                stageSyncReason: syncReason
            }
        },
        { new: true }
    );

    return {
        success: true,
        changed: true,
        previousStage: deal.stage,
        stage: computedDealStage,
        stageSyncReason: syncReason,
        deal: updated
    };
};

/**
 * PUT /api/stage-engine/deals/:id/sync
 *
 * Sync deal stage from its linked leads' stages.
 * Applies conflict rules: highest lead stage wins; if any lead is Qualified+ → Deal moves up.
 * Body: { leadStages: ['Negotiation', 'Qualified'], reason, userId }
 */
export const syncDealStage = async (req, res) => {
    try {
        const { id } = req.params;
        const { leadStages = [], reason, userId, stage: explicitStage, hasOwnerWithdrawal = false } = req.body;

        const result = await internalSyncDealStage(id, leadStages, {
            reason, userId, explicitStage, hasOwnerWithdrawal
        });

        if (!result.success) {
            return res.status(result.error === 'Deal not found' ? 404 : 400).json(result);
        }

        res.json(result);
    } catch (err) {
        console.error('[StageEngine] syncDealStage error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/stage-engine/deals/bulk-sync
 *
 * Enterprise: Scan ALL active deals in the database and self-heal
 * any deals whose stage is out-of-sync with their linked leads.
 * Designed to be called by a nightly CRON job or by an admin.
 */
export const bulkSyncDeals = async (req, res) => {
    try {
        console.log('[BulkSync] Starting enterprise bulk deal sync...');

        // Fetch live admin syncRules
        let liveSyncRules = [];
        try {
            const syncSetting = await SystemSetting.findOne({ key: 'syncRules' }).lean();
            if (Array.isArray(syncSetting?.value)) liveSyncRules = syncSetting.value;
        } catch (e) {
            console.warn('[BulkSync] Could not fetch syncRules, using enterprise defaults.');
        }

        // Fetch all non-terminal deals
        const TERMINAL_STAGES = ['Closed Won', 'Closed (Won)', 'Closed Lost', 'Closed (Lost)'];
        const deals = await Deal.find({
            stage: { $nin: TERMINAL_STAGES }
        }).select('_id stage leads projectName stageChangedAt').lean();

        let updatedCount = 0;
        let skippedCount = 0;
        const updates = [];

        for (const deal of deals) {
            try {
                // Fetch all linked lead stages
                const linkedLeadIds = (deal.leads || []).filter(id => mongoose.Types.ObjectId.isValid(id));
                if (linkedLeadIds.length === 0) { skippedCount++; continue; }

                const linkedLeads = await Lead.find({ _id: { $in: linkedLeadIds } })
                    .select('stage')
                    .populate('stage', 'lookup_value')
                    .lean();

                const leadStages = linkedLeads.map(l =>
                    typeof l.stage === 'object' ? l.stage?.lookup_value : l.stage
                ).filter(Boolean);

                if (leadStages.length === 0) { skippedCount++; continue; }

                const { stage: correctStage, reason } = resolveMultiLeadDealStage(
                    leadStages, liveSyncRules, false
                );

                if (correctStage === deal.stage) { skippedCount++; continue; }

                // Update the deal
                await Deal.findByIdAndUpdate(deal._id, {
                    $set: {
                        stage: correctStage,
                        stageChangedAt: new Date(),
                        stageSyncReason: `[BulkSync] ${reason}`
                    }
                });
                updates.push({ dealId: deal._id, from: deal.stage, to: correctStage, reason });
                updatedCount++;
                console.log(`[BulkSync] Deal ${deal._id} corrected: ${deal.stage} → ${correctStage}`);
            } catch (e) {
                console.error(`[BulkSync] Failed for deal ${deal._id}:`, e.message);
            }
        }

        console.log(`[BulkSync] Complete. Updated: ${updatedCount}, Skipped: ${skippedCount}`);
        res.json({ success: true, updatedCount, skippedCount, totalScanned: deals.length, updates });

    } catch (err) {
        console.error('[BulkSync] Fatal error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};



/**
 * GET /api/stage-engine/leads/:id/history
 *
 * Full stage history timeline for a lead.
 */
export const getLeadStageHistory = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, error: 'Invalid lead ID' });

        const lead = await Lead.findById(id)
            .select('stage stageHistory stageChangedAt firstName lastName mobile')
            .populate('stage', 'lookup_value')
            .lean();

        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

        const currentStage = lead.stage?.lookup_value || lead.stage || 'New';

        res.json({
            success: true,
            leadId: id,
            leadName: `${lead.firstName} ${lead.lastName || ''}`.trim(),
            currentStage,
            stageChangedAt: lead.stageChangedAt,
            stageHistory: lead.stageHistory || [],
            totalStageChanges: lead.stageHistory?.length || 0
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/stage-engine/deals/:id/history
 *
 * Full stage history timeline for a deal.
 */
export const getDealStageHistory = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, error: 'Invalid deal ID' });

        const deal = await Deal.findById(id)
            .select('stage stageHistory stageChangedAt stageSyncReason dealId unitNo')
            .lean();

        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        res.json({
            success: true,
            dealId: id,
            dealRef: deal.dealId || deal.unitNo,
            currentStage: deal.stage,
            stageChangedAt: deal.stageChangedAt,
            stageSyncReason: deal.stageSyncReason,
            stageHistory: deal.stageHistory || [],
            totalStageChanges: deal.stageHistory?.length || 0
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/stage-engine/density
 *
 * Stage density metrics from real MongoDB data.
 * Returns per-stage: count, conversionRate, avgDays, isBottleneck.
 */
export const getStageDensity = async (req, res) => {
    try {
        const entityType = req.query.entityType === 'deal' ? 'deal' : 'lead';

        let densityStats;
        let STAGE_ORDER = [];

        if (entityType === 'deal') {
            const dealDensity = await Deal.aggregate([
                {
                    $project: {
                        stageLabel: { $ifNull: ['$stage', 'Open'] },
                        stageChangedAt: 1,
                        createdAt: 1
                    }
                },
                {
                    $group: {
                        _id: '$stageLabel',
                        count: { $sum: 1 },
                        avgDaysInStage: {
                            $avg: {
                                $dateDiff: {
                                    startDate: { $ifNull: ['$stageChangedAt', '$createdAt'] },
                                    endDate: '$$NOW',
                                    unit: 'day'
                                }
                            }
                        }
                    }
                },
                { $sort: { count: -1 } }
            ]);
            densityStats = dealDensity;
            STAGE_ORDER = ['Open', 'Quote', 'Negotiation', 'Booked', 'Closed', 'Stalled', 'Dormant'];
        } else {
            const leadDensity = await Lead.aggregate([
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
                        stageChangedAt: 1,
                        createdAt: 1
                    }
                },
                {
                    $group: {
                        _id: '$stageLabel',
                        count: { $sum: 1 },
                        avgDaysInStage: {
                            $avg: {
                                $dateDiff: {
                                    startDate: { $ifNull: ['$stageChangedAt', '$createdAt'] },
                                    endDate: '$$NOW',
                                    unit: 'day'
                                }
                            }
                        }
                    }
                },
                { $sort: { count: -1 } }
            ]);
            densityStats = leadDensity;
            STAGE_ORDER = ['New', 'Prospect', 'Qualified', 'Opportunity', 'Negotiation', 'Booked', 'Closed Won', 'Closed Lost', 'Stalled'];
        }

        const total = densityStats.reduce((sum, s) => sum + s.count, 0) || 1;

        const density = densityStats.map(entry => {
            const stageIdx = STAGE_ORDER.indexOf(entry._id);
            const nextStageCount = stageIdx >= 0 && stageIdx < STAGE_ORDER.length - 2
                ? densityStats.find(s => s._id === STAGE_ORDER[stageIdx + 1])?.count || 0
                : null;

            const conversionRate = nextStageCount !== null && entry.count > 0
                ? Math.round((nextStageCount / entry.count) * 100)
                : null;

            const avgDays = Math.round(entry.avgDaysInStage || 0);

            // Bottleneck: avg days > 14 with good count
            const isBottleneck = avgDays > 14 && entry.count > 2;

            return {
                stage: entry._id,
                count: entry.count,
                percentage: Math.round((entry.count / total) * 100),
                conversionRate,
                avgDaysInStage: avgDays,
                isBottleneck
            };
        });

        // Overall funnel stats
        let newCount = 0;
        let bookedCount = 0;
        let overallConversion = 0;

        if (entityType === 'deal') {
            newCount = densityStats.find(s => s._id === 'Open')?.count || 0;
            bookedCount = densityStats.find(s => s._id === 'Closed Won')?.count || 0;
            overallConversion = newCount > 0 ? Math.round((bookedCount / newCount) * 100) : 0;
        } else {
            newCount = densityStats.find(s => s._id === 'New')?.count || 0;
            bookedCount = densityStats.find(s => s._id === 'Booked')?.count || 0;
            overallConversion = newCount > 0 ? Math.round((bookedCount / newCount) * 100) : 0;
        }

        res.json({
            success: true,
            totalLeads: total,
            overallConversionRate: overallConversion,
            density,
            generatedAt: new Date()
        });
    } catch (err) {
        console.error('[StageEngine] getStageDensity error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/stage-engine/stalled
 *
 * All stalled deals from MongoDB:
 * - Deal stage = Negotiation AND stageChangedAt > X days
 * - OR no activity for > Y days
 * Query params: ?daysSinceStageChange=21&daysNoActivity=14
 */
export const getStalledDeals = async (req, res) => {
    try {
        const stalledDayThreshold = parseInt(req.query.daysSinceStageChange) || 21;
        const noActivityThreshold = parseInt(req.query.daysNoActivity) || 14;

        const stalledCutoff = new Date(Date.now() - stalledDayThreshold * 86400000);
        const activityCutoff = new Date(Date.now() - noActivityThreshold * 86400000);

        // 1. Deals stuck in Negotiation for too long
        const stuckDeals = await Deal.find({
            stage: 'Negotiation',
            stageChangedAt: { $lt: stalledCutoff },
            $or: [
                { 'closingDetails.isClosed': false },
                { 'closingDetails.isClosed': { $exists: false } }
            ]
        })
            .select('dealId unitNo projectName stage stageChangedAt lastActivityAt assignedTo price')
            .populate('assignedTo', 'fullName email')
            .lean();

        // 2. Any active deal with no recent activity
        const inactiveDeals = await Deal.find({
            stage: { $nin: ['Closed', 'Cancelled', 'Closed Won', 'Closed Lost'] },
            $or: [
                { lastActivityAt: { $lt: activityCutoff } },
                { lastActivityAt: { $exists: false } }
            ]
        })
            .select('dealId unitNo projectName stage stageChangedAt lastActivityAt assignedTo price')
            .populate('assignedTo', 'fullName email')
            .lean();

        // Merge and deduplicate
        const allIds = new Set();
        const allStalled = [...stuckDeals, ...inactiveDeals].filter(d => {
            if (allIds.has(d._id.toString())) return false;
            allIds.add(d._id.toString());
            return true;
        });

        const enriched = allStalled.map(deal => {
            const daysSinceStageChange = deal.stageChangedAt
                ? Math.floor((Date.now() - new Date(deal.stageChangedAt)) / 86400000)
                : null;
            const daysSinceActivity = deal.lastActivityAt
                ? Math.floor((Date.now() - new Date(deal.lastActivityAt)) / 86400000)
                : null;

            let severity = 'warning';
            if (daysSinceStageChange > 30 || daysSinceActivity > 21) severity = 'critical';

            return {
                ...deal,
                daysSinceStageChange,
                daysSinceActivity,
                severity,
                suggestedAction: severity === 'critical'
                    ? 'Immediate follow-up required or mark as lost'
                    : 'Schedule a call or send an offer update'
            };
        });

        res.json({
            success: true,
            count: enriched.length,
            stalledDeals: enriched,
            thresholds: { daysSinceStageChange: stalledDayThreshold, daysNoActivity: noActivityThreshold },
            generatedAt: new Date()
        });
    } catch (err) {
        console.error('[StageEngine] getStalledDeals error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/stage-engine/health/:dealId
 *
 * Deal health score computed from real activities in MongoDB.
 * No hardcoded data.
 */
export const getDealHealth = async (req, res) => {
    try {
        const { dealId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(dealId)) return res.status(400).json({ success: false, error: 'Invalid deal ID' });

        const deal = await Deal.findById(dealId).select('stage stageChangedAt lastActivityAt price assignedTo').lean();
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        // Fetch real recent activities for this deal (last 60 days)
        const activityCutoff = new Date(Date.now() - 60 * 86400000);
        const activities = await Activity.find({
            $or: [
                { entityId: dealId, entityType: { $regex: /deal/i } },
                { 'relatedTo.id': dealId }
            ],
            createdAt: { $gte: activityCutoff }
        }).select('type status details completedAt createdAt updatedAt').lean();

        // Stage score (Aligned with 5-stage Enterprise Pipeline)
        const STAGE_SCORES = {
            'Open': 10, 'Quote': 30, 'Negotiation': 65, 'Booked': 85,
            'Closed': 100, 'Closed Lost': 0, 'Stalled': 20, 'Dormant': 0
        };
        const stageScore = STAGE_SCORES[deal.stage] || 10;

        // Activity score: outcome quality + recency
        const POSITIVE_KEYWORDS = ['interested', 'connected', 'accepted', 'conducted', 'visited', 'positive', 'agreed', 'shortlisted', 'follow up', 'booked', 'offer accepted'];
        const NEGATIVE_KEYWORDS = ['not interested', 'rejected', 'no answer', 'cancelled', 'no show', 'did not visit', 'lost', 'withdrawn', 'no response'];
        const now = Date.now();

        let activityRaw = 0;
        activities.forEach(act => {
            if (act.status !== 'Completed' && act.status !== 'completed') return;
            const completedAt = act.completedAt || act.updatedAt || act.createdAt;
            const daysAgo = completedAt ? Math.floor((now - new Date(completedAt)) / 86400000) : 30;
            const multiplier = daysAgo <= 7 ? 1.5 : daysAgo <= 30 ? 1.0 : 0.5;
            const outcome = (
                act.details?.meetingOutcomeStatus || act.details?.callOutcome ||
                act.details?.completionResult || act.details?.mailStatus || ''
            ).toLowerCase();
            let points = 3;
            if (POSITIVE_KEYWORDS.some(k => outcome.includes(k))) points = 10;
            else if (NEGATIVE_KEYWORDS.some(k => outcome.includes(k))) points = -5;
            const typeBonus = act.type === 'Site Visit' ? 5 : act.type === 'Meeting' ? 3 : act.type === 'Call' ? 1 : 0;
            activityRaw += (points + typeBonus) * multiplier;
        });
        const activityScore = Math.max(0, Math.min(25, Math.round(activityRaw)));

        return res.json({
            success: true,
            dealId,
            stage: deal.stage,
            stageScore,
            activityScore,
            lastActivityDaysAgo: deal.lastActivityAt ? Math.floor((now - new Date(deal.lastActivityAt)) / 86400000) : null
        });
    } catch (err) {
        console.error('[StageEngine] getDealHealth error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};


/**
 * POST /api/stage-engine/bulk-recalc
 *
 * Admin-only: Recalculate all active leads' lastActivityAt from Activity collection.
 * Useful after data migration or bulk import.
 * Body: { dryRun: bool }
 */
export const bulkRecalcStages = async (req, res) => {
    try {
        const { dryRun = false } = req.body;

        // Get all active leads
        const leads = await Lead.find({}).select('_id stageChangedAt lastActivityAt').lean();

        const results = { updated: 0, skipped: 0, errors: [] };

        for (const lead of leads) {
            try {
                // Find the latest activity for this lead
                const latestActivity = await Activity.findOne({
                    entityId: lead._id.toString()
                }).sort({ createdAt: -1 }).select('createdAt').lean();

                if (!latestActivity) { results.skipped++; continue; }

                const lastActivityAt = latestActivity.createdAt;

                if (!dryRun) {
                    await Lead.findByIdAndUpdate(lead._id, { $set: { lastActivityAt } });
                }
                results.updated++;
            } catch (err) {
                results.errors.push({ leadId: lead._id, error: err.message });
            }
        }

        res.json({
            success: true,
            dryRun,
            totalLeads: leads.length,
            ...results
        });
    } catch (err) {
        console.error('[StageEngine] bulkRecalcStages error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/stage-engine/leads/scores
 *
 * Bulk lightweight score for all leads — optimised for list views.
 */
export const getLeadScores = async (req, res) => {
    try {
        const leadQuery = {};
        if (req.query.leadId && mongoose.Types.ObjectId.isValid(req.query.leadId)) {
            leadQuery._id = req.query.leadId;
        }

        const leads = await Lead.find(leadQuery)
            .select('_id intent_index leadScore')
            .lean();

        const scores = {};

        for (const lead of leads) {
            const finalScore = lead.leadScore || lead.intent_index || 50;
            
            let color = '#64748B'; // Default grey
            let label = 'Cold';
            
            if (finalScore >= 81) {
                color = '#7C3AED';
                label = 'Super Hot';
            } else if (finalScore >= 61) {
                color = '#EF4444';
                label = 'Hot';
            } else if (finalScore >= 31) {
                color = '#F59E0B';
                label = 'Warm';
            }

            scores[lead._id.toString()] = {
                score: finalScore,
                color,
                label
            };
        }

        res.json({ success: true, scores });
    } catch (err) {
        console.error('[StageEngine] getLeadScores error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/stage-engine/deals/scores
 *
 * Bulk lightweight score for all deals — optimised for list views.
 * Formula: stageWeight + activityRecency + stageHistoryDepth
 * Returns: { success, scores: { dealId: { score, color, label } } }
 */
export const getDealScores = async (req, res) => {
    try {
        const SystemSetting = mongoose.model('SystemSetting');
        const dealRulesSetting = await SystemSetting.findOne({ key: 'dealScoringRules' }).lean();
        
        // --- SENIOR PROFESSIONAL DEFAULTS (Sync with PropertyConfigContext) ---
        const DEFAULT_RULES = {
            stageWeights: {
                incoming: { label: 'Incoming', points: 10 },
                prospect: { label: 'Prospect', points: 20 },
                opportunity: { label: 'Opportunity', points: 40 },
                negotiation: { label: 'Negotiation', points: 60 },
                closed: { label: 'Closed', points: 100 }
            },
            activityRecency: {
                last24h: { points: 15 },
                last3d: { points: 10 },
                last7d: { points: 5 },
                noActivity7d: { points: -10 },
                hotThresholdDays: 1,
                warmThresholdDays: 3,
                coldThresholdDays: 7
            },
            historyDepth: {
                interactions5Plus: { points: 10 },
                interactions10Plus: { points: 20 },
                meetingsDone: { points: 15 },
                interactionsSomeThreshold: 5,
                interactionsManyThreshold: 10
            }
        };

        const dealRules = dealRulesSetting?.value || DEFAULT_RULES;
        
        // Deep merge weights to handle partial configs
        const stageWeights = { ...DEFAULT_RULES.stageWeights, ...(dealRules.stageWeights || {}) };
        const activityRules = { ...DEFAULT_RULES.activityRecency, ...(dealRules.activityRecency || {}) };
        const historyRules = { ...DEFAULT_RULES.historyDepth, ...(dealRules.historyDepth || {}) };

        const getDealStageWeight = (stage) => {
            const rawStage = String(stage || 'Open');
            const key = rawStage.toLowerCase().replace(/\s+/g, '');
            
            // Try matching by normalized key
            const foundKey = Object.keys(stageWeights).find(k => k.toLowerCase().replace(/\s+/g, '') === key);
            if (foundKey) {
                const weight = stageWeights[foundKey];
                return (typeof weight === 'object' ? weight.points : weight) || 20;
            }
            
            return 20; // Absolute fallback
        };

        // Support ?dealId= filter (for detail page)
        const visibilityFilter = await getVisibilityFilter(req.user);
        let dealQuery = { 
            ...visibilityFilter,
            stage: { $nin: ['Closed', 'Cancelled', 'Closed Won', 'Closed Lost'] } 
        };
        
        if (req.query.dealId && mongoose.Types.ObjectId.isValid(req.query.dealId)) {
            dealQuery._id = req.query.dealId;
        }

        const deals = await Deal.find(dealQuery)
            .select('_id stage history lastActivityAt createdAt price size sizeUnit location subCategory ratePerUnit')
            .populate('subCategory', 'lookup_value')
            .populate('location', 'lookup_value')
            .lean();
            
        const dealIds = deals.map(d => d._id);
        const activityStats = await Activity.aggregate([
            { $match: { 
                entityId: { $in: dealIds }, 
                entityType: { $regex: /deal/i }, 
                status: { $regex: /completed/i } 
            } },
            { $group: {
                _id: "$entityId",
                total: { $sum: 1 },
                meetings: { $sum: { $cond: [{ $in: ["$type", ["Meeting", "Site Visit", "Meeting Scheduled"]] }, 1, 0] } }
            }}
        ]);
        const activityStatsMap = new Map(activityStats.map(s => [s._id.toString(), s]));
            
        // 3. Market Gap Integration
        const uniqueLookupIds = new Set();
        deals.forEach(d => {
            if (d.location && mongoose.Types.ObjectId.isValid(d.location)) uniqueLookupIds.add(d.location.toString());
            if (d.subCategory && mongoose.Types.ObjectId.isValid(d.subCategory)) uniqueLookupIds.add(d.subCategory.toString());
        });
        
        const lookupMap = new Map();
        if (uniqueLookupIds.size > 0) {
            const Lookup = mongoose.model('Lookup');
            const lookups = await Lookup.find({ _id: { $in: Array.from(uniqueLookupIds) } }).lean();
            lookups.forEach(l => lookupMap.set(l._id.toString(), l.lookup_value));
        }

        const uniqueParams = new Set();
        deals.forEach(d => {
            let locVal = d.location;
            if (locVal && mongoose.Types.ObjectId.isValid(locVal)) locVal = lookupMap.get(locVal.toString()) || locVal.toString();
            else if (typeof locVal === 'object' && locVal?.lookup_value) locVal = locVal.lookup_value;

            let subCatVal = d.subCategory;
            if (subCatVal && mongoose.Types.ObjectId.isValid(subCatVal)) subCatVal = lookupMap.get(subCatVal.toString()) || subCatVal.toString();
            else if (typeof subCatVal === 'object' && subCatVal?.lookup_value) subCatVal = subCatVal.lookup_value;

            if (locVal && subCatVal && typeof locVal === 'string' && typeof subCatVal === 'string') {
                uniqueParams.add(`${locVal}|${subCatVal}`);
            }
        });

        const benchmarkMap = new Map();
        if (uniqueParams.size > 0) {
            const PricingBenchmark = mongoose.model('PricingBenchmark');
            const queries = Array.from(uniqueParams).map(param => {
                const [loc, subCat] = param.split('|');
                return { location: loc, subCategory: subCat, period: 'trailing-90d' };
            });
            if (queries.length > 0) {
                const benchmarks = await PricingBenchmark.find({ $or: queries }).lean();
                benchmarks.forEach(bm => {
                    benchmarkMap.set(`${bm.location}|${bm.subCategory}`, bm);
                });
            }
        }

        const scores = {};
        const now = new Date();

        // Recency thresholds (Default: 1, 3, 7 days)
        const thresholds = {
            hot: activityRules.hotThresholdDays || 1,
            warm: activityRules.warmThresholdDays || 3,
            cold: activityRules.coldThresholdDays || 7,
            manyInteractions: historyRules.interactionsManyThreshold || 10,
            someInteractions: historyRules.interactionsSomeThreshold || 5
        };

        deals.forEach(deal => {
            const stageWeight = getDealStageWeight(deal.stage);
            const stats = activityStatsMap.get(deal._id.toString()) || { total: 0, meetings: 0 };
            
            // 1. Activity Momentum (ActivityRecency)
            let activityBonus = 0;
            const lastActivity = deal.lastActivityAt ? new Date(deal.lastActivityAt) : new Date(deal.createdAt);
            const daysSinceActivity = (now - lastActivity) / (1000 * 60 * 60 * 24);

            if (daysSinceActivity < thresholds.hot) activityBonus = activityRules.last24h?.points || 15;
            else if (daysSinceActivity < thresholds.warm) activityBonus = activityRules.last3d?.points || 10;
            else if (daysSinceActivity < thresholds.cold) activityBonus = activityRules.last7d?.points || 5;
            else if (daysSinceActivity >= thresholds.cold) activityBonus = activityRules.noActivity7d?.points || -10;

            // 2. History Depth (Functional Interaction Tracking)
            let historyBonus = 0;
            const interactionCount = stats.total;
            if (interactionCount >= thresholds.manyInteractions) historyBonus = historyRules.interactions10Plus?.points || 20;
            else if (interactionCount >= thresholds.someInteractions) historyBonus = historyRules.interactions5Plus?.points || 10;
            
            // Check for meetings
            if (stats.meetings > 0) historyBonus += (historyRules.meetingsDone?.points || 15);

            // 3. Market Pricing Gap (Pricing Intelligence Option 4)
            let marketGapPct = null;
            let gapBonus = 0;
            
            let locVal = deal.location;
            if (locVal && mongoose.Types.ObjectId.isValid(locVal)) locVal = lookupMap.get(locVal.toString()) || locVal.toString();
            else if (typeof locVal === 'object' && locVal?.lookup_value) locVal = locVal.lookup_value;

            let subCatVal = deal.subCategory;
            if (subCatVal && mongoose.Types.ObjectId.isValid(subCatVal)) subCatVal = lookupMap.get(subCatVal.toString()) || subCatVal.toString();
            else if (typeof subCatVal === 'object' && subCatVal?.lookup_value) subCatVal = subCatVal.lookup_value;
            
            if (locVal && subCatVal && typeof locVal === 'string' && typeof subCatVal === 'string') {
                const bm = benchmarkMap.get(`${locVal}|${subCatVal}`);
                if (bm && bm.avgClosedRPU && deal.price) {
                    // Try to determine size value
                    const dealSizeVal = typeof deal.size === 'object' ? deal.size?.value : deal.size;
                    
                    if (dealSizeVal) {
                        const sqFtSize = toSqFt(dealSizeVal, deal.sizeUnit);
                        if (sqFtSize > 0) {
                            // Compute RPU in target AreaUnit using getAreaUnit from pricingUtils if we wanted, 
                            // but actually bm.avgClosedRPU is in bm.areaUnit.
                            // The simplest way to be safe is comparing the deal's ratePerUnit directly if it's there.
                            let dealRPU = deal.price / sqFtSize;
                            
                            if (dealRPU > 0) {
                                const diff = dealRPU - bm.avgClosedRPU;
                                marketGapPct = Math.round((diff / bm.avgClosedRPU) * 100);
                                
                                // Overpriced drops probability, underpriced boosts it
                                if (marketGapPct > 10) gapBonus = -20;
                                else if (marketGapPct > 5) gapBonus = -10;
                                else if (marketGapPct < -5) gapBonus = 10;
                                else if (marketGapPct < -10) gapBonus = 20;
                            }
                        }
                    }
                }
            }

            const score = Math.min(100, Math.max(0, stageWeight + activityBonus + historyBonus + gapBonus));
            
            // Bands logic
            let color = '#3b82f6'; // Blue
            let label = 'Active';
            if (score >= 80) { color = '#ef4444'; label = 'Super Hot'; }
            else if (score >= 60) { color = '#f59e0b'; label = 'Hot'; }
            else if (score < 30) { color = '#94a3b8'; label = 'Cold'; }

            scores[deal._id.toString()] = { score, color, label, marketGapPct };
        });

        res.json({ success: true, count: deals.length, scores });
    } catch (error) {
        console.error('getDealScores Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
