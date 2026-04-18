import Lead from "../models/Lead.js";
import Deal from "../models/Deal.js";
import Lookup from "../models/Lookup.js";
import User from "../models/User.js";
import Contact from "../models/Contact.js";
import Activity from "../models/Activity.js";
import mongoose from "mongoose";
import { paginate } from "../utils/pagination.js";
import smsService from "../src/modules/sms/sms.service.js";
import SmsLog from "../src/modules/sms/smsLog.model.js";
import { runFullLeadEnrichment } from "../src/utils/enrichmentEngine.js";
import { autoAssign } from "../src/services/DistributionService.js";
import { createNotification } from "./notification.controller.js";
import { syncDocumentsToInventory } from "../utils/sync.js";
import { getVisibilityFilter } from "../utils/visibility.js";
import Project from "../models/Project.js"; // Added for [matchLeads] consistency

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};


// ━━ GLOBAL LOOKUP CACHE (process-scoped, bounded to 500 entries) ━━━━━━━━━━━━
const _lookupResolveCache = new Map();
const LOOKUP_CACHE_MAX = 500;

// Helper to resolve lookup (Find or Create)
const resolveLookup = async (type, value, createIfMissing = true) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value.toString());

    const cacheKey = `${type}:${String(value).toLowerCase()}`;
    if (_lookupResolveCache.has(cacheKey)) return _lookupResolveCache.get(cacheKey);

    const escapedValue = escapeRegExp(value);
    const re = new RegExp(`^${escapedValue}$`, 'i');
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: re } });

    if (!lookup) {
        if (!createIfMissing) return null;
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }

    if (_lookupResolveCache.size >= LOOKUP_CACHE_MAX) {
        _lookupResolveCache.delete(_lookupResolveCache.keys().next().value);
    }
    _lookupResolveCache.set(cacheKey, lookup._id);
    return lookup._id;
};

// Helper to resolve User (By Name or Email)
const resolveUser = async (identifier) => {
    if (!identifier) return null;
    if (mongoose.Types.ObjectId.isValid(identifier)) return new mongoose.Types.ObjectId(identifier.toString());

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
        // If it's an object from frontend state that didn't get flattened, try to extract ID or string
        if (doc[field] && typeof doc[field] === 'object' && !mongoose.Types.ObjectId.isValid(doc[field])) {
            doc[field] = doc[field]._id || doc[field].id || doc[field].lookup_value || doc[field].value || null;
        }
    }

    // ─── PERFORMANCE FIX: Parallel resolution of all scalar lookups ──────────────
    const scalarFieldMap = [
        ['requirement', 'Requirement'],
        ['subRequirement', 'SubRequirement'],
        ['budget', 'Budget'],
        ['location', 'Location'],
        ['source', 'Source'],
        ['status', 'Status'],
        ['stage', 'Stage'],
        ['countryCode', 'CountryCode'],
        ['campaign', 'Campaign'],
        ['subSource', 'SubSource'],
    ];
    const scalarResults = await Promise.all(
        scalarFieldMap.map(([field, type]) => doc[field] ? resolveLookup(type, doc[field], true) : Promise.resolve(null))
    );
    scalarFieldMap.forEach(([field], i) => { if (scalarResults[i] !== null) doc[field] = scalarResults[i]; });

    // Handle Arrays (Lookup fields)
    const arrayLookups = {
        propertyType: 'PropertyType',
        subType: 'SubType',
        unitType: 'UnitType',
        facing: 'Facing',
        roadWidth: 'RoadWidth',
        direction: 'Direction'
    };

    await Promise.all(Object.entries(arrayLookups).map(async ([field, type]) => {
        if (Array.isArray(doc[field])) {
            doc[field] = doc[field].filter(val => val !== "");
            doc[field] = await Promise.all(doc[field].map(async val => {
                if (val && typeof val === 'object' && !mongoose.Types.ObjectId.isValid(val)) {
                    val = val._id || val.id || val.lookup_value || val.value;
                }
                return val ? resolveLookup(type, val, true) : null;
            }));
            doc[field] = doc[field].filter(v => v !== null);
        }
    }));

    if (doc.owner === "") doc.owner = null;
    if (doc.owner) {
        if (typeof doc.owner === 'object' && !mongoose.Types.ObjectId.isValid(doc.owner)) {
            doc.owner = doc.owner._id || doc.owner.id || null;
        }
        if (doc.owner) doc.owner = await resolveUser(doc.owner);
    }

    // Handle Team resolution (from ID or Name)
    const teamsToResolve = Array.isArray(doc.teams) ? doc.teams : (doc.team ? [doc.team] : []);
    if (teamsToResolve.length > 0) {
        const Team = mongoose.model('Team');
        const resolvedTeams = await Promise.all(teamsToResolve.map(async (t) => {
            let teamId = t;
            if (typeof teamId === 'object' && teamId?._id) teamId = teamId._id;
            
            if (mongoose.Types.ObjectId.isValid(teamId)) {
                const teamDoc = await Team.findById(teamId).select('_id');
                return teamDoc?._id;
            } else if (typeof teamId === 'string' && teamId.trim() !== "") {
                const teamDoc = await Team.findOne({ name: { $regex: new RegExp(`^${escapeRegExp(teamId)}$`, 'i') } }).select('_id');
                return teamDoc?._id;
            }
            return null;
        }));

        doc.teams = resolvedTeams.filter(Boolean);
        if (doc.teams.length > 0) {
            if (!doc.assignment) doc.assignment = {};
            doc.assignment.team = doc.teams;
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
    { path: 'teams', select: 'name' },
    { path: 'documents.documentCategory', select: 'lookup_value' },
    { path: 'documents.documentName', select: 'lookup_value' },
    { path: 'documents.documentType', select: 'lookup_value' },
];

// 🏎️ SENIOR OPTIMIZATION: Lean population for summary list view
const leadListPopulateFields = [
    { path: 'requirement', select: 'lookup_value' },
    { path: 'subRequirement', select: 'lookup_value' },
    { path: 'location', select: 'lookup_value' },
    { path: 'source', select: 'lookup_value' },
    { path: 'stage', select: 'lookup_value' },
    { path: 'propertyType', select: 'lookup_value' },
    { path: 'subType', select: 'lookup_value' },
    { path: 'project', select: 'name' },
    { path: 'owner', select: 'fullName email name' },
    { path: 'assignment.assignedTo', select: 'fullName' }
];

/**
 * @desc    Get all leads with pagination and search
 * @route   GET /leads
 * @access  Private
 */
export const getLeads = async (req, res, next) => {
    try {
        const { page = 1, limit = 25, search = "", stage, status, teamId, userId, mobile, showDormant } = req.query;
        const visibilityFilter = await getVisibilityFilter(req.user);
        
        // 🛠️ SENIOR DIAGNOSTIC LOG (Harden for potential undefined user)
        if (req.user) {
            console.log(`[VISIBLE_AUDIT] User: ${req.user.email}, Scope: ${req.user.dataScope}, Teams: ${JSON.stringify(req.user.teams?.map(t => t._id || t))}`);
        } else {
            console.log(`[VISIBLE_AUDIT] Anonymous request - Visibility restricted to public data.`);
        }
        console.log(`[VISIBLE_AUDIT] Generated Filter: ${JSON.stringify(visibilityFilter, null, 2)}`);

        let query = { ...visibilityFilter };

        if (mobile) {
            query.mobile = { $regex: new RegExp(`${mobile}$`) }; 
        }

        if (search) {
            const searchFilter = {
                $or: [
                    { firstName: { $regex: search, $options: "i" } },
                    { lastName: { $regex: search, $options: "i" } },
                    { mobile: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } }
                ]
            };
            
            // Merge security filter with search filter using $and
            if (query.$or) {
                const securityOr = query.$or;
                delete query.$or;
                query.$and = [{ $or: securityOr }, searchFilter];
            } else {
                query.$or = searchFilter.$or;
            }
        }

        if (stage && mongoose.Types.ObjectId.isValid(stage)) query.stage = stage;
        if (stage && mongoose.Types.ObjectId.isValid(stage)) query.stage = stage;
        if (teamId && mongoose.Types.ObjectId.isValid(teamId)) query['assignment.team'] = teamId;
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            query.$or = query.$or || [];
            query.$or.push({ owner: userId }, { 'assignment.assignedTo': userId });
        }

        // Support for 'status' keywords (fresh, hot, incoming, prospect, etc.)
        if (status) {
            let targetStages = [];
            let isHotOrFresh = false;
            if (status === 'fresh') { targetStages = ['New', 'Lead Created', 'Open', 'Prospect']; isHotOrFresh = true; }
            else if (status === 'hot') { targetStages = ['Qualified', 'Opportunity', 'Negotiation', 'Booked', 'Closed Won']; isHotOrFresh = true; }
            else if (status === 'incoming') targetStages = ['New', 'Lead Created', 'Open'];
            else if (status === 'prospect') targetStages = ['Prospect', 'Qualified'];
            else if (status === 'opportunity') targetStages = ['Opportunity'];
            else if (status === 'negotiation') targetStages = ['Negotiation', 'Booked'];
            else if (status === 'won') targetStages = ['Closed Won'];
            else if (status === 'lost') targetStages = ['Closed Lost', 'Stalled'];

            if (targetStages.length > 0) {
                const stages = await Lookup.find({ 
                    lookup_type: 'Stage', 
                    lookup_value: { $in: targetStages.map(s => new RegExp(`^${s}$`, 'i')) } 
                }).select('_id');
                query.stage = { $in: stages.map(s => s._id) };
            } else if (mongoose.Types.ObjectId.isValid(status)) {
                query.status = status;
            }
        }
        
        // --- 💤 DORMANT EXCLUSION (Hide by default) ---
        if (showDormant !== "true") {
            const dormantLookups = await Lookup.find({ 
                lookup_value: { $regex: /^Dormant$/i } 
            }).select('_id');
            const dormantIds = dormantLookups.map(l => l._id);
            
            if (dormantIds.length > 0) {
                const exclusionFilter = { 
                    $and: [
                        { stage: { $nin: dormantIds } },
                        { status: { $nin: dormantIds } }
                    ]
                };
                
                if (query.$and) {
                    query.$and.push(exclusionFilter);
                } else {
                    // Extract existing fields from query and wrap them with exclusionFilter in a new $and
                    const baseQuery = { ...query };
                    query = { $and: [baseQuery, exclusionFilter] };
                }
            }
        }

        // ─── PERFORMANCE FIX: Pre-resolve Lookup IDs for Stats to avoid $lookup in aggregate ───
        const stageBuckets = {
            fresh: ['New', 'Lead Created', 'Open', 'Prospect'],
            hot: ['Qualified', 'Opportunity', 'Negotiation', 'Booked', 'Closed Won'],
            incoming: ['New', 'Lead Created', 'Open'],
            prospect: ['Prospect', 'Qualified'],
            opportunity: ['Opportunity'],
            negotiation: ['Negotiation', 'Booked'],
            won: ['Closed Won'],
            lost: ['Closed Lost', 'Stalled']
        };

        const allTargetStages = [...new Set(Object.values(stageBuckets).flat())];
        const resolvedStages = await Lookup.find({ 
            lookup_type: 'Stage', 
            lookup_value: { $in: allTargetStages.map(s => new RegExp(`^${s}$`, 'i')) } 
        }).select('_id lookup_value').lean();

        const stageToId = new Map();
        resolvedStages.forEach(s => stageToId.set(s.lookup_value.toLowerCase(), s._id));

        const bucketToIds = {};
        Object.entries(stageBuckets).forEach(([bucket, labels]) => {
            bucketToIds[bucket] = labels.map(l => stageToId.get(l.toLowerCase())).filter(Boolean);
        });

        // Calculate Stats (Total, Today, Fresh, Hot, and Pipeline) in a optimized way
        // SENIOR OPTIMIZATION: Only calculate stats on Page 1 to save DB resources on scroll
        let statsObj: any = null;
        if (Number(page) === 1) {
            const stats = await Lead.aggregate([
                { $match: visibilityFilter },
                {
                    $facet: {
                        total: [{ $count: "count" }],
                        today: [
                            { $match: { createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } } },
                            { $count: "count" }
                        ],
                        fresh: [
                            { $match: { stage: { $in: bucketToIds.fresh || [] } } },
                            { $count: "count" }
                        ],
                        hot: [
                            { $match: { stage: { $in: bucketToIds.hot || [] } } },
                            { $count: "count" }
                        ],
                        incoming: [
                            { $match: { stage: { $in: bucketToIds.incoming || [] } } },
                            { $count: "count" }
                        ],
                        prospect: [
                            { $match: { stage: { $in: bucketToIds.prospect || [] } } },
                            { $count: "count" }
                        ],
                        opportunity: [
                            { $match: { stage: { $in: bucketToIds.opportunity || [] } } },
                            { $count: "count" }
                        ],
                        negotiation: [
                            { $match: { stage: { $in: bucketToIds.negotiation || [] } } },
                            { $count: "count" }
                        ],
                        won: [
                            { $match: { stage: { $in: bucketToIds.won || [] } } },
                            { $count: "count" }
                        ],
                        lost: [
                            { $match: { stage: { $in: bucketToIds.lost || [] } } },
                            { $count: "count" }
                        ]
                    }
                }
            ]);

            statsObj = {
                total: stats[0]?.total[0]?.count || 0,
                today: stats[0]?.today[0]?.count || 0,
                fresh: stats[0]?.fresh[0]?.count || 0,
                hot: stats[0]?.hot[0]?.count || 0,
                pipeline: {
                    incoming: stats[0]?.incoming[0]?.count || 0,
                    prospect: stats[0]?.prospect[0]?.count || 0,
                    opportunity: stats[0]?.opportunity[0]?.count || 0,
                    negotiation: stats[0]?.negotiation[0]?.count || 0,
                    won: stats[0]?.won[0]?.count || 0,
                    lost: stats[0]?.lost[0]?.count || 0
                }
            };
        }

        // Enable population for key fields (Use lean population for list view)
        const results = await paginate(Lead, query, Number(page), Number(limit), { updatedAt: -1 }, leadListPopulateFields);
        results.stats = statsObj;

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

            // ─── PERFORMANCE FIX: Pre-fetch all unique lookup IDs in one batch query ──
            // Replaces ~50 per-lead Lookup.findById() calls with a single query
            const uniqueLookupIds = new Set();
            results.records.forEach(lead => {
                const leadObj = lead.toObject ? lead.toObject() : lead;
                const titleId = leadObj.contactDetails?.title?._id || leadObj.contactDetails?.title;
                if (titleId && mongoose.Types.ObjectId.isValid(titleId)) uniqueLookupIds.add(titleId.toString());
                if (leadObj.salutation && mongoose.Types.ObjectId.isValid(leadObj.salutation)) uniqueLookupIds.add(leadObj.salutation.toString());
            });

            // Single batch DB query for all needed lookups
            const batchLookups = uniqueLookupIds.size > 0
                ? await Lookup.find({ _id: { $in: [...uniqueLookupIds] } }).select('lookup_value').lean()
                : [];
            const lookupValueMap = new Map(batchLookups.map(l => [l._id.toString(), l.lookup_value]));

            results.records = results.records.map((lead) => {
                const leadId = lead._id.toString();
                const leadActs = activityGroup.get(leadId) || [];
                const latest = leadActs[0];
                const leadObj = lead.toObject ? lead.toObject() : lead;

                // O(1) lookup from pre-fetched map — no DB call
                if (leadObj.contactDetails && leadObj.contactDetails.title) {
                    const titleId = (leadObj.contactDetails.title._id || leadObj.contactDetails.title)?.toString();
                    if (titleId && lookupValueMap.has(titleId)) {
                        const titleValue = lookupValueMap.get(titleId);
                        leadObj.contactDetails.titleValue = titleValue;
                        if (leadObj.salutation === titleId || !leadObj.salutation) {
                            leadObj.salutation = titleValue;
                        }
                    } else if (typeof leadObj.contactDetails.title === 'string' && !mongoose.Types.ObjectId.isValid(leadObj.contactDetails.title)) {
                        leadObj.contactDetails.titleValue = leadObj.contactDetails.title;
                    }
                }

                // O(1) salutation resolution from pre-fetched map
                if (leadObj.salutation && mongoose.Types.ObjectId.isValid(leadObj.salutation)) {
                    const resolved = lookupValueMap.get(leadObj.salutation.toString());
                    if (resolved) leadObj.salutation = resolved;
                }

                return {
                    ...leadObj,
                    activities: leadActs,
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
            const assignment = await autoAssign(lead.toObject(), 'lead');
            if (assignment) {
                const updatePayload = {};
                if (assignment.assignedTo) {
                    updatePayload.owner = assignment.assignedTo;
                    updatePayload.assignedTo = assignment.assignedTo;
                    updatePayload['assignment.assignedTo'] = assignment.assignedTo;
                }
                if (assignment.teams && assignment.teams.length > 0) {
                    updatePayload.teams = assignment.teams;
                    updatePayload['assignment.team'] = assignment.teams;
                }

                await Lead.findByIdAndUpdate(lead._id, { $set: updatePayload });
                
                assignedAgent = {
                    userId: assignment.assignedTo,
                    teams: assignment.teams,
                    ruleName: assignment.ruleName
                };
                console.log(`[DISTRIBUTION] Lead ${lead._id} auto-assigned via rule "${assignment.ruleName}"`);
                
                // Create Notification for auto-assignment
                await createNotification(
                    assignment.assignedTo,
                    'assignment',
                    'New Lead Assigned',
                    `A new lead ${lead.firstName} ${lead.lastName || ''} has been assigned to you.`,
                    `/leads/${lead._id}`,
                    { leadId: lead._id }
                );
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

        // ━━ Stage & Assignment History: auto-track changes ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const existing = await Lead.findById(req.params.id)
            .select('stage stageHistory stageChangedAt createdAt owner assignment firstName lastName')
            .lean();

        if (existing) {
            const now = new Date();
            const historyUpdate = {};
            let requiresHistoryUpdate = false;

            // 1. Stage History
            if (updateData.stage) {
                // Resolve current stage to a string label
                let currentStageStr = 'New';
                if (existing.stage) {
                    const existingLookup = await Lookup.findById(existing.stage).select('lookup_value').lean();
                    currentStageStr = existingLookup?.lookup_value || 'New';
                }
                const newLookup = await Lookup.findById(updateData.stage).select('lookup_value').lean();
                const newStageStr = newLookup?.lookup_value || String(updateData.stage);

                if (currentStageStr !== newStageStr) {
                    requiresHistoryUpdate = true;
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
                    historyUpdate.$push = historyUpdate.$push || {};
                    historyUpdate.$push.stageHistory = {
                        stage: newStageStr,
                        enteredAt: now,
                        triggeredBy: updateData.triggeredBy || 'manual_override',
                        activityType: updateData.activityType || null,
                        outcome: updateData.outcome || null,
                        reason: updateData.reason || null
                    };
                    updateData.stageChangedAt = now;

                    // Audit Log Transition
                    const AuditLog = mongoose.model('AuditLog');
                    await AuditLog.logEntityUpdate(
                        'stage_changed',
                        'lead',
                        req.params.id,
                        `${existing.firstName || ''} ${existing.lastName || ''}`.trim(),
                        req.user?.id || null,
                        { before: currentStageStr, after: newStageStr },
                        `Lead stage shifted from ${currentStageStr} to ${newStageStr}${updateData.reason ? ' - ' + updateData.reason : ''}`
                    );
                }
            }

            // 2. Assignment History
            const newOwner = updateData.owner || updateData.assignment?.assignedTo || updateData['assignment.assignedTo'];
            const oldOwner = existing.owner || existing.assignment?.assignedTo;
            if (newOwner && String(newOwner) !== String(oldOwner)) {
                requiresHistoryUpdate = true;
                historyUpdate.$push = historyUpdate.$push || {};
                historyUpdate.$push['assignment.history'] = {
                    assignedTo: newOwner,
                    assignedBy: req.user?.id,
                    assignedAt: now,
                    notes: updateData.assignmentNote || updateData.reason || "Lead reassigned"
                };

                // Audit Log Assignment
                const AuditLog = mongoose.model('AuditLog');
                await AuditLog.logEntityUpdate(
                    'assignment_changed',
                    'lead',
                    req.params.id,
                    `${existing.firstName || ''} ${existing.lastName || ''}`.trim(),
                    req.user?.id || null,
                    { before: oldOwner, after: newOwner },
                    `Lead reassigned to a new owner.`
                );
            }

            if (requiresHistoryUpdate) {
                const atomicUpdate = { ...historyUpdate };
                delete atomicUpdate.$push; // Move $push to top level if needed
                await Lead.findByIdAndUpdate(req.params.id, { 
                    $set: atomicUpdate, 
                    $push: historyUpdate.$push 
                });
            }
        }

        // Standard update (stage already resolved to ObjectId by resolveAllReferenceFields)
        const finalLead = await Lead.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate(leadPopulateFields);

        if (finalLead) {
            // Bidirectional Sync: Lead -> Inventory
            if (updateData.documents && Array.isArray(updateData.documents)) {
                await syncDocumentsToInventory(updateData.documents, { 
                    name: `${finalLead.firstName} ${finalLead.lastName || ''}`.trim(), 
                    mobile: finalLead.mobile 
                });
            }
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
        const leadPopulateReduced = [
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
            { path: 'teams', select: 'name' }
        ];

        // Check if ID is a valid MongoDB ObjectId
        let lead;
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            lead = await Lead.findById(id).populate(leadPopulateReduced);
        } else {
            // Fallback: search by mobile number
            lead = await Lead.findOne({ mobile: id }).populate(leadPopulateReduced);
        }

        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        // Manual Enrichment for Mixed fields that might be strings (preventing CastErrors)
        const leadData = lead.toObject();
        
        const mixedFields = [
            { field: 'requirement', type: 'Requirement' },
            { field: 'subRequirement', type: 'SubRequirement' },
            { field: 'budget', type: 'Budget' },
            { field: 'location', type: 'Location' },
            { field: 'source', type: 'Source' },
            { field: 'status', type: 'Status' },
            { field: 'stage', type: 'Stage' },
            { field: 'subSource', type: 'SubSource' },
            { field: 'campaign', type: 'Campaign' }
        ];

        const arrayMixedFields = [
            { field: 'propertyType', type: 'PropertyType' },
            { field: 'subType', type: 'SubType' },
            { field: 'unitType', type: 'UnitType' },
            { field: 'facing', type: 'Facing' },
            { field: 'roadWidth', type: 'RoadWidth' },
            { field: 'direction', type: 'Direction' }
        ];

        for (const { field, type } of mixedFields) {
            const val = leadData[field];
            if (val && typeof val === 'string' && !mongoose.Types.ObjectId.isValid(val)) {
                const lookup = await Lookup.findOne({ lookup_type: type, lookup_value: val }).lean();
                leadData[field] = lookup || { lookup_value: val };
            } else if (val && mongoose.Types.ObjectId.isValid(val)) {
                const lookup = await Lookup.findById(val).lean();
                leadData[field] = lookup || { _id: val };
            }
        }

        for (const { field, type } of arrayMixedFields) {
            if (Array.isArray(leadData[field])) {
                leadData[field] = await Promise.all(leadData[field].map(async (v) => {
                    if (typeof v === 'string' && !mongoose.Types.ObjectId.isValid(v)) {
                        const lookup = await Lookup.findOne({ lookup_type: type, lookup_value: v }).lean();
                        return lookup || { lookup_value: v };
                    } else if (mongoose.Types.ObjectId.isValid(v)) {
                        const lookup = await Lookup.findById(v).lean();
                        return lookup || { _id: v };
                    }
                    return v;
                }));
            }
        }

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
        const errors = [];
        for (let i = 0; i < data.length; i++) {

            const item = data[i];
            try {
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
                leadEntry.requirement = await resolveLookup('Requirement', item.requirement || 'Buy', false);
                leadEntry.source = await resolveLookup('Source', item.source || 'Direct', false);
                leadEntry.status = await resolveLookup('Status', item.status || 'Active', false);
                leadEntry.stage = await resolveLookup('Stage', item.stage || 'New', false);
                leadEntry.location = await resolveLookup('Location', item.location || leadEntry.locArea, false);
                leadEntry.budget = await resolveLookup('Budget', item.budget, false);
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
            } catch (err) {
                console.error(`[IMPORT] Lead Error at row ${i + 1}:`, err);
                errors.push({
                    row: i + 1,
                    name: (item.firstName || item.name) || 'Unknown',
                    reason: err.message
                });
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
            message: `Import processed. New: ${newCount}, Updated: ${updatedCount}. ${errors.length > 0 ? errors.length + ' failed.' : ''}`,
            successCount: newCount + updatedCount,
            newCount: newCount,
            updatedCount: updatedCount,
            errorCount: errors.length,
            errors
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
        const { 
            dealId,
            budgetFlexibility = 20, 
            sizeFlexibility = 20,
            weights: weightsParam 
        } = req.query;

        if (!dealId) {
            return res.status(400).json({ success: false, error: "dealId is required" });
        }

        // Parse weights (default if missing)
        let weights = { location: 30, type: 20, budget: 25, size: 25 };
        if (weightsParam) {
            try {
                weights = typeof weightsParam === 'string' ? JSON.parse(weightsParam) : weightsParam;
            } catch (e) {
                console.error("Error parsing weights:", e);
            }
        }

        const bFlex = parseFloat(budgetFlexibility) / 100;
        const sFlex = parseFloat(sizeFlexibility) / 100;

        const deal = await Deal.findById(dealId)
            .populate('inventoryId')
            .populate('associatedContact')
            .lean();
            
        if (!deal) {
            return res.status(404).json({ success: false, error: "Deal not found" });
        }

        // Manual Robust Population for Deal Lookups to prevent CastError
        const dealLookups = await Lookup.find({ 
            lookup_type: { $in: ['Category', 'Intent', 'SubCategory'] } 
        }).lean();
        const dealLookupMap = new Map(dealLookups.map(l => [String(l._id), l]));
        const dealLookupValueMap = new Map(dealLookups.map(l => [String(l.lookup_value).toLowerCase(), l]));

        const enrichItemWithLookup = (item, field) => {
            if (!item) return;
            const val = item[field];
            if (!val) return;
            if (mongoose.Types.ObjectId.isValid(val)) {
                item[field] = dealLookupMap.get(String(val)) || val;
            } else if (typeof val === 'string') {
                item[field] = dealLookupValueMap.get(val.toLowerCase()) || { lookup_value: val };
            }
        };

        enrichItemWithLookup(deal, 'category');
        enrichItemWithLookup(deal, 'intent');
        enrichItemWithLookup(deal, 'subCategory');

        const dealIntent = String(deal.intent?.lookup_value || deal.intent || "").toLowerCase();
        const dealCategory = String(deal.category?.lookup_value || deal.category || "").toLowerCase();

        // 1. Fetch potential leads
        const excludedStatusNames = ["Lost", "Closed", "Rejected", "Dormant"];
        const excludedStatusIds = await Promise.all(
            excludedStatusNames.map(name => resolveLookup('Status', name, false))
        );
        const validExclusions = excludedStatusIds.filter(Boolean);

        const leads = await Lead.find({ status: { $nin: validExclusions } })
            .populate('requirement', 'lookup_value')
            .populate('propertyType', 'lookup_value')
            .populate('subType', 'lookup_value')
            .populate('facing', 'lookup_value')
            .populate('direction', 'lookup_value')
            .populate('roadWidth', 'lookup_value')
            .populate('location', 'lookup_value')
            .lean();

        // 3. ENHANCEMENT: Fetch Dispatch Proof (Recent Activities for THIS deal)
        const invId = String(deal.inventoryId?._id || deal.inventoryId || "");
        const dispatchActivities = await Activity.find({
            type: 'Marketing',
            status: 'Completed',
            'details.inventoryId': invId
        }).sort({ performedAt: -1 }).lean();

        const dispatchMap = new Map();
        dispatchActivities.forEach(act => {
            const leadIdStr = String(act.entityId || "");
            if (leadIdStr && !dispatchMap.has(leadIdStr)) {
                dispatchMap.set(leadIdStr, {
                    date: act.performedAt,
                    channels: act.details?.results?.filter(r => r.status === 'success').map(r => r.channel) || []
                });
            }
        });

        // 2. Filter and Score
        const matchingLeads = leads.filter(lead => {
            // ALWAYS include associated contact if it exists
            if (deal.associatedContact && String(lead._id) === String(deal.associatedContact._id)) return true;

            const leadReq = String(lead.requirement?.lookup_value || lead.requirement || "").toLowerCase();
            const leadCats = (Array.isArray(lead.propertyType) ? lead.propertyType : [])
                .map(c => String(c?.lookup_value || c || "").toLowerCase())
                .filter(Boolean);

            let intentMatched = false;
            // Liberal matching if data is missing or strictly correlated
            if (!dealIntent || !leadReq) intentMatched = true; 
            else if (dealIntent.includes("sell") && (leadReq.includes("buy") || leadReq.includes("purchase"))) intentMatched = true;
            else if (dealIntent.includes("rent") && (leadReq.includes("rent") || leadReq.includes("lease"))) intentMatched = true;
            else if (dealIntent.includes("lease") && (leadReq.includes("lease") || leadReq.includes("rent"))) intentMatched = true;
            else if ((dealIntent.includes("buy") || dealIntent.includes("purchase")) && leadReq.includes("sell")) intentMatched = true;
            else if (dealIntent === leadReq) intentMatched = true; 

            if (!intentMatched) return false;

            let catMatched = false;
            if (!dealCategory || (leadCats.length === 0)) catMatched = true;
            else if (dealCategory.includes("res") && leadCats.some(c => c && c.includes("res"))) catMatched = true;
            else if (dealCategory.includes("comm") && leadCats.some(c => c && c.includes("comm"))) catMatched = true;
            else if (dealCategory.includes("ind") && leadCats.some(c => c && c.includes("ind"))) catMatched = true;
            else catMatched = leadCats.some(c => c && (c.includes(dealCategory) || dealCategory.includes(c)));

            return catMatched;
        }).map(lead => {
            let score = 0;
            const matchDetails = [];

            // Base Score for Associated Contact
            if (deal.associatedContact && String(lead._id) === String(deal.associatedContact._id)) {
                score = 100;
                matchDetails.push("Currently Associated Person");
            }

            const dealSub = (deal.subCategory?.lookup_value || "").toLowerCase();
            const leadSubs = (lead.subType || []).filter(Boolean).map(s => String(s.lookup_value || s || "").toLowerCase());
            if (dealSub && leadSubs.some(s => s && s.includes(dealSub))) {
                score += (weights.type || 20);
                matchDetails.push("Unit Type Correlation");
            }

            const dealPrice = deal.price || deal.quotePrice || 0;
            if (dealPrice > 0) {
                const min = lead.budgetMin || 0;
                const max = lead.budgetMax || Infinity;
                if (dealPrice >= min && dealPrice <= max) {
                    score += (weights.budget || 25);
                    matchDetails.push("Budget Alignment");
                } else if (dealPrice >= min * (1 - bFlex) && dealPrice <= max * (1 + bFlex)) {
                    score += (weights.budget || 25) * 0.6;
                    matchDetails.push("Approximate Budget Match");
                }
            }

            const dealLoc = String(deal.location?.lookup_value || deal.location?._id || deal.location || deal.projectName || "").toLowerCase();
            const leadLocArea = String(lead.locArea || "").toLowerCase();
            const leadSelectedLoc = String(lead.location?.lookup_value || lead.location?._id || lead.location || "").toLowerCase();
            const leadProjects = Array.isArray(lead.projectName) ? lead.projectName : [];
            let locScore = 0;
            const locWeight = (weights.location || 30);
            if (deal.projectName && typeof deal.projectName === 'string' && leadProjects.some(p => p && typeof p === 'string' && deal.projectName.toLowerCase().includes(p.toLowerCase()))) {
                locScore = locWeight;
                matchDetails.push("Target Project Match");
            } else if ((leadLocArea && dealLoc.includes(leadLocArea)) || (leadSelectedLoc && dealLoc.includes(leadSelectedLoc))) {
                locScore = locWeight;
                matchDetails.push("Location Correlation");
            } else {
                let addressPoints = 0;
                const dealSector = (deal.inventoryId?.sector || "").toLowerCase();
                if (lead.sector && dealSector.includes(String(lead.sector).toLowerCase())) addressPoints += locWeight * 0.7;
                const dealCity = (deal.inventoryId?.city || "").toLowerCase();
                if (lead.locCity && dealCity.includes(String(lead.locCity).toLowerCase())) addressPoints += locWeight * 0.3;
                locScore = Math.min(addressPoints, locWeight);
            }
            score += locScore;

            if (deal.inventoryId) {
                const inv = deal.inventoryId;
                const lFacing = (lead.facing || []).filter(Boolean).map(f => String(f._id || f));
                const lDir = (lead.direction || []).filter(Boolean).map(d => String(d._id || d));
                if (lFacing.includes(String(inv.facing))) score += 5;
                if (lDir.includes(String(inv.direction))) score += 5;
            }

            const lastDispatch = dispatchMap.get(String(lead._id)) || null;

            return {
                ...lead,
                name: `${lead.firstName} ${lead.lastName || ""}`.trim(),
                score: Math.min(score, 100),
                matchDetails,
                lastDispatch
            };
        });

        const sorted = matchingLeads.sort((a,b) => b.score - a.score).slice(0, 50);
        return res.status(200).json({ success: true, count: sorted.length, data: sorted });
    } catch (error) {
        console.error("[matchLeads Error]:", error);
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
