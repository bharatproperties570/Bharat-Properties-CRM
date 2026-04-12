import Activity from "../models/Activity.js";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import Lead from "../models/Lead.js";
import Deal from "../models/Deal.js";
import { enrichmentQueue, googleSyncQueue } from "../src/queues/queueManager.js";

import StageTransitionEngine from "../src/services/StageTransitionEngine.js";
import LeadScoringService from "../src/services/LeadScoringService.js";
import { autoAssign } from "../src/services/DistributionService.js";
import { createNotification } from "./notification.controller.js";
import { getVisibilityFilter } from "../utils/visibility.js";

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
        await LeadScoringService.computeAndSave(leadId, { triggeredBy: 'activity_completion', triggeredByUserId: userId });

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

        const visibilityFilter = await getVisibilityFilter(req.user);
        const query = { ...visibilityFilter };

        if (entityId && mongoose.Types.ObjectId.isValid(entityId)) query.entityId = entityId;
        else if (entityId) return res.status(400).json({ success: false, error: "Invalid entityId format" });
        if (entityType) query.entityType = entityType;
        if (type) query.type = type;
        if (status) {
            if (status === 'Pending') {
                query.status = { $in: ['Pending', 'In Progress', 'Overdue'] };
            } else {
                query.status = status;
            }
        }
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
            .populate('assignedTo', 'fullName name email')
            .lean();

        const total = await Activity.countDocuments(query);

        // Enrichment: Process attribution fallbacks for older records
        const enrichedActivities = activities.map(a => {
            const act = { ...a };
            if (!act.performedBy) {
                if (act.assignedTo) {
                    act.performedBy = act.assignedTo.fullName || act.assignedTo.name || "Staff User";
                } else {
                    act.performedBy = "System"; // Default System attribution
                }
            }
            return act;
        });

        res.json({
            success: true,
            data: enrichedActivities,
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
export const getActivitiesByEntity = async (req, res) => {
    try {
        const { entityType, entityId } = req.params;
        const escapedEntityType = escapeRegExp(entityType);
        if (!mongoose.Types.ObjectId.isValid(entityId)) {
            return res.status(400).json({ success: false, error: "Invalid entityId format" });
        }
        const visibilityFilter = await getVisibilityFilter(req.user);
        const activities = await Activity.find({
            ...visibilityFilter,
            entityType: { $regex: new RegExp(`^${escapedEntityType}$`, 'i') },
            entityId: entityId
        }).populate('assignedTo', 'fullName name email').sort({ createdAt: -1 }).lean();

        // Enrichment: Process attribution fallbacks
        const enrichedActivities = activities.map(a => {
            const act = { ...a };
            if (!act.performedBy) {
                if (act.assignedTo) {
                    act.performedBy = act.assignedTo.fullName || act.assignedTo.name || "Staff User";
                } else {
                    act.performedBy = "System";
                }
            }
            return act;
        });

        res.json({ success: true, data: enrichedActivities });
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

        if (!mongoose.Types.ObjectId.isValid(entityId)) {
            return res.status(400).json({ success: false, error: "Invalid entityId format" });
        }

        const visibilityFilter = await getVisibilityFilter(req.user);
        // 1. Fetch Activities
        const activities = await Activity.find({
            ...visibilityFilter,
            entityId,
            entityType: { $regex: new RegExp(`^${escapeRegExp(entityType)}$`, 'i') }
        })
            .populate('assignedTo', 'fullName name')
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
                actor: a.performedBy || (a.assignedTo ? (a.assignedTo.fullName || a.assignedTo.name) : 'System'),
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
        const activityData = { ...req.body };
        
        // Auto-set performer name from authenticated user
        if (req.user) {
            activityData.performedBy = req.user.fullName || req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();
            // Default teams to user's teams if no inheritance happens later
            if (!activityData.teams || activityData.teams.length === 0) {
                activityData.teams = Array.isArray(req.user.teams) ? req.user.teams : (req.user.team ? [req.user.team] : []);
            }
        }

        // 🚀 Team Inheritance from Parent Entity
        if (activityData.entityType && activityData.entityId && mongoose.Types.ObjectId.isValid(activityData.entityId)) {
            const ModelMap = { leads: Lead, contact: mongoose.model('Contact'), deal: Deal, project: mongoose.model('Project'), company: mongoose.model('Company') };
            const ParentModel = ModelMap[activityData.entityType.toLowerCase() + 's'] || ModelMap[activityData.entityType.toLowerCase()];
            if (ParentModel) {
                const parent = await ParentModel.findById(activityData.entityId).select('teams assignment.team').lean();
                if (parent) {
                    const inheritedTeams = parent.teams || parent.assignment?.team || [];
                    if (inheritedTeams.length > 0) {
                        activityData.teams = inheritedTeams;
                    }
                }
            }
        }

        const activity = await Activity.create(activityData);

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
            await autoTriggerStageChange(activity, req.user?.id || req.user?._id || activity.assignedTo || null);
        }

        // Create Notification if assigned to a user
        if (activity.assignedTo) {
            await createNotification(
                activity.assignedTo,
                'assignment',
                'New Activity Assigned',
                `You have been assigned a new ${activity.type}: ${activity.subject}`,
                `/activities/${activity._id}`,
                { activityId: activity._id }
            );
        }

        // Sync to Google Calendar
        googleSyncQueue.add('syncEvent', { activityId: activity._id }).catch(() => { });

        res.status(201).json({ success: true, data: activity });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update an activity
// @route   PUT /api/activities/:id
export const updateActivity = async (req, res) => {
    try {
        const updateData = { ...req.body };
        
        // If status is changing to Completed, ensure performedBy is set
        if (updateData.status === 'Completed' && req.user) {
            updateData.performedBy = req.user.fullName || req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();
        }

        const activity = await Activity.findByIdAndUpdate(
            req.params.id,
            updateData,
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
            await autoTriggerStageChange(activity, req.user?.id || req.user?._id || activity.assignedTo || null);
        }

        // Sync to Google Calendar
        googleSyncQueue.add('syncEvent', { activityId: activity._id }).catch(() => { });

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

        // Sync to Google Calendar
        if (activity.googleEventId) {
            googleSyncQueue.add('deleteEvent', { googleEventId: activity.googleEventId }).catch(() => { });
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
        const { calls = [], messages = [] } = req.body;

        if (!Array.isArray(calls) || !Array.isArray(messages)) {
            return res.status(400).json({ success: false, error: "Invalid data format" });
        }

        const syncedActivities = [];

        // Helper for entity matching
        const findEntity = async (phone) => {
            const normalizedPhone = phone.replace(/[^0-9]/g, '').slice(-10);
            const escapedPhone = escapeRegExp(normalizedPhone);

            // 1. Try Contact
            const contact = await mongoose.model('Contact').findOne({
                "phones.number": { $regex: new RegExp(`${escapedPhone}$`) }
            }).lean();
            if (contact) return { entity: contact, type: 'Contact', name: contact.name };

            // 2. Try Lead
            const lead = await mongoose.model('Lead').findOne({
                "mobile": { $regex: new RegExp(`${escapedPhone}$`) }
            }).lean();
            if (lead) return { entity: lead, type: 'Lead', name: `${lead.firstName} ${lead.lastName || ''}`.trim() };

            return null;
        };

        // 1. Process Calls
        for (const call of calls) {
            if (!call || !call.number) continue;

            const match = await findEntity(call.number);
            const participantName = match ? match.name : (call.name || 'Unknown');

            const activityData = {
                type: 'Call',
                subject: `Mobile Call: ${call.type || 'Incoming'}`,
                entityType: match ? match.type : 'Unknown',
                entityId: match ? match.entity._id : null,
                relatedTo: match ? [{ id: match.entity._id, name: match.name, model: match.type }] : [],
                participants: [{ name: participantName, mobile: call.number }],
                dueDate: new Date(call.timestamp),
                status: 'Completed',
                description: `Synced from mobile. Duration: ${call.duration}s. Raw: ${call.number}`,
                details: {
                    direction: call.type?.toUpperCase() === 'INCOMING' ? 'Incoming' : 'Outgoing',
                    duration: call.duration,
                    platform: 'Mobile',
                    mobileId: call.id,
                    isMatched: !!match,
                    recordingUrl: call.recordingUrl || null
                },
                performedAt: new Date(call.timestamp),
                performedBy: req.user?.fullName || req.user?.name || "Mobile User",
                teams: match ? (match.entity.teams || match.entity.assignment?.team || []) : []
            };
            
            // Fallback for unmatched calls: Creator's teams
            if ((!activityData.teams || activityData.teams.length === 0) && req.user) {
                activityData.teams = Array.isArray(req.user.teams) ? req.user.teams : (req.user.team ? [req.user.team] : []);
            }

            const existing = await Activity.findOne({ "details.mobileId": call.id, "details.platform": 'Mobile' });
            if (!existing) {
                const activity = await Activity.create(activityData);
                googleSyncQueue.add('syncEvent', { activityId: activity._id }).catch(() => { });
                syncedActivities.push(activity);

                // Trigger Notification
                if (req.user?.id || req.user?._id) {
                    await createNotification(
                        req.user.id || req.user._id,
                        activity.details?.direction === 'Incoming' ? 'assignment' : 'system',
                        `Mobile Call: ${activity.details?.direction}`,
                        `${activity.details?.direction} call from ${participantName} (${call.number})`,
                        `/activities/${activity._id}`,
                        { activityId: activity._id, type: 'Call' }
                    );
                }
            }
        }

        // 2. Process Messages (SMS)
        for (const msg of messages) {
            if (!msg || !msg.address) continue;

            const match = await findEntity(msg.address);
            const participantName = match ? match.name : 'Unknown';

            const activityData = {
                type: 'Messaging',
                subject: `Mobile SMS: ${msg.type || 'Incoming'}`,
                entityType: match ? match.type : 'Unknown',
                entityId: match ? match.entity._id : null,
                relatedTo: match ? [{ id: match.entity._id, name: match.name, model: match.type }] : [],
                participants: [{ name: participantName, mobile: msg.address }],
                dueDate: new Date(msg.date),
                status: 'Completed',
                description: msg.body,
                details: {
                    direction: msg.type?.toLowerCase() === 'sent' ? 'Outgoing' : 'Incoming',
                    platform: 'MobileSMS',
                    mobileId: msg.id || `${msg.address}_${msg.date}`,
                    isMatched: !!match
                },
                performedAt: new Date(msg.date),
                performedBy: req.user?.fullName || req.user?.name || "Mobile User",
                teams: match ? (match.entity.teams || match.entity.assignment?.team || []) : []
            };

            // Fallback for unmatched SMS: Creator's teams
            if ((!activityData.teams || activityData.teams.length === 0) && req.user) {
                activityData.teams = Array.isArray(req.user.teams) ? req.user.teams : (req.user.team ? [req.user.team] : []);
            }

            const existing = await Activity.findOne({ 
                "details.mobileId": activityData.details.mobileId, 
                "details.platform": 'MobileSMS' 
            });

            if (!existing) {
                const activity = await Activity.create(activityData);
                syncedActivities.push(activity);

                // Trigger Notification
                if (req.user?.id || req.user?._id) {
                    await createNotification(
                        req.user.id || req.user._id,
                        activity.details?.direction === 'Incoming' ? 'assignment' : 'system',
                        `Mobile SMS: ${activity.details?.direction}`,
                        `${activity.details?.direction} SMS from ${participantName}: ${msg.body.substring(0, 30)}...`,
                        `/activities/${activity._id}`,
                        { activityId: activity._id, type: 'Messaging' }
                    );
                }
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
