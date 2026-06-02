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
import Project from "../models/Project.js"; 
import Inventory from "../models/Inventory.js";
import AiAgent from '../models/AiAgent.js';
import UnifiedAIService from '../services/UnifiedAIService.js';

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
    
    // 🚀 SENIOR SAFETY: Extract ID if it's an object
    let idStr = identifier;
    if (typeof identifier === 'object') {
        idStr = identifier._id || identifier.id || identifier.email || identifier.toString();
    }

    if (mongoose.Types.ObjectId.isValid(idStr)) return new mongoose.Types.ObjectId(idStr.toString());

    const escapedIdentifier = escapeRegExp(String(idStr));
    const user = await User.findOne({
        $or: [
            { fullName: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } },
            { email: String(idStr).toLowerCase() },
            { name: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } }
        ]
    });
    return user ? user._id : null;
};

// Resolve All Reference Fields for Lead
const resolveAllReferenceFields = async (doc) => {
    // If field is an empty string, set it to null so Mongoose doesn't try to cast it as ObjectId
    const fieldsToResolve = ['salutation', 'requirement', 'subRequirement', 'budget', 'location', 'source', 'status', 'stage', 'countryCode', 'campaign', 'subSource', 'locPincode'];
    for (const field of fieldsToResolve) {
        if (doc[field] === "") doc[field] = null;
        // If it's an object from frontend state that didn't get flattened, try to extract ID or string
        if (doc[field] && typeof doc[field] === 'object' && !mongoose.Types.ObjectId.isValid(doc[field])) {
            doc[field] = doc[field]._id || doc[field].id || doc[field].lookup_value || doc[field].value || null;
        }
    }

    // ─── PERFORMANCE FIX: Parallel resolution of all scalar lookups ──────────────
    const scalarFieldMap = [
        ['salutation', 'Title'],
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
        ['locPincode', 'Pincode'],
    ];
    const scalarResults = await Promise.all(
        scalarFieldMap.map(([field, type]) => doc[field] ? resolveLookup(type, doc[field], true) : Promise.resolve(null))
    );
    scalarFieldMap.forEach(([field], i) => { if (scalarResults[i] !== null) doc[field] = scalarResults[i]; });

    // Handle Arrays (Lookup fields)
    const arrayLookups = {
        propertyType: 'Category',
        subType: 'SubCategory',
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
    let teamsToResolve = Array.isArray(doc.teams) ? doc.teams : (doc.team ? [doc.team] : []);
    
    // Also check nested assignment.team if scalar teams are missing
    if (teamsToResolve.length === 0 && doc.assignment?.team) {
        teamsToResolve = Array.isArray(doc.assignment.team) ? doc.assignment.team : [doc.assignment.team];
    }

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
    { path: 'project', select: 'name' },
    { path: 'owner', select: 'fullName email name' },
    { path: 'propertyType', select: 'lookup_value' },
    { path: 'subType', select: 'lookup_value' },
    { path: 'unitType', select: 'lookup_value' },
    { path: 'facing', select: 'lookup_value' },
    { path: 'roadWidth', select: 'lookup_value' },
    { path: 'direction', select: 'lookup_value' },
    { path: 'location', select: 'lookup_value' },
    { path: 'status', select: 'lookup_value' },
    { path: 'stage', select: 'lookup_value' },
    {
        path: 'contactDetails',
        populate: [
            { path: 'title', select: 'lookup_value' },
            { path: 'source', select: 'lookup_value' },
            { path: 'personalAddress.location', select: 'lookup_value' },
            { path: 'personalAddress.pincode', select: 'lookup_value' },
            { path: 'correspondenceAddress.city', select: 'lookup_value' },
            { path: 'correspondenceAddress.state', select: 'lookup_value' },
            { path: 'correspondenceAddress.country', select: 'lookup_value' },
            { path: 'correspondenceAddress.location', select: 'lookup_value' },
            { path: 'correspondenceAddress.pincode', select: 'lookup_value' },
            { path: 'correspondenceAddress.tehsil', select: 'lookup_value' },
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
    { path: 'project', select: 'name' },
    { path: 'owner', select: 'fullName email name' },
    { path: 'assignment.assignedTo', select: 'fullName name email' },
    { path: 'assignment.team', select: 'name' },
    { path: 'teams', select: 'name' },
    { path: 'contactDetails' }
];

/**
 * @desc    Get all leads with pagination and search
 * @route   GET /leads
 * @access  Private
 */
export const getLeads = async (req, res, next) => {
    try {
        const { 
            page = 1, limit = 100, search = "", stage, status, teamId, userId, mobile, showDormant,
            source, project, location, budgetMin, budgetMax, areaMin, areaMax,
            propertyType, subType, unitType, facing, direction, roadWidth, requirement
        } = req.query;

        // 🏗️ ENTERPRISE HARDENING: Limit cap to prevent memory exhaustion on large fetches
        const safeLimit = Math.min(Number(limit) || 100, 500);

        const visibilityFilter = await getVisibilityFilter(req.user);
        
        // 🛠️ SENIOR DIAGNOSTIC: Log exact request params for Mobile Debugging
        const auditData = {
            user: req.user?.email,
            role: req.user?.role?.name || req.user?.role,
            scope: req.user?.dataScope,
            params: req.query,
            timestamp: new Date().toISOString()
        };
        console.log(`[LEAD_AUDIT] Request reaching controller: ${JSON.stringify(auditData)}`);

        let query = { ...visibilityFilter };

        // 🛡️ [SENIOR HARDENING] Sanitize filters to prevent empty string matches
        if (stage && stage !== "" && stage !== "undefined") {
            if (Array.isArray(stage)) query.stage = { $in: stage };
            else if (mongoose.Types.ObjectId.isValid(stage)) query.stage = stage;
        }

        if (status && status !== "" && status !== "undefined" && mongoose.Types.ObjectId.isValid(status)) {
            query.status = status;
        }

        if (source && source !== "") {
            query.source = source;
        }

        // 🛡️ [SENIOR FIX] Validate 'mobile' param — only apply regex if it's a numeric string
        // This prevents 'mobile=true' (common in some UI flags) from returning 0 results
        if (mobile && typeof mobile === 'string' && /^\d+$/.test(mobile)) {
            query.mobile = { $regex: new RegExp(`${mobile}$`) }; 
        }

        if (search) {
            const searchFilter = {
                $or: [
                    { firstName: { $regex: search, $options: "i" } },
                    { lastName: { $regex: search, $options: "i" } },
                    { mobile: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } },
                    { projectName: { $regex: search, $options: "i" } },
                    { locArea: { $regex: search, $options: "i" } }
                ]
            };
            
            // 🛡️ [SENIOR FIX] Safe Merge: Use $and to wrap visibility and search
            // This prevents the search $or from accidentally overriding top-level visibility logic
            if (Object.keys(query).length > 0) {
                const baseQuery = { ...query };
                query = { $and: [baseQuery, searchFilter] };
            } else {
                query = searchFilter;
            }
        }

        // --- 🏗️ ADVANCED ENTERPRISE FILTERS (Web CRM Parity) ---
        if (stage) {
            if (Array.isArray(stage)) query.stage = { $in: stage };
            else if (mongoose.Types.ObjectId.isValid(stage)) query.stage = stage;
        }

        if (teamId && mongoose.Types.ObjectId.isValid(teamId)) query['assignment.team'] = teamId;
        
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            query.$or = query.$or || [];
            query.$or.push({ owner: userId }, { 'assignment.assignedTo': userId });
        }

        if (source) {
            if (Array.isArray(source)) query.source = { $in: source };
            else if (mongoose.Types.ObjectId.isValid(source)) query.source = source;
        }

        if (requirement) query.requirement = requirement;
        if (project) {
            if (mongoose.Types.ObjectId.isValid(project)) query.project = project;
            else query.projectName = { $regex: project, $options: "i" };
        }
        if (location) query.locArea = { $regex: location, $options: "i" };

        // Budget & Area Ranges
        if (budgetMin || budgetMax) {
            query.budgetMax = {};
            if (budgetMin) query.budgetMax.$gte = Number(budgetMin);
            if (budgetMax) query.budgetMax.$lte = Number(budgetMax);
        }
        if (areaMin || areaMax) {
            query.areaMax = {};
            if (areaMin) query.areaMax.$gte = Number(areaMin);
            if (areaMax) query.areaMax.$lte = Number(areaMax);
        }

        // Multi-select Arrays
        const arrayFields = { propertyType, subType, unitType, facing, direction, roadWidth };
        Object.entries(arrayFields).forEach(([field, val]) => {
            if (val) {
                if (Array.isArray(val)) query[field] = { $in: val };
                else query[field] = val;
            }
        });

        // Support for 'status' keywords (fresh, hot, incoming, prospect, etc.)
        if (status) {
            let targetStages = [];
            let isHotOrFresh = false;
            if (status === 'fresh') { targetStages = ['Incoming', 'Open', 'Prospect']; isHotOrFresh = true; }
            else if (status === 'hot') { targetStages = ['Qualified', 'Opportunity', 'Negotiation', 'Booked', 'Closed Won']; isHotOrFresh = true; }
            else if (status === 'incoming') targetStages = ['Incoming', 'Open'];
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
        
        // --- 💤 DORMANT EXCLUSION (Hide by default unless showDormant is true OR searching) ---
        if (showDormant !== "true" && !req.query.stage && !search) {
            const dormantLookups = await Lookup.find({ 
                lookup_value: { $regex: /^Dormant$/i } 
            }).select('_id').lean();
            const dormantIds = dormantLookups.map(l => l._id);
            
            if (dormantIds.length > 0) {
                const exclusionFilter = { 
                    stage: { $nin: dormantIds }
                };
                
                if (query.$and) {
                    query.$and.push(exclusionFilter);
                } else if (Object.keys(query).length > 0) {
                    const baseQuery = { ...query };
                    query = { $and: [baseQuery, exclusionFilter] };
                } else {
                    query = exclusionFilter;
                }
            }
        }

        // ─── PERFORMANCE FIX: Pre-resolve Lookup IDs for Stats to avoid $lookup in aggregate ───
        const stageBuckets = {
            fresh: ['Incoming', 'Prospect'],
            hot: ['Opportunity', 'Negotiation', 'Closed Won'],
            incoming: ['Incoming'],
            prospect: ['Prospect'],
            opportunity: ['Opportunity'],
            negotiation: ['Negotiation'],
            won: ['Closed Won', 'Won'],
            lost: ['Closed Lost', 'Lost']
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

        // 📊 [SENIOR RESILIENCE] Wrap stats in try-catch
        // Ensure stats failures don't block the lead list from loading
        let statsObj = null;
        if (Number(page) === 1) {
            try {
                const stats = await Lead.aggregate([
                    { $match: query },
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
        } catch (err) {
                console.error('[LeadStats] Failed to compute stats:', err.message);
            }
        }

        // --- 📊 DYNAMIC SORTING (Senior Professional Optimization) ---
        const sortBy = req.query.sortBy || 'updatedAt';
        const sortOrder = parseInt(req.query.sortOrder) || -1;
        
        let sortOption = { [sortBy]: sortOrder };

        // 🏗️ [SENIOR FIX] Intelligent Stage Sorting
        // If sorting by 'stage', we want to sort by the logical sequence, not the ObjectId
        if (sortBy === 'stage') {
            console.log("[LeadSort] Applying Intelligent Stage Sequence sort...");
            // We use the 'stage_sequence' logic: Incoming(1) -> Prospect(2) -> Qualified(3) -> Opportunity(4) -> Negotiation(5) -> Booked(6) -> Closed Won(7)
            // Since we can't easily sort by lookup value sequence in a simple .find(), 
            // we'll keep the standard sort but ensure the UI knows this is a best-effort sort by ID 
            // OR we could use an aggregate, but for now we'll stick to indexed fields.
            // NOTE: Future improvement should add a 'sequence' field to the Lead model updated on stage change.
        }

        // Collated sorting for alphabetical fields
        const collation = ['firstName', 'lastName', 'projectName'].includes(sortBy)
            ? { locale: 'en', strength: 2 }
            : null;

        // Enable population for key fields (Use lean population for list view)
        const results = await paginate(Lead, query, Number(page), safeLimit, sortOption, leadListPopulateFields, collation);
        results.stats = statsObj;

        if (req.query.sortBy) {
            console.log(`[LeadSort] Applied sort: ${sortBy} (${sortOrder}) - Records: ${results.records?.length}`);
        }

        // Attach Interaction Data (Activity Counts & Recent Activities)
        if (results.records && results.records.length > 0) {
            const leadIds = results.records.map(r => r._id);
            const leadIdsStr = leadIds.map(id => id.toString());

            // 🚀 SENIOR OPTIMIZATION: Use targeted aggregations for interaction data instead of bulk fetching
            // This prevents "Error loading leads" when limit is set to 50, 100, or higher.
            const [activityStats, smsStats] = await Promise.all([
                Activity.aggregate([
                    { $match: { entityId: { $in: leadIdsStr }, status: 'Completed' } },
                    { $sort: { createdAt: -1 } },
                    { $group: {
                        _id: "$entityId",
                        latestActivity: { $first: "$$ROOT" },
                        call: { $sum: { $cond: [{ $regexMatch: { input: "$type", regex: /call/i } }, 1, 0] } },
                        meeting: { $sum: { $cond: [{ $regexMatch: { input: "$type", regex: /meeting/i } }, 1, 0] } },
                        siteVisit: { $sum: { $cond: [{ $regexMatch: { input: "$type", regex: /site visit/i } }, 1, 0] } },
                        email: { $sum: { $cond: [{ $regexMatch: { input: "$type", regex: /email/i } }, 1, 0] } },
                        whatsapp: { $sum: { $cond: [{ $regexMatch: { input: "$type", regex: /whatsapp|messaging/i } }, 1, 0] } }
                    }}
                ]),
                SmsLog.aggregate([
                    { $match: { entityId: { $in: leadIdsStr }, status: { $in: ['Sent', 'Delivered'] } } },
                    { $group: {
                        _id: "$entityId",
                        count: { $sum: 1 }
                    }}
                ])
            ]);

            const activityMap = new Map(activityStats.map(s => [s._id.toString(), s]));
            const smsMap = new Map(smsStats.map(s => [s._id.toString(), s.count]));

            // O(1) lookup collection
            const uniqueLookupIds = new Set();
            const mixedFields = [
                'requirement', 'subRequirement', 'budget', 'location', 'source', 
                'status', 'stage', 'subSource', 'campaign', 'salutation', 
                'unitType', 'propertyType', 'subType' // Added for scalar support
            ];
            const arrayMixedFields = [
                'propertyType', 'subType', 'unitType', 'facing', 'roadWidth', 
                'direction', 'category', 'propertySubType' // Expanded list
            ];

            results.records.forEach(lead => {
                const leadObj = lead.toObject ? lead.toObject() : lead;
                
                mixedFields.forEach(f => {
                    const val = leadObj[f];
                    if (!val) return;
                    if (mongoose.Types.ObjectId.isValid(val)) {
                        uniqueLookupIds.add(val.toString());
                    } else if (typeof val === 'object' && val.lookup_value && mongoose.Types.ObjectId.isValid(val.lookup_value)) {
                        // 🚀 SENIOR FIX: If already an object but lookup_value is an ID, re-hydrate
                        uniqueLookupIds.add(val.lookup_value.toString());
                    } else if (typeof val === 'object' && val._id && mongoose.Types.ObjectId.isValid(val._id)) {
                        uniqueLookupIds.add(val._id.toString());
                    }
                });

                arrayMixedFields.forEach(f => {
                    if (Array.isArray(leadObj[f])) {
                        leadObj[f].forEach(v => {
                            if (!v) return;
                            if (mongoose.Types.ObjectId.isValid(v)) {
                                uniqueLookupIds.add(v.toString());
                            } else if (typeof v === 'object' && v.lookup_value && mongoose.Types.ObjectId.isValid(v.lookup_value)) {
                                uniqueLookupIds.add(v.lookup_value.toString());
                            } else if (typeof v === 'object' && v._id && mongoose.Types.ObjectId.isValid(v._id)) {
                                uniqueLookupIds.add(v._id.toString());
                            }
                        });
                    }
                });

                const titleId = leadObj.contactDetails?.title?._id || leadObj.contactDetails?.title;
                if (titleId && mongoose.Types.ObjectId.isValid(titleId)) uniqueLookupIds.add(titleId.toString());
            });

            // Single batch DB query for all needed lookups
            const [batchLookups, systemConfig] = await Promise.all([
                uniqueLookupIds.size > 0
                    ? Lookup.find({ _id: { $in: [...uniqueLookupIds] } }).select('lookup_value lookup_type').lean()
                    : Promise.resolve([]),
                mongoose.models.SystemSetting 
                    ? mongoose.model('SystemSetting').findOne({ key: 'propertyConfig' }).select('value').lean()
                    : Promise.resolve(null)
            ]);

            // Create a map for standard lookups
            const lookupValueMap = new Map(batchLookups.map(l => [l._id.toString(), l.lookup_value]));
            
            console.log(`[HYDRATION_DEBUG] Fetched ${batchLookups.length} lookups. Unique IDs requested: ${uniqueLookupIds.size}`);
            if (uniqueLookupIds.size > 0 && batchLookups.length === 0) {
                console.warn(`[HYDRATION_DEBUG] CRITICAL: Requested ${uniqueLookupIds.size} IDs but found 0 in Lookups table!`);
            }
            // 🚀 SENIOR RESOLVER: Fallback for missing IDs
            const resolveFromAnywhere = (id) => {
                const idStr = id.toString();
                // 1. Try standard map
                if (lookupValueMap.has(idStr)) return lookupValueMap.get(idStr);
                
                // 2. Try propertyConfig crawl
                if (systemConfig?.value) {
                    let foundName = null;
                    const crawl = (obj) => {
                        if (foundName || !obj || typeof obj !== 'object') return;
                        if ((obj.id === idStr || obj._id === idStr) && (obj.name || obj.label)) {
                            foundName = obj.name || obj.label;
                            return;
                        }
                        Object.values(obj).forEach(v => typeof v === 'object' && crawl(v));
                    };
                    crawl(systemConfig.value);
                    if (foundName) return foundName;
                }
                return null;
            };

            results.records = results.records.map((lead) => {
                const leadId = lead._id.toString();
                const actStat = activityMap.get(leadId);
                const latest = actStat?.latestActivity; 
                const leadObj = lead.toObject ? lead.toObject() : lead;

                // 🏗️ Universal Hydration (Batch Optimized)
                mixedFields.forEach(f => {
                    let val = leadObj[f];
                    if (!val) return;

                    let idToResolve = null;
                    if (mongoose.Types.ObjectId.isValid(val)) {
                        idToResolve = val.toString();
                    } else if (typeof val === 'object') {
                        // If already an object, check if we need to fix the label
                        const label = val.lookup_value || val.name || val.label;
                        if (label && mongoose.Types.ObjectId.isValid(label)) {
                            idToResolve = label.toString();
                        } else if (!label && val._id) {
                            idToResolve = val._id.toString();
                        }
                    }

                    if (idToResolve) {
                        const resolved = resolveFromAnywhere(idToResolve);
                        if (resolved) {
                            leadObj[f] = { _id: idToResolve, lookup_value: resolved };
                        } else if (typeof val === 'string') {
                            // If resolution fails but it was a string, hide the ID from being the label
                            // Actually, better to keep it as ID but mark it for frontend cleanup
                            leadObj[f] = { _id: val, lookup_value: null }; 
                        }
                    } else if (typeof val === 'string' && !mongoose.Types.ObjectId.isValid(val)) {
                        leadObj[f] = { lookup_value: val };
                    }
                });

                arrayMixedFields.forEach(f => {
                    if (Array.isArray(leadObj[f])) {
                        const uniqueMap = new Map();
                        leadObj[f].forEach(v => {
                            if (!v) return;
                            let id = null;
                            let label = null;

                            if (mongoose.Types.ObjectId.isValid(v)) {
                                id = v.toString();
                                label = resolveFromAnywhere(v);
                            } else if (typeof v === 'object') {
                                id = v._id?.toString() || (mongoose.Types.ObjectId.isValid(v.id) ? v.id : null);
                                label = v.lookup_value || v.name || v.label;
                                
                                // Fix if label is an ID
                                if (label && mongoose.Types.ObjectId.isValid(label)) {
                                    label = resolveFromAnywhere(label);
                                } else if (!label && id) {
                                    label = resolveFromAnywhere(id);
                                }
                            } else if (typeof v === 'string') {
                                label = v;
                            }

                            // Only add if we have a non-ID label or if we want to preserve the entry
                            if (label && !mongoose.Types.ObjectId.isValid(label)) {
                                const cleanLabel = label.trim();
                                const key = cleanLabel.toLowerCase();
                                if (!uniqueMap.has(key)) {
                                    uniqueMap.set(key, id ? { _id: id, lookup_value: cleanLabel } : { lookup_value: cleanLabel });
                                }
                            } else if (id) {
                                // If we have an ID but no label, still add it but with null label to avoid UI pollution
                                uniqueMap.set(`id-${id}`, { _id: id, lookup_value: null });
                            }
                        });
                        leadObj[f] = Array.from(uniqueMap.values());
                    }
                });

                // ... (rest of contactDetails hydration)
                if (leadObj.contactDetails && leadObj.contactDetails.title) {
                    const titleId = (leadObj.contactDetails.title._id || leadObj.contactDetails.title)?.toString();
                    if (titleId && lookupValueMap.has(titleId)) {
                        const titleValue = lookupValueMap.get(titleId);
                        leadObj.contactDetails.titleValue = titleValue;
                        if (leadObj.salutation?._id === titleId || leadObj.salutation === titleId || !leadObj.salutation) {
                            leadObj.salutation = titleValue;
                            leadObj.title = titleValue; // Web Alias
                            leadObj.salutationData = { _id: titleId, lookup_value: titleValue };
                        }
                    } else if (typeof leadObj.contactDetails.title === 'string' && !mongoose.Types.ObjectId.isValid(leadObj.contactDetails.title)) {
                        leadObj.contactDetails.titleValue = leadObj.contactDetails.title;
                    }
                }

                if (leadObj.salutation && mongoose.Types.ObjectId.isValid(leadObj.salutation)) {
                    const resolved = lookupValueMap.get(leadObj.salutation.toString());
                    if (resolved) {
                        // 📱 MOBILE & WEB COMPATIBILITY: Standardize as string
                        leadObj.salutation = resolved;
                        leadObj.title = resolved; // Alias for Web frontend
                        leadObj.salutationData = { _id: leadObj.salutation, lookup_value: resolved };
                    }
                }

                return {
                    ...leadObj,
                    interactionCounts: {
                        call: actStat?.call || 0,
                        meeting: actStat?.meeting || 0,
                        siteVisit: actStat?.siteVisit || 0,
                        email: actStat?.email || 0,
                        whatsapp: actStat?.whatsapp || 0,
                        sms: smsMap.get(leadId) || 0
                    },
                    activity: latest ? latest.subject : "None",
                    lastAct: latest ? new Date(latest.createdAt).toLocaleDateString() : "Today"
                };
            });
        }

        console.log(`[LEAD_AUDIT] Results fetched. Total: ${results.totalCount}, Records: ${results.records?.length}`);
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

        // 1. Resolve references first so that manual 'team' selection (singular) is moved into 'teams' array
        await resolveAllReferenceFields(data);
        
        // 🛡️ [SENIOR ROBUSTNESS] Default stage to 'Incoming' and status to 'New' if missing
        if (!data.stage) data.stage = await resolveLookup('Stage', 'Incoming');
        if (!data.status) data.status = await resolveLookup('Status', 'New');
        
        console.log("[DEBUG] Data after resolution:", JSON.stringify(data, null, 2));

        // 2. 🔒 Enterprise Isolation: Auto-tag with creator's department and teams ONLY IF MISSING
        // We do this AFTER resolution so that manual selections are respected.
        if (req.user) {
            if (req.user.department && !data.department) data.department = req.user.department;
            
            // Critical Fix: Only auto-assign creator's teams if the resolved data.teams is still empty
            if (req.user.teams && req.user.teams.length > 0 && (!data.teams || data.teams.length === 0)) {
                data.teams = req.user.teams.map(t => t._id || t);
            }
        }

        const lead = await Lead.create(data);
        console.log("[DEBUG] Lead created successfully:", lead._id);

        // Auto-run Enrichment (wrapped in try-catch to prevent crash if ReferenceError/Enrichment fails)
        try {
            await runFullLeadEnrichment(lead._id);
        } catch (enrichError) {
            console.error("[ENRICHMENT ERROR] Failed in addLead:", enrichError.message);
        }

        // ─── Proactive Duplicate Check & Conflict Notification ───────────────────────
        if (lead.mobile) {
            const existingLead = await Lead.findOne({ 
                _id: { $ne: lead._id }, 
                mobile: lead.mobile 
            }).populate('owner').lean();
            
            if (existingLead && existingLead.owner) {
                await createNotification(
                    existingLead.owner._id,
                    'conflictAlerts',
                    '⚠️ Duplicate Lead Attempt',
                    `Someone just tried to register your client ${lead.firstName} (${lead.mobile}). Lead was merged/blocked.`,
                    `/leads/${existingLead._id}`,
                    { duplicateLeadId: lead._id }
                ).catch(() => {});
            }
        }

        // ─── Auto-Assign via Enterprise Distribution Engine ────────────────────────
        let assignedAgent = null;
        try {
            const { distributeEntity } = await import("../src/utils/distributionEngine.js");
            const assignment = await distributeEntity(lead, 'onCreate');
            
            if (assignment && assignment.assignedTo) {
                assignedAgent = {
                    userId: assignment.assignedTo,
                    ruleName: assignment.ruleName
                };
                console.log(`[DISTRIBUTION] Lead ${lead._id} auto-assigned via rule "${assignment.ruleName}"`);
                
                // Create Notification for auto-assignment
                await createNotification(
                    assignment.assignedTo,
                    'assignments',
                    'New Lead Assigned',
                    `A new lead ${lead.firstName} ${lead.lastName || ''} has been assigned to you.`,
                    `/leads/${lead._id}`,
                    { leadId: lead._id }
                );
            }
        } catch (distErr) {
            console.warn('[DISTRIBUTION] distributeEntity failed (non-critical):', distErr.message);
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

/**
 * Toggles the pinned status of a match for a specific lead.
 * Pinned matches are persistent bookmarks that stay in the lead profile.
 */
export const togglePinMatch = async (req, res) => {
    try {
        const { id, inventoryId } = req.params;
        const lead = await Lead.findById(id);

        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        if (!lead.pinnedMatches) lead.pinnedMatches = [];

        const index = lead.pinnedMatches.indexOf(inventoryId);
        if (index > -1) {
            // Remove (Unpin)
            lead.pinnedMatches.splice(index, 1);
        } else {
            // Add (Pin)
            lead.pinnedMatches.push(inventoryId);
        }

        await lead.save();

        res.json({
            success: true,
            message: index > -1 ? "Match unpinned" : "Match pinned successfully",
            data: lead.pinnedMatches
        });
    } catch (error) {
        console.error("[TOGGLE_PIN_MATCH_ERROR]", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateLead = async (req, res, next) => {
    try {
        const updateData = { ...req.body };
        await resolveAllReferenceFields(updateData);

        // 🛡️ SENIOR FIX: Prevent frontend from overwriting audit trails & computed fields 
        // This causes "Cast to embedded failed" if frontend passes back hydrated _id strings
        delete updateData.stageHistory;
        delete updateData.interactionCounts;
        delete updateData.activities;
        delete updateData.activity;
        delete updateData.lastAct;

        // ━━ Security: Enforce visibility for updates ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const visibilityFilter = await getVisibilityFilter(req.user);
        const existing = await Lead.findOne({ _id: req.params.id, ...visibilityFilter })
            .select('stage stageHistory stageChangedAt createdAt owner assignment firstName lastName')
            .lean();

        if (existing) {
            const now = new Date();
            const historyUpdate = { $push: {} };
            let requiresHistoryUpdate = false;

            // 1. Stage History
            if (updateData.stage) {
                // Resolve current stage to a string label
                let currentStageStr = 'Incoming';
                if (existing.stage) {
                    const existingLookup = await Lookup.findById(existing.stage).select('lookup_value').lean();
                    currentStageStr = existingLookup?.lookup_value || 'Incoming';
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
                // [ENTERPRISE] Sync Lead Department with new Owner
                const User = mongoose.model('User');
                const ownerUser = await User.findById(newOwner).select('department').lean();
                if (ownerUser?.department) {
                    updateData.department = ownerUser.department;
                }

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

                // [NOTIFICATION] Notify new owner of reassignment
                if (String(newOwner) !== String(req.user?.id)) { // Don't notify self
                    await createNotification(
                        newOwner,
                        'assignments',
                        '🔄 Lead Reassigned to You',
                        `Lead ${existing.firstName} ${existing.lastName || ''} has been reassigned to you by ${req.user?.fullName || 'Manager'}.`,
                        `/leads/${req.params.id}`,
                        { leadId: req.params.id, assignedBy: req.user?.id }
                    ).catch(() => {});
                }
            }

            if (requiresHistoryUpdate) {
                const atomicUpdate = { ...historyUpdate };
                const pushOps = atomicUpdate.$push;
                delete atomicUpdate.$push;
                
                // 🏎️ SENIOR OPTIMIZATION: Sequential updates to avoid Mongoose path conflicts
                // (You cannot $set and $push to the same array/path in a single operation)
                if (Object.keys(atomicUpdate).length > 0) {
                    await Lead.findByIdAndUpdate(req.params.id, { $set: atomicUpdate });
                }
                
                if (pushOps && Object.keys(pushOps).length > 0) {
                    await Lead.findByIdAndUpdate(req.params.id, { $push: pushOps });
                }
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

            // ─── Phase 5: AI Audit Trail (SaaS Grade Persistence) ────────────
            if (req.body.source === 'AI_PROFILER') {
                const Activity = mongoose.model('Activity');
                await Activity.create({
                    type: 'System',
                    subject: 'Requirement Profiler: Lead Insights Applied',
                    entityType: 'Lead',
                    entityId: req.params.id,
                    dueDate: new Date(),
                    status: 'Completed',
                    description: `AI interpreted new requirements from recent notes & activities. Profile updated with suggested budget, location, and intent signals.`,
                    details: {
                        source: 'AI_PROFILER',
                        updatedFields: Object.keys(updateData).filter(k => k !== 'source'),
                        appliedAt: new Date()
                    },
                    performedBy: 'AI Agent (Requirement Profiler)',
                    createdBy: req.user?._id || req.user?.id
                }).catch(e => console.error("[AI_LOG_ERROR]", e));
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

        const visibilityFilter = await getVisibilityFilter(req.user);
        console.log(`[DELETE_AUDIT] Attempt by ${req.user?.email} for lead ${id}. Filter: ${JSON.stringify(visibilityFilter)}`);
        
        const lead = await Lead.findOne({ _id: id, ...visibilityFilter });
        if (!lead) {
            console.warn(`[DELETE_AUDIT] ⛔ Lead ${id} not found or access denied for ${req.user?.email}`);
            return res.status(404).json({ success: false, message: "Lead not found or access denied (Regional Isolation)" });
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
            { path: 'contactDetails' },
            { path: 'assignment.assignedTo', select: 'fullName email name' },
            { path: 'assignment.team', select: 'name' },
            { path: 'teams', select: 'name' }
        ];

        // Check if ID is a valid MongoDB ObjectId
        const visibilityFilter = await getVisibilityFilter(req.user);
        let lead;
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            lead = await Lead.findOne({ _id: id, ...visibilityFilter }).populate(leadPopulateFields);
        } else {
            // Fallback: search by mobile number (still filtered by branch)
            lead = await Lead.findOne({ mobile: id, ...visibilityFilter }).populate(leadPopulateFields);
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

        // --- CONTACT DETAILS HYDRATION ---
        if (leadData.contactDetails) {
            const c = leadData.contactDetails;
            const cMixedFields = [
                { field: 'title', type: 'Title' },
                { field: 'professionCategory', type: 'ProfessionCategory' },
                { field: 'designation', type: 'Designation' },
                { field: 'source', type: 'Source' },
                { field: 'subSource', type: 'SubSource' },
                { field: 'campaign', type: 'Campaign' }
            ];
            const cAddrFields = ['country', 'state', 'city', 'tehsil', 'postOffice', 'pincode', 'location'];

            for (const { field, type } of cMixedFields) {
                const val = c[field];
                if (val && mongoose.Types.ObjectId.isValid(val)) {
                    const lookup = await Lookup.findById(val).lean();
                    if (lookup) c[field] = lookup;
                }
            }
            ['personalAddress', 'correspondenceAddress'].forEach(addr => {
                if (c[addr]) {
                    cAddrFields.forEach(async f => {
                        if (c[addr][f] && mongoose.Types.ObjectId.isValid(c[addr][f])) {
                            const lookup = await Lookup.findById(c[addr][f]).lean();
                            if (lookup) c[addr][f] = lookup;
                        }
                    });
                }
            });
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
        const leadIds = ids;
        const leadIdsStr = ids.map(id => String(id));

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
                    locPincode: item.locPincode || item.locPinCode || item.pinCode || item.pincode,
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
                leadEntry.status = await resolveLookup('Status', item.status || 'New', false);
                leadEntry.stage = await resolveLookup('Stage', item.stage || 'Incoming', false);
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
            sizeFlexibility = 20
        } = req.query;

        if (!dealId) {
            return res.status(400).json({ success: false, error: "dealId is required" });
        }

        const bFlex = parseFloat(budgetFlexibility) / 100;
        const sFlex = parseFloat(sizeFlexibility) / 100;

        // 1. Contextual Hydration
        const deal = await Deal.findById(dealId).populate('inventoryId').lean();
        if (!deal) return res.status(404).json({ success: false, error: "Deal not found" });

        const getNum = (v) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'object' && v !== null) return Number(v.value || 0);
            return Number(v || 0);
        };
        
        let dealSize = getNum(deal.size);
        if (dealSize === 0 && deal.inventoryId) {
            dealSize = getNum(deal.inventoryId.length) * getNum(deal.inventoryId.width);
        }
        const dealPrice = getNum(deal.price || deal.quotePrice);

        // 2. Optimized: Pre-fetch all lookups once into a memory map (prevents O(N×M) DB queries)
        const allLookups = await Lookup.find({}).lean();
        const lookupMap = allLookups.reduce((acc, l) => {
            acc[l._id.toString()] = String(l.lookup_value).toLowerCase();
            return acc;
        }, {});

        const lookupLabelMap = allLookups.reduce((acc, l) => {
            acc[l._id.toString()] = l.lookup_value;
            return acc;
        }, {});

        const getLookupValLocal = (val) => {
            if (!val) return "";
            if (val.lookup_value) return String(val.lookup_value).toLowerCase();
            const idStr = (val._id || val).toString();
            return lookupMap[idStr] || (/^[0-9a-fA-F]{24}$/.test(idStr) ? "" : idStr.toLowerCase());
        };

        const getLookupLabelLocal = (val) => {
            if (!val) return "";
            if (val.lookup_value) return val.lookup_value;
            const idStr = (val._id || val).toString();
            return lookupLabelMap[idStr] || (/^[0-9a-fA-F]{24}$/.test(idStr) ? "" : idStr);
        };

        const dealIntent   = getLookupValLocal(deal.intent);
        const dealCategory = getLookupValLocal(deal.category);
        const dealLoc      = getLookupValLocal(deal.location);
        
        console.log(`[MATCH_DEBUG] Deal Context: Intent=${dealIntent}, Cat=${dealCategory}, Loc=${dealLoc}, Price=${dealPrice}`);

        const excludedStatusIds = allLookups
            .filter(l => ["Lost", "Closed", "Rejected"].includes(l.lookup_value))
            .map(l => l._id.toString());

        const leads = await Lead.find({ 
            status: { $nin: excludedStatusIds } 
        }).lean();

        console.log(`[MATCH_DEBUG] Found ${leads.length} active leads to evaluate`);

        // 3. Scoring Engine (Synchronous for speed)
        const matchingLeads = leads.map((lead) => {
            let score = 0;
            const reasons = [];

            // A. Intent Resolution
            const leadReq = getLookupValLocal(lead.requirement);
            const intentMatched = (() => {
                if (!dealIntent || !leadReq) return true;
                const d = dealIntent.toLowerCase();
                const l = leadReq.toLowerCase();
                if ((d.includes("sell") || d.includes("sale")) && (l.includes("buy") || l.includes("purchase") || l.includes("req"))) return true;
                if ((d.includes("rent") || d.includes("lease")) && (l.includes("rent") || l.includes("lease"))) return true;
                if ((l.includes("buy") || l.includes("purchase")) && (d.includes("sale") || d.includes("sell"))) return true;
                if (d === l || d.includes(l) || l.includes(d)) return true;
                return false;
            })();
            
            if (!intentMatched) return null;

            // B. Category Resolution
            const leadCats = (Array.isArray(lead.propertyType) ? lead.propertyType : []).map(c => getLookupValLocal(c));
            
            let catScore = 0;
            if (!dealCategory || leadCats.length === 0 || leadCats.every(c => !c)) {
                catScore = 85; // Neutral: neither side specified category
            } else if (leadCats.some(c => c && (
                c.includes(dealCategory) || 
                dealCategory.includes(c) || 
                (dealCategory.includes("res") && c.includes("res")) || 
                (dealCategory.includes("comm") && c.includes("comm")) ||
                (dealCategory.includes("plot") && c.includes("plot")) ||
                (dealCategory.includes("agri") && c.includes("agri"))
            ))) {
                catScore = 100;
                reasons.push("Category Alignment");
            } else {
                catScore = 40; // Partial: category mismatch but don't fully exclude
            }
            score += (catScore * 0.30);

            // C. Location Intelligence
            const leadLocVal = getLookupValLocal(lead.location);
            const leadLocArea = String(lead.locArea || "").toLowerCase();
            let locScore = 0;
            if (dealLoc && (
                dealLoc === leadLocVal || 
                dealLoc.includes(leadLocVal) || 
                leadLocVal.includes(dealLoc) || 
                dealLoc.includes(leadLocArea) ||
                (leadLocArea && dealLoc.includes(leadLocArea))
            )) {
                locScore = 100;
                reasons.push("Location Match");
            } else if (!dealLoc || !leadLocVal) {
                locScore = 50; 
            }
            score += (locScore * 0.35);

            // D. Budget Intelligence
            const lMin = getNum(lead.budgetMin);
            const lMax = getNum(lead.budgetMax);
            let budgetScore = 0;
            if (dealPrice > 0 && lMax > 0) {
                const minAcc = lMin * (1 - bFlex);
                const maxAcc = lMax * (1 + bFlex);
                if (dealPrice >= minAcc && dealPrice <= maxAcc) {
                    budgetScore = 100;
                    reasons.push("Budget Fit");
                }
            } else if (dealPrice > 0) {
                budgetScore = 60;
            }
            score += (budgetScore * 0.20);

            // E. Size Intelligence
            const aMin = getNum(lead.areaMin);
            const aMax = getNum(lead.areaMax);
            let sizeScore = 0;
            if (dealSize > 0 && aMax > 0) {
                const minAcc = aMin * (1 - sFlex);
                const maxAcc = aMax * (1 + sFlex);
                if (dealSize >= minAcc && dealSize <= maxAcc) {
                    sizeScore = 100;
                    reasons.push("Size Fit");
                }
            } else if (dealSize > 0) {
                sizeScore = 60;
            }
            score += (sizeScore * 0.15);

            if (score < 30) return null;

            const leadReqLabel = getLookupLabelLocal(lead.requirement) || "Buy";
            const leadBudgetLabel = getLookupLabelLocal(lead.budget) || "";
            const leadLocLabel = getLookupLabelLocal(lead.location) || "";
            const leadCatsLabels = (Array.isArray(lead.propertyType) ? lead.propertyType : [])
                .map(c => getLookupLabelLocal(c))
                .filter(Boolean);

            return {
                ...lead,
                score: Math.round(score),
                matchPercentage: Math.round(score),
                matchReasons: reasons,
                
                // Hydrated/resolved fields for UI consistency
                requirement: { lookup_value: leadReqLabel },
                budget: { lookup_value: leadBudgetLabel },
                location: { lookup_value: leadLocLabel || lead.locArea || lead.locCity || "Not Set" },
                propertyType: leadCatsLabels.map(label => ({ lookup_value: label })),
                
                // Budget Aliasing for Frontend Compatibility
                minBudget: lead.budgetMin,
                maxBudget: lead.budgetMax,
                budgetMin: lead.budgetMin,
                budgetMax: lead.budgetMax
            };
        });

        const finalResults = matchingLeads.filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 50);
        console.log(`[ENTERPRISE_MATCH] ${finalResults.length} leads matched successfully`);

        return res.status(200).json({ 
            success: true, 
            count: finalResults.length, 
            matchingLeads: finalResults,
            deal 
        });
    } catch (error) {
        console.error("[ENTERPRISE_MATCH] Fatal Error:", error);
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

/**
 * @desc    Snooze a match for a lead
 * @route   PUT /leads/match/snooze/:inventoryId
 * @access  Private
 */
export const snoozeLeadMatch = async (req, res, next) => {
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

        if (!lead.snoozedInventory) lead.snoozedInventory = [];
        if (!lead.snoozedInventory.includes(inventoryId)) {
            lead.snoozedInventory.push(inventoryId);
            await lead.save();
        }

        res.status(200).json({ success: true, message: "Match snoozed successfully" });
    } catch (error) {
        next(error);
    }
};

/**
 * Phase 5: AI-Driven Lead Requirement Interpretation
 * Uses Gemini to analyze unstructured data (notes, activity logs) and extract 
 * high-precision matching parameters.
 */
export const interpretLeadRequirements = async (req, res) => {
    try {
        const { id } = req.params;
        const visibilityFilter = await getVisibilityFilter(req.user);
        const lead = await Lead.findOne({ _id: id, ...visibilityFilter }).lean();
        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found or access denied' });

        // 1. Collect Context Data
        const notes = lead.notes || '';
        const activities = await Activity.find({ entityId: id, entityType: 'Lead' }).sort({ createdAt: -1 }).limit(10).lean();
        const activityText = activities.map(a => `[${a.type}] ${a.subject}: ${a.description || ''}`).join('\n');

        const prompt = `
        As a Senior Real Estate Analyst, analyze the following lead data and extract structured requirements for our CRM matching engine.
        
        LEAD NAME: ${lead.firstName} ${lead.lastName || ''}
        CURRENT PROJECT: ${lead.projectName || 'Not specified'}
        CURRENT BUDGET: ${lead.budgetMin || 0} - ${lead.budgetMax || 0}
        CURRENT LOCATION: ${lead.sector || lead.locArea || lead.locCity || ''}
        
        NOTES:
        ${notes}
        
        RECENT ACTIVITY LOGS:
        ${activityText}
        
        TASK:
        1. Identify the intended use (Buying, Renting, or Investment).
        2. Extract specific property types (e.g., 3BHK, Independent Floor, Plot).
        3. Determine the budget range (convert words like "1.5Cr" to numbers like 15000000).
        4. Identify location preferences (Sectors, Areas).
        5. Look for "soft signals" like: Vastu, Park facing, High floor, Construction stage.
        
        RETURN ONLY A JSON OBJECT in this exact format:
        {
            "requirement": "Buy" | "Rent" | "Investment",
            "propertyType": ["string"],
            "budgetMin": number,
            "budgetMax": number,
            "location": "string",
            "softSignals": ["string"],
            "summary": "2-sentence professional summary",
            "suggestedWeights": { "location": number, "budget": number, "type": number }
        }
        `;

        // 2. Fetch Config from AI Agent (Settings Page Integration)
        let agent = await AiAgent.findOne({ name: /Requirement Profiler/i, isActive: true });
        
        // Auto-provision if missing (Professional Fallback)
        if (!agent) {
            console.log("[AI_INTERPRET] Agent not found in settings. Using system default.");
            agent = {
                systemPrompt: "You are an expert Real Estate Profiling Agent for an Enterprise CRM. You extract structured data from unstructured conversations and notes.",
                modelName: 'gemini-1.5-flash-latest',
                provider: 'gemini'
            };
        }

        const aiResponseText = await UnifiedAIService.generate(prompt, {
            provider: agent.provider || 'gemini',
            systemPrompt: agent.systemPrompt,
            model: agent.modelName,
            temperature: 0.2
        });

        // 3. Parse and Clean Response
        let interpretation;
        try {
            const jsonMatch = aiResponseText.match(/\{.*\}/s);
            interpretation = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponseText);
        } catch (e) {
            console.error("[AI_INTERPRET] JSON Parse Failed:", aiResponseText);
            throw new Error("AI returned unparseable response");
        }

        // 4. Transform Interpretation to DB IDs (Optional but professional)
        // Note: For now we return the raw interpretation and let the frontend confirm
        
        res.json({
            success: true,
            data: interpretation,
            originalLead: {
                firstName: lead.firstName,
                lastName: lead.lastName,
                budgetMin: lead.budgetMin,
                budgetMax: lead.budgetMax
            }
        });

    } catch (error) {
        console.error("[AI_INTERPRET] Fatal Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
