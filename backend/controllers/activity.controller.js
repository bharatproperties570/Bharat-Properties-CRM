import Activity from "../models/Activity.js";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import Lead from "../models/Lead.js";
import Deal from "../models/Deal.js";
import { enrichmentQueue } from "../src/queues/queueManager.js";
import { updateLeadStage } from "./stage.controller.js";
import StageTransitionEngine from "../src/services/StageTransitionEngine.js";
import LeadScoringService from "../src/services/LeadScoringService.js";

/**
 * Bug 6 Fix: Auto-trigger stage change when a completed activity is saved for a lead.
 * Looks up the mapped stage from activityMasterFields settings, then calls updateLeadStage.
 * This makes stage auto-computation truly automatic without requiring the frontend hook.
 */
/**
 * Professionals Fix: Auto-trigger stage change and recalculate score.
 * Delegates to StageTransitionEngine for stage logic and LeadScoringService for scoring.
 */
const autoTriggerStageChange = async (activity, userId = null) => {
    try {
        if (activity.entityType?.toLowerCase() !== 'lead') return;
        if (activity.status?.toLowerCase() !== 'completed') return;
        if (!activity.entityId) return;

        const leadId = activity.entityId;
        const actType = activity.type;
        const outcome = activity.details?.completionResult ||
                        activity.details?.meetingOutcomeStatus ||
                        activity.details?.callOutcome ||
                        activity.details?.outcome ||
                        activity.completionResult || '';
        const reason = activity.details?.outcomeReason || activity.details?.reason || '';
        const purpose = activity.details?.purpose || activity.details?.meetingPurpose || activity.details?.callPurpose || activity.purpose || '';

        // Site Visit special outcome resolution
        let resolvedOutcome = outcome;
        if (!resolvedOutcome && actType?.toLowerCase() === 'site visit' && Array.isArray(activity.details?.visitedProperties)) {
            const priorityMap = { 'very interested': 1, 'shortlisted': 2, 'somewhat interested': 3 };
            resolvedOutcome = activity.details.visitedProperties
                .map(p => (p.result || '').toLowerCase())
                .filter(Boolean)
                .sort((a, b) => (priorityMap[a] || 99) - (priorityMap[b] || 99))[0] || '';
        }

        // 1. Evaluate Stage Transition (backend rule engine)
        const transition = await StageTransitionEngine.evaluateAndTransition(
            leadId,
            actType,
            resolvedOutcome,
            reason,
            {}, // stageFormData already synced in previous steps if any
            {
                activityId: activity._id,
                triggeredByUser: userId,
                purpose
            }
        );

        // 2. Recalculate Lead Score (unified scoring engine)
        await LeadScoringService.computeAndSave(leadId, { triggeredBy: 'activity_completion' });

        if (transition.stageChanged) {
            console.log(`[StageAlignment] Lead ${leadId} moved: ${transition.prevStage} → ${transition.newStage}`);
        }
    } catch (err) {
        console.error('[ActivityController] autoTriggerStageChange failed:', err.message);
    }
};

// @desc    Get all activities with filtering and pagination
// @route   GET /api/activities
export const getActivities = async (req, res) => {
    try {
        const {
            entityId,
            entityType,
            type,
            status,
            assignedTo,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 100
        } = req.query;

        const query = {};

        if (entityId) query.entityId = entityId;
        if (entityType) query.entityType = entityType;
        if (type) query.type = type;
        if (status) query.status = status;
        if (assignedTo) query.assignedTo = assignedTo;

        // Date Range Filtering
        if (startDate || endDate) {
            query.dueDate = {};
            if (startDate) query.dueDate.$gte = new Date(startDate);
            if (endDate) query.dueDate.$lte = new Date(endDate);
        }

        // Search in subject or description
        if (search) {
            query.$or = [
                { subject: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { "participants.name": { $regex: search, $options: 'i' } }
            ];
        }

        const activities = await Activity.find(query)
            .sort({ dueDate: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .populate('assignedTo', 'firstName lastName email')
            .lean();

        const total = await Activity.countDocuments(query);

        res.json({
            success: true,
            data: activities,
            pagination: {
                total,
                page: Number(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        if (error.name === "CastError") return res.status(400).json({ success: false, error: `Invalid ${error.path}: ${error.value}` }); res.status(500).json({ success: false, error: error.message });
    }
};

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
// @desc    Get activities for a specific entity
// @route   GET /api/activities/entity/:entityType/:entityId
export const getActivitiesByEntity = async (req, res, next) => {
    try {
        const { entityType, entityId } = req.params;
        const escapedEntityType = escapeRegExp(entityType);
        const activities = await Activity.find({
            entityType: { $regex: new RegExp(`^${escapedEntityType}$`, 'i') },
            entityId: entityId
        }).populate('assignedTo', 'firstName lastName email').sort({ createdAt: -1 }).lean();

        res.json({ success: true, data: activities });
    } catch (error) {
        if (error.name === "CastError") return res.status(400).json({ success: false, error: `Invalid ${error.path}: ${error.value}` });
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get unified chronological timeline (Activities + Audit Logs)
// @route   GET /api/activities/unified/:entityType/:entityId
export const getUnifiedTimeline = async (req, res) => {
    try {
        const { entityId, entityType } = req.params;

        // 1. Fetch Activities
        const activities = await Activity.find({
            entityId,
            entityType: { $regex: new RegExp(`^${escapeRegExp(entityType)}$`, 'i') }
        })
            .populate('assignedTo', 'firstName lastName')
            .lean();

        // 2. Fetch Audit Logs
        // Map entityType to targetType for AuditLog
        const targetTypeMap = {
            'lead': 'lead',
            'contact': 'contact',
            'deal': 'deal',
            'project': 'project',
            'inventory': 'inventory'
        };
        const targetType = targetTypeMap[entityType.toLowerCase()] || entityType.toLowerCase();

        const auditLogs = await AuditLog.find({
            targetId: entityId,
            targetType
        }).lean();

        // 3. Normalize and Combine
        const timeline = [
            ...activities.map(a => ({
                _id: a._id,
                source: 'activity',
                type: a.type.toLowerCase(),
                timestamp: a.completedAt || a.performedAt || a.createdAt || a.dueDate,
                title: a.subject,
                description: a.description,
                status: a.status,
                actor: a.assignedTo ? `${a.assignedTo.firstName} ${a.assignedTo.lastName}` : (a.performedBy || 'System'),
                isStarred: a.isStarred || false,
                tags: a.tags || [],
                metadata: {
                    details: a.details,
                    completionResult: a.completionResult,
                    priority: a.priority
                }
            })),
            ...auditLogs.map(l => ({
                _id: l._id,
                source: 'audit',
                type: 'system_log',
                timestamp: l.timestamp,
                title: l.description,
                description: l.eventType.replace(/_/g, ' ').toUpperCase(),
                status: 'Completed',
                actor: l.actorName || 'System',
                metadata: {
                    changes: l.changes,
                    eventType: l.eventType
                }
            }))
        ];

        // 4. Sort by timestamp descending
        timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            success: true,
            data: timeline
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get activity by ID
// @route   GET /api/activities/:id
export const getActivityById = async (req, res) => {
    try {
        const activity = await Activity.findById(req.params.id)
            .populate('assignedTo', 'firstName lastName email')
            .lean();

        if (!activity) {
            return res.status(404).json({ success: false, error: "Activity not found" });
        }

        res.json({ success: true, data: activity });
    } catch (error) {
        if (error.name === "CastError") return res.status(400).json({ success: false, error: `Invalid ${error.path}: ${error.value}` }); res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Add new activity
// @route   POST /api/activities
export const addActivity = async (req, res) => {
    try {
        const activity = await Activity.create(req.body);

        // Auto-run Enrichment if entity is a Lead
        if (activity.entityType?.toLowerCase() === 'lead' && activity.entityId) {
            await enrichmentQueue.add('enrichLead', { leadId: activity.entityId });
            // Update lastActivityAt
            await Lead.findByIdAndUpdate(activity.entityId, { lastActivityAt: new Date() }).catch(() => { });
        } else if (activity.entityType?.toLowerCase() === 'deal' && activity.entityId) {
            // Update lastActivityAt for Deal
            await Deal.findByIdAndUpdate(activity.entityId, { lastActivityAt: new Date() }).catch(() => { });
        }

        // 🚀 Professionals Fix: Site Visit Sync to Deal
        if (activity.type === 'Site Visit' && activity.status === 'Completed') {
            const dealRelation = activity.relatedTo?.find(r => r.model === 'Deal');
            const dealId = dealRelation?.id || (activity.entityType?.toLowerCase() === 'deal' ? activity.entityId : null);

            if (dealId) {
                const updateData = {};
                // Extract unit number from visitedProperties if available
                const properties = activity.details?.visitedProperties || [];
                if (properties.length > 0 && properties[0].property) {
                    updateData.unitNo = properties[0].property;
                    if (properties[0].project) updateData.projectName = properties[0].project;
                    if (properties[0].block) updateData.block = properties[0].block;
                }

                // Increment deal score for successful site visit
                if (activity.details?.meetingOutcomeStatus === 'Conducted') {
                    updateData.$inc = { dealScore: 15 }; // Boost score by 15 points
                }

                if (Object.keys(updateData).length > 0) {
                    await Deal.findByIdAndUpdate(dealId, updateData).catch(err => console.error("Score/Unit sync failed:", err));
                }
            }
        }

        // Bug 6 Fix: Auto-trigger stage change based on activity outcome mapping
        if (activity.entityType?.toLowerCase() === 'lead' && activity.status?.toLowerCase() === 'completed') {
            await autoTriggerStageChange(activity, req.body.assignedTo || null);
        }

        res.status(201).json({ success: true, data: activity });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update an activity
// @route   PUT /api/activities/:id
export const updateActivity = async (req, res) => {
    try {
        const activity = await Activity.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!activity) {
            return res.status(404).json({ success: false, error: "Activity not found" });
        }

        // Auto-run Enrichment if entity is a Lead
        if (activity.entityType?.toLowerCase() === 'lead' && activity.entityId) {
            await enrichmentQueue.add('enrichLead', { leadId: activity.entityId });
            // Update lastActivityAt
            await Lead.findByIdAndUpdate(activity.entityId, { lastActivityAt: new Date() }).catch(() => { });
        } else if (activity.entityType?.toLowerCase() === 'deal' && activity.entityId) {
            // Update lastActivityAt for Deal
            await Deal.findByIdAndUpdate(activity.entityId, { lastActivityAt: new Date() }).catch(() => { });
        }

        // Bug 6 Fix: Auto-trigger stage change based on activity outcome mapping
        if (activity.entityType?.toLowerCase() === 'lead' && activity.status?.toLowerCase() === 'completed') {
            await autoTriggerStageChange(activity, req.body.assignedTo || null);
        }

        res.json({ success: true, data: activity });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete an activity
// @route   DELETE /api/activities/:id
export const deleteActivity = async (req, res) => {
    try {
        const activity = await Activity.findByIdAndDelete(req.params.id);

        if (!activity) {
            return res.status(404).json({ success: false, error: "Activity not found" });
        }
        if (activity.entityType?.toLowerCase() === 'lead' && activity.entityId) {
            // Fetch most recent activity remaining to reset lastActivityAt
            const lastLog = await Activity.findOne({ entityId: activity.entityId }).sort({ createdAt: -1 });
            await Lead.findByIdAndUpdate(activity.entityId, { lastActivityAt: lastLog ? (lastLog.completedAt || lastLog.createdAt) : null }).catch(() => { });
        } else if (activity.entityType?.toLowerCase() === 'deal' && activity.entityId) {
            const lastLog = await Activity.findOne({ entityId: activity.entityId }).sort({ createdAt: -1 });
            await Deal.findByIdAndUpdate(activity.entityId, { lastActivityAt: lastLog ? (lastLog.completedAt || lastLog.createdAt) : null }).catch(() => { });
        }

        res.json({ success: true, message: "Activity deleted successfully" });
    } catch (error) {
        if (error.name === "CastError") return res.status(400).json({ success: false, error: `Invalid ${error.path}: ${error.value}` }); res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Sync mobile call logs
// @route   POST /api/activities/mobile-sync
export const syncMobileCalls = async (req, res) => {
    try {
        const { calls } = req.body;

        if (!calls || !Array.isArray(calls)) {
            return res.status(400).json({ success: false, error: "Invalid calls data" });
        }

        const syncedActivities = [];

        for (const call of calls) {
            if (!call || !call.number) {
                console.warn("[Sync] Skipping invalid call record:", call);
                continue;
            }
            const normalizedPhone = call.number.replace(/[^0-9]/g, '').slice(-10);

            let matchedEntity = null;
            let entityType = 'Unknown';
            let participantName = call.name || 'Unknown';

            // 1. Try Exact Mobile Number via Contact
            const escapedPhone = escapeRegExp(normalizedPhone);
            const matchedContact = await mongoose.model('Contact').findOne({
                "phones.number": { $regex: new RegExp(`${escapedPhone}$`) }
            }).lean();

            if (matchedContact) {
                matchedEntity = matchedContact;
                entityType = 'Contact';
                participantName = matchedContact.name;
            } else {
                // 2. Try Exact Mobile Number via Lead
                const lead = await mongoose.model('Lead').findOne({
                    "mobile": { $regex: new RegExp(`${escapedPhone}$`) }
                }).lean();

                if (lead) {
                    matchedEntity = lead;
                    entityType = 'Lead';
                    participantName = `${lead.firstName} ${lead.lastName || ''}`.trim();
                }
            }

            const activityData = {
                type: 'Call',
                subject: `Mobile Call: ${call.type || 'Incoming'}`,
                entityType: matchedEntity ? entityType : 'Unknown',
                entityId: matchedEntity ? matchedEntity._id : null,
                relatedTo: matchedEntity ? [{
                    id: matchedEntity._id,
                    name: participantName,
                    model: entityType
                }] : [],
                participants: [{
                    name: participantName,
                    mobile: call.number,
                }],
                dueDate: new Date(call.timestamp),
                status: 'Completed',
                description: `Synced from mobile. Duration: ${call.duration}s. Raw number: ${call.number}`,
                details: {
                    direction: call.type === 'INCOMING' ? 'Incoming' : 'Outgoing',
                    duration: call.duration,
                    platform: 'Mobile',
                    mobileId: call.id,
                    isMatched: !!matchedEntity
                },
                performedAt: new Date(call.timestamp)
            };

            const existing = await Activity.findOne({
                "details.mobileId": call.id,
                "details.platform": 'Mobile'
            });

            if (!existing) {
                const newActivity = await Activity.create(activityData);
                syncedActivities.push(newActivity);
            }
        }

        res.json({
            success: true,
            syncedCount: syncedActivities.length,
            data: syncedActivities
        });

    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
