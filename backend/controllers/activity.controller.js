import Activity from "../models/Activity.js";
import OutboxEvent from "../models/OutboxEvent.js";
import { withMongoTransaction } from "../utils/withMongoTransaction.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { DomainEventPublisher } from '../utils/DomainEventPublisher.js';
import AuditLog from "../models/AuditLog.js";
import Lead from "../models/Lead.js";
import Deal from "../models/Deal.js";
import Conversation from "../models/Conversation.js";
import SmsLog from "../src/modules/sms/smsLog.model.js";
import { enrichmentQueue, googleSyncQueue } from "../src/queues/queueManager.js";

import * as StageTransitionEngine from "../src/services/StageTransitionEngine.js";
import LeadScoringService from "../src/services/LeadScoringService.js";
import { createNotification } from "./notification.controller.js";
import { getVisibilityFilter } from "../utils/visibility.js";
import { normalizePhone } from "../utils/normalization.js";
import Contact from "../models/Contact.js";
import Lookup from "../models/Lookup.js";
import Project from "../models/Project.js";
import Inventory from "../models/Inventory.js";
import { interpolateTemplateText } from "../utils/templateResolver.js";
import RealtimeHub from "../services/RealtimeHub.js";
import { BaileysConnectionManager } from "../services/baileysQueue/BaileysConnectionManager.js";

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
        if (!mongoose.connection || mongoose.connection.readyState !== 1) return;
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

export const autoTriggerStageChange = async (activityInput, userId = null) => {
    try {
        let activity = activityInput;
        if (!activity) return null;
        if (typeof activity === 'string' || activity instanceof mongoose.Types.ObjectId) {
            activity = await Activity.findById(activity);
        } else if (activity._id && !activity.type) {
            activity = await Activity.findById(activity._id);
        }
        if (!activity) return null;

        if (activity.entityType?.toLowerCase() !== 'lead') return null;
        if (activity.status?.toLowerCase() !== 'completed') return null;
        if (!activity.entityId) return null;

        const leadId = activity.entityId;
        const actType = activity.type;
        const outcome = activity.details?.completionResult ||
                        activity.details?.meetingOutcomeStatus ||
                        activity.details?.callOutcome ||
                        activity.details?.outcome ||
                        activity.completionResult || '';
        const reason = activity.details?.outcomeReason || activity.details?.reason || '';
        const purpose = activity.details?.purpose || activity.details?.meetingPurpose || activity.details?.callPurpose || activity.purpose || '';

        // Site Visit & Meeting special outcome resolution
        let resolvedOutcome = outcome;
        const actTypeLower = actType?.toLowerCase();
        if (!resolvedOutcome && (actTypeLower === 'site visit' || actTypeLower === 'meeting') && Array.isArray(activity.details?.visitedProperties)) {
            const priorityMap = { 'token given': 1, 'final deal': 1, 'negotiation': 2, 'very interested': 3, 'shortlisted': 4, 'somewhat interested': 5 };
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
                status: activity.status,
                visitedProperties: activity.details?.visitedProperties || []
            }
        );

        // 2. Recalculate Lead Score (unified scoring engine)
        const { AuthorityProofIssuer } = await import('../utils/ServerAuthorityProof.js');
        const systemContract = AuthorityProofIssuer.issueSystemContract('activity_completion');
        await LeadScoringService.computeAndSave(
            leadId,
            { triggeredBy: 'activity_completion', triggeredByUserId: userId },
            { user: req.user, systemAuthorityContract: systemContract }
        );

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

        // 🏢 ENTERPRISE: Deal Auto-Sync Cascade
        try {
            // Find if this activity relates to any Deals
            const dealRelations = (activity.relatedTo || []).filter(r => r.model === 'Deal' && r.id);
            const dealIds = dealRelations.map(r => r.id);

            // Also if entityType is Deal (unlikely for Lead activity, but safety fallback)
            if (activity.entityType?.toLowerCase() === 'deal' && activity.entityId) {
                dealIds.push(activity.entityId);
            }

            if (dealIds.length > 0) {
                const uniqueDealIds = [...new Set(dealIds)];

                // For each linked Deal:
                // 1. Add this Lead to the Deal's leads array
                // 2. Trigger a sync using all leads connected to that deal
                const { internalSyncDealStage } = await import('./stage.controller.js');

                for (const dId of uniqueDealIds) {
                    // Link lead to deal (idempotent addToSet)
                    await Deal.findByIdAndUpdate(dId, {
                        $addToSet: { leads: leadId }
                    }).catch(() => {});

                    // Fetch all leads now linked to this deal to resolve multi-lead stage
                    const deal = await Deal.findById(dId).select('leads').lean();
                    if (deal && deal.leads && deal.leads.length > 0) {
                        const linkedLeads = await Lead.find({ _id: { $in: deal.leads } })
                            .select('stage')
                            .populate('stage', 'lookup_value')
                            .lean();

                        const leadStages = linkedLeads.map(l => typeof l.stage === 'object' ? l.stage?.lookup_value : l.stage).filter(Boolean);

                        if (leadStages.length > 0) {
                            await internalSyncDealStage(dId, leadStages, {
                                reason: `Auto-cascade from Lead activity: ${actType}`,
                                user: userId
                            });
                            console.log(`[DealSyncCascade] Deal ${dId} synchronized based on ${leadStages.length} linked leads.`);
                        }
                    }
                }
            }
        } catch (cascadeErr) {
            console.error('[DealSyncCascade] Failed during auto-cascade:', cascadeErr.message);
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

        // Auto-set performer name from authenticated user and isolate tenant
        const effectiveTenantId = req.user?.tenantId || req.user?.tenant || null;
        if (effectiveTenantId) {
            activityData.tenantId = effectiveTenantId;
        }

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
            const getModel = (name) => mongoose.models[name] || null;
            const ModelMap = {
                leads: Lead,
                lead: Lead,
                contacts: getModel('Contact'),
                contact: getModel('Contact'),
                deals: Deal,
                deal: Deal,
                projects: getModel('Project'),
                project: getModel('Project'),
                companies: getModel('Company'),
                company: getModel('Company'),
                inventories: getModel('Inventory'),
                inventory: getModel('Inventory')
            };
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

        let activity = null;
        let transition = null;
        await withMongoTransaction(async (session) => {
            activity = (await Activity.create([activityData], { session }))[0];

            const outboxEntry = {
                eventType: 'ActivityCreated',
                aggregateType: 'Activity',
                aggregateId: activity._id,
                payload: {
                    ...activity.toJSON(),
                    actorId: req.user?.id || req.user?._id || null
                }
            };
            if (effectiveTenantId) {
                outboxEntry.tenantId = effectiveTenantId;
            }

            await OutboxEvent.create([outboxEntry], { session });

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
                await Lead.findByIdAndUpdate(activity.entityId, { lastActivityAt: new Date() }, { session }).catch(() => { });
            }
        } else if (activity.entityType?.toLowerCase() === 'deal' && activity.entityId) {
            // Update lastActivityAt for Deal
            const dealUpdate = { lastActivityAt: new Date() };

            // Handle Activity-Driven Deal Loss
            if (activity.details?.markDealAsLost) {
                dealUpdate.stage = 'Closed Lost';
                dealUpdate.closedAt = new Date();
                dealUpdate.closingDetails = {
                    lostReason: activity.details.lostReason || 'Activity Outcome Negative',
                    lostPrice: activity.details.lostPrice ? Number(activity.details.lostPrice) : null,
                    lostDate: activity.details.lostDate || new Date()
                };
            }

            await Deal.findByIdAndUpdate(activity.entityId, dealUpdate, { session }).catch(() => { });
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
                    await Deal.findByIdAndUpdate(dealId, updateData, { session }).catch(err => console.error("Score/Unit sync failed:", err));
                }
            }
        }

        if (activity.entityType?.toLowerCase() === 'lead' && activity.status?.toLowerCase() === 'completed') {
            const outcome = activity.details?.completionResult || activity.details?.meetingOutcomeStatus || activity.details?.callOutcome || activity.details?.outcome || activity.completionResult || '';
            const reason = activity.details?.outcomeReason || activity.details?.reason || '';
            const purpose = activity.details?.purpose || activity.details?.meetingPurpose || activity.details?.callPurpose || activity.purpose || '';

            let resolvedOutcome = outcome;
            const actTypeLower = activity.type?.toLowerCase();
            if (!resolvedOutcome && (actTypeLower === 'site visit' || actTypeLower === 'meeting') && Array.isArray(activity.details?.visitedProperties)) {
                const priorityMap = { 'token given': 1, 'final deal': 1, 'negotiation': 2, 'very interested': 3, 'shortlisted': 4, 'somewhat interested': 5 };
                resolvedOutcome = activity.details.visitedProperties
                    .map(p => (p.result || '').toLowerCase())
                    .filter(Boolean)
                    .sort((a, b) => (priorityMap[a] || 99) - (priorityMap[b] || 99))[0] || '';
            }

            transition = await StageTransitionEngine.evaluateAndTransition(
                activity.entityId,
                activity.type,
                resolvedOutcome,
                reason,
                {},
                {
                    activityId: activity._id,
                    triggeredByUser: req.user?.id || req.user?._id || activity.assignedTo || null,
                    purpose,
                    status: activity.status,
                    visitedProperties: activity.details?.visitedProperties || [],
                    session
                }
            );
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

        // Sync and Workflows moved to durable OutboxEvent (C8)

                }); // end tx
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
        const existingAct = await Activity.findOne({ _id: req.params.id, ...visibilityFilter }).lean();
        if (!existingAct) {
            return res.status(404).json({ success: false, error: "Activity not found" });
        }

        // 🌟 SENIOR ADDITION: Notify on reassignment
        if (updateData.assignedTo) {
            if (String(existingAct.assignedTo) !== String(updateData.assignedTo)) {
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

        let activity = null;
        let transition = null;
        await withMongoTransaction(async (session) => {
            activity = await Activity.findOneAndUpdate(
                { _id: req.params.id, ...visibilityFilter },
                updateData,
                { new: true, runValidators: true, session }
            );

            if (!activity) {
                const notFoundErr = new Error("Activity not found");
                notFoundErr.statusCode = 404;
                throw notFoundErr;
            }

            // Auto-run Enrichment if entity is a Lead
            if (activity.entityType?.toLowerCase() === 'lead' && activity.entityId) {
                await enrichmentQueue.add('enrichLead', { leadId: activity.entityId });
                // Update lastActivityAt if not missed
                const outcome = (activity.details?.outcome || activity.completionResult || '').toLowerCase();
                const isMissed = ['no-answer', 'no answer', 'busy', 'failed', 'not connected', 'missed'].some(s => outcome.includes(s));
                if (!isMissed) {
                    await Lead.findByIdAndUpdate(activity.entityId, { lastActivityAt: new Date() }, { session }).catch(() => { });
                }
            } else if (activity.entityType?.toLowerCase() === 'deal' && activity.entityId) {
                // Update lastActivityAt for Deal with session
                await Deal.findByIdAndUpdate(activity.entityId, { lastActivityAt: new Date() }, { session }).catch(() => { });
            }

            if (activity.entityType?.toLowerCase() === 'lead' && activity.status?.toLowerCase() === 'completed') {
                const outcome = activity.details?.completionResult || activity.details?.meetingOutcomeStatus || activity.details?.callOutcome || activity.details?.outcome || activity.completionResult || '';
                const reason = activity.details?.outcomeReason || activity.details?.reason || '';
                const purpose = activity.details?.purpose || activity.details?.meetingPurpose || activity.details?.callPurpose || activity.purpose || '';

                let resolvedOutcome = outcome;
                const actTypeLower = activity.type?.toLowerCase();
                if (!resolvedOutcome && (actTypeLower === 'site visit' || actTypeLower === 'meeting') && Array.isArray(activity.details?.visitedProperties)) {
                    const priorityMap = { 'token given': 1, 'final deal': 1, 'negotiation': 2, 'very interested': 3, 'shortlisted': 4, 'somewhat interested': 5 };
                    resolvedOutcome = activity.details.visitedProperties
                        .map(p => (p.result || '').toLowerCase())
                        .filter(Boolean)
                        .sort((a, b) => (priorityMap[a] || 99) - (priorityMap[b] || 99))[0] || '';
                }

                transition = await StageTransitionEngine.evaluateAndTransition(
                    activity.entityId,
                    activity.type,
                    resolvedOutcome,
                    reason,
                    {},
                    {
                        activityId: activity._id,
                        triggeredByUser: req.user?.id || req.user?._id || activity.assignedTo || null,
                        purpose,
                        status: activity.status,
                        visitedProperties: activity.details?.visitedProperties || [],
                        session
                    }
                );
            }

            const statusChanged = existingAct.status !== activity.status;
            const assignmentChanged = String(existingAct.assignedTo) !== String(activity.assignedTo);
            const dateChanged = String(existingAct.dueDate) !== String(activity.dueDate);
            const prevOutcome = existingAct.details?.callOutcome || existingAct.completionResult || '';
            const newOutcome = activity.details?.callOutcome || activity.completionResult || '';
            const outcomeChanged = prevOutcome !== newOutcome;
            const descriptionChanged = existingAct.description !== activity.description;

            if (statusChanged || assignmentChanged || dateChanged || outcomeChanged || descriptionChanged) {
                const effectiveTenantId = req.user?.tenantId || req.user?.tenant || activity.tenantId || null;
                const outboxEntry = {
                    eventType: 'ActivityUpdated',
                    aggregateType: 'Activity',
                    aggregateId: activity._id,
                    payload: {
                        ...activity.toJSON(),
                        statusChanged,
                        previousStatus: existingAct.status,
                        newStatus: activity.status,
                        assignmentChanged,
                        previousAssignedTo: existingAct.assignedTo,
                        newAssignedTo: activity.assignedTo,
                        dateChanged,
                        outcomeChanged,
                        descriptionChanged,
                        actorId: req.user?.id || req.user?._id || null
                    }
                };
                if (effectiveTenantId) {
                    outboxEntry.tenantId = effectiveTenantId;
                }
                await OutboxEvent.create([outboxEntry], { session });
            }
        }); // end tx

        // Sync and Workflows moved to durable OutboxEvent (C8)

        res.json({ success: true, data: activity, transition });
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({ success: false, error: error.message });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete an activity
// @route   DELETE /api/activities/:id
export const deleteActivity = async (req, res) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const activity = await withMongoTransaction(async (session) => {
            const act = await Activity.softDeleteOne({ _id: req.params.id, ...visibilityFilter }, { userId: req.user?._id, session });

            if (act) {
                await DomainEventPublisher.publishFromHttp(req, session, {
                    eventType: 'ActivityDeleted',
                    aggregateType: 'Activity',
                    aggregateId: act._id,
                    payload: {
                        activityId: act._id,
                        googleEventId: act.googleEventId,
                        entityType: act.entityType,
                        entityId: act.entityId,
                        deletedAt: act.deletedAt || new Date(),
                        actorId: req.user?.id || req.user?._id || null
                    }
                });
            }

            return act;
        });

        if (!activity) {
            return res.status(404).json({ success: false, error: "Activity not found" });
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
                description: `Synced from mobile SMS. Raw: ${msg.address}

Body: ${msg.body}`,
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
        const { phoneNumber, message, channel = 'whatsapp', entityId, entityType, attachment, integrationId, fromPhoneNumberId } = req.body;

        if (!phoneNumber || (!message && !attachment)) {
            return res.status(400).json({ success: false, error: "Phone number and message/attachment are required" });
        }

        // 1. Resolve Services
        const waService = (await import('../services/WhatsAppService.js')).default;
        const smsSvc = (await import('../services/SmsService.js')).default;

        const cleanPhone = normalizePhone(phoneNumber);
        let targetAccount = integrationId || fromPhoneNumberId || null;
        const isGroup = cleanPhone.includes('@g.us');

        const normChannel = String(channel || '').toLowerCase().trim();
        const isWhatsAppWeb = normChannel === 'whatsapp_web' || normChannel === 'wa_web' || (isGroup && normChannel !== 'sms' && normChannel !== 'rcs');
        const isWhatsAppAPI = normChannel === 'whatsapp_api' || normChannel === 'wa_api' || (normChannel === 'whatsapp' && !isWhatsAppWeb);
        const isWhatsApp = isWhatsAppWeb || isWhatsAppAPI;

        // Auto-resolve accounts based on provider selection
        const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
        if (isWhatsAppWeb) {
            let baileysAcc = null;
            if (targetAccount && mongoose.Types.ObjectId.isValid(targetAccount)) {
                baileysAcc = await WhatsAppIntegration.findOne({ _id: targetAccount, provider: 'BAILEYS', status: 'ACTIVE' }).lean();
            }
            if (!baileysAcc) {
                baileysAcc = await WhatsAppIntegration.findOne({ isDefault: true, provider: 'BAILEYS', status: 'ACTIVE' }).lean();
            }
            if (!baileysAcc) {
                baileysAcc = await WhatsAppIntegration.findOne({ provider: 'BAILEYS', status: 'ACTIVE' }).sort({ isDefault: -1, createdAt: -1 }).lean();
            }
            if (baileysAcc) {
                targetAccount = baileysAcc._id.toString();
            }
        } else if (isWhatsAppAPI) {
            let metaAcc = null;
            if (targetAccount && mongoose.Types.ObjectId.isValid(targetAccount)) {
                metaAcc = await WhatsAppIntegration.findOne({ _id: targetAccount, provider: { $ne: 'BAILEYS' }, status: 'ACTIVE' }).lean();
            }
            if (!metaAcc) {
                metaAcc = await WhatsAppIntegration.findOne({ isDefault: true, provider: { $ne: 'BAILEYS' }, status: 'ACTIVE' }).lean();
            }
            if (!metaAcc) {
                metaAcc = await WhatsAppIntegration.findOne({ provider: { $ne: 'BAILEYS' }, status: 'ACTIVE' }).sort({ isDefault: -1, createdAt: -1 }).lean();
            }
            if (metaAcc) {
                targetAccount = metaAcc._id.toString();
            }
        }

        let dispatchResult = { success: false, error: "Initialization error" };

        // 🛡️ Enterprise RBAC Check for WhatsApp Outbound
        if (isWhatsApp) {
            const WhatsAppAccountAuthorizationService = (await import('../services/WhatsAppAccountAuthorizationService.js')).default;
            const authCheck = await WhatsAppAccountAuthorizationService.assertCanSend(req.user, targetAccount);
            if (!authCheck.authorized) {
                return res.status(403).json({ success: false, error: authCheck.reason || "Unauthorized to send from this WhatsApp account" });
            }
        }

        // 🌟 Enterprise Variable Interpolation before dispatching
        let outgoingMessage = message;
        if (outgoingMessage && outgoingMessage.includes('{{')) {
            try {
                const cleanPhone10 = cleanPhone.replace(/\D/g, '').slice(-10);
                const leadDoc = await Lead.findOne({ mobile: { $regex: cleanPhone10 + '$' } })
                    .populate('assignedTo', 'fullName name mobile phone email')
                    .populate('assignment.assignedTo', 'fullName name mobile phone email')
                    .populate('owner', 'fullName name mobile phone email')
                    .lean();
                const contactDoc = !leadDoc ? await Contact.findOne({ 'phones.number': { $regex: cleanPhone10 + '$' } })
                    .populate('assignedTo', 'fullName name mobile phone email')
                    .populate('assignment.assignedTo', 'fullName name mobile phone email')
                    .populate('owner', 'fullName name mobile phone email')
                    .lean() : null;
                outgoingMessage = interpolateTemplateText(outgoingMessage, {
                    recipient: leadDoc || contactDoc || { mobile: cleanPhone },
                    agent: {
                        fullName: req.user?.fullName || req.user?.name || 'Bharat Properties Consultant',
                        mobile: req.user?.phone || req.user?.mobile || '+91 94160 35570',
                        email: req.user?.email || 'info@bharatproperties.co'
                    }
                });
            } catch (tplErr) {
                console.warn('[ActivityController/sendReply] Variable interpolation error:', tplErr.message);
            }
        }

        const dispatchOpts = {
            provider: isWhatsAppWeb ? 'BAILEYS' : 'META',
            channel: isWhatsAppWeb ? 'whatsapp_web' : 'whatsapp_api',
            platform: isWhatsAppWeb ? 'WhatsApp Web' : 'Direct',
            integrationId: targetAccount
        };

        try {
            if (isWhatsApp) {
                if (attachment) {
                    // Send Media/Special Message
                    dispatchResult = await waService.sendMedia(
                        cleanPhone,
                        attachment.type,
                        attachment.url,
                        attachment.caption || outgoingMessage,
                        attachment.filename,
                        { ...attachment, ...dispatchOpts }
                    );
                } else {
                    dispatchResult = await waService.sendMessage(cleanPhone, outgoingMessage, dispatchOpts);
                }
            } else if (normChannel === 'sms') {
                dispatchResult = await smsSvc.sendSms(cleanPhone, outgoingMessage, { entityId, entityType });
            } else {
                dispatchResult = await waService.sendMessage(cleanPhone, outgoingMessage, dispatchOpts);
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
            type: isWhatsApp ? 'WhatsApp' : 'Messaging',
            subject: `Reply via ${isWhatsAppWeb ? 'WhatsApp Web' : isWhatsAppAPI ? 'WhatsApp API' : channel.toUpperCase()}${attachment ? ` (${attachment.type})` : ''}`,
            description: outgoingMessage || `Sent ${attachment?.type || 'message'}`,
            entityType: isGroup ? 'WhatsAppGroup' : (entityType || 'General'),
            entityId: isGroup ? cleanPhone : (entityId || null),
            dueDate: new Date(),
            status: 'Completed',
            visibleTo: 'Everyone',
            details: {
                direction: 'Outgoing',
                platform: isWhatsAppWeb ? 'WhatsApp Web' : (isWhatsAppAPI ? 'Direct' : 'SMS'),
                provider: isWhatsAppWeb ? 'BAILEYS' : (isWhatsAppAPI ? 'META' : undefined),
                channel: isWhatsAppWeb ? 'whatsapp_web' : (isWhatsAppAPI ? 'whatsapp_api' : normChannel),
                message: outgoingMessage,
                text: outgoingMessage,
                renderedBody: outgoingMessage,
                from: targetAccount || null,
                to: cleanPhone,
                messageId: dispatchResult.messageId || dispatchResult.sid,
                isManualReply: true,
                phoneNumber: cleanPhone,
                isGroup: isGroup,
                groupJid: isGroup ? cleanPhone : null,
                attachment: attachment || null,
                whatsappIntegrationId: targetAccount || null
            },
            performedBy: req.user?.fullName || "Agent",
            performedAt: new Date()
        });

        // 3. Update Conversation History
        const displayMsg = outgoingMessage || `Sent ${attachment?.type || 'file'}`;

        const clean10 = cleanPhone.replace(/\D/g, '').slice(-10);
        const convPhoneVariants = isGroup
            ? [cleanPhone]
            : [cleanPhone, '91' + clean10, '+91' + clean10, clean10];

        let convFilter = { phoneNumber: { $in: convPhoneVariants } };
        const existingConv = await Conversation.findOne(convFilter).sort({ updatedAt: -1 });

        if (existingConv) {
            convFilter = { _id: existingConv._id };
        } else {
            convFilter = { phoneNumber: cleanPhone };
        }

        await Conversation.findOneAndUpdate(
            convFilter,
            {
                $push: {
                    messages: {
                        role: 'assistant',
                        content: displayMsg,
                        timestamp: new Date(),
                        metadata: {
                            attachment: attachment || null,
                            whatsappIntegrationId: targetAccount || null,
                            platform: isWhatsAppWeb ? 'WhatsApp Web' : (isWhatsAppAPI ? 'Direct' : 'SMS'),
                            provider: isWhatsAppWeb ? 'BAILEYS' : (isWhatsAppAPI ? 'META' : undefined),
                            channel: isWhatsAppWeb ? 'whatsapp_web' : (isWhatsAppAPI ? 'whatsapp_api' : normChannel)
                        }
                    }
                },
                $set: {
                    status: 'handed_off',
                    updatedAt: new Date(),
                    isGroup: isGroup,
                    channel: isWhatsApp ? 'whatsapp' : normChannel,
                    'metadata.unreadCount': 0,
                    'metadata.platform': isWhatsAppWeb ? 'WhatsApp Web' : (isWhatsAppAPI ? 'Direct' : 'SMS'),
                    'metadata.provider': isWhatsAppWeb ? 'BAILEYS' : (isWhatsAppAPI ? 'META' : undefined),
                    ...(targetAccount ? { whatsappIntegrationId: targetAccount } : {})
                },
                $setOnInsert: {
                    phoneNumber: cleanPhone
                }
            },
            { upsert: true }
        );

        // ⚡ Enterprise Real-Time Broadcast to all active client tabs
        try {
            RealtimeHub.emitMessage({
                phone: cleanPhone,
                channel: isWhatsApp ? 'WhatsApp' : 'SMS',
                platform: isWhatsAppWeb ? 'WhatsApp Web' : (isWhatsAppAPI ? 'Direct' : 'SMS'),
                provider: isWhatsAppWeb ? 'BAILEYS' : (isWhatsAppAPI ? 'META' : undefined),
                message: {
                    id: dispatchResult.messageId || dispatchResult.sid || activity._id.toString(),
                    sender: 'agent',
                    fromMe: true,
                    text: displayMsg,
                    time: new Date().toISOString(),
                    timestamp: new Date().toISOString(),
                    status: 'delivered',
                    metadata: {
                        attachment: attachment || null,
                        whatsappIntegrationId: targetAccount || null,
                        platform: isWhatsAppWeb ? 'WhatsApp Web' : (isWhatsAppAPI ? 'Direct' : 'SMS'),
                        provider: isWhatsAppWeb ? 'BAILEYS' : (isWhatsAppAPI ? 'META' : undefined)
                    }
                },
                streamItem: {
                    _id: activity._id,
                    type: isWhatsApp ? 'WhatsApp' : 'Messaging',
                    via: isWhatsApp ? 'WhatsApp' : 'SMS',
                    subject: activity.subject,
                    description: `You: ${displayMsg}`,
                    snippet: `You: ${displayMsg}`,
                    participant: cleanPhone,
                    phone: cleanPhone,
                    phoneNumber: cleanPhone,
                    outcome: 'Delivered',
                    timestamp: new Date().toISOString(),
                    date: new Date().toISOString(),
                    platform: isWhatsAppWeb ? 'WhatsApp Web' : (isWhatsAppAPI ? 'Direct' : 'SMS Gateway'),
                    isGroup: isGroup,
                    whatsappIntegrationId: targetAccount || null
                }
            });
        } catch (emitErr) {
            console.error('[sendReply] RealtimeHub emit error:', emitErr.message);
        }

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
        const WhatsAppAccountAuthorizationService = (await import('../services/WhatsAppAccountAuthorizationService.js')).default;
        const isSuperAdmin = WhatsAppAccountAuthorizationService.isAdmin(req.user) || req.user?.dataScope === 'all';
        
        let allowedIntegIds = [];
        if (!isSuperAdmin && req.user) {
            try {
                const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
                const userIntegrations = await WhatsAppIntegration.find({
                    status: 'ACTIVE',
                    $or: [
                        { connectedBy: req.user._id },
                        { allowedUsers: req.user._id }
                    ]
                }).select('_id').lean();
                allowedIntegIds = userIntegrations.map(i => i._id);
            } catch (e) {}
        }

        // 1. Optimized Combined Query with WhatsApp Multi-User Isolation
        const messagingTypes = ['WhatsApp', 'whatsapp', 'Call', 'call', 'Email', 'email', 'SMS', 'sms', 'Voice', 'voice', 'Messaging', 'Marketing', 'marketing'];
        const unassignedConditions = isSuperAdmin
            ? [{ assignedTo: { $exists: false } }]
            : [
                ...(allowedIntegIds.length > 0 ? [{
                    assignedTo: { $exists: false },
                    'details.whatsappIntegrationId': { $in: allowedIntegIds }
                }] : []),
                {
                    assignedTo: { $exists: false },
                    type: { $nin: ['WhatsApp', 'whatsapp'] },
                    'details.platform': { $ne: 'WhatsApp Web' },
                    'details.isGroup': { $ne: true }
                }
            ];

        const query = {
            $and: [
                { type: { $in: messagingTypes } },
                {
                    $or: [
                        { ...visibilityFilter },
                        ...unassignedConditions
                    ]
                }
            ]
        };

        if (channel !== 'all') {
            if (channel === 'Voice') {
                query.$and.push({ type: { $in: ['Voice', 'voice', 'Call', 'call'] } });
            } else if (channel === 'Email') {
                query.$and.push({
                    $or: [
                        { type: { $in: ['Email', 'email'] } },
                        { $and: [{ type: { $in: ['Marketing', 'marketing'] } }, { 'details.results.channel': 'email' }] }
                    ]
                });
            } else if (channel === 'WhatsApp') {
                query.$and.push({
                    $or: [
                        { type: { $in: ['WhatsApp', 'whatsapp'] } },
                        { 'details.platform': { $regex: /^whatsapp$/i } }
                    ]
                });
            } else if (channel === 'WhatsApp_API') {
                query.$and.push({
                    $and: [
                        { $or: [
                            { type: { $in: ['WhatsApp', 'whatsapp'] } },
                            { 'details.platform': { $regex: /^whatsapp$/i } }
                        ]},
                        { 'details.platform': { $ne: 'WhatsApp Web' } },
                        { 'details.isGroup': { $ne: true } },
                        { 'details.groupJid': { $exists: false } }
                    ]
                });
            } else if (channel === 'WhatsApp_Web') {
                query.$and.push({
                    $and: [
                        { $or: [
                            { type: { $in: ['WhatsApp', 'whatsapp'] } },
                            { 'details.platform': { $regex: /^whatsapp/i } }
                        ]},
                        { $or: [
                            { 'details.platform': 'WhatsApp Web' },
                            { 'details.whatsappIntegrationId': { $exists: true, $ne: null } },
                            { 'details.isGroup': true },
                            { 'details.groupJid': { $exists: true, $ne: null } }
                        ]}
                    ]
                });
            } else if (channel === 'WAGroups') {
                query.$and.push({
                    $or: [
                        { 'details.isGroup': true },
                        { 'details.groupJid': { $exists: true, $ne: null } }
                    ]
                });
            } else if (channel === 'SMS') {
                query.$and.push({
                    $or: [
                        { type: { $in: ['SMS', 'sms'] } },
                        { $and: [{ type: { $in: ['Marketing', 'marketing'] } }, { 'details.results.channel': 'sms' }] }
                    ]
                });
            } else {
                query.$and.push({ type: channel });
            }
        }

        // Fetch larger batch for grouping but limited to manageable size
        const convFilter = (channel === 'all')
            ? (isSuperAdmin ? {} : {
                $or: [
                    { channel: { $ne: 'whatsapp' } },
                    ...(allowedIntegIds.length > 0 ? [{ whatsappIntegrationId: { $in: allowedIntegIds } }] : [{ whatsappIntegrationId: null }])
                ]
              })
            : (channel === 'WhatsApp_API'
                ? { 
                    channel: { $in: ['whatsapp', 'WhatsApp'] }, 
                    isGroup: { $ne: true }, 
                    $or: [{ whatsappIntegrationId: { $exists: false } }, { whatsappIntegrationId: null }],
                    phoneNumber: { $not: /@g\.us$/ }
                  }
                : (channel === 'WhatsApp_Web'
                    ? { 
                        channel: { $in: ['whatsapp', 'WhatsApp'] }, 
                        ...(isSuperAdmin ? {
                            $or: [
                                { isGroup: true }, 
                                { whatsappIntegrationId: { $exists: true, $ne: null } },
                                { phoneNumber: /@g\.us$/ }
                            ]
                        } : {
                            whatsappIntegrationId: { $in: allowedIntegIds }
                        })
                      }
                    : (channel === 'WAGroups'
                        ? { 
                            channel: { $in: ['whatsapp', 'WhatsApp'] }, 
                            $or: [{ isGroup: true }, { phoneNumber: /@g\.us$/ }],
                            ...(isSuperAdmin ? {} : { whatsappIntegrationId: { $in: allowedIntegIds } })
                          }
                        : (['Web_Chat', 'website_chat'].includes(channel)
                            ? { channel: 'website_chat' }
                            : { _id: null })
                      )
                  )
              );

        const [activities, rawConversations, rawSmsLogs] = await Promise.all([
            Activity.find(query)
                .select('_id type subject description entityType entityId status outcome createdAt dueDate participants details')
                .sort({ createdAt: -1 })
                .limit(200)
                .lean(),
            Conversation.find(convFilter)
                .select('_id channel phoneNumber businessPhoneNumberId businessPhoneNumber whatsappIntegrationId isGroup groupName title lead contact status createdAt updatedAt metadata messages')
                .slice('messages', -1)
                .sort({ updatedAt: -1 })
                .limit(100)
                .lean(),
            SmsLog.find(channel === 'all' || channel === 'SMS' ? {} : { _id: null })
                .select('_id to message entityType entityId status sentAt')
                .sort({ sentAt: -1 })
                .limit(100)
                .lean()
        ]);

        // 2. High-Performance Grouping First (Reduce 1,000+ items to ~50 conversation threads)
        const conversationsMap = new Map();

        // 2.1 Process Activities
        activities.forEach(a => {
            const rawActPhone = a.details?.phoneNumber || a.details?.from || a.details?.to || a.details?.recipient || a.details?.senderPhone || a.participants?.[0]?.mobile || (a.details?.mobileId ? a.details.mobileId.split('_')[0] : '');
            const phone = normalizePhone(rawActPhone);
            const email = (a.details?.email || a.participants?.[0]?.email || '').toLowerCase();
            const identifier = phone || email;
            if (!identifier) return;

            const isGroupItem = Boolean(a.details?.isGroup || a.details?.groupJid || (phone && phone.includes('@g.us')) || (rawActPhone && rawActPhone.includes('@g.us')));

            let via = 'SMS';
            if (isGroupItem) {
                via = 'WhatsApp';
            } else if (['Call', 'Voice', 'call', 'voice'].includes(a.type)) {
                via = 'Voice';
            } else if (['Email', 'email'].includes(a.type) || a.details?.results?.some(r => r.channel === 'email')) {
                via = 'Email';
            } else if (['WhatsApp', 'whatsapp'].includes(a.type) || 
                       ['whatsapp', 'whatsapp web'].includes(a.details?.platform?.toLowerCase()) ||
                       a.details?.whatsappIntegrationId ||
                       a.details?.results?.some(r => r.channel === 'whatsapp')) {
                via = 'WhatsApp';
            } else if (['website chat', 'web chat', 'webchat'].includes((a.type || '').toLowerCase()) || ['website', 'web chat'].includes(a.details?.platform?.toLowerCase())) {
                via = 'Web Chat';
            } else if (['SMS', 'sms'].includes(a.type) || a.details?.results?.some(r => r.channel === 'sms')) {
                via = 'SMS';
            }

            let key = `${identifier}_${via}`;
            if (via === 'WhatsApp') {
                const bizId = a.details?.businessPhoneNumberId || a.details?.whatsappPhoneNumberId || 'default';
                key = `${identifier}_WhatsApp_${bizId}`;
            }

            const isOutbound = (a.details?.direction || '').toLowerCase() === 'outbound' || (a.details?.direction || '').toLowerCase() === 'outgoing' || (a.subject||'').toLowerCase().includes('outgoing') || ['Sent', 'Delivered'].includes(a.outcome || a.status);
            const prefix = isOutbound ? 'You: ' : 'Customer: ';
            let baseSnippet = a.details?.renderedBody || a.details?.message || a.details?.text || a.description || a.subject || '';
            if (/^Sent via\s+/i.test(baseSnippet.trim()) && a.subject && !/^Sent via\s+/i.test(a.subject.trim())) {
                baseSnippet = a.subject;
            }
            const snippet = (baseSnippet.startsWith('You: ') || baseSnippet.startsWith('Customer: ')) ? baseSnippet : prefix + baseSnippet;

            let resolvedGroupName = null;
            if (isGroupItem) {
                resolvedGroupName = a.details?.groupName || 
                                    (a.participants?.[0]?.name && !a.participants[0].name.includes('@g.us') ? a.participants[0].name : null);
                if (!resolvedGroupName) {
                    try {
                        resolvedGroupName = BaileysConnectionManager.getGroupSubject(phone) || BaileysConnectionManager.getGroupSubject(rawActPhone);
                    } catch (e) {}
                }
                if (!resolvedGroupName && a.subject && a.subject.startsWith('Group WhatsApp: ')) {
                    const rawSubj = a.subject.replace('Group WhatsApp: ', '').trim();
                    if (!rawSubj.includes('@g.us')) resolvedGroupName = rawSubj;
                }
            }

            const isCustomerEntity = Boolean(a.entityId && a.entityType && !['Unknown', 'System', 'User', 'WhatsAppGroup'].includes(a.entityType));
            const hasPrelinkedEntity = isCustomerEntity;
            const initialParticipantName = isGroupItem
                ? (resolvedGroupName || (a.participants?.[0]?.name && !a.participants[0].name.includes('@g.us') ? a.participants[0].name : null) || 'WhatsApp Group')
                : (a.participants?.[0]?.name && a.participants[0].name !== 'Agent' ? a.participants[0].name : identifier);

            const actualActTime = a.details?.deliveredAt || a.details?.sentAt || a.details?.timestamp || a.performedAt || a.createdAt;

            if (!conversationsMap.has(key) || new Date(actualActTime) > new Date(conversationsMap.get(key).timestamp)) {
                const isWaWeb = isGroupItem || (via === 'WhatsApp' && (a.details?.whatsappIntegrationId || a.details?.platform === 'WhatsApp Web'));
                conversationsMap.set(key, {
                    _id: a._id,
                    type: a.type,
                    via,
                    subject: a.subject,
                    description: snippet,
                    snippet: snippet,
                    entityType: isCustomerEntity ? a.entityType : null,
                    entityId: isCustomerEntity ? a.entityId : null,
                    participant: initialParticipantName,
                    phone: phone,
                    phoneNumber: phone,
                    email: email,
                    isMatched: hasPrelinkedEntity,
                    outcome: a.details?.status || a.outcome || a.status || 'Delivered',
                    timestamp: actualActTime,
                    date: actualActTime,
                    platform: isGroupItem ? 'WhatsApp Web' : (a.details?.platform || (isWaWeb ? 'WhatsApp Web' : 'Direct')),
                    isGroup: isGroupItem,
                    groupJid: isGroupItem ? (a.details?.groupJid || phone) : null,
                    groupName: isGroupItem ? (resolvedGroupName || initialParticipantName) : null,
                    whatsappIntegrationId: a.details?.whatsappIntegrationId || null,
                    businessPhoneNumberId: a.details?.businessPhoneNumberId || a.details?.whatsappPhoneNumberId || null,
                    thread: []
                });
            }
        });

        // 2.2 Process SMS Logs
        rawSmsLogs.forEach(log => {
            const phone = normalizePhone(log.to);
            const key = `${phone}_SMS`;
            const hasPrelinkedEntity = !!log.entityId;

            if (!conversationsMap.has(key) || new Date(log.sentAt) > new Date(conversationsMap.get(key).timestamp)) {
                conversationsMap.set(key, {
                    _id: log._id, type: 'Messaging', via: 'SMS', subject: 'Outgoing SMS',
                    description: log.message, snippet: log.message,
                    entityType: log.entityType || null,
                    entityId: log.entityId || null,
                    participant: phone, phone, phoneNumber: phone,
                    isMatched: hasPrelinkedEntity, outcome: log.status, timestamp: log.sentAt, date: log.sentAt,
                    platform: 'SMS Gateway',
                    isGroup: false,
                    thread: []
                });
            }
        });

        // 2.3 Process Raw Conversations
        rawConversations.forEach(c => {
            const isWebChat = c.channel === 'website_chat';
            let phone = normalizePhone(c.phoneNumber);

            let extractedName = null;
            if (!phone && c.messages && c.messages.length > 0) {
                for (const m of c.messages) {
                    if (m.content) {
                        const contactMatch = m.content.match(/Name=([^,\n]+),\s*Mobile=(\+?\d+)/i);
                        if (contactMatch) {
                            extractedName = contactMatch[1].trim();
                            phone = normalizePhone(contactMatch[2]);
                            break;
                        }
                        const numMatch = m.content.match(/(?:\+91|91)?([6-9]\d{9})/);
                        if (numMatch && !phone) {
                            phone = normalizePhone(numMatch[1]);
                        }
                    }
                }
            }

            const bizId = c.businessPhoneNumberId || 'default';
            const via = isWebChat ? 'Web Chat' : 'WhatsApp';
            const type = isWebChat ? 'Website Chat' : 'WhatsApp';
            const subject = isWebChat ? 'Website Live Chat' : 'WhatsApp Chat';
            const platform = isWebChat ? 'Website' : (c.whatsappIntegrationId ? 'WhatsApp Web' : 'Direct');

            const identifier = phone || (isWebChat ? (c.metadata?.sessionId || c._id.toString()) : '');
            if (!identifier) return;

            const key = isWebChat ? `${identifier}_WebChat` : `${phone}_WhatsApp_${bizId}`;
            const existingActivity = conversationsMap.get(key);
            const lastMsg = c.messages?.[c.messages.length - 1];
            const actualMsgTime = lastMsg?.timestamp || lastMsg?.createdAt || c.metadata?.lastMessageAt || c.createdAt;

            if (!existingActivity || new Date(actualMsgTime) > new Date(existingActivity.timestamp)) {
                let snippet = isWebChat ? 'Website chat started' : 'Conversation started';

                if (lastMsg) {
                    const prefix = lastMsg.role === 'user' ? 'Customer: ' : 'You: ';
                    snippet = prefix + (lastMsg.content || '');
                } else if (existingActivity) {
                    snippet = existingActivity.snippet || existingActivity.description || snippet;
                }

                let defaultName = phone;
                if (isWebChat) {
                    defaultName = extractedName || c.title || `Website Visitor #${(c.metadata?.sessionId || c._id.toString()).slice(-4)}`;
                } else if (c.isGroup) {
                    defaultName = c.title || phone;
                } else if (!phone) {
                    defaultName = 'Unknown';
                }

                const hasPrelinkedEntity = !!(c.lead || c.contact);
                const participantName = existingActivity?.participant || (c.lead ? 'Lead' : (c.contact ? 'Contact' : defaultName));

                conversationsMap.set(key, {
                    _id: c._id,
                    type,
                    via,
                    subject,
                    description: snippet,
                    snippet: snippet,
                    entityType: c.lead ? 'Lead' : (c.contact ? 'Contact' : null),
                    entityId: c.lead || c.contact || null,
                    participant: participantName,
                    phone: phone || (isWebChat ? 'Website Chat' : ''),
                    phoneNumber: phone || (isWebChat ? 'Website Chat' : ''),
                    isMatched: hasPrelinkedEntity,
                    outcome: c.status || 'Active',
                    timestamp: actualMsgTime,
                    date: actualMsgTime,
                    platform,
                    isGroup: !!c.isGroup,
                    whatsappIntegrationId: c.whatsappIntegrationId || null,
                    businessPhoneNumberId: c.businessPhoneNumberId || null,
                    businessPhoneNumber: c.businessPhoneNumber || null,
                    thread: []
                });
            }
        });

        // 3. Ultra-Fast Identity Lookup (ONLY for the distinct ~50 conversation threads)
        const identifierSet = new Set();
        const entityIdSet = new Set();

        for (const item of conversationsMap.values()) {
            if (item.phone) identifierSet.add(item.phone);
            if (item.phoneNumber) identifierSet.add(item.phoneNumber);
            if (item.email) identifierSet.add(item.email.toLowerCase());
            if (item.entityId && mongoose.Types.ObjectId.isValid(item.entityId) && item.entityType && !['User', 'System', 'Unknown'].includes(item.entityType)) {
                entityIdSet.add(item.entityId.toString());
            }
        }

        const uniqueIdentifiers = Array.from(identifierSet);
        const uniqueEntityIds = Array.from(entityIdSet).map(id => new mongoose.Types.ObjectId(id));

        // Generate only exact clean10 and +91 variants (cuts search space by 80%)
        const searchIdentifiers = new Set(uniqueIdentifiers);
        uniqueIdentifiers.forEach(id => {
            const clean10 = id.replace(/\D/g, '').slice(-10);
            if (clean10 && clean10.length === 10) {
                searchIdentifiers.add(clean10);
                searchIdentifiers.add('+91' + clean10);
            }
        });
        const allSearchIdentifiers = Array.from(searchIdentifiers);

        // Targeted Parallel Lookup with partial index compliance
        const [leads, contacts] = await Promise.all([
            allSearchIdentifiers.length || uniqueIdentifiers.length || uniqueEntityIds.length
                ? Lead.find({
                    isDeleted: { $ne: true },
                    $or: [
                        { mobile: { $in: allSearchIdentifiers } },
                        { email: { $in: uniqueIdentifiers } },
                        { _id: { $in: uniqueEntityIds } }
                    ]
                }).select('firstName lastName fullName mobile email').lean()
                : Promise.resolve([]),
            allSearchIdentifiers.length || uniqueIdentifiers.length || uniqueEntityIds.length
                ? Contact.find({
                    isDeleted: { $ne: true },
                    isMerged: { $ne: true },
                    $or: [
                        { 'phones.number': { $in: allSearchIdentifiers } },
                        { 'emails.address': { $in: uniqueIdentifiers } },
                        { _id: { $in: uniqueEntityIds } }
                    ]
                }).select('name phones emails').lean()
                : Promise.resolve([])
        ]);

        const identityMap = new Map();
        const identifierToNameMap = new Map();

        leads.forEach(l => {
            const name = l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Lead';
            const data = { name, entityId: l._id, entityType: 'Lead', phone: l.mobile, email: l.email };
            identityMap.set(l._id.toString(), data);
            if (l.mobile) {
                const norm = normalizePhone(l.mobile);
                const clean10 = norm.replace(/\D/g, '').slice(-10);
                if (clean10) identifierToNameMap.set(clean10, data);
                identifierToNameMap.set(norm, data);
                identifierToNameMap.set(l.mobile, data);
            }
            if (l.email) identifierToNameMap.set(l.email.toLowerCase(), data);
        });

        contacts.forEach(c => {
            const name = c.name || 'Contact';
            const primaryPhone = c.phones?.[0]?.number;
            const primaryEmail = c.emails?.[0]?.address;
            const data = { name, entityId: c._id, entityType: 'Contact', phone: primaryPhone, email: primaryEmail };
            identityMap.set(c._id.toString(), data);
            c.phones?.forEach(p => {
                if (p.number) {
                    const norm = normalizePhone(p.number);
                    const clean10 = norm.replace(/\D/g, '').slice(-10);
                    if (clean10) identifierToNameMap.set(clean10, data);
                    identifierToNameMap.set(norm, data);
                    identifierToNameMap.set(p.number, data);
                }
            });
            c.emails?.forEach(e => {
                if (e.address) identifierToNameMap.set(e.address.toLowerCase(), data);
            });
        });

        // 4. Enrich conversation heads with resolved entity matches
        const resolveEntityMatch = (identifier, phone, email, entityId, entityType) => {
            // First priority: Customer phone number lookup (matches actual customer in CRM)
            const clean10 = phone ? phone.replace(/\D/g, '').slice(-10) : '';
            if (clean10 && clean10.length === 10 && identifierToNameMap.has(clean10)) {
                return identifierToNameMap.get(clean10);
            }
            if (phone && identifierToNameMap.has(phone)) {
                return identifierToNameMap.get(phone);
            }
            if (email && identifierToNameMap.has(email)) {
                return identifierToNameMap.get(email);
            }
            // Secondary priority: entityId only if valid customer entity (not User/System)
            if (entityId && entityType !== 'User' && entityType !== 'System' && identityMap.has(entityId.toString())) {
                return identityMap.get(entityId.toString());
            }
            if (identifier && identifierToNameMap.has(identifier)) {
                return identifierToNameMap.get(identifier);
            }
            return null;
        };

        for (const item of conversationsMap.values()) {
            const matched = resolveEntityMatch(item.phone || item.email, item.phone, item.email, item.entityId, item.entityType);
            if (matched) {
                if (!item.isGroup) {
                    item.participant = matched.name || item.participant;
                }
                item.entityType = matched.entityType || item.entityType;
                item.entityId = matched.entityId || item.entityId;
                item.isMatched = true;
            }
        }

        // 5. Final Filtering, Sort & Paginate
        let unified = Array.from(conversationsMap.values());

        // Strict Enterprise Channel Filter on the unified conversationsMap
        if (channel !== 'all') {
            if (channel === 'Voice') {
                unified = unified.filter(i => i.via === 'Voice' || ['Call', 'call', 'Voice', 'voice'].includes(i.type));
            } else if (channel === 'SMS') {
                unified = unified.filter(i => i.via === 'SMS');
            } else if (channel === 'Email') {
                unified = unified.filter(i => i.via === 'Email');
            } else if (channel === 'WhatsApp_API') {
                unified = unified.filter(i => (i.via === 'WhatsApp' || i.type === 'WhatsApp') && i.platform !== 'WhatsApp Web' && !i.isGroup && !i.details?.isGroup && !(i.phone && i.phone.includes('@g.us')) && !(i.phoneNumber && i.phoneNumber.includes('@g.us')));
            } else if (channel === 'WhatsApp_Web') {
                unified = unified.filter(i => (i.via === 'WhatsApp' || i.type === 'WhatsApp') && (i.platform === 'WhatsApp Web' || i.whatsappIntegrationId || i.isGroup || i.details?.isGroup || (i.phone && i.phone.includes('@g.us'))));
            } else if (channel === 'WAGroups') {
                unified = unified.filter(i => i.isGroup || i.details?.isGroup || (i.phone && i.phone.includes('@g.us')));
            } else if (['Web_Chat', 'website_chat'].includes(channel)) {
                unified = unified.filter(i => i.via === 'Web Chat');
            }
        }

        if (subTab === 'matched') unified = unified.filter(i => i.isMatched);
        else if (subTab === 'unmatched') unified = unified.filter(i => !i.isMatched);
        else if (subTab === 'groups') unified = unified.filter(i => i.isGroup || i.details?.isGroup || (i.phone && i.phone.includes('@g.us')));

        if (search) {
            const s = search.toLowerCase();
            unified = unified.filter(i => (i.participant || '').toLowerCase().includes(s) || (i.phone || '').includes(s) || (i.description || '').toLowerCase().includes(s));
        }

        unified.sort((a, b) => (new Date(a.timestamp) - new Date(b.timestamp)) * sortOrder);

        const totalCount = unified.length;
        const startIndex = (page - 1) * limit;
        const paginatedData = unified.slice(startIndex, startIndex + Number(limit));

        // 6. Global KPI Counts (O(1) in-memory calculation from unified streams)
        const totalStreams = unified.length;
        const matchedStreams = unified.filter(i => i.isMatched).length;
        const failedStreams = unified.filter(i => i.outcome === 'Failed' || i.status === 'Failed').length;

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
        const { via, businessPhoneNumberId, integrationId } = req.query; // WhatsApp, SMS, Voice, Email
        if (!identifier) return res.status(400).json({ success: false, error: "Identifier required" });

        const phone = normalizePhone(identifier);
        const email = identifier.toLowerCase();
        const visibilityFilter = await getVisibilityFilter(req.user);

        // Account Identity Resolution for WhatsApp Isolation
        let targetBizPhoneId = businessPhoneNumberId ? String(businessPhoneNumberId).trim() : null;
        let targetIntegrationId = integrationId ? String(integrationId).trim() : null;

        if (targetIntegrationId && !targetBizPhoneId && mongoose.Types.ObjectId.isValid(targetIntegrationId)) {
            try {
                const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
                const intDoc = await WhatsAppIntegration.findById(targetIntegrationId).select('phoneNumberId').lean();
                if (intDoc?.phoneNumberId) {
                    targetBizPhoneId = String(intDoc.phoneNumberId).trim();
                }
            } catch (e) {}
        }

        // Build Multi-Format Phone & Identity Variants (Enterprise Omnichannel Correlation)
        const isGroup = identifier.includes('@g.us');
        const cleanPhone10 = phone ? String(phone).replace(/\D/g, '').slice(-10) : '';
        const phoneRegex = cleanPhone10 ? new RegExp(cleanPhone10 + '$') : null;

        const phoneVariants = new Set([identifier, phone]);
        if (cleanPhone10 && cleanPhone10.length === 10) {
            phoneVariants.add(cleanPhone10);
            phoneVariants.add('+91' + cleanPhone10);
            phoneVariants.add('91' + cleanPhone10);
            phoneVariants.add('0' + cleanPhone10);
            phoneVariants.add('+91 ' + cleanPhone10);
        }
        const phoneVariantList = Array.from(phoneVariants);

        // Build Conversation Query
        const phoneFilters = isGroup 
            ? [{ phoneNumber: identifier }, { 'metadata.groupJid': identifier }] 
            : [
                { phoneNumber: { $in: phoneVariantList } },
                ...(phoneRegex ? [{ phoneNumber: phoneRegex }] : []),
                ...(mongoose.Types.ObjectId.isValid(identifier) ? [{ _id: new mongoose.Types.ObjectId(identifier) }] : []),
                { 'metadata.sessionId': identifier }
              ];
        let convQuery = { $or: phoneFilters };

        const reqVia = (via || '').trim().toLowerCase();
        const isWhatsApp = ['whatsapp', 'whatsapp_api', 'whatsapp_web'].includes(reqVia) || !via;
        const isWebChat = ['web chat', 'web_chat', 'website_chat'].includes(reqVia);
        const isSMS = reqVia === 'sms';
        const isVoice = ['voice', 'call'].includes(reqVia);
        const isEmail = reqVia === 'email';

        if (isWebChat) {
            convQuery = { $and: [convQuery, { channel: 'website_chat' }] };
        } else if (isWhatsApp && via) {
            const accFilters = [{ channel: { $in: ['whatsapp', 'WhatsApp'] } }];
            if (!isGroup) {
                if (targetBizPhoneId) accFilters.push({ businessPhoneNumberId: targetBizPhoneId });
                if (targetIntegrationId) accFilters.push({ whatsappIntegrationId: targetIntegrationId });
            }
            convQuery = { $and: [convQuery, ...accFilters] };
        } else if (isSMS) {
            convQuery = { $and: [convQuery, { channel: 'sms' }] };
        } else if (isVoice || isEmail) {
            convQuery = { _id: null };
        }

        // 1. Fetch relevant records in parallel with comprehensive omnichannel match
        const activityMatchConditions = isGroup
            ? [
                { 'details.groupJid': identifier },
                { 'details.phoneNumber': identifier },
                { 'details.to': identifier },
                { 'details.from': identifier },
                { entityId: identifier },
                { 'participants.mobile': identifier }
              ]
            : [
                { 'details.phoneNumber': { $in: phoneVariantList } },
                { 'details.from': { $in: phoneVariantList } },
                { 'details.to': { $in: phoneVariantList } },
                { 'details.recipient': { $in: phoneVariantList } },
                { 'details.senderPhone': { $in: phoneVariantList } },
                { 'participants.mobile': { $in: phoneVariantList } },
                ...(phoneRegex ? [
                    { 'details.phoneNumber': phoneRegex },
                    { 'details.from': phoneRegex },
                    { 'details.to': phoneRegex },
                    { 'participants.mobile': phoneRegex }
                ] : []),
                ...(email ? [
                    { 'details.email': email },
                    { 'participants.email': email }
                ] : [])
            ];

        const [activities, conversations, templatesDoc, matchedLead, matchedContact] = await Promise.all([
            Activity.find({
                $and: [
                    {
                        $or: [
                            { ...visibilityFilter },
                            { assignedTo: { $exists: false } },
                            { visibleTo: 'Everyone' }
                        ]
                    },
                    { $or: activityMatchConditions }
                ]
            }).sort({ createdAt: 1 }).lean(),
            Conversation.find(convQuery).lean(),
            (async () => {
                try {
                    const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting');
                    let s = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' }).lean();
                    if (!s && mongoose.connection.db) {
                        s = await mongoose.connection.db.collection('systemsettings').findOne({ key: 'crm_whatsapp_templates' });
                    }
                    return s;
                } catch (e) { return null; }
            })(),
            phoneRegex ? Lead.findOne({ mobile: phoneRegex, isDeleted: { $ne: true } })
                .populate('assignedTo', 'fullName name mobile phone email')
                .populate('assignment.assignedTo', 'fullName name mobile phone email')
                .populate('owner', 'fullName name mobile phone email')
                .lean() : null,
            phoneRegex ? Contact.findOne({ 'phones.number': phoneRegex, isDeleted: { $ne: true } })
                .populate('assignedTo', 'fullName name mobile phone email')
                .populate('assignment.assignedTo', 'fullName name mobile phone email')
                .populate('owner', 'fullName name mobile phone email')
                .lean() : null
        ]);

        // Collect linked Deal IDs for any marketing broadcasts
        const linkedDealIds = (activities || [])
            .map(a => a.details?.dealId)
            .filter(id => id && mongoose.Types.ObjectId.isValid(id));
        const dealMap = new Map();
        if (linkedDealIds.length > 0) {
            try {
                const deals = await Deal.find({ _id: { $in: linkedDealIds } }).lean();
                deals.forEach(d => dealMap.set(d._id.toString(), d));
            } catch (dErr) {}
        }

        const leadAgent = matchedLead?.assignedTo || matchedLead?.assignment?.assignedTo || (typeof matchedLead?.owner === 'object' ? matchedLead?.owner : null);
        const contactAgent = matchedContact?.assignedTo || matchedContact?.assignment?.assignedTo || (typeof matchedContact?.owner === 'object' ? matchedContact?.owner : null);
        const activeAgent = leadAgent || contactAgent;

        const recipientContext = {
            firstName: matchedLead?.firstName || (matchedContact?.name ? matchedContact.name.split(' ')[0] : '') || '',
            lastName: matchedLead?.lastName || matchedContact?.surname || '',
            name: (matchedLead ? `${matchedLead.firstName || ''} ${matchedLead.lastName || ''}`.trim() : matchedContact?.name) || '',
            mobile: matchedLead?.mobile || matchedContact?.phones?.[0]?.number || phone,
            phone: phone,
            email: matchedLead?.email || matchedContact?.emails?.[0]?.address || email,
            requirement: matchedLead?.requirement || matchedLead?.requirementType || '',
            location: matchedLead?.location || matchedLead?.locCity || '',
            budget: matchedLead?.budget || matchedLead?.budgetMin || '',
            status: matchedLead?.status || ''
        };

        const agentContext = {
            fullName: activeAgent?.fullName || activeAgent?.name || req.user?.fullName || 'Bharat Properties Consultant',
            mobile: activeAgent?.mobile || activeAgent?.phone || req.user?.phone || '+91 94160 35570',
            email: activeAgent?.email || req.user?.email || 'info@bharatproperties.co'
        };

        // Build fast template lookup cache
        const templateMap = new Map();
        if (templatesDoc?.value && Array.isArray(templatesDoc.value)) {
            templatesDoc.value.forEach(t => {
                if (t.name) templateMap.set(String(t.name).trim().toLowerCase(), t);
                if (t.id) templateMap.set(String(t.id).trim().toLowerCase(), t);
                if (t._id) templateMap.set(String(t._id).trim().toLowerCase(), t);
            });
        }
        const defaultTemplates = [
            {
                name: 'property_owner_feedback',
                body: 'Hello {{OwnerName}},\n\nThis is {{EmployeeName}} from Bharat Properties.\n\nRegarding your {{PropertyType}}:\n\n📋 Discussion Summary: {{DiscussionSummary}}\n\nFor any queries, contact us at {{EmployeeMobile}}.\n\nThank you for your time!',
                components: [
                    { type: 'HEADER', format: 'IMAGE' },
                    { type: 'BODY', text: 'Hello {{OwnerName}},\n\nThis is {{EmployeeName}} from Bharat Properties.\n\nRegarding your {{PropertyType}}:\n\n📋 Discussion Summary: {{DiscussionSummary}}\n\nFor any queries, contact us at {{EmployeeMobile}}.\n\nThank you for your time!' },
                    { type: 'BUTTONS', buttons: [
                        { type: 'QUICK_REPLY', text: 'Update Feedback' },
                        { type: 'QUICK_REPLY', text: 'Status is Correct' }
                    ]}
                ]
            },
            {
                name: 'welcome_lead',
                body: 'Namaste! Welcome to Bharat Properties.\nThank you for reaching out to us. Our property advisor will connect with you shortly with prime options matching your requirements.',
                components: [
                    { type: 'HEADER', format: 'TEXT', text: 'Namaste & Welcome' },
                    { type: 'BODY', text: 'Namaste! Welcome to Bharat Properties.\nThank you for reaching out to us. Our property advisor will connect with you shortly with prime options matching your requirements.' },
                    { type: 'FOOTER', text: 'Bharat Properties • Client Success' }
                ]
            },
            {
                name: 'lead_match_full_v1',
                body: 'Hi {{1}} 👋\n\nBased on your specific requirement, our AI Match Center has identified a highly suitable property for you:\n\n{{2}}\n\nAre you interested in scheduling a site visit or receiving more details?',
                components: [
                    { type: 'HEADER', format: 'TEXT', text: '🌟 Premium Property Match' },
                    { type: 'BODY', text: 'Hi {{1}} 👋\n\nBased on your specific requirement, our AI Match Center has identified a highly suitable property for you:\n\n{{2}}\n\nAre you interested in scheduling a site visit or receiving more details?' },
                    { type: 'FOOTER', text: 'Bharat Properties • Enterprise CRM' },
                    { type: 'BUTTONS', buttons: [
                        { type: 'QUICK_REPLY', text: '✅ Yes, send details' },
                        { type: 'QUICK_REPLY', text: '📅 Schedule Visit' }
                    ]}
                ]
            },
            {
                name: 'sample_property_launch',
                body: 'Hello {{1}}, check out our new project {{2}} starting at {{3}} Lakhs!',
                components: [
                    { type: 'HEADER', format: 'TEXT', text: 'New Project Launch' },
                    { type: 'BODY', text: 'Hello {{1}}, check out our new project {{2}} starting at {{3}} Lakhs!' }
                ]
            },
            {
                name: 'property_match_alert',
                body: 'Hi {{1}}! 🏠\n\nWe found an exclusive property match that aligns perfectly with your requirements:\n\n{{2}}\n\nWould you like to schedule a priority site visit or receive more details?\n\nBest regards,\n{{3}}\nBharat Properties',
                components: [
                    { type: 'HEADER', format: 'TEXT', text: '🏠 Exclusive Property Match' },
                    { type: 'BODY', text: 'Hi {{1}}! 🏠\n\nWe found an exclusive property match that aligns perfectly with your requirements:\n\n{{2}}\n\nWould you like to schedule a priority site visit or receive more details?\n\nBest regards,\n{{3}}\nBharat Properties' },
                    { type: 'BUTTONS', buttons: [
                        { type: 'QUICK_REPLY', text: '📅 Schedule Visit' },
                        { type: 'QUICK_REPLY', text: 'ℹ️ More Info' }
                    ]}
                ]
            },
            {
                name: 'fb_interested_hot_wa',
                body: "Hi {owner}, great to hear from you regarding {{unit_number}}! I'm finalizing the details for our {{due_date}} meeting. Please keep the original documents ready.",
                components: [
                    { type: 'BODY', text: "Hi {owner}, great to hear from you regarding {{unit_number}}! I'm finalizing the details for our {{due_date}} meeting. Please keep the original documents ready." }
                ]
            },
            {
                name: 'fb_interested_warm_wa',
                body: "Hi {owner}, thank you for your time discussing {{unit_number}}. I've noted your interest for {{lead_status}}. I will share some market comparisons shortly.",
                components: [
                    { type: 'BODY', text: "Hi {owner}, thank you for your time discussing {{unit_number}}. I've noted your interest for {{lead_status}}. I will share some market comparisons shortly." }
                ]
            }
        ];
        defaultTemplates.forEach(t => {
            if (!templateMap.has(t.name.toLowerCase())) {
                templateMap.set(t.name.toLowerCase(), t);
            }
        });

        // 🚀 Enterprise Helper: Resolve comprehensive media, button, header, and footer metadata
        const resolveMessageMetadata = (details, rawText) => {
            const d = details || {};
            const searchKey = (d.templateId || (rawText && rawText.match(/template:\s*([a-zA-Z0-9_\-]+)/i)?.[1]) || rawText || '').trim().toLowerCase();
            const matchedTpl = searchKey ? templateMap.get(searchKey) : null;

            // 1. Resolve Attachment (Image, Document, Video, Audio, Location, Contacts, Catalogue)
            let attachment = d.attachment || null;
            if (!attachment) {
                if (d.mediaUrl || d.url || d.fileUrl || d.imageUrl) {
                    const mediaUrl = d.mediaUrl || d.url || d.fileUrl || d.imageUrl;
                    const type = d.type || (mediaUrl.match(/\.(jpeg|jpg|png|gif|webp)/i) ? 'image' : (mediaUrl.match(/\.(mp4|mov|avi)/i) ? 'video' : (mediaUrl.match(/\.(mp3|ogg|wav|m4a)/i) ? 'audio' : 'document')));
                    attachment = {
                        type,
                        url: mediaUrl,
                        filename: d.filename || d.fileName || (type === 'document' ? 'Document' : ''),
                        caption: d.caption || '',
                        mimeType: d.mimeType
                    };
                } else if (d.location) {
                    attachment = {
                        type: 'location',
                        location: d.location
                    };
                } else if (d.contacts || d.contact) {
                    attachment = {
                        type: 'contacts',
                        contacts: Array.isArray(d.contacts) ? d.contacts : [d.contact]
                    };
                } else if (d.catalogue || d.product) {
                    attachment = {
                        type: 'catalogue',
                        catalogue: d.catalogue || d.product
                    };
                }
            }

            // 2. Resolve Buttons (API Buttons, Quick Replies, Call-to-Actions, Flows)
            let buttons = d.buttons || d.interactive?.action?.buttons || null;
            if (!buttons && matchedTpl?.components) {
                const btnComp = matchedTpl.components.find(c => c.type === 'BUTTONS' || c.type === 'buttons');
                if (btnComp?.buttons) {
                    buttons = btnComp.buttons;
                }
            }

            // 3. Resolve Header & Footer
            let header = d.header || null;
            let footer = d.footer || null;
            if (matchedTpl?.components) {
                const headComp = matchedTpl.components.find(c => c.type === 'HEADER' || c.type === 'header');
                if (headComp && !header) {
                    header = {
                        format: headComp.format || 'TEXT',
                        text: headComp.text,
                        url: headComp.url || headComp[headComp.format?.toLowerCase()]?.link
                    };
                }
                const footComp = matchedTpl.components.find(c => c.type === 'FOOTER' || c.type === 'footer');
                if (footComp && !footer) {
                    footer = footComp.text;
                }
            }

            return {
                ...d,
                attachment,
                buttons,
                header,
                footer,
                templateId: d.templateId || (matchedTpl ? matchedTpl.name : null)
            };
        };

        const resolveActivityText = (a) => {
            // 1. Highest priority: detailed rendered message or message text
            let text = a.details?.renderedBody || a.details?.message || a.details?.text || a.description || a.subject || '';

            // 2. Marketing results WhatsApp content
            if (a.type?.toLowerCase() === 'marketing' && a.details?.results) {
                const waRes = a.details.results.find(r => r.channel === 'whatsapp');
                if (waRes && waRes.messageContent) {
                    text = waRes.messageContent;
                }
            }

            // 3. Resolve Deal Broadcast if text is a placeholder like "Sent via whatsapp" or matches "Sent via..."
            const isSentViaPlaceholder = !text || /^Sent via\s+/i.test(text.trim()) || text.trim().toLowerCase() === 'sent via whatsapp';
            if (isSentViaPlaceholder && a.details?.dealId && dealMap.has(String(a.details.dealId))) {
                const d = dealMap.get(String(a.details.dealId));
                const meta = d.broadcastMetadata;
                if (meta) {
                    const features = (meta.features || []).filter(f => !String(f).includes('[object Object]'));
                    let waMsg = `*🏢 BROKER UPDATE: ${meta.title || d.projectName || 'Property Deal'}*\n\n` +
                        `💰 *Price:* ${meta.price || d.priceInWords || ''}\n` +
                        `📍 *Location:* ${meta.location || 'Kurukshetra'}\n` +
                        (features.length > 0 ? `📐 *Specs:* ${features.join(' | ')}\n\n` : '\n');
                    if (meta.detailedSections && Array.isArray(meta.detailedSections)) {
                        meta.detailedSections.forEach(sec => {
                            waMsg += `*${sec.title.toUpperCase()}*\n`;
                            (sec.lines || []).forEach(l => { waMsg += `• ${l}\n`; });
                            waMsg += `\n`;
                        });
                    }
                    if (meta.description) {
                        waMsg += `📝 *Details:* ${meta.description}\n\n`;
                    }
                    waMsg += `🔗 *Ref:* ${d.shareableId || a.details?.shareableId || 'BP-DEAL'}\n` +
                        `Contact us for commission split and site visits.`;
                    text = waMsg;
                }
            } else if (isSentViaPlaceholder && a.subject && !/^Sent via\s+/i.test(a.subject.trim())) {
                text = a.subject;
            }

            // 4. Strip administrative / synthetic logger prefixes
            text = text.replace(/^Auto WhatsApp dispatched to [^:]+:\s*/i, '');
            text = text.replace(/^Synced from mobile[:.]\s*/i, '');

            // Clean format for Call logs if viewed in Voice / All channel
            if (a.type?.toLowerCase() === 'call' || ['mobile', 'call', 'voice'].includes(a.details?.platform?.toLowerCase())) {
                const isIncomingCall = (a.details?.direction || '').toLowerCase().includes('in') || (a.subject || '').toLowerCase().includes('incoming');
                const dir = isIncomingCall ? 'Incoming Call' : 'Outgoing Call';
                let dur = a.details?.duration;
                if (!dur && a.description) {
                    const m = a.description.match(/Duration:\s*(\d+s?)/i);
                    if (m) dur = m[1];
                }
                const durStr = dur ? ` (${String(dur).endsWith('s') ? dur : dur + 's'})` : '';
                text = `📞 ${dir}${durStr}`;
            }

            // 4. Check if text is just a template ID or placeholder log
            const templateId = a.details?.templateId || (text.match(/template:\s*([a-zA-Z0-9_\-]+)/i)?.[1]) || null;
            const isPlaceholder = !text || 
                /^Sent (?:text|template|image|document|video) media \/ template:/i.test(text) ||
                templateMap.has(text.trim().toLowerCase()) ||
                (templateId && text.trim().toLowerCase() === String(templateId).trim().toLowerCase());

            if (templateId || isPlaceholder) {
                const searchKey = (templateId || text).trim().toLowerCase();
                const matchedTpl = templateMap.get(searchKey);
                if (matchedTpl) {
                    let tplBody = matchedTpl.body || matchedTpl.content || '';
                    if (!tplBody && matchedTpl.components) {
                        const bodyComp = matchedTpl.components.find(c => c.type === 'BODY');
                        if (bodyComp?.text) tplBody = bodyComp.text;
                    }

                    if (tplBody) {
                        // Interpolate variables if present in details
                        let rendered = tplBody;
                        const params = a.details?.templateComponents || a.details?.parameters || [];
                        if (Array.isArray(params)) {
                            params.forEach((p, idx) => {
                                const val = typeof p === 'string' ? p : (p?.text || '');
                                if (val) {
                                    rendered = rendered.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), val);
                                    if (p?.parameter_name) {
                                        rendered = rendered.replace(new RegExp(`\\{\\{${p.parameter_name}\\}\\}`, 'gi'), val);
                                    }
                                }
                            });
                        }
                        if (a.details?.namedParams && typeof a.details.namedParams === 'object') {
                            Object.entries(a.details.namedParams).forEach(([k, v]) => {
                                rendered = rendered.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'gi'), String(v));
                            });
                        }
                        text = rendered;
                    }
                }
            }

            // 5. Enterprise Universal Variable Interpolation (Resolves any surviving raw placeholders)
            if (text && text.includes('{{')) {
                const actRecipient = { ...recipientContext };
                if (a.participants?.[0]?.name && !actRecipient.name) {
                    actRecipient.name = a.participants[0].name;
                    actRecipient.firstName = a.participants[0].name.split(' ')[0];
                }
                const actAgent = { ...agentContext };
                if (a.performedBy && !a.performedBy.toLowerCase().includes('system')) {
                    actAgent.fullName = a.performedBy;
                }
                text = interpolateTemplateText(text, {
                    recipient: actRecipient,
                    agent: actAgent,
                    activity: a
                });
            }

            return text;
        };

        // 2. Unify and Sort — Strict Enterprise Channel Isolation
        let filteredActivities = activities.filter(a => {
            const aType = (a.type || '').toLowerCase();
            const aPlatform = (a.details?.platform || '').toLowerCase();

            if (isWhatsApp && via) {
                const isWa = ['whatsapp'].includes(aType) || 
                             ['whatsapp', 'whatsapp web'].includes(aPlatform) ||
                             (aType === 'marketing' && a.details?.results?.some(r => r.channel === 'whatsapp'));
                if (!isWa) return false;

                if (isGroup) return true;

                const aBizId = a.details?.businessPhoneNumberId || a.details?.whatsappPhoneNumberId;
                const aIntId = a.details?.whatsappIntegrationId || a.details?.integrationId;
                if (aBizId && targetBizPhoneId && String(aBizId) !== targetBizPhoneId) return false;
                if (aIntId && targetIntegrationId && String(aIntId) !== targetIntegrationId) return false;
                return true;
            }

            if (isWebChat) {
                return ['website chat', 'web chat', 'webchat'].includes(aType) || 
                       ['website', 'web chat', 'webchat'].includes(aPlatform);
            }

            if (isSMS) {
                return ['sms'].includes(aType) || 
                       ['sms', 'sms gateway'].includes(aPlatform) ||
                       (aType === 'marketing' && a.details?.results?.some(r => r.channel === 'sms'));
            }

            if (isVoice) {
                return ['call', 'voice'].includes(aType) || ['call', 'voice', 'mobile'].includes(aPlatform);
            }

            if (isEmail) {
                return ['email'].includes(aType) || ['email'].includes(aPlatform);
            }

            // If via is 'all' or empty: exclude system tasks, site visits, and raw mobile syncs from chat
            return ['whatsapp', 'sms', 'email', 'call', 'voice', 'website chat', 'marketing'].includes(aType) ||
                   ['whatsapp', 'whatsapp web', 'sms', 'sms gateway', 'mobile', 'website'].includes(aPlatform);
        });

        let thread = filteredActivities.map(a => {
            const text = resolveActivityText(a);
            const isIncoming = (a.details?.direction || '').toLowerCase().includes('in');
            const isHexId = (val) => Boolean(val && /^[0-9a-fA-F]{24}$/.test(String(val).trim()));
            const senderName = isIncoming
                ? ((!isHexId(a.performedBy) && a.performedBy !== 'System' ? a.performedBy : null) || a.details?.senderName || a.participants?.[0]?.name || recipientContext.name || 'Customer')
                : ((!isHexId(a.performedBy) ? a.performedBy : null) || 'Agent');

            return {
                id: a._id,
                sender: isIncoming ? 'customer' : 'agent',
                senderName: senderName,
                text: text,
                time: a.createdAt || a.performedAt,
                status: a.details?.status || a.outcome || (isIncoming ? 'Received' : 'Delivered'),
                metadata: {
                    ...resolveMessageMetadata(a.details, a.details?.message || a.description || a.subject),
                    messageId: a.details?.messageId || a._id.toString(),
                    ...(a.details?.participant ? { participant: a.details.participant } : {}),
                    ...(a.details?.isGroup ? { isGroup: true, groupJid: a.details.groupJid, groupName: a.details.groupName } : {})
                }
            };
        });

        const matchingConvs = conversations.filter(c => {
            const cChan = (c.channel || '').toLowerCase();
            if (isWebChat) return cChan === 'website_chat';
            if (isWhatsApp && via) return ['whatsapp'].includes(cChan);
            if (isSMS) return cChan === 'sms';
            if (isVoice || isEmail) return false;
            return true;
        });

        if (matchingConvs.length > 0) {
            const aiMsgs = matchingConvs.flatMap(c => (c.messages || []).map(m => {
                const isIncoming = m.role === 'user';
                let contentText = m.content || '';
                if (contentText && contentText.includes('{{')) {
                    contentText = interpolateTemplateText(contentText, {
                        recipient: recipientContext,
                        agent: agentContext
                    });
                }
                return {
                    id: m._id,
                    sender: isIncoming ? 'customer' : (m.role === 'assistant' ? 'ai' : 'agent'),
                    senderName: isIncoming
                        ? (m.metadata?.senderName || m.metadata?.participant || c.metadata?.senderName || recipientContext.name || 'Member')
                        : (m.role === 'assistant' ? 'AI Bot' : 'Agent'),
                    text: contentText,
                    time: m.timestamp,
                    status: m.metadata?.status || 'Delivered',
                    metadata: {
                        ...resolveMessageMetadata(m.metadata, contentText),
                        messageId: m.metadata?.messageId || m._id?.toString(),
                        ...(m.metadata?.participant ? { participant: m.metadata.participant } : {}),
                        ...(m.metadata?.isGroup ? { isGroup: true, groupJid: m.metadata.groupJid, groupName: m.metadata.groupName } : {})
                    }
                };
            }));
            thread = [...thread, ...aiMsgs];
        }

        // De-duplicate and sort by time
        const seenMessageIds = new Set();
        const seenFuzzy = [];
        const uniqueThread = thread.filter(m => {
            const msgId = m.metadata?.messageId || m.id;
            if (msgId && /^[A-Z0-9_-]{12,}$/i.test(String(msgId))) {
                if (seenMessageIds.has(String(msgId))) return false;
                seenMessageIds.add(String(msgId));
            }
            const timeMs = new Date(m.time).getTime();
            const isFuzzyDup = seenFuzzy.some(existing => 
                existing.sender === m.sender &&
                (!isGroup || existing.senderName === m.senderName) &&
                existing.text === m.text &&
                Math.abs(existing.timeMs - timeMs) < 3000
            );
            if (isFuzzyDup) return false;
            seenFuzzy.push({ sender: m.sender, senderName: m.senderName, text: m.text, timeMs });
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
        const { createStandardizedLead } = await import('../services/LeadCreationEngine.js');
        const leadResult = await createStandardizedLead({
            firstName: name || "Messaging",
            lastName: "Lead",
            mobile: cleanPhone,
            source: source,
            status: newStatus?._id || null,
            stage: newStage?._id || null,
            owner: req.user?._id || null,
            remarks: `Manually created from Communication Hub by ${req.user?.fullName || 'Agent'}`
        }, { triggerEvent: 'onCreate' });

        const lead = leadResult.lead;

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

export const getPublicActivityDetails = async (req, res) => {
    try {
        const { activityId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(activityId)) {
            return res.status(400).json({ success: false, message: "Invalid Activity ID" });
        }

        // Fetch only safe fields needed for public form rendering
        const activity = await Activity.findById(activityId)
            .select('type subject details status')
            .lean();

        if (!activity) {
            return res.status(404).json({ success: false, message: "Activity not found" });
        }

        res.status(200).json({
            success: true,
            data: {
                _id: activity._id,
                type: activity.type,
                subject: activity.subject,
                status: activity.status,
                visitedProperties: activity.details?.visitedProperties || []
            }
        });
    } catch (error) {
        console.error("[getPublicActivityDetails] Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

/**
 * @desc    Establish real-time SSE stream for CRM Communication Hub
 * @route   GET /api/activities/stream-live
 */
export const liveStreamSSE = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Initial ping
    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ status: 'connected', user: req.user?._id, time: new Date() })}\n\n`);

    RealtimeHub.addClient(res, req.user);

    // Heartbeat every 25s to keep connection alive through proxies
    const heartbeat = setInterval(() => {
        try {
            res.write(': ping\n\n');
        } catch (e) {
            clearInterval(heartbeat);
        }
    }, 25000);

    req.on('close', () => {
        clearInterval(heartbeat);
    });
};
