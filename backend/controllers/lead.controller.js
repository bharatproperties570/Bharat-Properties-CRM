import Lead from "../models/Lead.js";
import Deal from "../models/Deal.js";
import Lookup from "../models/Lookup.js";
import User from "../models/User.js";
import Contact from "../models/Contact.js";
import Activity from "../models/Activity.js";
import AuditLog from "../models/AuditLog.js";
import mongoose from "mongoose";
import { paginate } from "../utils/pagination.js";
import mockStore from "../utils/mockStore.js";
import { enrichmentQueue } from "../src/queues/queueManager.js";
import smsService from "../src/modules/sms/sms.service.js";
import SmsLog from "../src/modules/sms/smsLog.model.js";
import { runFullLeadEnrichment } from "../src/utils/enrichmentEngine.js";
import { autoAssign } from "../src/services/DistributionService.js";

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const sanitizeIds = (ids) => {
    if (!ids) return [];
    const arr = Array.isArray(ids) ? ids : ids.split(",").map((s) => s.trim());
    return arr.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
};

// Helper to resolve lookup (Find or Create)
const resolveLookup = async (type, value) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    const escapedValue = escapeRegExp(value);
    const re = new RegExp(`^${escapedValue}$`, 'i');
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: re } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};

// Helper to resolve User (By Name or Email)
const resolveUser = async (identifier) => {
    if (!identifier) return null;
    if (mongoose.Types.ObjectId.isValid(identifier)) return identifier;

    const escapedIdentifier = escapeRegExp(identifier);
    const user = await User.findOne({
        $or: [
            { fullName: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } },
            { email: identifier.toLowerCase() },
            { name: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } }
        ]
    });
    return user ? user._id : null;
};

// Resolve All Reference Fields for Lead
const resolveAllReferenceFields = async (doc) => {
    // If field is an empty string, set it to null so Mongoose doesn't try to cast it as ObjectId
    const fieldsToResolve = ['requirement', 'subRequirement', 'budget', 'location', 'source', 'status', 'stage', 'countryCode', 'campaign', 'subSource'];
    for (const field of fieldsToResolve) {
        if (doc[field] === "") doc[field] = null;
    }

    if (doc.requirement) doc.requirement = await resolveLookup('Requirement', doc.requirement);
    if (doc.subRequirement) doc.subRequirement = await resolveLookup('SubRequirement', doc.subRequirement);
    if (doc.budget) doc.budget = await resolveLookup('Budget', doc.budget);
    if (doc.location) doc.location = await resolveLookup('Location', doc.location);
    if (doc.source) doc.source = await resolveLookup('Source', doc.source);
    if (doc.status) doc.status = await resolveLookup('Status', doc.status);
    if (doc.stage) doc.stage = await resolveLookup('Stage', doc.stage);
    if (doc.countryCode) doc.countryCode = await resolveLookup('CountryCode', doc.countryCode);
    if (doc.campaign) doc.campaign = await resolveLookup('Campaign', doc.campaign);
    if (doc.subSource) doc.subSource = await resolveLookup('SubSource', doc.subSource);

    // Handle Arrays (Lookup fields)
    const arrayLookups = {
        propertyType: 'PropertyType',
        subType: 'SubType',
        unitType: 'UnitType',
        facing: 'Facing',
        roadWidth: 'RoadWidth',
        direction: 'Direction'
    };

    // Re-check from list_lookup results:
    // Property Type
    // PropertyType
    // Road Width
    // RoadWidth
    // Unit Type
    // UnitType
    // I'll update to match the ones with spaces if they are more standard, or stick to what was there.
    // The previous code had spaces. I'll keep them but harmonize with Country-Code etc.

    for (const [field, type] of Object.entries(arrayLookups)) {
        if (Array.isArray(doc[field])) {
            // Filter out empty strings from arrays
            doc[field] = doc[field].filter(val => val !== "");
            doc[field] = await Promise.all(doc[field].map(val => resolveLookup(type, val)));
        }
    }

    if (doc.owner === "") doc.owner = null;
    if (doc.owner) doc.owner = await resolveUser(doc.owner);

    // Handle Team resolution (from ID or Name)
    if (doc.team) {
        const Team = mongoose.model('Team');
        let teamId = doc.team;
        if (typeof teamId === 'object' && teamId._id) teamId = teamId._id;

        let teamDoc;
        if (mongoose.Types.ObjectId.isValid(teamId)) {
            teamDoc = await Team.findById(teamId);
        } else {
            // Find by name if not a valid ID
            teamDoc = await Team.findOne({ name: { $regex: new RegExp(`^${escapeRegExp(teamId)}$`, 'i') } });
        }

        if (teamDoc) {
            if (!doc.assignment) doc.assignment = {};
            doc.assignment.team = [teamDoc._id];
        } else {
            console.log(`[WARN] Team not found: ${teamId}`);
        }
    }

    if (doc.contactDetails && !mongoose.Types.ObjectId.isValid(doc.contactDetails)) {
        // If it's not a valid ID, it might be a name or something from old logic, but here we expect ID
        // However, resolveAllReferenceFields is usually for bulk imports too.
        // For now, just ensure it's handled if it exists.
    }
    if (doc.assignment?.assignedTo) doc.assignment.assignedTo = await resolveUser(doc.assignment.assignedTo);

    // Sync top-level owner to assignment.assignedTo if missing
    if (doc.owner && !doc.assignment?.assignedTo) {
        if (!doc.assignment) doc.assignment = {};
        doc.assignment.assignedTo = doc.owner;
    }

    if (doc.project) {
        // Assume doc.project is name if not valid ID
        if (!mongoose.Types.ObjectId.isValid(doc.project)) {
            const Project = mongoose.model('Project');
            const p = await Project.findOne({ name: { $regex: new RegExp(`^${doc.project}$`, 'i') } });
            if (p) doc.project = p._id;
        }
    }


    // Resolve Documents
    if (Array.isArray(doc.documents)) {
        for (const docItem of doc.documents) {
            if (docItem.documentCategory) docItem.documentCategory = await resolveLookup('DocumentCategory', docItem.documentCategory);
            if (docItem.documentName) docItem.documentName = await resolveLookup('Document Name', docItem.documentName);
            if (docItem.documentType) docItem.documentType = await resolveLookup('DocumentType', docItem.documentType);
        }
    }
    console.log("[DEBUG] resolveAllReferenceFields completed successfully");
    return doc;
};

const leadPopulateFields = [
    { path: 'requirement', select: 'lookup_value' },
    { path: 'subRequirement', select: 'lookup_value' },
    { path: 'budget', select: 'lookup_value' },
    { path: 'location', select: 'lookup_value' },
    { path: 'source', select: 'lookup_value' },
    { path: 'subSource', select: 'lookup_value' },
    { path: 'campaign', select: 'lookup_value' },
    { path: 'status', select: 'lookup_value' },
    { path: 'stage', select: 'lookup_value' },
    { path: 'propertyType', select: 'lookup_value' },
    { path: 'subType', select: 'lookup_value' },
    { path: 'unitType', select: 'lookup_value' },
    { path: 'facing', select: 'lookup_value' },
    { path: 'roadWidth', select: 'lookup_value' },
    { path: 'direction', select: 'lookup_value' },
    { path: 'project', select: 'name' },
    { path: 'owner', select: 'fullName email name' },
    {
        path: 'contactDetails',
        populate: [
            { path: 'title', select: 'lookup_value' },
            { path: 'source', select: 'lookup_value' },
            { path: 'personalAddress.location', select: 'lookup_value' },
            { path: 'correspondenceAddress.city', select: 'lookup_value' },
            { path: 'correspondenceAddress.state', select: 'lookup_value' },
            { path: 'correspondenceAddress.country', select: 'lookup_value' },
            { path: 'correspondenceAddress.location', select: 'lookup_value' },
            { path: 'professionCategory', select: 'lookup_value' },
            { path: 'professionSubCategory', select: 'lookup_value' },
            { path: 'designation', select: 'lookup_value' },
            { path: 'subSource', select: 'lookup_value' },
            { path: 'campaign', select: 'lookup_value' },
            { path: 'educations.education', select: 'lookup_value' },
            { path: 'educations.degree', select: 'lookup_value' },
            { path: 'loans.loanType', select: 'lookup_value' },
            { path: 'loans.bank', select: 'lookup_value' },
            { path: 'incomes.incomeType', select: 'lookup_value' }
        ]
    },
    { path: 'assignment.assignedTo', select: 'fullName email name' },
    { path: 'assignment.team', select: 'name' },
    { path: 'documents.documentCategory', select: 'lookup_value' },
    { path: 'documents.documentName', select: 'lookup_value' },
    { path: 'documents.documentType', select: 'lookup_value' },
];

/**
 * @desc    Get all leads with pagination and search
 * @route   GET /leads
 * @access  Private
 */
export const getLeads = async (req, res, next) => {
    try {
        const { page = 1, limit = 25, search = "", stage, status, teamId, userId } = req.query;

        let query = {};

        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: "i" } },
                { lastName: { $regex: search, $options: "i" } },
                { mobile: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } }
            ];
        }

        if (stage && mongoose.Types.ObjectId.isValid(stage)) query.stage = stage;
        if (status && mongoose.Types.ObjectId.isValid(status)) query.status = status;
        if (teamId && mongoose.Types.ObjectId.isValid(teamId)) query['assignment.team'] = teamId;
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            query.$or = query.$or || [];
            query.$or.push({ owner: userId }, { 'assignment.assignedTo': userId });
        }

        // Enable population for key fields
        const results = await paginate(Lead, query, Number(page), Number(limit), { updatedAt: -1 }, leadPopulateFields);

        // Attach Interaction Data (Activity Counts & Recent Activities)
        if (results.records && results.records.length > 0) {
            const leadIds = results.records.map(r => r._id);
            const leadIdsStr = leadIds.map(id => id.toString());

            // 1. Fetch recent activities for display/scoring
            const allActivities = await Activity.find({
                entityId: { $in: leadIdsStr },
                status: 'Completed'
            }).sort({ createdAt: -1 }).lean();

            // 2. Fetch all relevant SMS logs
            const allSmsLogs = await SmsLog.find({
                entityId: { $in: leadIdsStr },
                status: { $in: ['Sent', 'Delivered'] }
            }).lean();

            const activityGroup = new Map();
            const countsMap = new Map(); // Map<leadId, {call, siteVisit, meeting, email, sms, whatsapp}>

            // Initialize counts for all leads on page
            leadIdsStr.forEach(id => {
                countsMap.set(id, { call: 0, siteVisit: 0, meeting: 0, email: 0, sms: 0, whatsapp: 0 });
            });

            allActivities.forEach(act => {
                const id = act.entityId.toString();
                if (!activityGroup.has(id)) activityGroup.set(id, []);
                if (activityGroup.get(id).length < 10) {
                    activityGroup.get(id).push(act);
                }

                if (countsMap.has(id)) {
                    const leadCounts = countsMap.get(id);
                    const t = (act.type || "").toLowerCase();
                    if (t.includes('call')) leadCounts.call++;
                    else if (t.includes('meeting')) leadCounts.meeting++;
                    else if (t.includes('site visit')) leadCounts.siteVisit++;
                    else if (t.includes('email')) leadCounts.email++;
                    else if (t.includes('whatsapp') || t.includes('messaging')) leadCounts.whatsapp++;
                }
            });

            allSmsLogs.forEach(log => {
                const id = log.entityId.toString();
                if (countsMap.has(id)) {
                    countsMap.get(id).sms++;
                }
            });

            results.records = results.records.map(lead => {
                const leadId = lead._id.toString();
                const leadActs = activityGroup.get(leadId) || [];
                const latest = leadActs[0];
                return {
                    ...lead,
                    activities: leadActs, // For frontend scoring engine
                    interactionCounts: countsMap.get(leadId) || { call: 0, siteVisit: 0, meeting: 0, email: 0, sms: 0, whatsapp: 0 },
                    activity: latest ? latest.subject : "None",
                    lastAct: latest ? new Date(latest.createdAt).toLocaleDateString() : "Today"
                };
            });
        }

        res.status(200).json({
            success: true,
            ...results
        });
    } catch (error) {
        console.error("[ERROR] getLeads failed:", error);
        next(error);
    }
};

// ... Rest of the file remained unchanged but simplified for logging
export const addLead = async (req, res, next) => {
    try {
        console.log("[DEBUG] addLead called with body:", JSON.stringify(req.body, null, 2));
        const data = { ...req.body };
        await resolveAllReferenceFields(data);
        console.log("[DEBUG] Data after resolution:", JSON.stringify(data, null, 2));
        const lead = await Lead.create(data);
        console.log("[DEBUG] Lead created successfully:", lead._id);

        // Auto-run Enrichment (wrapped in try-catch to prevent crash if ReferenceError/Enrichment fails)
        try {
            await runFullLeadEnrichment(lead._id);
        } catch (enrichError) {
            console.error("[ENRICHMENT ERROR] Failed in addLead:", enrichError.message);
        }

        // ─── Auto-Assign via DistributionService ───────────────────────────────────
        let assignedAgent = null;
        try {
            const assignment = await autoAssign(lead.toObject());
            if (assignment?.assignedTo) {
                await Lead.findByIdAndUpdate(lead._id, {
                    owner: assignment.assignedTo,
                    'assignment.assignedTo': assignment.assignedTo
                });
                assignedAgent = {
                    userId: assignment.assignedTo,
                    ruleName: assignment.ruleName
                };
                console.log(`[DISTRIBUTION] Lead ${lead._id} auto-assigned to ${assignment.assignedTo} via rule "${assignment.ruleName}"`);
            }
        } catch (distErr) {
            console.warn('[DISTRIBUTION] autoAssign failed (non-critical):', distErr.message);
        }

        await lead.populate(leadPopulateFields);

        // SMS Trigger: Welcome Message via registered DLT template
        if (lead.mobile) {
            smsService.sendSMSWithTemplate(
                lead.mobile,
                'Get Response',  // Name of the registered DLT template
                { Name: lead.firstName || 'Customer' },
                { entityType: 'Lead', entityId: lead._id }
            ).catch(err => console.error('[SMS Trigger Error] Welcome failed:', err.message));
        }

        res.status(201).json({ success: true, data: lead, assignedAgent });
    } catch (error) {
        console.error("[ERROR] addLead failed:", error);
        next(error);
    }
};

export const updateLead = async (req, res, next) => {
    try {
        const updateData = { ...req.body };
        await resolveAllReferenceFields(updateData);

        // ━━ Stage History: auto-track if stage is changing ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (updateData.stage) {
            const existing = await Lead.findById(req.params.id).select('stage stageHistory stageChangedAt createdAt').lean();
            if (existing) {
                // Resolve current stage to a string label
                let currentStageStr = 'New';
                if (existing.stage) {
                    const existingLookup = await Lookup.findById(existing.stage).select('lookup_value').lean();
                    currentStageStr = existingLookup?.lookup_value || 'New';
                }
                // Resolve new stage to a string label (updateData.stage is now an ObjectId)
                const newLookup = await Lookup.findById(updateData.stage).select('lookup_value').lean();
                const newStageStr = newLookup?.lookup_value || String(updateData.stage);

                // Only write history if stage actually changed
                if (currentStageStr !== newStageStr) {
                    const now = new Date();
                    const historyUpdate = {};

                    // Close previous open entry
                    if (existing.stageHistory?.length > 0) {
                        const lastIdx = existing.stageHistory.length - 1;
                        const last = existing.stageHistory[lastIdx];
                        if (!last.exitedAt) {
                            const enteredAt = new Date(last.enteredAt || existing.stageChangedAt || existing.createdAt);
                            const daysInStage = Math.floor((now - enteredAt) / 86400000);
                            historyUpdate[`stageHistory.${lastIdx}.exitedAt`] = now;
                            historyUpdate[`stageHistory.${lastIdx}.daysInStage`] = daysInStage;
                        }
                    }

                    // Push new history entry
                    const triggeredBy = updateData.triggeredBy || 'activity';
                    const leadUpdateRes = await Lead.findByIdAndUpdate(req.params.id, {
                        $set: historyUpdate,
                        $push: {
                            stageHistory: {
                                stage: newStageStr,
                                enteredAt: now,
                                triggeredBy,
                                activityType: updateData.activityType || null,
                                outcome: updateData.outcome || null,
                                reason: updateData.reason || null
                            }
                        }
                    }, { new: true }); // Need new data for AuditLog name

                    // Ensure AuditLog captures this transition for the Timeline
                    const AuditLog = mongoose.model('AuditLog');
                    await AuditLog.logEntityUpdate(
                        'stage_changed',
                        'lead',
                        req.params.id,
                        `${leadUpdateRes?.firstName || ''} ${leadUpdateRes?.lastName || ''}`.trim(),
                        req.user?.id || null, // Best effort actor
                        { before: currentStageStr, after: newStageStr },
                        `Lead stage shifted from ${currentStageStr} to ${newStageStr}${updateData.reason ? ' - ' + updateData.reason : ''}`
                    );

                    // Set stageChangedAt
                    updateData.stageChangedAt = now;
                }
            }
        }

        // Standard update (stage already resolved to ObjectId by resolveAllReferenceFields)
        const finalLead = await Lead.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate(leadPopulateFields);

        if (finalLead) {
            // Auto-run Enrichment (wrapped in try-catch)
            try {
                await runFullLeadEnrichment(finalLead._id);
            } catch (enrichError) {
                console.error("[ENRICHMENT ERROR] Failed in updateLead:", enrichError.message);
            }

            // SMS Trigger: Stage Change (only if lead has a DLT-compliant template configured)
            // We skip arbitrary text messages as they violate DLT regulations in India
            if (finalLead.mobile && updateData.stage) {
                smsService.sendSMSWithTemplate(
                    finalLead.mobile,
                    'Get Response',
                    { Name: finalLead.firstName || 'Customer' },
                    { entityType: 'Lead', entityId: finalLead._id }
                ).catch(e => console.error('[SMS Trigger Error] Stage change failed:', e.message));
            }
        }
        res.json({ success: true, data: finalLead });
    } catch (error) {
        next(error);
    }
};

export const deleteLead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { deleteContact } = req.query;

        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        if (deleteContact === 'true' && lead.mobile) {
            await Contact.deleteMany({ 'phones.number': lead.mobile });
        }

        await Lead.findByIdAndDelete(id);
        res.json({ success: true, message: "Lead deleted successfully" });
    } catch (error) {
        next(error);
    }
};

export const getLeadById = async (req, res, next) => {
    try {
        const { id } = req.params;
        let lead;

        // Check if ID is a valid MongoDB ObjectId
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            lead = await Lead.findById(id);
        } else {
            // Fallback: search by mobile number
            lead = await Lead.findOne({ mobile: id });
        }

        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        // Populate lead
        await lead.populate(leadPopulateFields);

        // Attach Recent Activities and Interaction Counts
        const leadIdStr = id.toString();
        const recentActivities = await Activity.find({
            entityId: leadIdStr,
            status: 'Completed'
        }).sort({ createdAt: -1 }).limit(10).lean();

        // Aggregate counts from Activity collection
        const activityStats = await Activity.aggregate([
            {
                $match: {
                    entityId: new mongoose.Types.ObjectId(leadIdStr),
                    status: 'Completed'
                }
            },
            {
                $group: {
                    _id: "$type",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Aggregate counts from SmsLog collection
        const SmsLog = mongoose.model('SmsLog');
        const smsStats = await SmsLog.countDocuments({
            entityId: new mongoose.Types.ObjectId(leadIdStr),
            status: { $in: ['Sent', 'Delivered'] }
        });

        const interactionCounts = { call: 0, siteVisit: 0, meeting: 0, email: 0, sms: smsStats, whatsapp: 0 };
        activityStats.forEach(stat => {
            const t = stat._id.toLowerCase();
            if (t.includes('call')) interactionCounts.call += stat.count;
            else if (t.includes('meeting')) interactionCounts.meeting += stat.count;
            else if (t.includes('site visit')) interactionCounts.siteVisit += stat.count;
            else if (t.includes('email')) interactionCounts.email += stat.count;
            else if (t.includes('whatsapp') || t.includes('messaging')) interactionCounts.whatsapp += stat.count;
        });

        const leadData = lead.toObject();
        leadData.activities = recentActivities;
        leadData.interactionCounts = interactionCounts;
        const latest = recentActivities[0];
        leadData.activity = latest ? latest.subject : "None";
        leadData.lastAct = latest ? new Date(latest.createdAt).toLocaleDateString() : "Today";

        res.json({ success: true, data: leadData });
    } catch (error) {
        console.error("[ERROR] getLeadById failed:", error);
        next(error);
    }
};

export const bulkDeleteLeads = async (req, res, next) => {
    try {
        const { ids, deleteContacts } = req.body;

        if (deleteContacts === true) {
            const leads = await Lead.find({ _id: { $in: ids } });
            const mobiles = leads.map(l => l.mobile).filter(Boolean);
            if (mobiles.length > 0) {
                await Contact.deleteMany({ 'phones.number': { $in: mobiles } });
            }
        }

        await Lead.deleteMany({ _id: { $in: ids } });
        res.status(200).json({ success: true, message: "Deleted" });
    } catch (error) {
        next(error);
    }
};

export const importLeads = async (req, res, next) => {
    try {
        const { data, updateDuplicates = false } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, message: "Invalid data provided" });
        }

        const bulkOps = [];
        const processedData = [];

        for (const item of data) {
            const firstName = item.name || item.firstName || '';
            const lastName = item.surname || item.lastName || '';

            const leadEntry = {
                salutation: item.title || item.salutation || 'Mr.',
                firstName: firstName,
                lastName: lastName,
                mobile: item.mobile,
                email: item.email,
                description: item.description,
                projectName: item.projectName ? (Array.isArray(item.projectName) ? item.projectName : [item.projectName]) : [],

                // Location Fields
                locCity: item.locCity || item.city,
                locArea: item.locArea || item.area,
                locBlock: item.locBlock ? (Array.isArray(item.locBlock) ? item.locBlock : [item.locBlock]) : [],
                locPinCode: item.locPinCode || item.pinCode,
                locState: item.locState || item.state,
                locCountry: item.locCountry || item.country,
                searchLocation: item.searchLocation,

                // Property/Requirement Fields
                budgetMin: Number(item.budgetMin) || undefined,
                budgetMax: Number(item.budgetMax) || undefined,
                areaMin: Number(item.areaMin) || undefined,
                areaMax: Number(item.areaMax) || undefined,
                areaMetric: item.areaMetric || 'Sq Yard',
                propertyType: item.propertyType ? (Array.isArray(item.propertyType) ? item.propertyType : item.propertyType.split(',').map(t => t.trim())) : [],
                subType: item.subType ? (Array.isArray(item.subType) ? item.subType : item.subType.split(',').map(t => t.trim())) : [],
                unitType: item.unitType ? (Array.isArray(item.unitType) ? item.unitType : item.unitType.split(',').map(t => t.trim())) : [],
                facing: item.facing ? (Array.isArray(item.facing) ? item.facing : item.facing.split(',').map(t => t.trim())) : [],
                roadWidth: item.roadWidth ? (Array.isArray(item.roadWidth) ? item.roadWidth : item.roadWidth.split(',').map(t => t.trim())) : [],
                direction: item.direction ? (Array.isArray(item.direction) ? item.direction : item.direction.split(',').map(t => t.trim())) : [],

                purpose: item.purpose,
                nri: item.nri === 'Yes' || item.nri === true,
                funding: item.funding,
                timeline: item.timeline,
                furnishing: item.furnishing,
                transactionType: item.transactionType,

                team: item.team ? (Array.isArray(item.team) ? item.team : item.team.split(',').map(t => t.trim())) : [],
                visibleTo: item.visibleTo || 'Everyone',
                notes: item.notes || item.remarks,
                tags: item.tags ? (Array.isArray(item.tags) ? item.tags : item.tags.split(',').map(t => t.trim())) : [],
            };

            // Inject "Import" tag
            if (!leadEntry.tags.includes('Import')) leadEntry.tags.push('Import');

            // Resolve Lookups
            leadEntry.requirement = await resolveLookup('Requirement', item.requirement || 'Buy');
            leadEntry.source = await resolveLookup('Source', item.source || 'Direct');
            leadEntry.status = await resolveLookup('Status', item.status || 'Active');
            leadEntry.stage = await resolveLookup('Stage', item.stage || 'New');
            leadEntry.location = await resolveLookup('Location', item.location || leadEntry.locArea);
            leadEntry.budget = await resolveLookup('Budget', item.budget);
            leadEntry.owner = await resolveUser(item.owner);

            if (item.mobile) {
                if (updateDuplicates) {
                    bulkOps.push({
                        updateOne: {
                            filter: { mobile: item.mobile },
                            update: { $set: leadEntry },
                            upsert: true
                        }
                    });
                } else {
                    processedData.push(leadEntry);
                }
            } else {
                processedData.push(leadEntry);
            }
        }

        let newCount = 0;
        let updatedCount = 0;

        if (bulkOps.length > 0) {
            const result = await Lead.bulkWrite(bulkOps, { ordered: false });
            // result.upsertedCount = new items created via upsert
            // result.modifiedCount = existing items updated
            newCount += result.upsertedCount;
            updatedCount += result.modifiedCount;
        }

        if (processedData.length > 0) {
            let dataToInsert = processedData;
            if (!updateDuplicates) {
                const mobiles = processedData.map(d => d.mobile).filter(Boolean);
                const existing = await Lead.find({ mobile: { $in: mobiles } }, 'mobile').lean();
                const existingMobiles = new Set(existing.map(e => e.mobile));
                dataToInsert = processedData.filter(d => !existingMobiles.has(d.mobile));
            }

            if (dataToInsert.length > 0) {
                const result = await Lead.insertMany(dataToInsert, { ordered: false });
                newCount += result.length;
            }
        }

        res.status(200).json({
            success: true,
            message: `Import processed. New: ${newCount}, Updated: ${updatedCount}`,
            successCount: newCount + updatedCount,
            newCount: newCount,
            updatedCount: updatedCount,
            errorCount: 0,
            errors: []
        });

    } catch (error) {
        console.error("Professional Lead Import Error:", error);
        next(error);
    }
};

export const checkDuplicatesImport = async (req, res, next) => {
    try {
        const { mobiles } = req.body;
        if (!mobiles || !Array.isArray(mobiles)) return res.status(400).json({ success: false, message: "Invalid mobile numbers" });
        const duplicates = await Lead.find({ mobile: { $in: mobiles } }, 'mobile firstName lastName').lean();
        res.status(200).json({ success: true, duplicates: duplicates.map(d => d.mobile) });
    } catch (error) {
        next(error);
    }
};

export const matchLeads = async (req, res) => {
    try {
        const { dealId } = req.query;
        if (!dealId) {
            return res.status(400).json({ success: false, error: "dealId is required" });
        }

        const deal = await Deal.findById(dealId).lean();
        if (!deal) {
            return res.status(404).json({ success: false, error: "Deal not found" });
        }

        const query = {
            isVisible: { $ne: false },
            $or: []
        };

        if (deal.projectId) query.$or.push({ project: deal.projectId }, { projectName: deal.projectName });
        if (deal.category) query.$or.push({ requirement: deal.category });
        if (deal.location) query.$or.push({ location: deal.location });

        if (query.$or.length === 0) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        const leads = await Lead.find(query)
            .populate('requirement location status contactDetails')
            .limit(50)
            .sort({ createdAt: -1 })
            .lean();

        // Simple scoring based on how many fields match
        const scoredLeads = leads.map(lead => {
            let score = 50;
            if (lead.project?.toString() === deal.projectId?.toString()) score += 20;
            if (lead.requirement?._id?.toString() === deal.category?.toString() || lead.requirement?.toString() === deal.category?.toString()) score += 20;
            if (lead.location?._id?.toString() === deal.location?.toString() || lead.location?.toString() === deal.location?.toString()) score += 10;
            return { ...lead, score: Math.min(score, 100) };
        });

        return res.status(200).json({ success: true, count: scoredLeads.length, data: scoredLeads });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Toggle lead interest in an inventory
 * @route   PUT /leads/interest/:inventoryId
 * @access  Private
 */
export const toggleLeadInterest = async (req, res, next) => {
    try {
        const { leadId } = req.body;
        const { inventoryId } = req.params;

        if (!leadId || !inventoryId) {
            return res.status(400).json({ success: false, message: "Lead ID and Inventory ID are required" });
        }

        const lead = await Lead.findById(leadId);
        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        const interestIndex = lead.interestedInventory.indexOf(inventoryId);
        if (interestIndex > -1) {
            // Remove interest
            lead.interestedInventory.splice(interestIndex, 1);
        } else {
            // Add interest
            lead.interestedInventory.push(inventoryId);
        }

        await lead.save();
        res.status(200).json({
            success: true,
            message: interestIndex > -1 ? "Removed from interested" : "Marked as interested",
            isInterested: interestIndex === -1
        });
    } catch (error) {
        next(error);
    }
};
