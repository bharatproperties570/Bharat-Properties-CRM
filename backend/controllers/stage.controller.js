/**
 * Stage Engine Controller — MongoDB Integration
 *
 * All endpoints read/write real MongoDB data.
 * No mock/dummy data anywhere.
 *
 * Routes mounted at: /api/stage-engine
 */

import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Activity from '../models/Activity.js';
import Lookup from '../models/Lookup.js';
import mongoose from 'mongoose';

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

        const lead = await Lead.findById(id).select('stage stageHistory stageChangedAt').lean();
        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

        // Resolve the incoming stage string to a Lookup ObjectId
        const stageId = await resolveStageId(newStage);

        // Get current stage string (for history label)
        const currentStageValue = await resolveStageValue(lead.stage);

        // Write stage history before applying the update
        await writeStageHistory(Lead, id, newStage, {
            triggeredBy: triggeredBy || 'activity',
            activityType,
            outcome,
            activityId,
            reason,
            userId
        });

        // Update the stage itself + stageChangedAt
        const updated = await Lead.findByIdAndUpdate(
            id,
            {
                $set: {
                    stage: stageId,
                    stageChangedAt: new Date(),
                    lastActivityAt: outcome ? new Date() : undefined
                }
            },
            { new: true }
        ).populate([
            { path: 'stage', select: 'lookup_value' },
            { path: 'stageHistory.activityId' }
        ]);

        res.json({
            success: true,
            previousStage: currentStageValue,
            stage: newStage,
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
 * PUT /api/stage-engine/deals/:id/sync
 *
 * Sync deal stage from its linked leads' stages.
 * Applies conflict rules: highest lead stage wins; if any lead is Qualified+ → Deal moves up.
 * Body: { leadStages: ['Negotiation', 'Qualified'], reason, userId }
 */
export const syncDealStage = async (req, res) => {
    try {
        const { id } = req.params;
        const { leadStages = [], reason, userId, stage: explicitStage } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, error: 'Invalid deal ID' });

        const deal = await Deal.findById(id).select('stage stageHistory stageChangedAt').lean();
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        // Stage priority for conflict resolution (high index = higher stage)
        const STAGE_PRIORITY = {
            'New': 0, 'Prospect': 1, 'Qualified': 2, 'Open': 2,
            'Opportunity': 3, 'Quote': 3, 'Negotiation': 4,
            'Stalled': 3.5, // Stalled = sideways from Negotiation
            'Booked': 5, 'Closed Won': 6, 'Closed': 6, 'Closed Lost': 1
        };

        // Map from Lead stage names → Deal stage names
        const LEAD_TO_DEAL_STAGE = {
            'New': 'Open', 'Prospect': 'Open', 'Qualified': 'Open',
            'Opportunity': 'Quote', 'Negotiation': 'Negotiation',
            'Stalled': 'Stalled', 'Booked': 'Booked',
            'Closed Won': 'Booked', 'Closed Lost': 'Open'
        };

        let computedDealStage = explicitStage || deal.stage || 'Open';

        if (leadStages.length > 0) {
            // Pick the highest-priority lead stage
            const highestLeadStage = leadStages.reduce((best, curr) => {
                return (STAGE_PRIORITY[curr] || 0) > (STAGE_PRIORITY[best] || 0) ? curr : best;
            }, leadStages[0]);
            computedDealStage = LEAD_TO_DEAL_STAGE[highestLeadStage] || computedDealStage;
        }

        // No-op if stage unchanged
        if (computedDealStage === deal.stage) {
            return res.json({ success: true, changed: false, stage: computedDealStage, reason: 'Stage unchanged' });
        }

        // Write deal stage history
        await writeStageHistory(Deal, id, computedDealStage, {
            triggeredBy: 'system',
            reason: reason || `Synced from lead stages: [${leadStages.join(', ')}]`,
            userId
        });

        const updated = await Deal.findByIdAndUpdate(
            id,
            {
                $set: {
                    stage: computedDealStage,
                    stageChangedAt: new Date(),
                    stageSyncReason: reason || `lead-sync: [${leadStages.join(', ')}]`
                }
            },
            { new: true }
        );

        res.json({
            success: true,
            changed: true,
            previousStage: deal.stage,
            stage: computedDealStage,
            stageSyncReason: updated.stageSyncReason,
            deal: updated
        });
    } catch (err) {
        console.error('[StageEngine] syncDealStage error:', err);
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
        // Aggregate leads by stage
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

        const total = leadDensity.reduce((sum, s) => sum + s.count, 0) || 1;

        // Stage order for funnel computation
        const STAGE_ORDER = ['New', 'Prospect', 'Qualified', 'Opportunity', 'Negotiation', 'Booked', 'Closed Won', 'Closed Lost', 'Stalled'];

        const density = leadDensity.map(entry => {
            const stageIdx = STAGE_ORDER.indexOf(entry._id);
            const nextStageCount = stageIdx >= 0 && stageIdx < STAGE_ORDER.length - 2
                ? leadDensity.find(s => s._id === STAGE_ORDER[stageIdx + 1])?.count || 0
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
        const newCount = leadDensity.find(s => s._id === 'New')?.count || 0;
        const bookedCount = leadDensity.find(s => s._id === 'Booked')?.count || 0;
        const overallConversion = newCount > 0 ? Math.round((bookedCount / newCount) * 100) : 0;

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

        // Stage score
        const STAGE_SCORES = {
            'New': 5, 'Open': 10, 'Prospect': 15, 'Qualified': 30, 'Quote': 35,
            'Opportunity': 50, 'Negotiation': 65, 'Booked': 80,
            'Closed Won': 100, 'Closed': 100, 'Closed Lost': 0, 'Stalled': 20
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

        // Owner response rate from activity gap
        const activityGapDays = deal.lastActivityAt
            ? Math.floor((now - new Date(deal.lastActivityAt)) / 86400000)
            : 30;
        const ownerResponseRate = activityGapDays <= 2 ? 100
            : activityGapDays <= 5 ? 85
                : activityGapDays <= 7 ? 70
                    : activityGapDays <= 14 ? 50
                        : activityGapDays <= 21 ? 35
                            : activityGapDays <= 30 ? 20 : 10;

        const ownerRisk = ownerResponseRate < 40 ? Math.round((40 - ownerResponseRate) / 40 * 15) : 0;

        // v3 formula
        const health = Math.max(0, Math.min(100,
            (stageScore * 0.25) + (stageScore * 0.25) + activityScore - ownerRisk
        ));

        const label = health >= 60 ? 'Healthy' : health >= 35 ? 'Watch' : 'At Risk';
        const color = health >= 60 ? '#10b981' : health >= 35 ? '#f59e0b' : '#ef4444';

        res.json({
            success: true,
            dealId,
            health: {
                score: Math.round(health),
                label,
                color,
                breakdown: {
                    stageScore,
                    activityScore,
                    ownerRisk,
                    ownerResponseRate,
                    activitiesAnalyzed: activities.length
                }
            },
            generatedAt: new Date()
        });
    } catch (err) {
        console.error('[StageEngine] getDealHealth error:', err);
        res.status(500).json({ success: false, error: err.message });
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
 * Uses intent_index (ML score) if present, else computes from:
 *   stageWeight + activityRecency + stageHistoryDepth
 * Returns: { success, scores: { leadId: { score, color, label } } }
 */
export const getLeadScores = async (req, res) => {
    try {
        // 1. Fetch System Settings for Activity Master Fields (Source of Truth for Scores)
        const SystemSetting = mongoose.model('SystemSetting');
        const setting = await SystemSetting.findOne({ key: 'activity_master_fields' }).lean();
        const activityConfig = setting?.value || {};

        const STAGE_WEIGHTS = {
            'New': 10, 'Prospect': 20, 'Qualified': 40, 'Opportunity': 55,
            'Negotiation': 70, 'Booked': 85, 'Closed Won': 100, 'Closed Lost': 5, 'Stalled': 15
        };

        // 2. Fetch all leads with their basic data
        const leads = await Lead.find({})
            .select('_id intent_index leadScore stage stageHistory lastActivityAt stageChangedAt')
            .populate('stage', 'lookup_value')
            .lean();

        const leadIds = leads.map(l => l._id);

        // 3. Fetch recent completed activities for these leads to compute behaviour score
        const activities = await Activity.find({
            entityId: { $in: leadIds },
            entityType: { $regex: /lead/i },
            status: { $regex: /completed/i }
        }).select('entityId type details completionResult createdAt').sort({ createdAt: -1 }).lean();

        // 4. Group activities by lead
        const activityGroups = activities.reduce((acc, act) => {
            const id = act.entityId.toString();
            if (!acc[id]) acc[id] = [];
            acc[id].push(act);
            return acc;
        }, {});

        const scores = {};
        const now = Date.now();

        for (const lead of leads) {
            let score = 0;
            const leadIdStr = lead._id.toString();

            // Priority 1: ML intent_index (already 0–100)
            if (lead.intent_index !== undefined && lead.intent_index !== null && lead.intent_index > 0) {
                score = Math.round(lead.intent_index);
            } else {
                // Formula: Stage Weight + Activity Behaviour Score
                const stageName = lead.stage?.lookup_value || lead.stage || 'New';
                const stageWeight = STAGE_WEIGHTS[stageName] || 10;

                // Activity Behaviour Score (Dynamic)
                let behavioralScore = 0;
                const leadActivities = activityGroups[leadIdStr] || [];

                leadActivities.forEach(act => {
                    const typeConfig = activityConfig.activities?.find(a => a.name === act.type);
                    if (typeConfig) {
                        const purpose = act.details?.purpose || '';
                        const purposeConfig = typeConfig.purposes?.find(p => p.name === purpose);
                        if (purposeConfig) {
                            // Find outcome score
                            const outcomeLabel = act.details?.completionResult || act.details?.meetingOutcomeStatus || act.details?.callOutcome || '';
                            const outcomeConfig = purposeConfig.outcomes?.find(o => o.label === outcomeLabel);
                            if (outcomeConfig) {
                                behavioralScore += (outcomeConfig.score || 0);
                            }
                        }
                    }
                });

                // Recency Bonus
                const lastActivity = lead.lastActivityAt || lead.stageChangedAt;
                const daysAgo = lastActivity ? Math.floor((now - new Date(lastActivity)) / 86400000) : 999;
                const recencyBonus = daysAgo <= 3 ? 10 : daysAgo <= 7 ? 5 : 0;

                score = Math.min(100, stageWeight + behavioralScore + recencyBonus);
            }

            // Temperature coding based on research
            // 81+ Super Hot (Purple), 61+ Hot (Red), 31+ Warm (Amber), <31 Cold (Slate)
            let color = '#94A3B8'; // Cold
            let label = 'Cold';

            if (score >= 81) {
                color = '#7C3AED'; // Super Hot
                label = 'Super Hot';
            } else if (score >= 61) {
                color = '#EF4444'; // Hot
                label = 'Hot';
            } else if (score >= 31) {
                color = '#F59E0B'; // Warm
                label = 'Warm';
            }

            scores[leadIdStr] = { score, color, label };
        }

        res.json({ success: true, count: leads.length, scores });
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
        const STAGE_WEIGHTS = {
            'Open': 20, 'Quote': 35, 'Opportunity': 45, 'Negotiation': 60,
            'Booked': 85, 'Closed Won': 100, 'Closed': 90,
            'Closed Lost': 5, 'Stalled': 15
        };

        const deals = await Deal.find({})
            .select('_id stage stageHistory lastActivityAt stageChangedAt dealProbability')
            .lean();

        const scores = {};
        const now = Date.now();

        for (const deal of deals) {
            const stageName = deal.stage || 'Open';
            const stageWeight = STAGE_WEIGHTS[stageName] || 20;

            const lastActivity = deal.lastActivityAt || deal.stageChangedAt;
            const daysAgo = lastActivity ? Math.floor((now - new Date(lastActivity)) / 86400000) : 999;
            const activityBonus = daysAgo <= 3 ? 15 : daysAgo <= 7 ? 10 : daysAgo <= 14 ? 5 : 0;

            const historyDepth = Math.min(10, (deal.stageHistory?.length || 0) * 2);

            // Also blend in dealProbability if set
            const probBonus = deal.dealProbability ? Math.round(deal.dealProbability * 0.1) : 0;

            const score = Math.min(100, stageWeight + activityBonus + historyDepth + probBonus);

            const color = score >= 80 ? '#10B981'   // Healthy / Booked
                : score >= 55 ? '#F59E0B'            // Watch / Negotiation
                    : score >= 30 ? '#3B82F6'            // Open / Quote
                        : '#EF4444';                         // At Risk / Stalled

            const label = score >= 80 ? 'Strong' : score >= 55 ? 'Active' : score >= 30 ? 'Open' : 'At Risk';

            scores[deal._id.toString()] = { score, color, label };
        }

        res.json({ success: true, count: deals.length, scores });
    } catch (err) {
        console.error('[StageEngine] getDealScores error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
