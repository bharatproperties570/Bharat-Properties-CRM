import Activity from "../models/Activity.js";
import User from "../models/User.js";
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
import Lookup from "../models/Lookup.js";
import Project from "../models/Project.js";
import Inventory from "../models/Inventory.js";

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
    const inventoryIds = new Set();
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
        
        // Also look for Inventory IDs to attach Project and Block for legacy records
        if (String(a.entityType || '').toLowerCase() === 'inventory' && a.entityId) {
            inventoryIds.add(String(a.entityId).trim());
        } else if (Array.isArray(a.relatedTo)) {
            a.relatedTo.forEach(r => {
                if (String(r.model || '').toLowerCase() === 'inventory' && r.id) {
                    inventoryIds.add(String(r.id).trim());
                }
            });
        }
    });

    const leadIdArray = Array.from(leadIds);
    const contactIdArray = Array.from(contactIds);
    const inventoryIdArray = Array.from(inventoryIds);

    // Filter to valid object IDs for primary lookup
    const validLeadObjIds = leadIdArray.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
    const validContactObjIds = contactIdArray.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
    const validInventoryObjIds = inventoryIdArray.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

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
    const [leads, contacts, inventories] = await Promise.all([
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
        }).select('name surname phones emails title').populate('title').lean(),
        Inventory.find({
            _id: { $in: validInventoryObjIds }
        }).select('projectName block').lean()
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

    const inventoryMap = new Map();
    inventories.forEach(inv => {
        inventoryMap.set(String(inv._id), { project: inv.projectName, block: inv.block });
    });

    return activities.map(a => {
        const act = { ...a };
        
        // Identity Resolution Logic (Multi-Path)
        let entityMatch = null;
        let inventoryMatch = null;
        
        // Path A: Primary Pointer
        const eId = String(act.entityId || '');
        const eType = String(act.entityType || '').toLowerCase();
        entityMatch = eType === 'lead' ? leadMap.get(eId) : contactMap.get(eId);
        if (eType === 'inventory') inventoryMatch = inventoryMap.get(eId);

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
        
        if (!inventoryMatch && Array.isArray(act.relatedTo)) {
            for (const r of act.relatedTo) {
                if (String(r.model || '').toLowerCase() === 'inventory') {
                    inventoryMatch = inventoryMap.get(String(r.id));
                    if (inventoryMatch) break;
                }
            }
        }

        // Attach Inventory fields if found (for legacy records missing them in details)
        if (inventoryMatch) {
            act.details = { ...act.details, project: inventoryMatch.project, block: inventoryMatch.block };
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

// ━━ PIPELINE HEALTH: Outcome Classification ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HubSpot/Pipedrive style — classify each outcome as POSITIVE, NEGATIVE, or NEUTRAL
const NEGATIVE_OUTCOMES = new Set([
    'no answer', 'no-answer', 'busy', 'not connected', 'missed', 'switched off',
    'not reachable', 'unreachable', 'voicemail left', 'failed',
    'no show', 'visit cancelled', 'meeting cancelled', 'rescheduled', 'visit rescheduled',
    'no reply', 'bounced', 'blocked'
]);

const POSITIVE_OUTCOMES = new Set([
    'connected', 'interested', 'very interested', 'somewhat interested', 'shortlisted',
    'conducted', 'meeting done', 'deal likely', 'deal agreed', 'booking done',
    'replied - interested', 'replied', 'picked up', 'answered',
    'second visit', 'second visit requested', 'will think', 'callback requested'
]);

// AT-RISK THRESHOLD: N consecutive failures trigger the "At Risk" flag
const AT_RISK_THRESHOLD = 3;

/**
 * Track consecutive failed contacts — enterprise pipeline health tracker
 * Mirrors HubSpot "Deal Rotting" + Pipedrive inactivity pattern detection
 */
const updatePipelineHealth = async (leadId, resolvedOutcome, actType) => {
    try {
        const outcomeNorm = (resolvedOutcome || '').toLowerCase().trim();
        const isNegative = NEGATIVE_OUTCOMES.has(outcomeNorm) ||
            [...NEGATIVE_OUTCOMES].some(n => outcomeNorm.includes(n));
        const isPositive = POSITIVE_OUTCOMES.has(outcomeNorm) ||
            [...POSITIVE_OUTCOMES].some(p => outcomeNorm.includes(p));

        if (isNegative) {
            // Increment consecutive fail counter
            const lead = await Lead.findByIdAndUpdate(
                leadId,
                {
                    $inc: { consecutiveFailedContacts: 1 },
                    $set: { lastFailedContactAt: new Date() }
                },
                { new: true }
            ).select('consecutiveFailedContacts isAtRisk stage').populate('stage', 'lookup_value');

            const count = lead?.consecutiveFailedContacts || 0;
            const stageName = (lead?.stage?.lookup_value || '').toLowerCase();
            // Skip At-Risk flagging for already Closed/Booked leads
            const isTerminal = ['closed', 'booked'].some(s => stageName.includes(s));

            if (count >= AT_RISK_THRESHOLD && !lead?.isAtRisk && !isTerminal) {
                const reason = `${count} consecutive failed contacts (${actType}: ${resolvedOutcome}). Last failed: ${new Date().toLocaleDateString('en-IN')}`;
                await Lead.findByIdAndUpdate(leadId, {
                    $set: {
                        isAtRisk: true,
                        atRiskSince: new Date(),
                        atRiskReason: reason
                    }
                });

                // 🔔 Notify agent
                try {
                    const { createNotification } = await import('./notification.controller.js');
                    const fullLead = await Lead.findById(leadId).populate('assignment.assignedTo', '_id').lean();
                    if (fullLead?.assignment?.assignedTo?._id) {
                        await createNotification({
                            userId: fullLead.assignment.assignedTo._id,
                            title: '⚠️ Lead At Risk',
                            message: reason,
                            type: 'warning',
                            link: `/leads/${leadId}`
                        });
                    }
                } catch (_) {}

                console.log(`[PipelineHealth] 🔴 Lead ${leadId} flagged AT RISK: ${reason}`);
            }
        } else if (isPositive) {
            // Reset on any positive signal — Pipedrive style automatic recovery
            await Lead.findByIdAndUpdate(leadId, {
                $set: {
                    consecutiveFailedContacts: 0,
                    isAtRisk: false,
                    atRiskSince: null,
                    atRiskReason: null
                }
            });
        }
    } catch (err) {
        console.error('[PipelineHealth] updatePipelineHealth error:', err.message);
    }
};

export const autoTriggerStageChange = async (activity, userId = null) => {
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

        // 🏥 PIPELINE HEALTH: Track consecutive failures (runs in parallel, non-blocking)
        updatePipelineHealth(leadId, resolvedOutcome, actType).catch(() => {});

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
                purpose,
                status: activity.status
            }
        );

        // 2. Recalculate Lead Score (unified scoring engine)
        await LeadScoringService.computeAndSave(leadId, { triggeredBy: 'activity_completion', triggeredByUserId: userId });

        // 🚀 OMNICHANNEL AUTOMATION TRIGGER
        // Trigger professional workflow (WhatsApp/SMS/Email) based on the specific outcome
        if (resolvedOutcome) {
            const NurtureBot = (await import("../services/NurtureBot.js")).default;
            const lead = await Lead.findById(leadId).lean();
            if (lead) {
                // Determine triggerId from outcome (e.g., 'Interested', 'Visit Scheduled')
                // The Automation Engine rules are mapped to these outcome names
                await NurtureBot.executeAutomation(resolvedOutcome, lead);
            }
        }

        if (transition.stageChanged) {
            console.log(`[StageAlignment] Lead ${leadId} moved: ${transition.prevStage} → ${transition.newStage}`);
        }
        
        return transition;
    } catch (err) {
        console.error('[ActivityController] autoTriggerStageChange failed:', err.message);
        return null;
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
            limit = 100,
            includeCommunications = 'false',
            sortBy,
            sortOrder
        } = req.query;

        const visibilityFilter = await getVisibilityFilter(req.user);
        const query = { ...visibilityFilter };

        // Professional Sorting Engine
        const finalSortBy = sortBy || 'dueDate';
        const finalSortOrder = parseInt(sortOrder) || -1;
        const sortOption = { [finalSortBy]: finalSortOrder };

        // Secondary sort for consistency
        if (!sortOption.createdAt) sortOption.createdAt = -1;

        // 🌟 Senior Logic: Filter out omnichannel communications from the global activity list
        // These should only be visible in Communication Hub or Entity Timelines.
        // We include manual 'Call' and 'Email' tasks but exclude automated logs.
        // 🌟 Senior Logic: Filter out omnichannel communications from the global activity list
        // These should only be visible in Communication Hub or Entity Timelines.
        if (includeCommunications !== 'true') {
            const actionableTypes = ['Call', 'Call Back', 'Email', 'Meeting', 'Site Visit', 'Task', 'Follow Up', 'Feedback', 'Note'];
            const typeRegexes = actionableTypes.map(t => new RegExp(`^${t}$`, 'i'));
            
            query.$and = query.$and || [];
            
            // 1. MUST be an actionable task type
            query.$and.push({ type: { $in: typeRegexes } });
            
            // 2. MUST NOT be an automated system log or synced passive log
            query.$and.push({
                'details.sid': { $exists: false },
                'details.callSid': { $exists: false },
                'details.messageId': { $exists: false },
                'details.mobileId': { $exists: false }, // Fix: Excludes Android synced passive calls
                'details.isAutomated': { $ne: true },
                'details.source': { $nin: ['System', 'AI_PROFILER'] }
            });
        }


        if (entityId && mongoose.Types.ObjectId.isValid(entityId)) query.entityId = entityId;
        else if (entityId) return res.status(400).json({ success: false, error: "Invalid entityId format" });
        if (entityType) query.entityType = entityType;
        
        // If specific type is requested, it overrides the communication filter
        if (type) {
            query.type = type;
        }
        if (status) {
            if (status === 'Pending') {
                query.status = { $in: ['Pending', 'In Progress', 'Overdue'] };
            } else {
                query.status = status;
            }
        }
        if (assignedTo) query.assignedTo = assignedTo;
        
        if (req.query.contactPhone) {
            const cleanPhone = req.query.contactPhone.replace(/[^0-9]/g, "").slice(-10);
            const phoneRegex = new RegExp(`${cleanPhone}$`);
            query.$or = query.$or || [];
            query.$or.push(
                { "participants.mobile": phoneRegex },
                { "contactPhone": phoneRegex }
            );
        }

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
            .sort(sortOption)
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
            project: Project,
            projects: Project,
            inventory: Inventory
        };
        const ParentModel = ModelMap[entityType.toLowerCase()];
        
        if (ParentModel) {
            const parentExists = await ParentModel.findOne({ _id: objId, ...visibilityFilter }).select('_id').lean();
            if (!parentExists) {
                return res.status(403).json({ success: false, error: "Access Denied: You do not have permission to view this record's history." });
            }
        }

        // 0.1 Fetch Entity Mobile for wider conversation matching
        let leadDoc = null;
        let mobileForLookup = null;
        if (entityType.toLowerCase() === 'lead') {
            leadDoc = await Lead.findById(objId).populate('source subSource campaign').lean();
            if (leadDoc?.mobile) mobileForLookup = normalizePhone(leadDoc.mobile);
        } else if (entityType.toLowerCase() === 'contact') {
            const contactDoc = await Contact.findById(objId).select('phones').lean();
            if (contactDoc?.phones && contactDoc.phones.length > 0) {
                mobileForLookup = normalizePhone(contactDoc.phones[0].number);
            }
        }

        // 1. Fetch Activities (Primary + Related Links + Mobile Matching)
        // [SENIOR HARDENING]: Match by ID (ObjectId or String) across primary and related fields
        // We remove strict entityType matching to ensure activities linked to contacts but related to properties appear.
        const activityQuery = {
            $or: [
                { entityId: objId },
                { entityId: entityId },
                { "relatedTo.id": objId },
                { "relatedTo.id": entityId }
            ]
        };

        // Add Mobile Matching for Contacts/Leads (Omnichannel Intelligence)
        if (mobileForLookup) {
            activityQuery.$or.push(
                { "participants.mobile": mobileForLookup },
                { "details.mobile": mobileForLookup },
                { "details.phone": mobileForLookup }
            );
        }

        const activities = await Activity.find(activityQuery)
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
                type: a.type?.toLowerCase() === 'whatsapp' ? 'whatsapp' : (a.type?.toLowerCase() === 'feedback' ? 'feedback' : a.type.toLowerCase()),
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
                    eventType: l.eventType,
                    // Senior Injection: Add Campaign context to creation logs
                    campaign: leadDoc?.campaign,
                    source: leadDoc?.source,
                    subSource: leadDoc?.subSource,
                    source_meta: leadDoc?.source_meta
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
                actor: m.role === 'user' ? (entityType.toLowerCase() === 'lead' ? 'Lead' : 'Contact') : 'AI Nurture Bot',
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
const detectMentions = async (text, actorId, entityInfo) => {
    try {
        if (!text || !text.includes('@')) return;
        
        // Match @Name or @Surname (handling spaces if quoted or just standard Slack-like pattern)
        const mentions = text.match(/@(\w+)/g);
        if (!mentions) return;

        for (const mention of mentions) {
            const name = mention.substring(1).toLowerCase();
            // Search for user by name or email
            const users = await User.find({
                $or: [
                    { firstName: { $regex: new RegExp(`^${name}$`, 'i') } },
                    { lastName: { $regex: new RegExp(`^${name}$`, 'i') } },
                    { fullName: { $regex: new RegExp(`${name}`, 'i') } }
                ]
            }).select('_id fullName').lean();

            for (const user of users) {
                if (String(user._id) === String(actorId)) continue; // Don't notify self

                await createNotification(
                    user._id,
                    'mentions',
                    '🏷️ You were mentioned',
                    `${entityInfo.actorName} mentioned you in a ${entityInfo.type}: "${text.substring(0, 50)}..."`,
                    entityInfo.link,
                    { sourceEntityId: entityInfo.id },
                    'high'
                ).catch(() => {});
            }
        }
    } catch (err) {
        console.error('[MentionDetection] Failed:', err.message);
    }
};

export const addActivity = async (req, res) => {
    try {
        const activityData = { ...req.body };
        const actorName = req.user?.fullName || req.user?.name || 'A teammate';
        
        // Auto-set performer name from authenticated user
        if (req.user) {
            activityData.createdBy = req.user.id || req.user._id;
            activityData.performedBy = actorName;
            // Default teams to user's teams if no inheritance happens later
            if (!activityData.teams || activityData.teams.length === 0) {
                activityData.teams = Array.isArray(req.user.teams) ? req.user.teams : (req.user.team ? [req.user.team] : []);
            }
        }

        // 🚀 Team & Department Inheritance from Parent Entity
        if (activityData.entityType && activityData.entityId && mongoose.Types.ObjectId.isValid(activityData.entityId)) {
            const ModelMap = { leads: Lead, contact: mongoose.model('Contact'), deal: Deal, project: mongoose.model('Project'), company: mongoose.model('Company'), inventory: mongoose.model('Inventory') };
            const ParentModel = ModelMap[activityData.entityType.toLowerCase() + 's'] || ModelMap[activityData.entityType.toLowerCase()];
            if (ParentModel) {
                const parent = await ParentModel.findById(activityData.entityId).select('teams department assignment.team').lean();
                if (parent) {
                    const inheritedTeams = parent.teams || parent.assignment?.team || [];
                    if (inheritedTeams.length > 0) {
                        activityData.teams = inheritedTeams;
                    }
                    if (parent.department) {
                        activityData.department = parent.department;
                    }
                }
            }
        }

        // Fallback to user's department if not inherited
        if (!activityData.department && req.user?.department) {
            activityData.department = req.user.department;
        }

        const activity = await Activity.create(activityData);
        
        // 🚀 Detect Mentions in Note/Description
        if (activity.description) {
            detectMentions(activity.description, req.user?.id || req.user?._id, {
                actorName,
                type: activity.type || 'Activity',
                id: activity.entityId,
                link: `/${String(activity.entityType || 'lead').toLowerCase()}s/${activity.entityId}`
            });
        }

        // Auto-run Enrichment if entity is a Lead
        if (activity.entityType?.toLowerCase() === 'lead' && activity.entityId) {
            await enrichmentQueue.add('enrichLead', { leadId: activity.entityId });
            // Update lastActivityAt if not missed
            const outcome = (activity.details?.outcome || activity.completionResult || '').toLowerCase();
            const isMissed = ['no-answer', 'no answer', 'busy', 'failed', 'not connected', 'missed'].some(s => outcome.includes(s));
            if (!isMissed) {
                await Lead.findByIdAndUpdate(activity.entityId, { lastActivityAt: new Date() }).catch(() => { });
            }
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
        let transition = null;
        if (activity.entityType?.toLowerCase() === 'lead' && activity.status?.toLowerCase() === 'completed') {
            transition = await autoTriggerStageChange(activity, req.user?.id || req.user?._id || activity.assignedTo || null);
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

        res.status(201).json({ success: true, data: activity, transition });
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

        const visibilityFilter = await getVisibilityFilter(req.user);
        // 🌟 SENIOR ADDITION: Notify on reassignment
        if (updateData.assignedTo) {
            const existingAct = await Activity.findOne({ _id: req.params.id, ...visibilityFilter }).select('assignedTo subject type').lean();
            if (existingAct && String(existingAct.assignedTo) !== String(updateData.assignedTo)) {
                await createNotification(
                    updateData.assignedTo,
                    'assignment',
                    '🔄 Activity Reassigned to You',
                    `Activity "${existingAct.subject}" has been reassigned to you.`,
                    `/activities/${req.params.id}`,
                    { activityId: req.params.id }
                ).catch(() => {});
            }
        }

        const activity = await Activity.findOneAndUpdate(
            { _id: req.params.id, ...visibilityFilter },
            updateData,
            { new: true, runValidators: true }
        );

        if (!activity) {
            return res.status(404).json({ success: false, error: "Activity not found" });
        }

        // Auto-run Enrichment if entity is a Lead
        if (activity.entityType?.toLowerCase() === 'lead' && activity.entityId) {
            await enrichmentQueue.add('enrichLead', { leadId: activity.entityId });
            // Update lastActivityAt if not missed
            const outcome = (activity.details?.outcome || activity.completionResult || '').toLowerCase();
            const isMissed = ['no-answer', 'no answer', 'busy', 'failed', 'not connected', 'missed'].some(s => outcome.includes(s));
            if (!isMissed) {
                await Lead.findByIdAndUpdate(activity.entityId, { lastActivityAt: new Date() }).catch(() => { });
            }
        } else if (activity.entityType?.toLowerCase() === 'deal' && activity.entityId) {
            // Update lastActivityAt for Deal
            await Deal.findByIdAndUpdate(activity.entityId, { lastActivityAt: new Date() }).catch(() => { });
        }

        // Bug 6 Fix: Auto-trigger stage change based on activity outcome mapping
        let transition = null;
        if (activity.entityType?.toLowerCase() === 'lead' && activity.status?.toLowerCase() === 'completed') {
            transition = await autoTriggerStageChange(activity, req.user?.id || req.user?._id || activity.assignedTo || null);
        }

        // Sync to Google Calendar
        googleSyncQueue.add('syncEvent', { activityId: activity._id }).catch(() => { });

        res.json({ success: true, data: activity, transition });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete an activity
// @route   DELETE /api/activities/:id
export const deleteActivity = async (req, res) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const activity = await Activity.findOneAndDelete({ _id: req.params.id, ...visibilityFilter });

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
        const pendingResolutions = [];

        // Helper for entity matching
        const findEntity = async (phone) => {
            if (!phone) return null;
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const normalizedPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;
            const escapedPhone = escapeRegExp(normalizedPhone);
            
            // Search criteria: match the last 10 digits
            const phoneQuery = { $regex: new RegExp(`${escapedPhone}$`) };

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
                assignedTo: req.user?._id || req.user?.id,
                createdBy: req.user?._id || req.user?.id,
                relatedTo: match ? [{ id: match.entity._id, name: match.name, model: match.type }] : [],
                participants: [{ name: participantName, mobile: call.number }],
                dueDate: new Date(call.timestamp),
                status: 'Completed',
                description: `Synced from mobile. Duration: ${call.duration}s. Raw: ${call.number}`,
                details: {
                    direction: call.type?.toUpperCase() === 'INCOMING' ? 'Incoming Call' : (call.type?.toUpperCase() === 'MISSED' ? 'Missed Call' : 'Outgoing Call'),
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
            
            // 🚀 [SENIOR FIX] Ensure teams, department and assignedTo are ALWAYS set for visibility
            if ((!activityData.teams || activityData.teams.length === 0) && req.user) {
                // If user belongs to teams, assign this activity to those teams so it's visible in their scope
                activityData.teams = Array.isArray(req.user.teams) ? req.user.teams : (req.user.team ? [req.user.team] : []);
            }
            if (!activityData.department && req.user?.department) {
                activityData.department = req.user.department;
            }
            if (!activityData.assignedTo && req.user) {
                activityData.assignedTo = req.user._id || req.user.id;
            }

            const existing = await Activity.findOne({ "details.mobileId": call.id, "details.platform": 'Mobile' });
            if (!existing) {
                const activity = await Activity.create(activityData);
                googleSyncQueue.add('syncEvent', { activityId: activity._id }).catch(() => { });
                syncedActivities.push(activity);

                let pendingActivity = null;
                if (match) {
                    pendingActivity = await Activity.findOne({
                        type: 'Call',
                        status: { $in: ['Pending', 'In Progress'] },
                        'relatedTo.id': match.entity._id,
                        assignedTo: req.user?._id || req.user?.id
                    }).lean();
                }

                if (pendingActivity && (req.user?.id || req.user?._id)) {
                    await createNotification(
                        req.user.id || req.user._id,
                        'pending_call_resolution',
                        `Action Required: Call Logged`,
                        `Please complete your scheduled call activity for ${participantName}.`,
                        `/activities/${pendingActivity._id}`,
                        { 
                            activityId: pendingActivity._id, 
                            syncActivityId: activity._id, 
                            type: 'pending_call_resolution',
                            participantName,
                            number: call.number
                        }
                    );
                    pendingResolutions.push({
                        activityId: pendingActivity._id,
                        entityName: participantName,
                        mobile: call.number
                    });
                } else if (req.user?.id || req.user?._id) {
                    await createNotification(
                        req.user.id || req.user._id,
                        activity.details?.direction === 'Incoming Call' ? 'assignment' : 'system',
                        `Mobile Call: ${activity.details?.direction}`,
                        `${activity.details?.direction} from ${participantName} (${call.number})`,
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
                description: `Synced from mobile SMS. Raw: ${msg.address}\n\nBody: ${msg.body}`,
                details: {
                    direction: msg.type?.toUpperCase() === 'INCOMING' ? 'Incoming' : 'Outgoing',
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
            pendingResolutions,
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
        const { phoneNumber, message, channel = 'whatsapp', entityId, entityType, attachment } = req.body;

        if (!phoneNumber || (!message && !attachment)) {
            return res.status(400).json({ success: false, error: "Phone number and message/attachment are required" });
        }

        // 1. Resolve Services
        const waService = (await import('../services/WhatsAppService.js')).default;
        const smsSvc = (await import('../services/SmsService.js')).default;
        
        const cleanPhone = normalizePhone(phoneNumber);
        let dispatchResult = { success: false, error: "Initialization error" };

        try {
            if (channel.toLowerCase() === 'whatsapp') {
                if (attachment) {
                    // Send Media/Special Message
                    dispatchResult = await waService.sendMedia(
                        cleanPhone, 
                        attachment.type, 
                        attachment.url, 
                        attachment.caption || message,
                        attachment.filename,
                        attachment // Pass whole object for location/contacts
                    );
                } else {
                    dispatchResult = await waService.sendMessage(cleanPhone, message);
                }
            } else if (channel.toLowerCase() === 'sms') {
                dispatchResult = await smsSvc.sendSms(cleanPhone, message, { entityId, entityType });
            } else {
                dispatchResult = await waService.sendMessage(cleanPhone, message);
            }
        } catch (dispatchError) {
            console.error(`[EnterpriseHub] Dispatch Engine CRASH:`, dispatchError);
            return res.status(500).json({ success: false, error: `Critical Dispatch Error: ${dispatchError.message}` });
        }

        if (!dispatchResult || !dispatchResult.success) {
            return res.status(400).json({ success: false, error: dispatchResult?.error || "Failed to dispatch message." });
        }

        // 2. Log Activity
        const activity = await Activity.create({
            type: 'Messaging',
            subject: `Reply via ${channel.toUpperCase()}${attachment ? ` (${attachment.type})` : ''}`,
            description: message || `Sent ${attachment.type}`,
            entityType: entityType || 'Unknown',
            entityId: entityId || null,
            dueDate: new Date(),
            status: 'Completed',
            details: {
                direction: 'Outgoing',
                platform: channel === 'whatsapp' ? 'WhatsApp' : 'SMS',
                messageId: dispatchResult.messageId || dispatchResult.sid,
                isManualReply: true,
                phoneNumber: cleanPhone,
                attachment: attachment || null
            },
            performedBy: req.user?.fullName || "Agent",
            performedAt: new Date()
        });

        // 3. Update Conversation History
        const displayMsg = message || `Sent ${attachment?.type || 'file'}`;

        await Conversation.findOneAndUpdate(
            { phoneNumber: cleanPhone },
            { 
                $push: { 
                    messages: { 
                        role: 'assistant', 
                        content: displayMsg, 
                        timestamp: new Date(),
                        metadata: attachment ? { attachment } : null 
                    } 
                },
                status: 'handed_off', 
                updatedAt: new Date()
            },
            { upsert: true }
        );

        res.json({ success: true, data: activity });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Get all messaging records (Activity + Conversation) for Communication Hub
 * @route   GET /api/activities/messaging
 */
export const getMessagingActivities = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            sortBy = 'date',
            sortOrder = -1,
            search,
            channel = 'all',
            subTab = 'all'
        } = req.query;

        const visibilityFilter = await getVisibilityFilter(req.user);

        // 1. Optimized Combined Query
        // 🚀 Senior Profession: Filter at DB level to reduce memory footprint
        const messagingTypes = ['WhatsApp', 'whatsapp', 'Call', 'call', 'Email', 'email', 'SMS', 'sms', 'Voice', 'voice', 'Messaging'];
        const query = {
            $and: [
                { type: { $in: messagingTypes } },
                {
                    $or: [
                        { ...visibilityFilter },
                        { assignedTo: { $exists: false } }
                    ]
                }
            ]
        };

        if (channel !== 'all') {
            if (channel === 'Voice') query.type = { $in: ['Voice', 'voice', 'Call', 'call'] };
            else if (channel === 'Email') query.type = { $in: ['Email', 'email'] };
            else if (channel === 'WhatsApp') query.type = { $in: ['WhatsApp', 'whatsapp'] };
            else if (channel === 'SMS') query.type = { $in: ['SMS', 'sms', 'Messaging'] };
        }

        // Fetch larger batch for grouping but limited to manageable size
        const [activities, rawConversations, rawSmsLogs] = await Promise.all([
            Activity.find(query).sort({ createdAt: -1 }).limit(800).lean(),
            Conversation.find(channel === 'all' || channel === 'WhatsApp' ? {} : { _id: null }).sort({ updatedAt: -1 }).limit(100).lean(),
            SmsLog.find(channel === 'all' || channel === 'SMS' ? {} : { _id: null }).sort({ sentAt: -1 }).limit(100).lean()
        ]);

        // 2. High-Performance Identity Mapping (O(1) Access)
        const identifierSet = new Set();
        const entityIdSet = new Set();

        const collectIdentifiers = (phone, email, eId) => {
            if (phone) identifierSet.add(normalizePhone(phone));
            if (email) identifierSet.add(email.toLowerCase());
            if (eId && mongoose.Types.ObjectId.isValid(eId)) entityIdSet.add(eId.toString());
        };

        activities.forEach(a => {
            collectIdentifiers(a.details?.phoneNumber || a.participants?.[0]?.mobile, a.details?.email || a.participants?.[0]?.email, a.entityId);
        });
        rawConversations.forEach(c => collectIdentifiers(c.phoneNumber, null, c.lead || c.contact));
        rawSmsLogs.forEach(l => collectIdentifiers(l.to, null, l.entityId));

        const uniqueIdentifiers = Array.from(identifierSet);
        const uniqueEntityIds = Array.from(entityIdSet).map(id => new mongoose.Types.ObjectId(id));

        // Parallel Identity Lookup
        const [leads, contacts] = await Promise.all([
            Lead.find({ $or: [{ mobile: { $in: uniqueIdentifiers } }, { email: { $in: uniqueIdentifiers } }, { _id: { $in: uniqueEntityIds } }] }).select('firstName lastName fullName mobile email').lean(),
            Contact.find({ $or: [{ 'phones.number': { $in: uniqueIdentifiers } }, { 'emails.address': { $in: uniqueIdentifiers } }, { _id: { $in: uniqueEntityIds } }] }).select('name phones emails').lean()
        ]);

        const identityMap = new Map();
        const identifierToNameMap = new Map();

        leads.forEach(l => {
            const name = l.fullName || `${l.firstName} ${l.lastName}`.trim();
            identityMap.set(l._id.toString(), { name, model: 'Lead', phone: l.mobile });
            if (l.mobile) identifierToNameMap.set(normalizePhone(l.mobile), name);
            if (l.email) identifierToNameMap.set(l.email.toLowerCase(), name);
        });
        contacts.forEach(c => {
            const name = c.name;
            identityMap.set(c._id.toString(), { name, model: 'Contact', phone: c.phones?.[0]?.number });
            c.phones?.forEach(p => { if (p.number) identifierToNameMap.set(normalizePhone(p.number), name); });
            c.emails?.forEach(e => { if (e.address) identifierToNameMap.set(e.address.toLowerCase(), name); });
        });

        // 3. Thread Correlation Mapping
        const convLookupMap = new Map();
        rawConversations.forEach(c => convLookupMap.set(normalizePhone(c.phoneNumber), c));

        // 4. Unified Stream Construction (Map-based Grouping)
        const conversationsMap = new Map();

        const getParticipantName = (identifier, entityId, fallback) => {
            if (entityId && identityMap.has(entityId.toString())) return identityMap.get(entityId.toString()).name;
            if (identifierToNameMap.has(identifier)) return identifierToNameMap.get(identifier);
            return fallback || identifier;
        };

        // 4.1 Process Activities
        activities.forEach(a => {
            const phone = normalizePhone(a.details?.phoneNumber || a.participants?.[0]?.mobile || '');
            const email = (a.details?.email || a.participants?.[0]?.email || '').toLowerCase();
            const identifier = phone || email;
            if (!identifier) return;

            const via = ['Call', 'Voice', 'call', 'voice'].includes(a.type) ? 'Voice' : (['Email', 'email'].includes(a.type) ? 'Email' : (['WhatsApp', 'whatsapp'].includes(a.type) || a.details?.platform === 'WhatsApp' ? 'WhatsApp' : 'SMS'));
            const key = `${identifier}_${via}`;

            if (!conversationsMap.has(key) || new Date(a.createdAt) > new Date(conversationsMap.get(key).timestamp)) {
                conversationsMap.set(key, {
                    _id: a._id,
                    type: a.type,
                    via,
                    subject: a.subject,
                    description: a.description,
                    snippet: a.description || a.subject,
                    entityType: a.entityType,
                    entityId: a.entityId,
                    participant: getParticipantName(identifier, a.entityId, a.participants?.[0]?.name),
                    phone: phone,
                    phoneNumber: phone,
                    email: email,
                    isMatched: !!(a.entityId && a.entityType !== 'Unknown'),
                    outcome: a.details?.status || a.outcome || a.status || 'Delivered',
                    timestamp: a.createdAt,
                    date: a.createdAt,
                    // 🚀 Ultra-Fast: Don't send thread in list view
                    thread: [] 
                });
            }
        });

        // 4.2 Process SMS Logs & Conversations
        rawSmsLogs.forEach(log => {
            const phone = normalizePhone(log.to);
            const key = `${phone}_SMS`;
            if (!conversationsMap.has(key) || new Date(log.sentAt) > new Date(conversationsMap.get(key).timestamp)) {
                conversationsMap.set(key, {
                    _id: log._id, type: 'Messaging', via: 'SMS', subject: 'Outgoing SMS',
                    description: log.message, snippet: log.message, entityType: log.entityType, entityId: log.entityId,
                    participant: getParticipantName(phone, log.entityId), phone, phoneNumber: phone,
                    isMatched: !!log.entityId, outcome: log.status, timestamp: log.sentAt, date: log.sentAt,
                    thread: []
                });
            }
        });

        rawConversations.forEach(c => {
            const phone = normalizePhone(c.phoneNumber);
            const key = `${phone}_WhatsApp`;
            if (!conversationsMap.has(key) || new Date(c.updatedAt) > new Date(conversationsMap.get(key).timestamp)) {
                const lastMsg = c.messages?.[c.messages.length - 1];
                conversationsMap.set(key, {
                    _id: c._id, type: 'WhatsApp', via: 'WhatsApp', subject: 'AI Bot Conversation',
                    description: lastMsg?.content || 'Conversation started', snippet: lastMsg?.content || 'Conversation started',
                    entityType: c.lead ? 'Lead' : 'Contact', entityId: c.lead || c.contact,
                    participant: getParticipantName(phone, c.lead || c.contact), phone, phoneNumber: phone,
                    isMatched: !!(c.lead || c.contact), outcome: 'Active', timestamp: c.updatedAt, date: c.updatedAt,
                    thread: []
                });
            }
        });

        // 5. Final Filtering, Sort & Paginate
        let unified = Array.from(conversationsMap.values());
        
        if (subTab === 'matched') unified = unified.filter(i => i.isMatched);
        else if (subTab === 'unmatched') unified = unified.filter(i => !i.isMatched);

        if (search) {
            const s = search.toLowerCase();
            unified = unified.filter(i => i.participant.toLowerCase().includes(s) || i.phone.includes(s) || (i.description || '').toLowerCase().includes(s));
        }

        unified.sort((a, b) => (new Date(a.timestamp) - new Date(b.timestamp)) * sortOrder);

        const totalCount = unified.length;
        const startIndex = (page - 1) * limit;
        const paginatedData = unified.slice(startIndex, startIndex + Number(limit));

        // 6. Global KPI Counts (Fast count)
        const [totalStreams, matchedStreams, failedStreams] = await Promise.all([
            Activity.countDocuments(query),
            Activity.countDocuments({ ...query, $or: [{ entityId: { $exists: true, $ne: null } }, { 'details.isMatched': true }] }),
            Activity.countDocuments({ ...query, outcome: 'Failed' })
        ]);

        res.json({
            success: true,
            data: paginatedData,
            pagination: { 
                totalCount, 
                totalPages: Math.ceil(totalCount / limit), 
                currentPage: Number(page), 
                limit: Number(limit) 
            },
            kpis: {
                total: totalStreams,
                matched: matchedStreams,
                failed: failedStreams
            }
        });

    } catch (error) {
        console.error("[ActivityController] Optimized MessagingHub Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Manual conversion of a messaging participant to a lead
 * @route   POST /api/activities/messaging/convert-to-lead
 */
/**
 * @desc    Get full thread history for a specific identifier (Ultra-Fast Selection)
 * @route   GET /api/activities/messaging/thread/:identifier
 */
export const getThreadHistory = async (req, res) => {
    try {
        const { identifier } = req.params;
        const { via } = req.query; // WhatsApp, SMS, Voice, Email
        if (!identifier) return res.status(400).json({ success: false, error: "Identifier required" });

        const phone = normalizePhone(identifier);
        const email = identifier.toLowerCase();
        const visibilityFilter = await getVisibilityFilter(req.user);

        // 1. Fetch relevant records in parallel
        const [activities, conversations] = await Promise.all([
            Activity.find({
                $and: [
                    { ...visibilityFilter },
                    { $or: [
                        { 'details.phoneNumber': phone },
                        { 'details.phoneNumber': identifier },
                        { 'details.email': email },
                        { 'participants.mobile': phone },
                        { 'participants.email': email }
                    ]}
                ]
            }).sort({ createdAt: 1 }).lean(),
            Conversation.find({ phoneNumber: phone }).lean()
        ]);

        // 2. Unify and Sort
        let thread = activities.map(a => ({
            sender: (a.details?.direction || '').toLowerCase().includes('in') ? 'customer' : 'agent',
            text: a.description || a.subject,
            time: a.createdAt,
            metadata: a.details?.attachment ? { attachment: a.details.attachment } : null
        }));

        if (conversations.length > 0) {
            const aiMsgs = conversations.flatMap(c => (c.messages || []).map(m => ({
                sender: m.role === 'user' ? 'customer' : (m.role === 'assistant' ? 'ai' : 'agent'),
                text: m.content,
                time: m.timestamp,
                metadata: m.metadata
            })));
            thread = [...thread, ...aiMsgs];
        }

        // De-duplicate and sort by time
        const seen = new Set();
        const uniqueThread = thread.filter(m => {
            const key = `${new Date(m.time).getTime()}-${m.text}-${m.sender}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((a, b) => new Date(a.time) - new Date(b.time));

        res.json({ success: true, data: uniqueThread });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const convertToLead = async (req, res) => {
    try {
        const { phoneNumber, name, source = 'Direct Messaging' } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ success: false, error: "Phone number is required" });
        }

        const cleanPhone = normalizePhone(phoneNumber);

        // 1. Double check duplicate
        const existingLead = await Lead.findOne({ mobile: cleanPhone });
        if (existingLead) {
            return res.status(400).json({ success: false, error: "Lead already exists with this phone number", data: existingLead });
        }

        // 2. Resolve Status & Stage for 'New'
        const newStatus = await Lookup.findOne({ lookup_type: 'Status', lookup_value: /New/i });
        const newStage = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: /New/i });

        // 3. Create Lead
        const lead = await Lead.create({
            firstName: name || "Messaging",
            lastName: "Lead",
            mobile: cleanPhone,
            source: source,
            status: newStatus?._id || null,
            stage: newStage?._id || null,
            owner: req.user?._id || null,
            remarks: `Manually created from Communication Hub by ${req.user?.fullName || 'Agent'}`
        });

        // 4. Update Conversation to link the lead
        await Conversation.findOneAndUpdate(
            { phoneNumber: cleanPhone },
            { lead: lead._id, status: 'handed_off' }
        );

        // 5. Update activities for this phone number to link to the new lead
        await Activity.updateMany(
            { "details.phoneNumber": cleanPhone },
            { entityId: lead._id, entityType: 'Lead' }
        );

        res.json({ success: true, data: lead });
    } catch (error) {
        // 🚀 Senior Professional: Handle Duplicate Merge Exception from Lead model
        if (error.isDuplicateMerge) {
            console.log(`[EnterpriseComm] Conversion: Duplicate merged for ${req.body.phoneNumber}`);
            return res.status(200).json({
                success: true,
                message: "Lead already exists. Details updated and linked.",
                data: error.mergedLead
            });
        }

        console.error('[EnterpriseComm] Conversion Error:', error.stack || error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

