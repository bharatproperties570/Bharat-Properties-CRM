import Activity from "../models/Activity.js";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import Lead from "../models/Lead.js";
import Deal from "../models/Deal.js";
import Conversation from "../models/Conversation.js";
import SmsLog from "../src/modules/sms/smsLog.model.js";
import { enrichmentQueue, googleSyncQueue } from "../src/queues/queueManager.js";

import StageTransitionEngine from "../src/services/StageTransitionEngine.js";
import LeadScoringService from "../src/services/LeadScoringService.js";
import { autoAssign } from "../src/services/DistributionService.js";
import { createNotification } from "./notification.controller.js";
import { getVisibilityFilter } from "../utils/visibility.js";
import { normalizePhone } from "../utils/normalization.js";
import Contact from "../models/Contact.js";

/**
 * Enterprise Enrichment Layer:
 * Heals activities by auto-populating missing contact/lead metadata (name, mobile, email).
 * This ensures "Unknown Client" and missing phone/email labels are eliminated even if 
 * the activity was saved with partial data (e.g. from mobile sync or legacy imports).
 */
const populateParticipantsAndRelatedData = async (activities) => {
    if (!activities || activities.length === 0) return activities;

    const leadIds = new Set();
    const contactIds = new Set();
    const namesForSearch = new Set();

    activities.forEach(a => {
        // Build ID sets from top-level and relatedTo
        const potentialEntityIds = [a.entityId];
        if (Array.isArray(a.relatedTo)) {
            a.relatedTo.forEach(r => {
                potentialEntityIds.push(r.id);
                if (r.name && r.name !== 'Unknown') namesForSearch.add(r.name);
            });
        }

        potentialEntityIds.forEach(id => {
            if (!id) return;
            const sId = String(id).trim();
            // We use strings for the set to ensure unique resolution before database hits
            const eType = String(a.entityType || '').toLowerCase();
            if (eType === 'lead') leadIds.add(sId);
            else if (eType === 'contact') contactIds.add(sId);
            else {
                // If top-level type is missing, peek into relatedTo if available for this specific ID
                if (Array.isArray(a.relatedTo)) {
                    const rel = a.relatedTo.find(r => String(r.id) === sId);
                    if (rel) {
                        const mType = String(rel.model || '').toLowerCase();
                        if (mType === 'lead') leadIds.add(sId);
                        else if (mType === 'contact') contactIds.add(sId);
                    }
                }
            }
        });
    });

    const leadIdArray = Array.from(leadIds);
    const contactIdArray = Array.from(contactIds);

    // Filter to valid object IDs for primary lookup
    const validLeadObjIds = leadIdArray.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
    const validContactObjIds = contactIdArray.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

    // Advance Name Parsing for Lead resolution (Split firstName/lastName)
    const leadNameQueries = Array.from(namesForSearch).map(name => {
        const parts = name.trim().split(/\s+/);
        if (parts.length > 1) {
            return { $and: [
                { firstName: { $regex: new RegExp(`^${parts[0]}$`, 'i') } },
                { lastName: { $regex: new RegExp(`^${parts.slice(1).join(' ')}$`, 'i') } }
            ]};
        }
        return { firstName: { $regex: new RegExp(`^${name}$`, 'i') } };
    });

    // Advance Name Parsing for Contact resolution (Split name/surname)
    const contactNameQueries = Array.from(namesForSearch).map(name => {
        const parts = name.trim().split(/\s+/);
        if (parts.length > 1) {
            return { $and: [
                { name: { $regex: new RegExp(`^${parts[0]}$`, 'i') } },
                { surname: { $regex: new RegExp(`^${parts.slice(1).join(' ')}$`, 'i') } }
            ]};
        }
        return { name: { $regex: new RegExp(`^${name}$`, 'i') } };
    });

    // Parallel lookup across both ID types AND names as an ultimate fallback for deep data healing
    const [leads, contacts] = await Promise.all([
        Lead.find({ 
            $or: [
                { _id: { $in: validLeadObjIds } },
                ...leadNameQueries
            ]
        }).select('firstName lastName mobile email salutation').lean(),
        Contact.find({ 
            $or: [
                { _id: { $in: validContactObjIds } },
                ...contactNameQueries
            ]
        }).select('name surname phones emails title').populate('title').lean()
    ]);

    // Build optimized lookup maps for O(1) row processing
    const leadMap = new Map();
    const leadNameMap = new Map();
    leads.forEach(l => {
        const fullName = `${l.firstName || ''} ${l.lastName || ''}`.trim();
        const data = { ...l, fullName, primaryPhone: l.mobile, primaryEmail: l.email };
        leadMap.set(String(l._id), data);
        leadNameMap.set(fullName, data);
    });

    const contactMap = new Map();
    const contactNameMap = new Map();
    contacts.forEach(c => {
        const titleLabel = (c.title && typeof c.title === 'object') ? c.title.lookup_value : (c.title || '');
        const fullName = `${titleLabel} ${c.name} ${c.surname || ''}`.trim();
        const data = { ...c, fullName, primaryPhone: c.phones?.[0]?.number, primaryEmail: c.emails?.[0]?.address };
        contactMap.set(String(c._id), data);
        contactNameMap.set(fullName, data);
    });

    return activities.map(a => {
        const act = { ...a };
        
        // Identity Resolution Logic (Multi-Path)
        let entityMatch = null;
        
        // Path A: Primary Pointer
        const eId = String(act.entityId || '');
        const eType = String(act.entityType || '').toLowerCase();
        entityMatch = eType === 'lead' ? leadMap.get(eId) : contactMap.get(eId);

        // Path B: Related Array Discovery
        if (!entityMatch && Array.isArray(act.relatedTo)) {
            for (const r of act.relatedTo) {
                const id = String(r.id);
                const model = String(r.model || '').toLowerCase();
                const match = model === 'lead' ? leadMap.get(id) : contactMap.get(id);
                if (match) {
                    entityMatch = match;
                    break;
                }
                // Path C: Name Fallback (Ultimate Data Healing)
                const nameMatch = model === 'lead' ? leadNameMap.get(r.name) : contactNameMap.get(r.name);
                if (nameMatch) {
                    entityMatch = nameMatch;
                    break;
                }
            }
        }

        // Apply Discovered Identity to heal the record
        if (entityMatch) {
            // Restore missing primary pointers
            if (!act.entityId) {
                act.entityId = entityMatch._id;
                act.entityType = leadMap.has(String(entityMatch._id)) ? 'Lead' : 'Contact';
            }

            // Sync participants - ensure mobile and email are present
            if (!Array.isArray(act.participants) || act.participants.length === 0) {
                act.participants = [{
                    name: entityMatch.fullName || entityMatch.name,
                    mobile: entityMatch.primaryPhone || '--',
                    email: entityMatch.primaryEmail || ''
                }];
            } else {
                act.participants = act.participants.map(p => {
                    const refreshed = { ...p };
                    if (!refreshed.name || refreshed.name === 'Unknown') refreshed.name = entityMatch.fullName;
                    if (!refreshed.mobile || refreshed.mobile === '--' || refreshed.mobile === '') refreshed.mobile = entityMatch.primaryPhone;
                    if (!refreshed.email || refreshed.email === '') refreshed.email = entityMatch.primaryEmail;
                    return refreshed;
                });
            }

            // Top-level conveniences for UI
            if (!act.contactEmail) act.contactEmail = entityMatch.primaryEmail;
            if (!act.contactPhone) act.contactPhone = entityMatch.primaryPhone;
        }

        return act;
    });
};

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
            .populate('createdBy', 'fullName name email')
            .lean();

        const total = await Activity.countDocuments(query);

        // Enrichment: Process attribution fallbacks and HEAL relation data
        const enrichedActivitiesRaw = activities.map(a => {
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

        const enrichedActivities = await populateParticipantsAndRelatedData(enrichedActivitiesRaw);

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
        }).populate('assignedTo', 'fullName name email').populate('createdBy', 'fullName name email').sort({ createdAt: -1 }).lean();

        // Enrichment: Process attribution fallbacks and relation healing
        const enrichedActivitiesRaw = activities.map(a => {
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

        const enrichedActivities = await populateParticipantsAndRelatedData(enrichedActivitiesRaw);

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
        const objId = new mongoose.Types.ObjectId(entityId);

        // 0. Authorize Entity Access (Entity-Based Authorization)
        // If the user has access to the parent entity, they see ALL its history.
        const ModelMap = { 
            leads: Lead, 
            lead: Lead,
            contact: Contact, 
            contacts: Contact,
            deal: Deal, 
            deals: Deal,
            project: mongoose.model('Project'),
            inventory: mongoose.model('Inventory')
        };
        const ParentModel = ModelMap[entityType.toLowerCase()];
        
        if (ParentModel) {
            const parentExists = await ParentModel.findOne({ _id: objId, ...visibilityFilter }).select('_id').lean();
            if (!parentExists) {
                return res.status(403).json({ success: false, error: "Access Denied: You do not have permission to view this record's history." });
            }
        }

        // 0.1 Fetch Entity Mobile for wider conversation matching
        let mobileForLookup = null;
        if (entityType.toLowerCase() === 'lead') {
            const leadDoc = await Lead.findById(objId).select('mobile').lean();
            if (leadDoc?.mobile) mobileForLookup = normalizePhone(leadDoc.mobile);
        } else if (entityType.toLowerCase() === 'contact') {
            const contactDoc = await Contact.findById(objId).select('phones').lean();
            if (contactDoc?.phones && contactDoc.phones.length > 0) {
                mobileForLookup = normalizePhone(contactDoc.phones[0].number);
            }
        }

        // 1. Fetch Activities (Unrestricted for authorized parent view)
        const activities = await Activity.find({
            entityId: objId,
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
            targetId: objId,
            targetType
        }).lean();

        // 3. Fetch WhatsApp Conversations (Match by ID OR Phone Number)
        const conversationQuery = {
            $or: [
                { lead: objId },
                { 'metadata.entityId': objId },
                { 'metadata.entityId': entityId },
                { 'metadata.entityId': objId.toString() }
            ],
            channel: 'whatsapp'
        };

        if (mobileForLookup) {
            conversationQuery.$or.push({ phoneNumber: mobileForLookup });
        }

        const conversations = await Conversation.find(conversationQuery).lean();

        // 4. Normalize and Combine
        const timeline = [
            ...activities.map(a => ({
                _id: a._id,
                source: 'activity',
                type: a.type?.toLowerCase() === 'whatsapp' ? 'whatsapp' : a.type.toLowerCase(),
                timestamp: a.completedAt || a.performedAt || a.createdAt || a.dueDate,
                title: a.subject,
                description: a.description,
                status: a.status,
                actor: a.performedBy || (a.assignedTo ? (a.assignedTo.fullName || a.assignedTo.name) : 'System'),
                isStarred: a.isStarred || false,
                tags: a.tags || [],
                createdAt: a.completedAt || a.performedAt || a.createdAt || a.dueDate, // Fallback
                date: a.completedAt || a.performedAt || a.createdAt || a.dueDate, // Fallback
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
                createdAt: l.timestamp, // Fallback
                date: l.timestamp, // Fallback
                metadata: {
                    changes: l.changes,
                    eventType: l.eventType
                }
            })),
            ...conversations.flatMap(c => (c.messages || []).map(m => ({
                _id: m._id || `${c._id}_${m.timestamp}`,
                source: 'conversation',
                type: 'whatsapp',
                timestamp: m.timestamp,
                title: m.role === 'user' ? 'Inbound WhatsApp' : 'AI Bot Response',
                description: m.content,
                status: 'Completed',
                actor: m.role === 'user' ? (entityType === 'Lead' ? 'Lead' : 'Contact') : 'AI Nurture Bot',
                isStarred: false,
                createdAt: m.timestamp, // Fallback
                date: m.timestamp, // Fallback
                details: {
                    direction: m.role === 'user' ? 'incoming' : 'outgoing',
                    platform: 'whatsapp',
                    role: m.role
                }
            })))
        ];

        // 5. Sort by timestamp descending
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
        // [SECURITY] Enforce visibility — user can only fetch activities in their scope
        const visibilityFilter = await getVisibilityFilter(req.user);
        const activity = await Activity.findOne({
            _id: req.params.id,
            ...visibilityFilter
        })
            .populate('assignedTo', 'fullName name email')
            .populate('createdBy', 'fullName name email')
            .lean();

        if (!activity) {
            return res.status(404).json({ success: false, error: "Activity not found or access denied" });
        }

        const [enrichedActivity] = await populateParticipantsAndRelatedData([activity]);

        res.json({ success: true, data: enrichedActivity });
    } catch (error) {
        if (error.name === "CastError") return res.status(400).json({ success: false, error: `Invalid ${error.path}: ${error.value}` });
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Add new activity
// @route   POST /api/activities
export const addActivity = async (req, res) => {
    try {
        const activityData = { ...req.body };
        
        // Auto-set performer name from authenticated user
        if (req.user) {
            activityData.createdBy = req.user.id || req.user._id;
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

/**
 * @desc    Send a reply to a messaging thread (WhatsApp/SMS)
 * @route   POST /api/activities/messaging/reply
 */
export const sendReply = async (req, res) => {
    try {
        const { phoneNumber, message, channel = 'whatsapp', entityId, entityType } = req.body;

        if (!phoneNumber || !message) {
            return res.status(400).json({ success: false, error: "Phone number and message are required" });
        }

        // 1. Resolve Services (Instances exported as default)
        const waService = (await import('../services/WhatsAppService.js')).default;
        const smsSvc = (await import('../services/SmsService.js')).default;
        
        // 🧼 Normalize Phone for API dispatch
        const cleanPhone = normalizePhone(phoneNumber);
        console.log(`[EnterpriseHub] 📡 DISPATCHING REPLY — Channel: ${channel} | Target: ${cleanPhone}`);

        let dispatchResult = { success: false, error: "Initialization error" };
        try {
            if (channel.toLowerCase() === 'whatsapp') {
                dispatchResult = await waService.sendMessage(cleanPhone, message);
            } else if (channel.toLowerCase() === 'sms') {
                console.log(`[EnterpriseHub] 📡 Routing to SMS Bridge...`);
                dispatchResult = await smsSvc.sendSms(cleanPhone, message, { entityId, entityType });
            } else {
                console.warn(`[EnterpriseHub] Unsupported channel: ${channel}`);
                dispatchResult = await waService.sendMessage(cleanPhone, message); // Fallback
            }
        } catch (dispatchError) {
            console.error(`[EnterpriseHub] 💥 Dispatch Engine CRASH:`, dispatchError);
            return res.status(500).json({ success: false, error: `Critical Dispatch Error: ${dispatchError.message}` });
        }

        if (!dispatchResult || !dispatchResult.success) {
            console.error(`[EnterpriseHub] ❌ DISPATCH FAILURE:`, dispatchResult?.error || "Unknown Failure");
            // Use 400 for functional failures (e.g., config missing) instead of 500
            return res.status(400).json({ 
                success: false, 
                error: dispatchResult?.error || "Failed to dispatch message. Please check your SMS/WhatsApp configuration in Settings." 
            });
        }

        // 2. Log Activity
        const activity = await Activity.create({
            type: 'Messaging',
            subject: `Reply via ${channel.toUpperCase()}`,
            description: message,
            entityType: entityType || 'Unknown',
            entityId: entityId || null,
            dueDate: new Date(),
            status: 'Completed',
            details: {
                direction: 'Outgoing',
                platform: channel === 'whatsapp' ? 'WhatsApp' : 'SMS',
                messageId: dispatchResult.messageId || dispatchResult.sid,
                isManualReply: true,
                phoneNumber: cleanPhone
            },
            performedBy: req.user?.fullName || "Agent",
            performedAt: new Date()
        });

        // 3. Update Conversation History (if applicable)
        const Conversation = mongoose.model('Conversation');
        await Conversation.findOneAndUpdate(
            { phoneNumber: cleanPhone },
            { 
                $push: { 
                    messages: { 
                        role: 'assistant', 
                        content: message, 
                        timestamp: new Date() 
                    } 
                },
                status: 'handed_off', 
                updatedAt: new Date()
            },
            { upsert: true }
        );

        res.json({ success: true, data: activity });
    } catch (error) {
        console.error("[ActivityController] sendReply error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Get all messaging records (Activity + Conversation) for Communication Hub
 * @route   GET /api/activities/messaging
 */
export const getMessagingActivities = async (req, res) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);

        // 1. Fetch Messaging & Voice Activities (SMS, WhatsApp, Mobile Calls)
        const activities = await Activity.find({
            type: { $in: ['Messaging', 'WhatsApp', 'Call'] },
            isDeleted: { $ne: true }
        })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

        // 2. Fetch AI Conversations (Fast fetch, manual lookup later)
        const rawConversations = await Conversation.find({})
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean();

        // 3. Fetch SMS Logs
        const rawSmsLogs = await SmsLog.find({})
            .sort({ sentAt: -1 })
            .limit(100)
            .lean();

        // 4. Resolve Leads manually (Senior Professional Optimization to avoid 'System' schema errors)
        // 4. Resolve Leads manually (Senior Professional Optimization to avoid 'System' schema errors)
        const leadIdSet = new Set();
        rawConversations.forEach(c => { if(c.lead) leadIdSet.add(c.lead.toString()); });
        activities.forEach(act => { if(act.entityId && act.entityType === 'Lead') leadIdSet.add(act.entityId.toString()); });
        
        const uniqueLeadIds = Array.from(leadIdSet).filter(id => mongoose.Types.ObjectId.isValid(id));
        const leads = await Lead.find({ _id: { $in: uniqueLeadIds } }).select('firstName lastName fullName mobile').lean();
        const leadMap = leads.reduce((acc, l) => {
            acc[l._id.toString()] = l;
            return acc;
        }, {});

        console.log(`[MessagingHub] Found: Activities=${activities.length}, Convs=${rawConversations.length}, SMSLogs=${rawSmsLogs.length}`);

        // 5. Unify and apply Matched/Unmatched logic
        const unified = [];

        // 5.1 Process Activities
        for (const a of activities) {
            try {
                const phone = a.details?.phoneNumber || a.participants?.[0]?.mobile || '';
                const aLeadIdStr = a.entityId ? a.entityId.toString() : null;
                const aLead = aLeadIdStr ? leadMap[aLeadIdStr] : null;

                const matchingConv = rawConversations.find(c => 
                    c.phoneNumber === phone || 
                    (c.lead && aLeadIdStr && c.lead.toString() === aLeadIdStr)
                );
                
                let pName = a.participants?.[0]?.name || '';
                if (!pName && aLead) pName = aLead.fullName || `${aLead.firstName} ${aLead.lastName}`;
                if (!pName && a.relatedTo?.length) {
                    const match = a.relatedTo.find(r => ['Contact', 'Lead'].includes(r.model));
                    if (match) pName = match.name;
                }
                if (!pName) pName = phone || 'Unknown';

                const isCall = a.type?.toLowerCase() === 'call';
                const via = isCall ? 'Voice' : (a.details?.platform?.toLowerCase() === 'whatsapp' || a.type?.toLowerCase() === 'whatsapp' ? 'WhatsApp' : 'SMS');

                unified.push({
                    _id: a._id,
                    type: a.type,
                    via: via,
                    subject: a.subject,
                    description: a.description,
                    snippet: a.description,
                    timestamp: a.createdAt,
                    entityType: a.entityType,
                    entityId: a.entityId,
                    actor: a.performedBy || 'System',
                    isMatched: a.details?.isMatched ?? !!(a.entityId && a.entityType !== 'Unknown'),
                    details: a.details,
                    platform: a.details?.platform || (isCall ? 'Mobile' : (a.type?.toLowerCase() === 'whatsapp' ? 'WhatsApp' : 'Direct')),
                    phoneNumber: phone,
                    phone: phone,
                    participant: pName,
                    outcome: a.details?.status || a.outcome || a.status || 'Delivered',
                    date: a.createdAt,
                    thread: matchingConv ? (matchingConv.messages || []).map(m => ({
                        sender: m.role === 'user' ? 'customer' : 'ai',
                        text: m.content,
                        time: m.timestamp
                    })) : [{
                        sender: a.details?.direction === 'Incoming' ? 'customer' : 'agent',
                        text: a.description,
                        time: a.createdAt
                    }]
                });
            } catch (err) { console.error("[MessagingHub] Activity Map Error:", err.message); }
        }

        // 5.2 Process SMS Logs
        for (const log of rawSmsLogs) {
            try {
                unified.push({
                    _id: log._id,
                    type: 'Messaging',
                    via: 'SMS',
                    subject: 'Outgoing SMS',
                    description: log.message,
                    snippet: log.message,
                    timestamp: log.sentAt,
                    entityType: log.entityType,
                    entityId: log.entityId,
                    actor: log.provider || 'Gateway',
                    isMatched: !!log.entityId && log.entityType !== 'System' && log.entityType !== 'Test',
                    platform: log.provider,
                    phoneNumber: log.to,
                    phone: log.to,
                    participant: log.to,
                    outcome: log.status,
                    thread: [{
                        sender: 'agent',
                        text: log.message,
                        time: log.sentAt
                    }]
                });
            } catch (err) { console.error("[MessagingHub] SmsLog Map Error:", err.message); }
        }

        // 5.3 Process Conversations
        for (const c of rawConversations) {
            try {
                const messages = c.messages || [];
                const lastMsg = messages[messages.length - 1];
                const cLead = c.lead ? leadMap[c.lead.toString()] : null;
                
                unified.push({
                    _id: c._id,
                    type: 'WhatsApp',
                    via: 'WhatsApp',
                    subject: 'AI Bot Conversation',
                    description: lastMsg?.content || 'Conversation started',
                    snippet: lastMsg?.content || 'Conversation started',
                    timestamp: c.updatedAt,
                    entityType: 'Lead',
                    entityId: c.lead,
                    participant: cLead ? (cLead.fullName || `${cLead.firstName} ${cLead.lastName}`) : 'Unknown',
                    phone: c.phoneNumber || (cLead ? cLead.mobile : ''),
                    participantName: cLead ? (cLead.fullName || `${cLead.firstName} ${cLead.lastName}`) : 'Unknown',
                    participantMobile: c.phoneNumber || (cLead ? cLead.mobile : ''),
                    direction: lastMsg?.role === 'user' ? 'Incoming' : 'Outgoing',
                    platform: 'WhatsApp Bot',
                    isMatched: !!(cLead && cLead.source !== 'AI Bot WhatsApp'),
                    phoneNumber: c.phoneNumber,
                    thread: messages.map(m => ({
                        sender: m.role === 'user' ? 'customer' : 'ai',
                        text: m.content,
                        time: m.timestamp
                    }))
                });
            } catch (err) { console.error("[MessagingHub] Conversation Map Error:", err.message); }
        }

        // 6. Final Sort and return
        unified.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            success: true,
            data: unified
        });
    } catch (error) {
        console.error("[ActivityController] getMessagingActivities error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

