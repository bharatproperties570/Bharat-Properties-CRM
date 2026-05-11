import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import Lookup from "../models/Lookup.js";
import User from "../models/User.js";

import Contact from "../models/Contact.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js"; // REQUIRED for population
import { paginate } from "../utils/pagination.js";
import mongoose from "mongoose";
import { getVisibilityFilter } from "../utils/visibility.js";

import DuplicationRule from "../models/DuplicationRule.js";
import Deal from "../models/Deal.js"; // Explicitly load to prevent registration errors
import { syncDocumentsToContact } from "../utils/sync.js";
import { createNotification } from "./notification.controller.js";


// ROBUST FILTER RESOLUTION (Handle both Names and IDs)
const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Resolves multi-select filters (names or IDs) to a MongoDB $in query
 * supports ObjectIds, String IDs, and raw names for Mixed fields.
 */
const resolveMultiFilter = async (type, values) => {
    if (!values) return null;
    let vals = Array.isArray(values) ? values : String(values).split(',').map(s => s.trim()).filter(Boolean);
    if (vals.length === 0) return null;

    const results = { ids: [], names: [], idStrings: [] };

    await Promise.all(vals.map(async (v) => {
        if (mongoose.Types.ObjectId.isValid(v)) {
            results.ids.push(new mongoose.Types.ObjectId(v.toString()));
            results.idStrings.push(v.toString());
            return;
        }
        
        results.names.push(v);
        const lookup = await mongoose.model('Lookup').findOne({ 
            lookup_type: type, 
            lookup_value: { $regex: new RegExp(`^${escapeRegExp(v)}$`, 'i') } 
        }).select('_id').lean();
        
        if (lookup) {
            results.ids.push(lookup._id);
            results.idStrings.push(lookup._id.toString());
        }
    }));

    const allPossibleMatches = [...new Set([
        ...results.ids.map(id => id.toString()), 
        ...results.idStrings, 
        ...results.names
    ])];

    // Map back to ObjectIds where valid for Mongoose internal casting
    const finalMatches = allPossibleMatches.map(m => mongoose.Types.ObjectId.isValid(m) ? new mongoose.Types.ObjectId(m) : m);

    return finalMatches.length > 0 ? { $in: finalMatches } : null;
};

const populateFields = [
    { path: "owners", select: "name phones emails title personalAddress" },
    {
        path: "associates.contact",
        model: 'Contact',
        select: "name phones emails title"
    },
    { path: "projectId" },
    { path: "team", select: "name" },
    { path: "assignedTo", select: "fullName name team" },
    { path: "teams", select: "name" }
];

export const getInventory = async (req, res) => {
    try {
        const { 
            page = 1, limit = 10, search = "", sortBy, sortOrder,
            category, subCategory, unitType, status, 
            project, block, location, area, contactId, 
            statusCategory, ownerPhone, feedbackOutcome, feedbackReason,
            minSize, maxSize, sizeMin, sizeMax,
            followUpFrom, followUpTo
        } = req.query;
        const visibilityFilter = await getVisibilityFilter(req.user);

        // 🛠️ SENIOR DIAGNOSTIC LOG (Harden for potential undefined user)
        if (req.user) {
            console.log(`[VISIBLE_AUDIT] User: ${req.user.email}, Scope: ${req.user.dataScope}, Teams: ${JSON.stringify(req.user.teams?.map(t => t._id || t))}`);
        } else {
            console.log(`[VISIBLE_AUDIT] Anonymous request - Visibility restricted to public data.`);
        }
        console.log(`[VISIBLE_AUDIT] Generated Filter: ${JSON.stringify(visibilityFilter, null, 2)}`);

        let query = { ...visibilityFilter };

        if (ownerPhone) {
            // [SECURITY FIX] Use $and to MERGE with visibility filter, not overwrite it
            const phoneConditions = [
                { ownerPhone: { $regex: new RegExp(`${ownerPhone}$`) } },
                { owners: { $in: await Contact.find({ "phones.number": { $regex: new RegExp(`${ownerPhone}$`) } }).select('_id') } }
            ];
            if (query.$or) {
                // Wrap existing $or into $and so both conditions must be satisfied
                query.$and = [
                    { $or: query.$or },
                    { $or: phoneConditions }
                ];
                delete query.$or;
            } else {
                query.$or = phoneConditions;
            }
        }

        // [ENTERPRISE FILTERING] Support for Block/Phase multi-select or partial matching
        if (block) {
            let blockVals = Array.isArray(block) ? block : String(block).split(',').map(s => s.trim()).filter(Boolean);
            if (blockVals.length > 0) {
                query.block = { $in: blockVals };
            }
        } else if (location) {
            // Fallback for location-based searching in block field if block not explicitly provided
            query.block = { $regex: escapeRegExp(location), $options: "i" };
        }

        if (area && !project) {
            query.projectName = area;
        }

        // [FEEDBACK FILTERS] Support for filtering by interaction history
        const feedbackOutcomeFilter = await resolveMultiFilter('propertyOwnerFeedback', feedbackOutcome || req.query['feedbackOutcome[]']);
        if (feedbackOutcomeFilter) query['history.details.result'] = feedbackOutcomeFilter;

        const feedbackReasonFilter = await resolveMultiFilter('feedbackReasons', feedbackReason || req.query['feedbackReason[]']);
        if (feedbackReasonFilter) query['history.details.reason'] = feedbackReasonFilter;

        if (contactId) {
            const ids = contactId.split(',');
            const allIds = [...ids];

            // ROBUST: Resolve linked IDs (Lead <-> Contact) via phone/email
            const identities = await Promise.all(ids.map(async (id) => {
                if (!mongoose.Types.ObjectId.isValid(id)) return null;
                const [c, l] = await Promise.all([
                    Contact.findById(id).lean(),
                    Lead.findById(id).lean()
                ]);
                const profile = { phones: [], emails: [] };
                if (c) {
                    if (c.phones) profile.phones.push(...c.phones.map(p => p.number));
                    if (c.emails) profile.emails.push(...c.emails.map(e => e.address));
                }
                if (l) {
                    if (l.mobile) profile.phones.push(l.mobile);
                    if (l.email) profile.emails.push(l.email);
                }
                return profile;
            }));

            const phones = [...new Set(identities.filter(Boolean).flatMap(i => i.phones).filter(Boolean))];
            const emails = [...new Set(identities.filter(Boolean).flatMap(i => i.emails).filter(Boolean))];

            if (phones.length > 0 || emails.length > 0) {
                const linkedEntities = await Promise.all([
                    Contact.find({
                        $or: [
                            { 'phones.number': { $in: phones } },
                            { 'emails.address': { $in: emails } }
                        ]
                    }).select('_id').lean(),
                    Lead.find({
                        $or: [
                            { mobile: { $in: phones } },
                            { email: { $in: emails } }
                        ]
                    }).select('_id').lean()
                ]);

                linkedEntities.flat().forEach(e => {
                    if (e && e._id) allIds.push(e._id.toString());
                });
            }

            const uniqueIds = [...new Set(allIds)];
            
            if (req.query.history === 'true') {
                query['ownerHistory.contactId'] = { $in: uniqueIds };
            } else {
                query.$or = [
                    { owners: { $in: uniqueIds } },
                    { 'associates.contact': { $in: uniqueIds } }
                ];
                
                // Heuristic fallback for legacy data fields if they exist
                if (phones.length > 0) {
                    phones.forEach(p => {
                        query.$or.push({ ownerPhone: p });
                        query.$or.push({ previousOwnerPhone: p });
                    });
                }
                if (emails.length > 0) {
                    emails.forEach(e => {
                        query.$or.push({ ownerEmail: e });
                        query.$or.push({ previousOwnerEmail: e });
                    });
                }
            }
        }

        // Search in unitNo, unitNumber, ownerName, ownerPhone
        if (search) {
            const searchConditions = [
                { unitNo: { $regex: search, $options: "i" } },
                { unitNumber: { $regex: search, $options: "i" } },
                { ownerName: { $regex: search, $options: "i" } },
                { ownerPhone: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { projectName: { $regex: search, $options: "i" } }
            ];
            if (query.$or) {
                query.$and = [
                    { $or: query.$or },
                    { $or: searchConditions }
                ];
                delete query.$or;
            } else {
                query.$or = searchConditions;
            }
        }

        // Standardize multi-select keys (handle status vs status[])
        const statusReq = status || req.query['status[]'];
        const categoryReq = category || req.query['category[]'];
        const subCategoryReq = subCategory || req.query['subCategory[]'];
        const unitTypeReq = unitType || req.query['unitType[]'];

        // Special handling for 'active' and 'inactive' status groups (Mobile CRM optimization)
        const activeStatusNames = ['Available', 'Active', 'Interested / Warm', 'Interested / Hot', 'Request Call Back', 'Busy / Driving', 'Market Feedback', 'General Inquiry', 'Blocked', 'Booked', 'Interested'];
        const inactiveStatusNames = ['Sold Out', 'Rented Out', 'Not Interested', 'Inactive', 'Wrong Number / Invalid', 'Switch Off / Unreachable'];

        if (statusReq === 'active' || (Array.isArray(statusReq) && statusReq.includes('active'))) {
            const activeStatusDocs = await Lookup.find({ lookup_type: 'Status', lookup_value: { $in: activeStatusNames } }).select('_id').lean();
            const activeStatusIds = activeStatusDocs.map(d => d._id);
            query.status = { $in: [...activeStatusIds, ...activeStatusIds.map(id => id.toString()), ...activeStatusNames] };
        } else if (statusReq === 'inactive' || (Array.isArray(statusReq) && statusReq.includes('inactive'))) {
            const inactiveStatusDocs = await Lookup.find({ lookup_type: 'Status', lookup_value: { $in: inactiveStatusNames } }).select('_id').lean();
            const inactiveStatusIds = inactiveStatusDocs.map(d => d._id);
            query.status = { $in: [...inactiveStatusIds, ...inactiveStatusIds.map(id => id.toString()), ...inactiveStatusNames] };
        } else {
            const statusFilter = await resolveMultiFilter('Status', statusReq);
            if (statusFilter) query.status = statusFilter;
        }

        const categoryFilter = await resolveMultiFilter('Category', categoryReq);
        if (categoryFilter) query.category = categoryFilter;

        const subCategoryFilter = await resolveMultiFilter('SubCategory', subCategoryReq);
        if (subCategoryFilter) query.subCategory = subCategoryFilter;

        const unitTypeFilter = await resolveMultiFilter('UnitType', unitTypeReq);
        if (unitTypeFilter) query.unitType = unitTypeFilter;

        // [ORIENTATION FILTERS]
        const directionFilter = await resolveMultiFilter('Direction', req.query.direction || req.query['direction[]']);
        if (directionFilter) query.direction = directionFilter;

        const roadWidthFilter = await resolveMultiFilter('RoadWidth', req.query.roadWidth || req.query['roadWidth[]']);
        if (roadWidthFilter) query.roadWidth = roadWidthFilter;

        const facingFilter = await resolveMultiFilter('Facing', req.query.facing || req.query['facing[]']);
        if (facingFilter) query.facing = facingFilter;
        
        // [SIZE RANGE FILTERS]
        const finalMinSize = minSize || sizeMin;
        const finalMaxSize = maxSize || sizeMax;
        if (finalMinSize || finalMaxSize) {
            query['size.value'] = {};
            if (finalMinSize) query['size.value'].$gte = parseFloat(finalMinSize);
            if (finalMaxSize) query['size.value'].$lte = parseFloat(finalMaxSize);
        }

        // [FOLLOW-UP DATE FILTERS]
        if (followUpFrom || followUpTo) {
            query.followUpDate = {};
            if (followUpFrom) query.followUpDate.$gte = new Date(followUpFrom);
            if (followUpTo) query.followUpDate.$lte = new Date(followUpTo);
        }

        if (project) {
            let projectVals = Array.isArray(project) ? project : String(project).split(',').map(s => s.trim()).filter(Boolean);
            if (projectVals.length > 0) {
                const projectIds = projectVals.filter(v => mongoose.Types.ObjectId.isValid(v));
                const projectNames = projectVals; 
                
                const projectConditions = [
                    { projectId: { $in: projectIds } },
                    { projectName: { $in: projectNames } }
                ].filter(c => (Array.isArray(c.projectId?.$in) && c.projectId.$in.length > 0) || (Array.isArray(c.projectName?.$in) && c.projectName.$in.length > 0));

                if (projectConditions.length > 0) {
                    if (query.$or) {
                        if (!query.$and) query.$and = [];
                        query.$and.push({ $or: query.$or });
                        query.$and.push({ $or: projectConditions });
                        delete query.$or;
                    } else {
                        query.$or = projectConditions;
                    }
                }
            }
        }

        // Only populate fields that are reliably ObjectIds (Contact references)
        // category, status, etc. in Inventory seem to be stored as objects or strings already
        const populateFields = [
            { path: "owners", select: "name phones" },
            { path: "associates.contact", select: "name phones" },
            { path: "projectId" },
            { path: "team", select: "name" },
            { path: "teams", select: "name" },
            { path: "assignedTo", select: "fullName" }
        ];

        const [activeStatusDocs, inactiveStatusDocs] = await Promise.all([
            Lookup.find({ lookup_type: 'Status', lookup_value: { $in: activeStatusNames } }).select('_id').lean(),
            Lookup.find({ lookup_type: 'Status', lookup_value: { $in: inactiveStatusNames } }).select('_id').lean()
        ]);

        const activeStatusIds = activeStatusDocs.map(d => d._id);
        const inactiveStatusIds = inactiveStatusDocs.map(d => d._id);

        // Robust matching: Include string IDs for data consistency fallback
        const activeStatusIdStrings = activeStatusIds.map(id => id.toString());
        const inactiveStatusIdStrings = inactiveStatusIds.map(id => id.toString());

        // Single aggregation for all stats
        // We need a separate query for category stats that ignores the category filter
        const categoryStatsQuery = { ...query };
        delete categoryStatsQuery.category;

        let statsAggregation = [], categoryStatsAggregation = [];
        try {
            [statsAggregation, categoryStatsAggregation] = await Promise.all([
                Inventory.aggregate([
                    { $match: query },
                    {
                        $facet: {
                            active: [
                                { 
                                    $match: { 
                                        $or: [
                                            { status: { $in: activeStatusIds } }, 
                                            { status: { $in: activeStatusIdStrings } },
                                            { status: { $in: activeStatusNames } }
                                        ] 
                                    } 
                                },
                                { $count: "count" }
                            ],
                            inactive: [
                                { 
                                    $match: { 
                                        $or: [
                                            { status: { $in: inactiveStatusIds } }, 
                                            { status: { $in: inactiveStatusIdStrings } },
                                            { status: { $in: inactiveStatusNames } }
                                        ] 
                                    } 
                                },
                                { $count: "count" }
                            ]
                        }
                    }
                ]),
                Inventory.aggregate([
                    { $match: categoryStatsQuery },
                    { $group: { _id: "$category", count: { $sum: 1 } } }
                ])
            ]);
        } catch (aggError) {
            console.error("[INVENTORY_AGG] Aggregation failed:", aggError.message);
            // Non-fatal: Allow the request to continue with partial stats
            statsAggregation = [{ active: [], inactive: [] }];
            categoryStatsAggregation = [];
        }

        const stats = statsAggregation[0] || { active: [], inactive: [] };
        const activeCount = stats.active[0]?.count || 0;
        const inactiveCount = stats.inactive[0]?.count || 0;

        // Enrichment: Resolve category names for stats
        const categoryResultIds = categoryStatsAggregation.map(c => c._id).filter(id => mongoose.Types.ObjectId.isValid(id));
        const categoryDocs = await Lookup.find({ _id: { $in: categoryResultIds } }).select('lookup_value').lean();
        const categoryMap = new Map(categoryDocs.map(d => [d._id.toString(), d.lookup_value]));

        const categoryStats = categoryStatsAggregation.map(c => ({
            name: categoryMap.get(c._id?.toString()) || String(c._id || 'Unknown'),
            count: c.count
        }));

        // Apply Status Category Filter if requested (optimized + legacy string support)
        if (statusCategory === 'Active') {
            query.status = { $in: [...activeStatusIds, ...activeStatusIdStrings, ...activeStatusNames] };
        } else if (statusCategory === 'InActive') {
            query.status = { $in: [...inactiveStatusIds, ...inactiveStatusIdStrings, ...inactiveStatusNames] };
        }

        // ─── PROFESSIONAL SORTING ENGINE (Enterprise Grade) ───
        const collation = { locale: "en", numericOrdering: true };
        
        // Handle nested and CRM-specific fields
        let finalSortOption = {};
        const sortField = sortBy || 'updatedAt';
        const order = parseInt(sortOrder) || -1;

        if (sortField === 'price') {
            finalSortOption = { 'price.value': order };
        } else if (sortField === 'size') {
            finalSortOption = { 'size.value': order };
        } else if (sortField === 'followUp') {
            finalSortOption = { followUpDate: order };
        } else if (sortField === 'lastContacted') {
            finalSortOption = { lastContactedAt: order };
        } else if (sortField === 'category' || sortField === 'unitType' || sortField === 'status' || sortField === 'facing' || sortField === 'direction' || sortField === 'orientation') {
            // [ENTERPRISE] For categorical fields, we sort by ID for now, 
            // but secondary sort ensures consistent ordering.
            finalSortOption = { [sortField]: order };
        } else {
            finalSortOption = { [sortField]: order };
        }

        // Secondary sort for consistency (Unit No -> Project -> Block)
        // Numeric ordering in collation handles strings like "101", "102", "1010" correctly.
        if (!finalSortOption.unitNo) finalSortOption.unitNo = 1;
        if (!finalSortOption.projectName) finalSortOption.projectName = 1;
        if (!finalSortOption.createdAt) finalSortOption.createdAt = -1;

        // Fetch paginated results
        const results = await paginate(Inventory, query, Number(page), Number(limit), finalSortOption, populateFields, collation);

        // Check for deals
        const inventoryIds = results.records.map(item => item._id);
        const deals = await Deal.find({ inventoryId: { $in: inventoryIds } }).select('inventoryId').lean();
        const dealInventoryIds = new Set(deals.map(d => d.inventoryId?.toString()).filter(Boolean));
        const uniqueLookupIds = new Set();
        const categoricalFields = ['category', 'subCategory', 'status', 'unitType', 'facing', 'direction', 'orientation', 'sizeConfig', 'roadWidth', 'builtupType'];
        const uniqueUserIds = new Set();
        const uniqueTeamIds = new Set();
        const uniqueProjectIds = new Set();

        results.records.forEach(item => {
            const itemObj = item; // results.records are already lean
            categoricalFields.forEach(f => {
                const val = itemObj[f];
                if (val && mongoose.Types.ObjectId.isValid(val)) uniqueLookupIds.add(val.toString());
                else if (Array.isArray(val)) {
                    val.forEach(v => { if (v && mongoose.Types.ObjectId.isValid(v)) uniqueLookupIds.add(v.toString()); });
                }
            });
            if (itemObj.assignedTo && mongoose.Types.ObjectId.isValid(itemObj.assignedTo)) uniqueUserIds.add(itemObj.assignedTo.toString());
            if (itemObj.team && mongoose.Types.ObjectId.isValid(itemObj.team)) uniqueTeamIds.add(itemObj.team.toString());
            if (Array.isArray(itemObj.teams)) itemObj.teams.forEach(t => { if (t && mongoose.Types.ObjectId.isValid(t)) uniqueTeamIds.add(t.toString()); });
            if (itemObj.projectId && mongoose.Types.ObjectId.isValid(itemObj.projectId)) uniqueProjectIds.add(itemObj.projectId.toString());

            // Address lookups
            if (itemObj.address) {
                const addrFields = ['city', 'state', 'locality', 'area', 'location', 'pincode', 'tehsil', 'postOffice'];
                addrFields.forEach(f => {
                    const val = itemObj.address[f];
                    if (val && mongoose.Types.ObjectId.isValid(val)) uniqueLookupIds.add(val.toString());
                });
            }
        });

        const [lookups, users, teams, projects] = await Promise.all([
            uniqueLookupIds.size > 0 ? Lookup.find({ _id: { $in: [...uniqueLookupIds] } }).select('lookup_value lookup_type').lean() : [],
            uniqueUserIds.size > 0 ? User.find({ _id: { $in: [...uniqueUserIds] } }).select('fullName name username').lean() : [],
            uniqueTeamIds.size > 0 ? Team.find({ _id: { $in: [...uniqueTeamIds] } }).select('name').lean() : [],
            uniqueProjectIds.size > 0 ? Project.find({ _id: { $in: [...uniqueProjectIds] } }).select('name').lean() : []
        ]);

        const lookupMap = new Map(lookups.map(l => [l._id.toString(), l]));
        const userMap = new Map(users.map(u => [u._id.toString(), u]));
        const teamMap = new Map(teams.map(t => [t._id.toString(), t]));
        const projectMap = new Map(projects.map(p => [p._id.toString(), p]));

        results.records = results.records.map((item) => {
            const itemObj = { ...item };
            
            // Hydrate Categorical
            categoricalFields.forEach(f => {
                const val = itemObj[f];
                if (val && mongoose.Types.ObjectId.isValid(val)) {
                    itemObj[f] = lookupMap.get(val.toString()) || val;
                } else if (Array.isArray(val)) {
                    itemObj[f] = val.map(v => (v && mongoose.Types.ObjectId.isValid(v)) ? (lookupMap.get(v.toString()) || v) : v);
                }
            });

            // Hydrate Address
            if (itemObj.address) {
                const addrFields = ['city', 'state', 'locality', 'area', 'location', 'pincode', 'tehsil', 'postOffice'];
                addrFields.forEach(f => {
                    const val = itemObj.address[f];
                    if (val && mongoose.Types.ObjectId.isValid(val)) {
                        itemObj.address[f] = lookupMap.get(val.toString()) || val;
                    }
                });
            }

            // Hydrate Relational
            if (itemObj.assignedTo && mongoose.Types.ObjectId.isValid(itemObj.assignedTo)) itemObj.assignedTo = userMap.get(itemObj.assignedTo.toString()) || itemObj.assignedTo;
            if (itemObj.team && mongoose.Types.ObjectId.isValid(itemObj.team)) itemObj.team = teamMap.get(itemObj.team.toString()) || itemObj.team;
            if (Array.isArray(itemObj.teams)) itemObj.teams = itemObj.teams.map(t => (t && mongoose.Types.ObjectId.isValid(t)) ? (teamMap.get(t.toString()) || t) : t);
            if (itemObj.projectId && mongoose.Types.ObjectId.isValid(itemObj.projectId)) itemObj.projectId = projectMap.get(itemObj.projectId.toString()) || itemObj.projectId;

            return {
                ...itemObj,
                hasDeal: dealInventoryIds.has(itemObj._id.toString())
            };
        });

        res.status(200).json({
            success: true,
            activeCount,
            inactiveCount,
            categoryStats,
            ...results
        });
    } catch (error) {
        console.error("[ERROR] getInventory failed:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};


export const getInventoryById = async (req, res) => {
    try {
        const { id } = req.params;

        // 🛡️ [HARDENING] Validate ID format before DB call to prevent 500 CastErrors
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            console.warn(`[DIAGNOSTIC] ⚠️ Invalid Inventory ID requested: "${id}"`);
            return res.status(400).json({ success: false, error: "Invalid Inventory ID format" });
        }

        // [SECURITY] Enforce visibility — scoped users cannot bypass via direct ID lookup
        console.log(`[DIAGNOSTIC] 🔍 Fetching Inventory: ${id} | User: ${req.user?.email}`);
        const visibilityFilter = await getVisibilityFilter(req.user);
        
        const populateFieldsReduced = [
            { path: "owners", select: "name phones emails title personalAddress" },
            {
                path: "associates.contact",
                model: 'Contact',
                select: "name phones emails title"
            },
            { path: "projectId" },
            { path: "team", select: "name" },
            { path: "assignedTo", select: "fullName name team" },
            { path: "teams", select: "name" }
        ];

        let inventory = await Inventory.findOne({
            _id: id,
            ...visibilityFilter
        }).populate(populateFieldsReduced);

        if (!inventory) {
            console.warn(`[DIAGNOSTIC] ⛔ Inventory ${id} NOT FOUND or ACCESS DENIED for ${req.user?.email}`);
            return res.status(404).json({ success: false, error: "Inventory item not found or access denied" });
        }

        // 🚀 Hydrate related deals for intelligence
        const deals = await Deal.find({ inventoryId: inventory._id }).lean();

        // Manual Enrichment for Mixed fields that might be strings (preventing CastErrors)
        const inventoryData = inventory.toObject();
        
        const mixedFields = [
            { field: 'category', type: 'Category' },
            { field: 'subCategory', type: 'SubCategory' },
            { field: 'status', type: 'Status' },
            { field: 'unitType', type: 'UnitType' },
            { field: 'facing', type: 'Facing' },
            { field: 'direction', type: 'Direction' },
            { field: 'orientation', type: 'Orientation' },
            { field: 'intent', type: 'Intent' },
            { field: 'builtupType', type: 'BuiltupType' },
            { field: 'roadWidth', type: 'RoadWidth' },
            { field: 'sizeConfig', type: 'Size' }
        ];

        for (const { field, type } of mixedFields) {
            let val = inventoryData[field];
            if (!val) continue;

            // Handle arrays (like intent)
            if (Array.isArray(val)) {
                inventoryData[field] = await Promise.all(val.map(async (v) => {
                    if (typeof v === 'string' && !mongoose.Types.ObjectId.isValid(v)) {
                         const lookup = await Lookup.findOne({ lookup_type: type, lookup_value: v }).lean();
                         return lookup || { lookup_value: v };
                    } else if (mongoose.Types.ObjectId.isValid(v)) {
                         const lookup = await Lookup.findById(v).lean();
                         return lookup || { _id: v };
                    }
                    return v;
                }));
            } else if (typeof val === 'string' && !mongoose.Types.ObjectId.isValid(val)) {
                const lookup = await Lookup.findOne({ lookup_type: type, lookup_value: val }).lean();
                inventoryData[field] = lookup || { lookup_value: val };
            } else if (mongoose.Types.ObjectId.isValid(val)) {
                const lookup = await Lookup.findById(val).lean();
                inventoryData[field] = lookup || { _id: val };
            }
        }

        // Handle address components
        if (inventoryData.address) {
            const addrFields = [
                { field: 'city', type: 'City' },
                { field: 'state', type: 'State' },
                { field: 'locality', type: 'Location' }, // Try Location first
                { field: 'area', type: 'Area' },
                { field: 'location', type: 'Location' }, // Try Location first
                { field: 'pincode', type: 'Pincode' },
                { field: 'tehsil', type: 'Tehsil' },
                { field: 'postOffice', type: 'PostOffice' },
                { field: 'country', type: 'Country' }
            ];
            for (const { field, type } of addrFields) {
                let val = inventoryData.address[field];
                if (!val) continue;

                // Case 1: Already a populated object with a value (skip)
                if (typeof val === 'object' && val !== null && (val.lookup_value || val.name || val.fullName)) continue;

                const valStr = String(val).trim();
                
                // Case 2: It's a valid Mongo ID (instance or string)
                if (mongoose.Types.ObjectId.isValid(valStr)) {
                    const lookup = await Lookup.findById(valStr).lean();
                    if (lookup) {
                        inventoryData.address[field] = lookup;
                    } else {
                        // Fallback: If ID not found in its primary type, it might be a generic lookup
                        inventoryData.address[field] = { _id: valStr, lookup_value: valStr };
                    }
                } 
                // Case 3: It's a raw string value
                else {
                    // Try to find the lookup by value
                    let lookup = await Lookup.findOne({ 
                        lookup_type: type, 
                        lookup_value: { $regex: new RegExp(`^${escapeRegExp(valStr)}$`, 'i') } 
                    }).lean();
                    
                    // Area/Location Cross-fallback
                    if (!lookup && (type === 'Location' || type === 'Area')) {
                        const fallbackType = type === 'Location' ? 'Area' : 'Location';
                        lookup = await Lookup.findOne({ 
                            lookup_type: fallbackType, 
                            lookup_value: { $regex: new RegExp(`^${escapeRegExp(valStr)}$`, 'i') } 
                        }).lean();
                    }

                    inventoryData.address[field] = lookup || { lookup_value: valStr };
                }
            }
        }
        inventoryData.media = [
            ...(inventory.inventoryImages || []).map(i => ({ ...i, type: 'image' })),
            ...(inventory.inventoryVideos || []).map(v => ({ ...v, type: 'video' })),
            ...(inventory.inventoryDocuments || []).map(d => ({ ...d, type: 'document', title: d.documentName }))
        ];
        // Legacy support for older mobile versions
        inventoryData.images = inventory.inventoryImages;

        console.log(`[DIAGNOSTIC] ✅ Success: ${inventory.projectName} | Deals found: ${deals.length} | Media: ${inventoryData.media.length}`);
        res.status(200).json({ success: true, data: { ...inventoryData, deals } });
    } catch (error) {
        console.error(`[DIAGNOSTIC] ❌ getInventoryById CRASH:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

const sanitizeIds = (ids) => {
    if (!ids || !Array.isArray(ids)) return ids;
    return ids.map(id => {
        if (typeof id === 'object' && id !== null) {
            return id._id || id.id || id;
        }
        return id;
    });
};


// Helper to sanitize payload and prevent CastErrors for empty strings in Ref fields
const sanitizePayload = (data) => {
    if (!data) return data;

    // 1. Handle top-level strict ObjectIds and Refs
    const strictRefs = ['projectId', 'assignedTo', 'team', 'category', 'subCategory', 'unitType', 'status', 'facing', 'direction', 'orientation', 'intent', 'builtupType', 'sizeConfig'];
    strictRefs.forEach(field => {
        if (data[field] === "" || data[field] === undefined) {
            delete data[field];
        }
    });

    // 2. Handle nested address lookups (common source of CastErrors during population)
    if (data.address) {
        const addressRefs = ['city', 'state', 'country', 'location', 'area', 'locality', 'tehsil', 'postOffice'];
        addressRefs.forEach(field => {
            if (data.address[field] === "") {
                data.address[field] = null;
            }
        });
    }

    // 3. Handle owners array
    if (data.owners && Array.isArray(data.owners)) {
        data.owners = data.owners.filter(o => o !== "" && o !== null);
    }

    return data;
};

// 🌟 SENIOR ADDITION: Notify Leads matching new Inventory
const notifyMatchingLeads = async (inventory) => {
    try {
        if (!inventory || !inventory.projectId || !inventory.category) return;
        
        // Find leads that match this project and property type
        const matches = await Lead.find({
            $or: [
                { project: inventory.projectId },
                { propertyType: inventory.category }
            ],
            stage: { $nin: await Lookup.find({ lookup_value: { $regex: /Won|Lost|Booked/i } }).select('_id') }
        }).populate('owner').lean();

        for (const lead of matches) {
            if (lead.owner) {
                await createNotification(
                    lead.owner._id,
                    'inventoryMatch',
                    '🏷️ New Inventory Match!',
                    `New unit "${inventory.unitNo || inventory.unitNumber}" in "${inventory.projectName}" matches lead ${lead.firstName}.`,
                    `/inventory/${inventory._id}`,
                    { inventoryId: inventory._id, leadId: lead._id }
                ).catch(() => {});
            }
        }
    } catch (err) {
        console.error('[InventoryMatch] Notification failed:', err.message);
    }
};

export const addInventory = async (req, res) => {
    try {
        const { projectName, block, unitNo, unitNumber } = req.body;
        const finalUnitNo = unitNo || unitNumber;

        if (projectName && block && finalUnitNo) {
            const existing = await Inventory.findOne({
                projectName,
                block,
                $or: [{ unitNo: finalUnitNo }, { unitNumber: finalUnitNo }]
            });

            if (existing) {
                return res.status(400).json({ success: false, error: "Duplicate Inventory: This Unit already exists in this Project/Block." });
            }
        }

        const data = sanitizePayload({ ...req.body });
        
        // 🔒 Enterprise Isolation: Auto-tag with creator's department and teams
        if (req.user) {
            if (req.user.department && !data.department) data.department = req.user.department;
            if (req.user.teams && req.user.teams.length > 0 && (!data.teams || data.teams.length === 0)) {
                data.teams = req.user.teams.map(t => t._id || t);
            }
        }

        // Resolve Reference Fields to prevent CastErrors
        if (data.category !== undefined) data.category = await resolveLookup('Category', data.category, false);
        if (data.subCategory !== undefined) data.subCategory = await resolveLookup('SubCategory', data.subCategory, false);
        if (data.unitType !== undefined) data.unitType = await resolveLookup('UnitType', data.unitType, false);
        if (data.status !== undefined) data.status = await resolveLookup('Status', data.status, false); else if (!data.status) data.status = await resolveLookup('Status', 'Inactive', false);
        if (data.facing !== undefined) data.facing = await resolveLookup('Facing', data.facing, false);
        if (data.direction !== undefined) data.direction = await resolveLookup('Direction', data.direction, false);
        if (data.orientation !== undefined) data.orientation = await resolveLookup('Orientation', data.orientation, false);
        if (data.intent !== undefined) data.intent = await resolveLookup('Intent', data.intent, false);
        if (data.builtupType !== undefined) data.builtupType = await resolveLookup('BuiltupType', data.builtupType, false);
        if (data.assignedTo) data.assignedTo = await resolveUser(data.assignedTo);
        if (data.teams) data.teams = await resolveTeam(data.teams);
        else if (data.team) data.team = await resolveTeam(data.team);

        if (data.owners) data.owners = sanitizeIds(data.owners);
        if (data.associates) {
            data.associates = data.associates.map(assoc => {
                if (typeof assoc === 'string') return { contact: assoc };
                if (assoc.id || assoc.contact) {
                    return {
                        contact: assoc.contact || assoc.id,
                        relationship: assoc.relationship
                    };
                }
                return assoc;
            });
        }

        let inventory = await Inventory.create(data);

        // Trigger Sync if documents were provided during creation
        if (data.inventoryDocuments && Array.isArray(data.inventoryDocuments)) {
            const metadata = {
                projectName: inventory.projectName,
                block: inventory.block,
                unitNumber: inventory.unitNo || inventory.unitNumber
            };
            await syncDocumentsToContact(data.inventoryDocuments, metadata);
        }

        inventory = await inventory.populate(populateFields);
        
        // 🌟 Trigger Match Notification
        if (inventory.status?.lookup_value !== 'Sold Out') {
            notifyMatchingLeads(inventory);
        }

        res.status(201).json({ success: true, data: inventory });

    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const updateInventory = async (req, res) => {
    try {
        console.log(`[DEBUG] updateInventory req.body:`, JSON.stringify(req.body, null, 2));
        console.log(`[DEBUG] updateInventory for ID: ${req.params.id}`);
        const data = sanitizePayload({ ...req.body });
        console.log(`[DEBUG] Payload keys: ${Object.keys(data).join(', ')}`);

        // Resolve Reference Fields to prevent CastErrors (Let model hooks handle the heavy lifting)
        if (data.assignedTo) data.assignedTo = await resolveUser(data.assignedTo);
        if (data.teams) data.teams = await resolveTeam(data.teams);
        else if (data.team) data.team = await resolveTeam(data.team);

        if (data.owners) data.owners = sanitizeIds(data.owners);

        // 🌟 SENIOR HARDENING: Resolve categorical fields BEFORE update to prevent populate-stage CastErrors
        const categoricalFields = [
            { field: 'category', type: 'Category' },
            { field: 'subCategory', type: 'SubCategory' },
            { field: 'status', type: 'Status' },
            { field: 'unitType', type: 'UnitType' },
            { field: 'facing', type: 'Facing' },
            { field: 'direction', type: 'Direction' },
            { field: 'orientation', type: 'Orientation' },
            { field: 'sizeConfig', type: 'Size' },
            { field: 'roadWidth', type: 'RoadWidth' },
            { field: 'builtupType', type: 'BuiltupType' }
        ];

        for (const { field, type } of categoricalFields) {
            if (data[field] !== undefined) {
                // If it's a populated object, extract ID
                if (typeof data[field] === 'object' && data[field] !== null && data[field]._id) {
                    data[field] = data[field]._id;
                }
                // If it's a string that is NOT a 24-char hex ID, resolve it via Lookup
                const isStrictId = typeof data[field] === 'string' && /^[0-9a-fA-F]{24}$/.test(data[field]);
                if (data[field] && !isStrictId) {
                    data[field] = await resolveLookup(type, data[field], true);
                }
            }
        }
        
        // 🚀 [MEDIA ENGINE] Handle 'media' field from mobile clients for strict schema compatibility
        if (data.media && Array.isArray(data.media)) {
            console.log(`[DIAGNOSTIC] 📁 Processing ${data.media.length} media items from mobile upload...`);
            
            // Map incoming generic media to specific schema arrays
            const images = data.media.filter(m => m.url && (m.url.match(/\.(jpg|jpeg|png|webp|gif)$/i) || m.type?.startsWith('image')));
            const videos = data.media.filter(m => m.url && (m.url.match(/\.(mp4|mov|wmv|avi)$/i) || m.type?.startsWith('video')));
            const docs = data.media.filter(m => m.url && !images.includes(m) && !videos.includes(m));

            if (images.length > 0) data.inventoryImages = images.map(i => ({ title: i.title || 'Image', url: i.url, category: i.category || 'General' }));
            if (videos.length > 0) data.inventoryVideos = videos.map(v => ({ title: v.title || 'Video', url: v.url, type: v.type || 'Video' }));
            if (docs.length > 0) data.inventoryDocuments = docs.map(d => ({ documentName: d.title || d.documentName || 'Document', url: d.url, documentType: d.type || 'Other' }));

            // Clean up mobile-specific field to avoid strict schema warnings
            delete data.media;
        }

        if (data.associates) {
            data.associates = data.associates.map(assoc => {
                if (typeof assoc === 'string') return { contact: assoc };
                if (assoc.id || assoc.contact) {
                    return {
                        contact: assoc.contact || assoc.id,
                        relationship: assoc.relationship
                    };
                }
                return assoc;
            });
        }

        if (data.interactions && Array.isArray(data.interactions)) {
            // Push interactions to history
            const historyToPush = data.interactions.map(interaction => ({
                date: interaction.date || new Date(),
                author: req.user?._id || data.assignedTo || null,
                actor: interaction.actor || (req.user ? (req.user.fullName || req.user.name) : null),
                type: 'Feedback',
                note: interaction.note,
                details: interaction.details
            }));
            data.$push = { history: { $each: historyToPush } };
            delete data.interactions;
        }

        const visibilityFilter = await getVisibilityFilter(req.user);
        const inventory = await Inventory.findOneAndUpdate({ _id: req.params.id, ...visibilityFilter }, data, {
            new: true,
            runValidators: false, // Mixed-type fields (status, category) cast via pre-hook, not validators
        }).populate([
            { path: "owners", select: "name phones" },
            { path: "associates.contact", select: "name phones" },
            { path: "projectId" },
            { path: "assignedTo", select: "fullName" },
            { path: "history.author", select: "fullName name" }
        ]);

        if (!inventory) {
            return res.status(404).json({ success: false, error: "Inventory item not found" });
        }

        // Trigger Sync if documents were updated
        if (data.inventoryDocuments && Array.isArray(data.inventoryDocuments)) {
            const metadata = {
                projectName: inventory.projectName,
                block: inventory.block,
                unitNumber: inventory.unitNo || inventory.unitNumber
            };
            await syncDocumentsToContact(data.inventoryDocuments, metadata);
        }

        if (!inventory) {
            console.warn(`[DEBUG] Inventory not found: ${req.params.id}`);
            return res.status(404).json({ success: false, error: "Inventory item not found" });
        }

        console.log(`[DEBUG] updateInventory SUCCESS for ID: ${req.params.id}`);
        res.status(200).json({ success: true, data: inventory });
    } catch (error) {
        console.error(`[DEBUG] updateInventory ERROR for ID ${req.params.id}:`, error);
        res.status(400).json({ 
            success: false, 
            error: error.message,
            validationErrors: error.errors ? Object.keys(error.errors) : undefined
        });
    }
};

export const deleteInventory = async (req, res) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const inventory = await Inventory.findOneAndDelete({ _id: req.params.id, ...visibilityFilter });

        if (!inventory) {
            return res.status(404).json({ success: false, error: "Inventory item not found" });
        }

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const bulkDeleteInventory = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, error: "Invalid IDs provided" });
        }
        await Inventory.deleteMany({ _id: { $in: ids } });
        res.status(200).json({ success: true, message: `${ids.length} items deleted successfully` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const matchInventory = async (req, res) => {
    try {
        const { inventoryId, leadId } = req.query;

        // Case 1: Find matching leads for a specific property
        if (inventoryId) {
            const inventory = await Inventory.findById(inventoryId).lean();
            if (!inventory) {
                return res.status(404).json({ success: false, error: "Inventory not found" });
            }

            const queryConditions = [];

            // Safe Project match
            if (inventory.projectId && mongoose.Types.ObjectId.isValid(inventory.projectId)) {
                queryConditions.push({ project: inventory.projectId });
            }
            if (inventory.projectName) {
                // Also search in projectName array or string fields in Lead if applicable
                // Lead.project is an ObjectId, so we can't query it with a string name directly
                // unless the Lead model has a projectName field (it does: Lead.projectName [String])
                queryConditions.push({ projectName: inventory.projectName });
            }

            // Safe Category/Requirement match
            if (inventory.category && mongoose.Types.ObjectId.isValid(inventory.category)) {
                queryConditions.push({ requirement: inventory.category });
            }
            // If it's a string name, we might need to find the Lookup ID first or skip

            // Safe Sub-Category match
            if (inventory.subCategory && mongoose.Types.ObjectId.isValid(inventory.subCategory)) {
                queryConditions.push({ subRequirement: inventory.subCategory });
            }

            if (queryConditions.length === 0) {
                return res.status(200).json({ success: true, count: 0, data: [] });
            }

            const leads = await Lead.find({ $or: queryConditions })
                .populate('contactDetails')
                .limit(50)
                .sort({ updatedAt: -1 })
                .lean();
            const interestedLeadsCount = await Lead.countDocuments({ interestedInventory: inventoryId });
            return res.status(200).json({ success: true, count: leads.length, data: leads, interestedCount: interestedLeadsCount });
        }

        // Case 2: Find matching inventory for a specific lead (Original placeholder intent)
        if (leadId) {
            const lead = await Lead.findById(leadId).lean();
            if (!lead) {
                return res.status(404).json({ success: false, error: "Lead not found" });
            }

            const query = {
                $or: []
            };
            if (lead.project) query.$or.push({ projectId: lead.project }, { projectName: lead.project });
            if (lead.requirement) query.$or.push({ category: lead.requirement });

            // Advanced matching based on property type and geography
            if (lead.propertyType && Array.isArray(lead.propertyType) && lead.propertyType.length > 0) {
                query.$or.push({ category: { $in: lead.propertyType } });
            }
            if (lead.location) {
                query.$or.push({ "address.locality": lead.location });
                query.$or.push({ "address.area": lead.location });
                query.$or.push({ "address.city": lead.location });
            }

            if (query.$or.length === 0) return res.status(200).json({ success: true, data: [] });

            const inventories = await Inventory.find(query).limit(50).sort({ createdAt: -1 }).lean();
            return res.status(200).json({ success: true, count: inventories.length, data: inventories });
        }

        res.status(400).json({ success: false, error: "Either inventoryId or leadId is required" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


// Helper to resolve lookup (Find or Create)
// Optimized with in-memory cache for bulk operations
const lookupCache = new Map(); // Key: "type:value" -> ID
const userCache = new Map();   // Key: identifier -> ID
const teamCache = new Map();   // Key: identifier -> ID
const contactCache = new Map(); // Key: identifier -> ID

const resolveLookup = async (type, value, createIfMissing = true) => {
    if (!value) return null;

    // Handle array or comma-separated string (for multi-intents)
    if (Array.isArray(value)) {
        return await Promise.all(value.map(val => resolveLookup(type, val, createIfMissing)));
    }
    if (typeof value === 'string' && value.includes(',')) {
        return await resolveLookup(type, value.split(',').map(v => v.trim()).filter(Boolean), createIfMissing);
    }

    if (!value) return null;
    const cleanValue = String(value).trim();

    // Protect against Excel Scientific Notation (e.g., 6.98e+23)
    if (cleanValue.toLowerCase().includes('e+') && cleanValue.length < 15) {
        console.warn(`[resolveLookup] Detected possible Excel corruption for ${type}: ${cleanValue}`);
        return null;
    }

    if (mongoose.Types.ObjectId.isValid(cleanValue)) return new mongoose.Types.ObjectId(cleanValue);

    const cacheKey = `${type}:${cleanValue.toLowerCase()}`;
    if (lookupCache.has(cacheKey)) return lookupCache.get(cacheKey);

    const escapedValue = escapeRegExp(value);
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
    
    if (!lookup) {
        if (!createIfMissing) {
            console.log(`[STRICT] Lookup not found for type '${type}' and value '${value}'. Auto-creation disabled.`);
            return null;
        }
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }

    lookupCache.set(cacheKey, lookup._id);
    return lookup._id;
};

/**
 * Professional Resolver for Size Labels
 * Matches by Project and Block to ensure correct configuration is picked
 */
export const resolveSizeLookup = async (value, projectName, blockName, categoryName, subCategoryName) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) {
        const lookup = await Lookup.findById(value).lean();
        return { id: value, metadata: lookup?.metadata };
    }

    const escapedValue = escapeRegExp(value);
    const query = {
        lookup_type: 'Size',
        lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') }
    };

    // If multiple matches exist, prioritize by Project, Block, Category and Sub-Category
    const lookups = await Lookup.find(query).lean();
    if (lookups.length === 0) {
        const newLookup = await Lookup.create({ lookup_type: 'Size', lookup_value: value });
        return { id: newLookup._id, metadata: null };
    }

    if (lookups.length === 1) return { id: lookups[0]._id, metadata: lookups[0].metadata };

    // Deep Context Matching: Prioritize by all constraints
    let matched = lookups.find(l =>
        l.metadata?.project?.toLowerCase() === projectName?.toLowerCase() &&
        l.metadata?.block?.toLowerCase() === blockName?.toLowerCase() &&
        l.metadata?.category?.toLowerCase() === categoryName?.toLowerCase() &&
        l.metadata?.subCategory?.toLowerCase() === subCategoryName?.toLowerCase()
    );

    if (!matched) {
        // Fallback 1: Project + Category + SubCategory
        matched = lookups.find(l => 
            l.metadata?.project?.toLowerCase() === projectName?.toLowerCase() &&
            l.metadata?.category?.toLowerCase() === categoryName?.toLowerCase() &&
            l.metadata?.subCategory?.toLowerCase() === subCategoryName?.toLowerCase()
        );
    }

    if (!matched) {
        // Fallback 2: Project only
        matched = lookups.find(l => l.metadata?.project?.toLowerCase() === projectName?.toLowerCase());
    }

    const final = matched || lookups[0];
    return { id: final._id, metadata: final.metadata };
};

// Helper to resolve User (By Name or Email)
const resolveUser = async (identifier) => {
    if (!identifier) return null;
    const cacheKey = String(identifier).toLowerCase();
    if (userCache.has(cacheKey)) return userCache.get(cacheKey);

    if (mongoose.Types.ObjectId.isValid(identifier)) {
        const id = new mongoose.Types.ObjectId(identifier.toString());
        userCache.set(cacheKey, id);
        return id;
    }

    const escapedIdentifier = escapeRegExp(identifier);
    const user = await User.findOne({
        $or: [
            { fullName: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } },
            { email: identifier.toLowerCase() },
            { name: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } }
        ]
    }).select('_id').lean();
    
    const resultId = user ? user._id : null;
    if (resultId) userCache.set(cacheKey, resultId);
    return resultId;
};

// Helper to resolve Team (By Name or ID)
const resolveTeam = async (identifier) => {
    if (!identifier) return null;
    
    // Handle array of teams
    if (Array.isArray(identifier)) {
        return await Promise.all(identifier.map(id => resolveTeam(id)));
    }

    const cacheKey = String(identifier).toLowerCase();
    if (teamCache.has(cacheKey)) return teamCache.get(cacheKey);

    if (mongoose.Types.ObjectId.isValid(identifier)) {
        const id = new mongoose.Types.ObjectId(identifier.toString());
        teamCache.set(cacheKey, id);
        return id;
    }

    const escapedIdentifier = escapeRegExp(identifier);
    const team = await Team.findOne({
        name: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') }
    }).select('_id').lean();
    
    const resultId = team ? team._id : null;
    if (resultId) teamCache.set(cacheKey, resultId);
    return resultId;
};


/**
 * @desc    Bulk import inventory
 * @route   POST /inventory/import
 * @access  Private
 */
export const importInventory = async (req, res) => {
    try {
        const { data, teams: bodyTeams } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, error: "Invalid data provided" });
        }

        // Professional Multi-Team Support: Resolve teams from body or individual items
        const globalTeams = Array.isArray(bodyTeams) ? bodyTeams : (bodyTeams ? [bodyTeams] : []);

        console.log(`[IMPORT] Received ${data.length} items for import`);
        
        // Clear cache for a fresh import session
        lookupCache.clear();
        userCache.clear();
        teamCache.clear();
        contactCache.clear();

        // Fetch property sizes from Lookups for auto-populating area details
        const sizeLookups = await Lookup.find({ lookup_type: 'Size' }).lean();
        const systemSizes = sizeLookups.map(l => ({
            name: l.lookup_value,
            id: l._id,
            ...l.metadata
        }));

        const restructuredData = [];
        const errors = [];

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            
            // DIAGNOSTIC SPY: Capture raw structure for first 3 records
            if (i < 3) {
                try {
                    const fs = await import('fs');
                    const diagPath = './import_diag.json';
                    const diagData = {
                        timestamp: new Date().toISOString(),
                        itemKeys: Object.keys(item),
                        itemData: item
                    };
                    fs.appendFileSync(diagPath, JSON.stringify(diagData, null, 2) + "\n---\n");
                    console.log(`[DIAGNOSTIC] Data captured to ${diagPath}`);
                } catch (e) { console.error('Diag failed', e); }
            }

            try {
                const rawPincode = item.pinCode || item.pincode || item['Pincode'] || item['Pin Code'] || item['PinCode'] || item.zipCode || item.zip || item['Zip Code'] || item['Zip'] || item['Postal Code'] || item['PostalCode'] || item['Loc Zip'] || item.locZip;
                const rawLocality = item.locality || item['Locality'] || item.area || item['Area'] || item.location || item['Location'] || item.locArea || item['Loc Area'];

                const result = {
                    projectName: item.projectName || item.project || item['Project Name'],
                    projectId: item.projectId,
                    block: item.block || item.sector || item['Block'] || item['Sector'],
                    unitNo: item.unitNo || item.unitNumber || item['Unit No'] || item['Unit Number'],
                    unitNumber: item.unitNo || item.unitNumber || item['Unit No'] || item['Unit Number'],
                    builtupType: await resolveLookup('BuiltupType', item.builtupType || item['Builtup Type'], true),

                    price: {
                        value: parseFloat(item.price || item.cost || item['Price'] || 0),
                        currency: 'INR'
                    },
                    rentPrice: {
                        value: parseFloat(item.rentPrice || item.rent || item['Rent'] || 0),
                        currency: 'INR'
                    },
                    size: {
                        value: parseFloat(item.size || item.plotArea || item['Size'] || item['Plot Area'] || 0),
                        unit: item.sizeUnit || item.unit || item['Size Unit'] || 'Sq.Ft.'
                    },
                    sizeUnit: item.sizeUnit || item.unit || item['Size Unit'] || 'Sq.Ft.',
                    builtUpArea: {
                        value: parseFloat(item.builtUpArea || item.builtup_area || item['Builtup Area'] || item['Covered Area'] || 0),
                        unit: item.sizeUnit || item.unit || item['Size Unit'] || 'Sq.Ft.'
                    },
                    carpetArea: {
                        value: parseFloat(item.carpetArea || item.carpet_area || item['Carpet Area'] || 0),
                        unit: item.sizeUnit || item.unit || item['Size Unit'] || 'Sq.Ft.'
                    },
                    totalSaleableArea: {
                        value: parseFloat(item.totalSaleableArea || item.saleableArea || item.total_saleable_area || item['Total Saleable Area'] || 0),
                        unit: item.sizeUnit || item.unit || item['Size Unit'] || 'Sq.Ft.'
                    },
                    length: parseFloat(item.length || item.plotLength || item['Length'] || item['Plot Length'] || 0),
                    width: parseFloat(item.width || item.plotWidth || item['Width'] || item['Plot Width'] || 0),
                    floor: item.floor || item['Floor'],
                    ownership: item.ownership || item['Ownership'],

                    address: {
                        hNo: item.hNo || item['H No'],
                        street: item.street || item['Street'],
                        locality: await resolveLookup('Location', rawLocality, true),
                        area: await resolveLookup('Area', rawLocality, true),
                        location: await resolveLookup('Location', rawLocality, true),
                        city: await resolveLookup('City', item.city || item['City'] || item['City Name'], true),
                        tehsil: await resolveLookup('Tehsil', item.tehsil || item['Tehsil'], true),
                        postOffice: item.postOffice || item['Post Office'],
                        pincode: await resolveLookup('Pincode', rawPincode, true),
                        state: await resolveLookup('State', item.state || item['State'], true),
                        country: item.country || item['Country'] || 'India'
                    },
                    
                    locArea: await resolveLookup('Location', rawLocality, true),
                    locZip: await resolveLookup('Pincode', rawPincode, true),
                    locSector: item.block || item.sector || item['Block'] || item['Sector'],
                    latitude: item.lat || item.latitude || item['Latitude'],
                    longitude: item.lng || item.longitude || item['Longitude'],

                    ownerName: item.ownerName || item['Owner Name'],
                    ownerPhone: item.ownerPhone || item['Owner Phone'],
                    ownerEmail: item.ownerEmail || item['Owner Email'],
                    ownerAddress: item.ownerAddress || item['Owner Address'],

                    teams: await resolveTeam(item.teams || globalTeams),
                    team: await resolveTeam(item.team || item['Team'] || (globalTeams.length > 0 ? globalTeams[0] : null)),
                    visibleTo: item.visibleTo || item['Visible To'] || 'Everyone'
                };

                result.category = await resolveLookup('Category', item.category || item.type || item['Category'] || item['Property Category'], false);
                result.subCategory = await resolveLookup('SubCategory', item.subCategory || item['SubCategory'] || item['Property Category'], false);
                result.unitType = await resolveLookup('UnitType', item.unitType || item['Unit Type'], false);

                const sizeResult = await resolveSizeLookup(
                    item.sizeLabel || item.sizeConfig || item['Size Label'] || item['Size Label*'],
                    result.projectName,
                    result.block,
                    item.category || item['Category'],
                    item.subCategory || item['Sub Category']
                );
                result.sizeConfig = sizeResult?.id;
                result.status = await resolveLookup('Status', item.status || item['Status'] || 'Inactive', false);

                if (sizeResult?.metadata) {
                    const meta = sizeResult.metadata;
                    if (!result.length && meta.length) result.length = parseFloat(meta.length);
                    if (!result.width && meta.width) result.width = parseFloat(meta.width);
                    if (result.size.value === 0 && meta.area) { // Using meta.area from Size lookup
                        result.size.value = parseFloat(meta.area);
                        result.size.unit = meta.areaMetrics || result.sizeUnit;
                    }
                }
                
                result.facing = await resolveLookup('Facing', item.facing || item['Facing'] || item['Orientation']);
                result.direction = await resolveLookup('Direction', item.direction || item['Direction'] || item['Orientation']);
                result.orientation = await resolveLookup('Orientation', item.orientation || item['Orientation']);
                result.roadWidth = await resolveLookup('RoadWidth', item.roadWidth || item['Road Width'] || item['RoadWidth']);
                result.intent = await resolveLookup('Intent', item.intent || item['Intent']);

                result.assignedTo = await resolveUser(item.assignedTo);

                if (item.ownerName || item.ownerPhone || item.ownerEmail) {
                    try {
                        const contactKey = `${item.ownerName || ''}:${item.ownerPhone || ''}:${item.ownerEmail || ''}`.toLowerCase();
                        let contact = null;

                        if (contactCache.has(contactKey)) {
                            contact = { _id: contactCache.get(contactKey) };
                        } else {
                            const query = [];
                            if (item.ownerPhone) query.push({ 'phones.number': item.ownerPhone });
                            if (item.ownerEmail) query.push({ 'emails.address': item.ownerEmail.toLowerCase() });

                            if (query.length > 0) {
                                contact = await Contact.findOne({ $or: query }).select('_id name').lean();
                            }
                            if (!contact && item.ownerName) {
                                contact = await Contact.findOne({ name: { $regex: new RegExp(`^${escapeRegExp(item.ownerName)}$`, 'i') } }).select('_id name').lean();
                            }

                            if (!contact) {
                                const newContactData = {
                                    name: item.ownerName || 'Unknown Owner',
                                    phones: item.ownerPhone ? [{ number: item.ownerPhone, type: 'Personal' }] : [],
                                    emails: item.ownerEmail ? [{ address: item.ownerEmail, type: 'Personal' }] : [],
                                    source: await resolveLookup('Source', 'Data Import')
                                };
                                contact = await Contact.create(newContactData);
                            }
                            contactCache.set(contactKey, contact._id);
                        }

                        result.owners = [contact._id];
                    } catch (err) {
                        console.error(`[IMPORT] Error linking owner for item index ${i}:`, err);
                    }
                }

                if (item.sizeLabel) {
                    result.sizeLabel = item.sizeLabel;
                    const currentProjectName = result.projectName;
                    const matchedSize = systemSizes.find(s =>
                        s.name === item.sizeLabel &&
                        (s.project === currentProjectName || s.project === 'Global')
                    );

                    if (matchedSize) {
                        if (matchedSize.unitType) result.unitType = await resolveLookup('Size', matchedSize.unitType);
                        result.builtUpArea = matchedSize.coveredArea || matchedSize.saleableArea; 
                        result.carpetArea = matchedSize.carpetArea;
                        result.superArea = matchedSize.saleableArea || matchedSize.totalArea;
                        if (matchedSize.category) result.category = await resolveLookup('Category', matchedSize.category);
                        if (matchedSize.subCategory) result.subCategory = await resolveLookup('SubCategory', matchedSize.subCategory);

                        if (matchedSize.totalArea) {
                            result.size = {
                                value: parseFloat(matchedSize.totalArea),
                                unit: matchedSize.resultMetric
                            };
                            result.sizeUnit = matchedSize.resultMetric;
                            result.dimensions = `${matchedSize.width || ''} x ${matchedSize.length || ''}`;
                        }
                    }
                }

                restructuredData.push(result);
                if (i % 10 === 0) console.log(`[IMPORT] Processed ${i}/${data.length} items`);
            } catch (itemErr) {
                console.error(`[IMPORT] Critical error in item restructuring at index ${i}:`, itemErr);
                errors.push({
                    row: i + 1,
                    name: item.unitNo || item.unitNumber || `Row ${i + 1}`,
                    reason: itemErr.message
                });
            }
        }

        console.log(`[IMPORT] Restructuring complete. Preparing bulk operations for ${restructuredData.length} documents...`);

        if (restructuredData.length === 0) {
             return res.status(400).json({ success: false, message: "No valid data to import", errors });
        }

        const bulkOps = restructuredData.map(item => ({
            updateOne: {
                filter: {
                    projectName: item.projectName,
                    block: item.block,
                    $or: [
                        { unitNo: item.unitNo },
                        { unitNumber: item.unitNo }
                    ]
                },
                update: { $set: item },
                upsert: true
            }
        }));

        const bulkResult = await Inventory.bulkWrite(bulkOps, { ordered: false });

        const successCount = (bulkResult.upsertedCount || 0) + (bulkResult.modifiedCount || 0);
        const newCount = bulkResult.upsertedCount || 0;
        const updatedCount = bulkResult.modifiedCount || 0;

        // GENERATE SUCCESS LOGS FOR ENTERPRISE AUDIT REPORT
        const successLogs = restructuredData.map(item => ({
            unitNo: item.unitNo,
            project: item.projectName,
            block: item.block,
            status: 'Processed' // Since bulkWrite doesn't map counts back to specific items easily
        }));

        console.log(`[IMPORT] Bulk write complete. New: ${newCount}, Updated: ${updatedCount}`);

        res.status(200).json({
            success: true,
            message: `Import complete: ${newCount} added, ${updatedCount} updated. ${errors.length > 0 ? errors.length + ' failed.' : ''}`,
            successCount: successCount,
            newCount,
            updatedCount,
            errorCount: errors.length,
            errors,
            successLogs // ENTERPRISE AUDIT DATA
        });
    } catch (error) {
        console.error("Inventory Import Fatal Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Check for duplicate inventory by unitNo and project
 * @route   POST /inventory/check-duplicates
 * @access  Private
 */
export const checkDuplicatesImport = async (req, res) => {
    try {
        const { items } = req.body; // Array of { unitNo, projectId, projectName, block }
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ success: false, error: "Invalid items provided" });
        }

        // Fetch active rules for Inventory from settings
        const inventoryRules = await DuplicationRule.find({
            entityType: 'Inventory',
            isActive: true
        }).lean();

        // Default: If no rules, check UnitNo + (Project + Block)
        const queryItems = items.map(item => {
            const conditions = [];

            // Standard real-estate identity: Project + Block + Unit
            const identityMatch = {
                $and: [
                    { $or: [{ unitNo: item.unitNo }, { unitNumber: item.unitNo }] },
                    { $or: [{ projectId: item.projectId }, { projectName: item.projectName || item.project }] },
                    { block: item.block }
                ]
            };
            conditions.push(identityMatch);

            // Add custom rules if defined in settings
            inventoryRules.forEach(rule => {
                const ruleFieldQueries = rule.fields.map(field => {
                    const value = item[field];
                    if (!value) return null;
                    return { [field]: value };
                }).filter(Boolean);

                if (ruleFieldQueries.length > 0) {
                    conditions.push(rule.matchType === 'all'
                        ? { $and: ruleFieldQueries }
                        : { $or: ruleFieldQueries }
                    );
                }
            });

            return { $or: conditions };
        });

        const query = { $or: queryItems };
        const duplicates = await Inventory.find(query, 'unitNo unitNumber projectId projectName block').lean();

        res.status(200).json({
            success: true,
            duplicates: duplicates.map(d => ({
                unitNo: d.unitNo || d.unitNumber,
                projectId: d.projectId,
                projectName: d.projectName,
                block: d.block
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Bulk update property owners and associates
 * @route   POST /inventory/bulk-update-owners
 * @access  Private
 */
export const bulkUpdatePropertyOwners = async (req, res) => {
    try {
        const { data, dryRun = false, resolutions = {}, defaultAssignedTo, defaultVisibleTo, teams } = req.body;
        const defaultTeam = Array.isArray(teams) ? teams[0] : teams; // Primary team for assignment
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, error: "Invalid data provided" });
        }

        console.log(`[BULK OWNER UPDATE] ${dryRun ? '[DRY RUN] ' : ''}Processing ${data.length} records`);

        const results = {
            total: data.length,
            inventoryMatched: 0,
            inventoryNotFound: 0,
            contactsCreated: 0,
            contactsFound: 0,
            noMobileCount: 0,
            conflicts: [], // 🛡️ ENTERPRISE: Structured conflicts for UI resolution
            errors: []
        };

        const contactCache = new Map();

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const {
                projectName, block, unitNo,
                ownerName, ownerMobile, ownerEmail,
                associateName, associateMobile, associateEmail, relationship,
                team, assignedTo, visibleTo,
                ownerHNo, ownerStreet, ownerLocality, ownerArea, ownerCity, ownerState, ownerPinCode
            } = row;

            // Resolve assignment hierarchy: CSV Row > Global Default
            const rowAssignedTo = assignedTo || defaultAssignedTo;
            const rowTeam = team || defaultTeam;
            const rowVisibleTo = visibleTo || defaultVisibleTo || 'Everyone';

            // Row Identifier for resolutions
            const rowKey = `row_${i}`;

            try {
                // 1. Find Inventory Record
                const inventory = await Inventory.findOne({
                    projectName: { $regex: new RegExp(`^${escapeRegExp(projectName)}$`, 'i') },
                    block: { $regex: new RegExp(`^${escapeRegExp(block)}$`, 'i') },
                    $or: [
                        { unitNo: { $regex: new RegExp(`^${escapeRegExp(unitNo)}$`, 'i') } },
                        { unitNumber: { $regex: new RegExp(`^${escapeRegExp(unitNo)}$`, 'i') } }
                    ]
                });

                if (!inventory) {
                    results.inventoryNotFound++;
                    results.errors.push({ row: i + 1, item: unitNo, reason: `Inventory not found.` });
                    continue;
                }

                results.inventoryMatched++;

                const updates = {};

                // Structured Address Object
                const personalAddress = {
                    hNo: ownerHNo || '',
                    street: ownerStreet || '',
                    location: ownerLocality || '',
                    area: ownerArea || '',
                    city: ownerCity || '',
                    state: ownerState || '',
                    pincode: ownerPinCode || ''
                };

                const commonSource = await resolveLookup('Source', 'Unified Import Center');

                // 2. Resolve/Create Owner (With Legal Identity & Assignment)
                if (ownerMobile || ownerName) {
                    let ownerId = null;
                    const mobile = String(ownerMobile || '').trim();
                    const name = String(ownerName || '').trim();
                    const fatherName = String(row.fatherName || '').trim();

                    if (!mobile) results.noMobileCount++;

                    const resolution = resolutions[rowKey]?.owner; 

                    if (mobile && contactCache.has(mobile)) {
                        ownerId = contactCache.get(mobile);
                        results.contactsFound++;
                    } else {
                        let contactByMobile = mobile ? await Contact.findOne({ 'phones.number': { $regex: new RegExp(escapeRegExp(mobile), 'i') } }) : null;
                        
                        // Legal Matching: Name + Father Name
                        let contactByLegal = null;
                        if (name && fatherName) {
                            contactByLegal = await Contact.findOne({ 
                                name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') },
                                fatherName: { $regex: new RegExp(`^${escapeRegExp(fatherName)}$`, 'i') }
                            });
                        }

                        const existingContact = contactByMobile || contactByLegal;

                        // CASE: Perfect Match
                        if (existingContact && (!mobile || (contactByMobile && contactByMobile._id.equals(existingContact._id)))) {
                            ownerId = existingContact._id;
                            results.contactsFound++;
                        }
                        // CASE: Conflict Detected (Name mismatch on same mobile)
                        else if (contactByMobile && contactByMobile.name.toLowerCase() !== name.toLowerCase()) {
                            if (dryRun) {
                                results.conflicts.push({
                                    row: i + 1,
                                    rowKey,
                                    type: 'owner',
                                    unitNo,
                                    providedName: name,
                                    providedFatherName: fatherName,
                                    existingName: contactByMobile.name,
                                    existingFatherName: contactByMobile.fatherName,
                                    mobile: mobile,
                                    reason: 'Name mismatch for existing mobile number.'
                                });
                                ownerId = "CONFLICT_PENDING";
                            } else {
                                if (resolution === 'UPDATE_SYSTEM') {
                                    contactByMobile.name = name;
                                    if (fatherName) contactByMobile.fatherName = fatherName;
                                    contactByMobile.personalAddress = personalAddress;
                                    await contactByMobile.save();
                                    ownerId = contactByMobile._id;
                                    results.contactsFound++;
                                } else if (resolution === 'KEEP_SYSTEM') {
                                    ownerId = contactByMobile._id;
                                    results.contactsFound++;
                                } else if (resolution === 'CREATE_NEW') {
                                    const newContact = await Contact.create({
                                        name: name || 'Unknown Owner',
                                        fatherName: fatherName,
                                        phones: mobile ? [{ number: mobile, type: 'Personal' }] : [],
                                        emails: ownerEmail ? [{ address: ownerEmail, type: 'Personal' }] : [],
                                        personalAddress: personalAddress,
                                        assignedTo: rowAssignedTo,
                                        owner: rowAssignedTo,
                                        team: rowTeam,
                                        visibleTo: rowVisibleTo,
                                        source: commonSource,
                                        tags: ['Property Owner']
                                    });
                                    ownerId = newContact._id;
                                    results.contactsCreated++;
                                }
                            }
                        }
                        // CASE: New Contact
                        else if (!existingContact) {
                            if (dryRun) {
                                ownerId = "SIMULATED_ID";
                            } else {
                                const newContact = await Contact.create({
                                    name: name || 'Unknown Owner',
                                    fatherName: fatherName,
                                    phones: mobile ? [{ number: mobile, type: 'Personal' }] : [],
                                    emails: ownerEmail ? [{ address: ownerEmail, type: 'Personal' }] : [],
                                    personalAddress: personalAddress,
                                    assignedTo: rowAssignedTo,
                                    owner: rowAssignedTo,
                                    team: rowTeam,
                                    visibleTo: rowVisibleTo,
                                    source: commonSource,
                                    tags: ['Property Owner']
                                });
                                ownerId = newContact._id;
                            }
                            results.contactsCreated++;
                        }

                        if (ownerId && ownerId !== "CONFLICT_PENDING" && mobile) contactCache.set(mobile, ownerId);
                    }

                    if (ownerId && ownerId !== "CONFLICT_PENDING" && !dryRun) {
                        const existingOwners = inventory.owners || [];
                        if (!existingOwners.some(id => id.toString() === ownerId.toString())) {
                            updates.owners = [...existingOwners, ownerId];
                        }
                    }
                }

                // 3. Resolve/Create Associate
                if (associateMobile || associateName) {
                    let associateId = null;
                    const mobile = String(associateMobile || '').trim();
                    const name = String(associateName || '').trim();

                    if (mobile && contactCache.has(mobile)) {
                        associateId = contactCache.get(mobile);
                    } else {
                        let contactByMobile = await Contact.findOne({ 'phones.number': { $regex: new RegExp(escapeRegExp(mobile), 'i') } });
                        if (contactByMobile) {
                            associateId = contactByMobile._id;
                        } else if (!dryRun) {
                            const newContact = await Contact.create({
                                name: name || 'Unknown Associate',
                                phones: mobile ? [{ number: mobile, type: 'Personal' }] : [],
                                emails: associateEmail ? [{ address: associateEmail, type: 'Personal' }] : [],
                                assignedTo: rowAssignedTo,
                                owner: rowAssignedTo,
                                team: rowTeam,
                                visibleTo: rowVisibleTo,
                                source: await resolveLookup('Source', 'Bulk Owner Update'),
                                tags: ['Family Member']
                            });
                            associateId = newContact._id;
                        } else {
                            associateId = "SIMULATED_ID";
                        }
                        if (associateId && mobile) contactCache.set(mobile, associateId);
                    }

                    if (associateId && associateId !== "SIMULATED_ID" && !dryRun) {
                        const existingAssociates = inventory.associates || [];
                        if (!existingAssociates.some(a => a.contact && a.contact.toString() === associateId.toString())) {
                            updates.associates = [...existingAssociates, { contact: associateId, relationship: relationship || 'Associate' }];
                        }
                    }
                }

                // 4. Save Updates (Inventory Assignment Persistence)
                if (!dryRun) {
                    // Update Inventory assignment to match owner for consistency
                    updates.assignedTo = rowAssignedTo;
                    updates.team = rowTeam;
                    updates.visibleTo = rowVisibleTo;

                    if (Object.keys(updates).length > 0) {
                        await Inventory.findByIdAndUpdate(inventory._id, { $set: updates });
                    }
                }

            } catch (itemErr) {
                results.errors.push({ row: i + 1, item: unitNo, reason: itemErr.message });
            }
        }

        res.status(200).json({
            success: true,
            message: dryRun ? 'Validation complete.' : 'Bulk update complete.',
            successCount: results.inventoryMatched,
            newCount: results.contactsCreated,
            updatedCount: results.contactsFound,
            noMobileCount: results.noMobileCount,
            conflictCount: results.conflicts.length,
            conflicts: results.conflicts,
            errors: results.errors
        });

    } catch (error) {
        console.error("Bulk Owner Update Fatal Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getUniqueBlocks = async (req, res) => {
    try {
        const { project } = req.query;
        if (!project) return res.status(200).json({ success: true, blocks: [] });
        
        // [SENIOR FIX] Use case-insensitive matching for project name to ensure data consistency
        const blocks = await Inventory.distinct("block", { 
            projectName: { $regex: new RegExp(`^${escapeRegExp(project)}$`, 'i') }, 
            block: { $ne: null, $exists: true } 
        });
        
        const sortedBlocks = blocks.filter(b => b && b.trim() !== "").sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        res.status(200).json({ success: true, blocks: sortedBlocks });
    } catch (error) {
        console.error("[GET_BLOCKS_ERROR]", error);
        res.status(500).json({ success: false, error: "Failed to fetch blocks" });
    }
};
