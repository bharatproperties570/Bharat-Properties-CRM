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
    { path: "category" },
    { path: "subCategory" },
    { path: "status" },
    { path: "unitType" },
    { path: "facing" },
    { path: "direction" },
    { path: "orientation" },
    { path: "sizeConfig" },
    { path: "roadWidth" },
    { path: "intent" },
    { path: "team", select: "name" },
    { path: "assignedTo", select: "fullName name team" },
    { path: "address.city" },
    { path: "address.tehsil" },
    { path: "address.state" },
    { path: "address.locality" },
    { path: "address.area" },
    { path: "address.location" },
    { path: "address.country" },
    { path: "address.postOffice" },
    { path: "builtupType" },
    { path: "team", select: "name" },
    { path: "teams", select: "name" }
];

export const getInventory = async (req, res) => {
    try {
        const { 
            page = 1, limit = 10, search = "", 
            category, subCategory, unitType, status, 
            project, block, location, area, contactId, 
            statusCategory, ownerPhone, feedbackOutcome, feedbackReason
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

        const unitTypeFilter = await resolveMultiFilter('Size', unitTypeReq);
        if (unitTypeFilter) query.unitType = unitTypeFilter;

        // [ORIENTATION FILTERS]
        const directionFilter = await resolveMultiFilter('Direction', req.query.direction || req.query['direction[]']);
        if (directionFilter) query.direction = directionFilter;

        const roadWidthFilter = await resolveMultiFilter('RoadWidth', req.query.roadWidth || req.query['roadWidth[]']);
        if (roadWidthFilter) query.roadWidth = roadWidthFilter;

        const facingFilter = await resolveMultiFilter('Facing', req.query.facing || req.query['facing[]']);
        if (facingFilter) query.facing = facingFilter;

        if (project) {
            const projectConditions = [
                { projectId: mongoose.Types.ObjectId.isValid(project) ? project : undefined },
                { projectName: project }
            ].filter(c => c.projectId || c.projectName);

            if (query.$or) {
                if (!query.$and) query.$and = [];
                query.$and.push({ $or: query.$or });
                query.$and.push({ $or: projectConditions });
                delete query.$or;
            } else {
                query.$or = projectConditions;
            }
        }

        // Only populate fields that are reliably ObjectIds (Contact references)
        // category, status, etc. in Inventory seem to be stored as objects or strings already
        const populateFields = [
            { path: "owners", select: "name phones" },
            { path: "associates.contact", select: "name phones" },
            { path: "projectId" },
            { path: "category" },
            { path: "subCategory" },
            { path: "status" },
            { path: "unitType" },
            { path: "facing" },
            { path: "direction" },
            { path: "orientation" },
            { path: "sizeConfig" },
            { path: "roadWidth" },
            { path: "team", select: "name" },
            { path: "assignedTo", select: "fullName" },
            { path: "address.city" },
            { path: "address.tehsil" },
            { path: "address.state" },
            { path: "address.locality" },
            { path: "address.area" },
            { path: "address.location" },
            { path: "builtupType" },
            { path: "team", select: "name" },
            { path: "teams", select: "name" }
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

        // Fetch paginated results
        // Collation removed to ensure compatibility with older MongoDB instances on live/AWS
        const results = await paginate(Inventory, query, Number(page), Number(limit), { unitNo: 1 }, populateFields);

        // Check for deals
        const inventoryIds = results.records.map(item => item._id);
        const deals = await Deal.find({ inventoryId: { $in: inventoryIds } }).select('inventoryId').lean();
        const dealInventoryIds = new Set(deals.map(d => d.inventoryId?.toString()).filter(Boolean));

        // [ROBUST FALLBACK] Manual population for IDs if paginate populate failed
        // This happens if ANY record has a bad ObjectId (like "") in the collection
        results.records = await Promise.all(results.records.map(async (item) => {
            const itemObj = item.toObject ? item.toObject() : item;
            
            // 1. Top level lookup fields
            const topFields = ['category', 'subCategory', 'status', 'unitType', 'facing', 'direction', 'orientation', 'sizeConfig', 'roadWidth', 'builtupType'];
            for (const field of topFields) {
                if (itemObj[field] && typeof itemObj[field] === 'string' && mongoose.Types.ObjectId.isValid(itemObj[field])) {
                    try {
                        const lookup = await Lookup.findById(itemObj[field]).select('lookup_value').lean();
                        if (lookup) itemObj[field] = lookup;
                    } catch (e) { /* ignore */ }
                }
            }

            // 2. Project fallback
            if (itemObj.projectId && typeof itemObj.projectId === 'string' && mongoose.Types.ObjectId.isValid(itemObj.projectId)) {
                try {
                    const projectDoc = await Project.findById(itemObj.projectId).select('name').lean();
                    if (projectDoc) itemObj.projectId = projectDoc;
                } catch (e) { /* ignore */ }
            }

            // 3. Address lookup fields
            if (itemObj.address) {
                const addrFields = ['city', 'location', 'locality', 'area', 'state', 'country', 'tehsil', 'postOffice'];
                for (const field of addrFields) {
                    if (itemObj.address[field] && typeof itemObj.address[field] === 'string' && mongoose.Types.ObjectId.isValid(itemObj.address[field])) {
                        try {
                            const lookup = await Lookup.findById(itemObj.address[field]).select('lookup_value').lean();
                            if (lookup) itemObj.address[field] = lookup;
                        } catch (e) { /* ignore */ }
                    }
                }
            }

            return {
                ...itemObj,
                hasDeal: dealInventoryIds.has(item._id.toString())
            };
        }));

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
            { field: 'unitType', type: 'Size' },
            { field: 'facing', type: 'Facing' },
            { field: 'direction', type: 'Direction' },
            { field: 'orientation', type: 'Orientation' },
            { field: 'intent', type: 'Intent' },
            { field: 'builtupType', type: 'BuiltupType' },
            { field: 'roadWidth', type: 'RoadWidth' }
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
                { field: 'locality', type: 'Area' },
                { field: 'area', type: 'Area' },
                { field: 'location', type: 'Area' }
            ];
            for (const { field, type } of addrFields) {
                let val = inventoryData.address[field];
                if (val && typeof val === 'string' && !mongoose.Types.ObjectId.isValid(val)) {
                    const lookup = await Lookup.findOne({ lookup_type: type, lookup_value: val }).lean();
                    inventoryData.address[field] = lookup || { lookup_value: val };
                } else if (val && mongoose.Types.ObjectId.isValid(val)) {
                    const lookup = await Lookup.findById(val).lean();
                    inventoryData.address[field] = lookup || { _id: val };
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
        if (typeof id === 'object' && id !== null && id.id) {
            return id.id;
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

        // Resolve Reference Fields to prevent CastErrors
        if (data.category !== undefined) data.category = await resolveLookup('Category', data.category, false);
        if (data.subCategory !== undefined) data.subCategory = await resolveLookup('SubCategory', data.subCategory, false);
        if (data.unitType !== undefined) data.unitType = await resolveLookup('Size', data.unitType, false);
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
        console.log(`[DEBUG] updateInventory for ID: ${req.params.id}`);
        const data = sanitizePayload({ ...req.body });
        console.log(`[DEBUG] Payload keys: ${Object.keys(data).join(', ')}`);

        // Resolve Reference Fields to prevent CastErrors (Let model hooks handle the heavy lifting)
        if (data.assignedTo) data.assignedTo = await resolveUser(data.assignedTo);
        if (data.teams) data.teams = await resolveTeam(data.teams);
        else if (data.team) data.team = await resolveTeam(data.team);

        if (data.owners) data.owners = sanitizeIds(data.owners);
        
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

        const inventory = await Inventory.findByIdAndUpdate(req.params.id, data, {
            new: true,
            runValidators: true,
        }).populate([
            { path: "owners", select: "name phones" },
            { path: "associates.contact", select: "name phones" },
            { path: "projectId" },
            { path: "category" },
            { path: "subCategory" },
            { path: "status" },
            { path: "unitType" },
            { path: "facing" },
            { path: "direction" },
            { path: "orientation" },
            { path: "sizeConfig" },
            { path: "roadWidth" },
            { path: "builtupType" },
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
        console.error(`[DEBUG] updateInventory ERROR: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
};

export const deleteInventory = async (req, res) => {
    try {
        const inventory = await Inventory.findByIdAndDelete(req.params.id);

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

    if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value.toString());

    const cacheKey = `${type}:${value.toLowerCase()}`;
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
export const resolveSizeLookup = async (value, projectName, blockName) => {
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

    // If multiple matches exist, prioritize by Project and Block
    const lookups = await Lookup.find(query).lean();
    if (lookups.length === 0) {
        const newLookup = await Lookup.create({ lookup_type: 'Size', lookup_value: value });
        return { id: newLookup._id, metadata: null };
    }

    if (lookups.length === 1) return { id: lookups[0]._id, metadata: lookups[0].metadata };

    // More than one match - filter by project/block
    let matched = lookups.find(l =>
        l.metadata?.project?.toLowerCase() === projectName?.toLowerCase() &&
        l.metadata?.block?.toLowerCase() === blockName?.toLowerCase()
    );

    if (!matched) {
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
            try {
                const result = {
                    projectName: item.projectName || item.project || item['Project Name'],
                    projectId: item.projectId,
                    unitNo: item.unitNo || item.unitNumber || item['Unit No'] || item['Unit No*'],
                    unitNumber: item.unitNo || item.unitNumber || item['Unit No'] || item['Unit No*'],
                    builtupType: await resolveLookup('BuiltupType', item.builtupType || item['Builtup Type'], true),

                    price: {
                        value: parseFloat(item.price || item.value || item['Price'] || item['Asking Price'] || 0),
                        currency: item.currency || 'INR'
                    },
                    totalCost: {
                        value: parseFloat(item.totalCost || item.total_cost || item['Total Cost'] || 0),
                        currency: item.currency || 'INR'
                    },
                    allInclusivePrice: {
                        value: parseFloat(item.allInclusivePrice || item.all_inclusive_price || item['All Inclusive Price'] || 0),
                        currency: item.currency || 'INR'
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
                    block: item.block || item['Block'],
                    ownership: item.ownership || item['Ownership'],

                    occupationDate: item.occupationDate || item['Occupation Date'],
                    possessionStatus: item.possessionStatus || item['Possession Status'],
                    furnishType: item.furnishType || item['Furnish Type'],
                    furnishedItems: item.furnishedItems || item['Furnished Items'],

                    address: {
                        hNo: item.hNo || item['H No'],
                        street: item.street || item['Street'],
                        locality: await resolveLookup('Area', item.locality || item['Locality'], true),
                        area: await resolveLookup('Area', item.area || item['Area'], true),
                        location: await resolveLookup('Area', item.location || item['Location'], true),
                        city: await resolveLookup('City', item.city || item['City'], true),
                        tehsil: await resolveLookup('Tehsil', item.tehsil || item['Tehsil'], true),
                        postOffice: item.postOffice || item['Post Office'],
                        pinCode: item.pinCode || item['Pin Code'] || item['Post Code'],
                        state: await resolveLookup('State', item.state || item['State'], true),
                        country: item.country || item['Country'] || 'India'
                    },
                    latitude: item.lat || item.latitude || item['Latitude'],
                    longitude: item.lng || item.longitude || item['Longitude'],

                    ownerName: item.ownerName || item['Owner Name'],
                    ownerPhone: item.ownerPhone || item['Owner Phone'],
                    ownerEmail: item.ownerEmail || item['Owner Email'],
                    ownerAddress: item.ownerAddress || item['Owner Address'],

                    teams: await resolveTeam(item.teams || globalTeams),
                    team: await resolveTeam(item.team || item['Team']),
                    visibleTo: item.visibleTo || item['Visible To'] || 'Everyone'
                };

                result.category = await resolveLookup('Category', item.category || item.type || item['Category'] || item['Property Category'], false);
                result.subCategory = await resolveLookup('SubCategory', item.subCategory || item['SubCategory'] || item['Property Category'], false);
                result.unitType = await resolveLookup('UnitType', item.unitType || item['Unit Type'], false);

                const sizeResult = await resolveSizeLookup(
                    item.sizeLabel || item.sizeConfig || item['Size Label'] || item['Size Label*'],
                    result.projectName,
                    result.block
                );
                result.sizeConfig = sizeResult?.id;
                result.status = await resolveLookup('Status', item.status || item['Status'] || 'Inactive', false);

                if (sizeResult?.metadata) {
                    const meta = sizeResult.metadata;
                    if (!result.length && meta.length) result.length = parseFloat(meta.length);
                    if (!result.width && meta.width) result.width = parseFloat(meta.width);
                    if (result.size.value === 0 && meta.totalArea) {
                        result.size.value = parseFloat(meta.totalArea);
                        result.size.unit = meta.resultMetric || result.sizeUnit;
                    }
                    if (result.totalSaleableArea.value === 0 && meta.saleableArea) result.totalSaleableArea.value = parseFloat(meta.saleableArea);
                    if (result.builtUpArea.value === 0 && meta.coveredArea) result.builtUpArea.value = parseFloat(meta.coveredArea);
                    if (result.carpetArea.value === 0 && meta.carpetArea) result.carpetArea.value = parseFloat(meta.carpetArea);
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
                if (i % 50 === 0) console.log(`[IMPORT] Processed ${i}/${data.length} items`);
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

        console.log(`[IMPORT] Bulk write complete. New: ${newCount}, Updated: ${updatedCount}`);

        res.status(200).json({
            success: true,
            message: `Import complete: ${newCount} added, ${updatedCount} updated. ${errors.length > 0 ? errors.length + ' failed.' : ''}`,
            successCount: successCount,
            newCount,
            updatedCount,
            errorCount: errors.length,
            errors
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
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, error: "Invalid data provided" });
        }

        console.log(`[BULK OWNER UPDATE] Processing ${data.length} records`);

        const results = {
            total: data.length,
            inventoryMatched: 0,
            inventoryNotFound: 0,
            contactsCreated: 0,
            contactsFound: 0,
            errors: []
        };

        // Cache for resolved contacts to avoid redundant DB hits within the same bulk job
        const contactCache = new Map(); // mobile -> contactId

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const {
                projectName, block, unitNo,
                ownerName, ownerMobile, ownerEmail,
                associateName, associateMobile, associateEmail, relationship
            } = row;

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
                    results.errors.push({ row: i + 1, item: unitNo, reason: `Inventory not found for ${projectName} | ${block} | ${unitNo}` });
                    continue;
                }

                results.inventoryMatched++;

                const updates = {};

                // 2. Resolve/Create Owner
                if (ownerMobile || ownerName) {
                    let ownerId = null;
                    const mobile = String(ownerMobile || '').trim();
                    const name = String(ownerName || '').trim();

                    if (mobile && contactCache.has(mobile)) {
                        ownerId = contactCache.get(mobile);
                        results.contactsFound++;
                    } else {
                        // Strict Matching: Both mobile and name must match for auto-alignment
                        let contactByMobile = null;
                        let contactByName = null;

                        if (mobile) {
                            contactByMobile = await Contact.findOne({ 'phones.number': { $regex: new RegExp(escapeRegExp(mobile), 'i') } });
                        }
                        if (name) {
                            contactByName = await Contact.findOne({ name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') } });
                        }

                        // Case 1: Perfect Match (Both match the same person)
                        if (contactByMobile && contactByName && contactByMobile._id.toString() === contactByName._id.toString()) {
                            ownerId = contactByMobile._id;
                            results.contactsFound++;
                        }
                        // Case 2: Only Mobile found (Completely new Name or partial match)
                        else if (contactByMobile && !contactByName) {
                            // Flag as recommendation if names are significantly different
                            results.errors.push({
                                row: i + 1,
                                item: unitNo,
                                reason: `RECOMMENDATION: Mobile ${mobile} found as "${contactByMobile.name}", but import says "${name}". Please check and align manually.`
                            });
                        }
                        // Case 3: Only Name found (New mobile for existing name)
                        else if (!contactByMobile && contactByName) {
                            results.errors.push({
                                row: i + 1,
                                item: unitNo,
                                reason: `RECOMMENDATION: Name "${name}" found, but Mobile in system is different. Please check and align manually.`
                            });
                        }
                        // Case 4: No match at all (New contact)
                        else if (!contactByMobile && !contactByName) {
                            const newContact = await Contact.create({
                                name: name || 'Unknown Owner',
                                phones: mobile ? [{ number: mobile, type: 'Personal' }] : [],
                                emails: ownerEmail ? [{ address: ownerEmail, type: 'Personal' }] : [],
                                source: await resolveLookup('Source', 'Bulk Owner Update')
                            });
                            ownerId = newContact._id;
                            results.contactsCreated++;
                        }
                        // Case 5: Conflict (Both match different people)
                        else if (contactByMobile && contactByName) {
                            results.errors.push({
                                row: i + 1,
                                item: unitNo,
                                reason: `CONFLICT: Mobile matches ${contactByMobile.name} and Name matches ${contactByName.name}. Skipped auto-alignment.`
                            });
                        }

                        if (ownerId && mobile) contactCache.set(mobile, ownerId);
                    }

                    if (ownerId) {
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
                        results.contactsFound++;
                    } else {
                        let contactByMobile = null;
                        let contactByName = null;

                        if (mobile) {
                            contactByMobile = await Contact.findOne({ 'phones.number': { $regex: new RegExp(escapeRegExp(mobile), 'i') } });
                        }
                        if (name) {
                            contactByName = await Contact.findOne({ name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') } });
                        }

                        if (contactByMobile && contactByName && contactByMobile._id.toString() === contactByName._id.toString()) {
                            associateId = contactByMobile._id;
                            results.contactsFound++;
                        }
                        else if (contactByMobile && !contactByName) {
                            results.errors.push({
                                row: i + 1,
                                item: unitNo,
                                reason: `RECOMMENDATION: Mobile ${mobile} found as "${contactByMobile.name}", but import says "${name}". Please check and align manually.`
                            });
                        }
                        else if (!contactByMobile && contactByName) {
                            results.errors.push({
                                row: i + 1,
                                item: unitNo,
                                reason: `RECOMMENDATION: Name "${name}" found, but Mobile is different. Please check and align manually.`
                            });
                        }
                        else if (!contactByMobile && !contactByName) {
                            const newContact = await Contact.create({
                                name: name || 'Unknown Associate',
                                phones: mobile ? [{ number: mobile, type: 'Personal' }] : [],
                                emails: associateEmail ? [{ address: associateEmail, type: 'Personal' }] : [],
                                source: await resolveLookup('Source', 'Bulk Owner Update')
                            });
                            associateId = newContact._id;
                            results.contactsCreated++;
                        }
                        else if (contactByMobile && contactByName) {
                            results.errors.push({
                                row: i + 1,
                                item: unitNo,
                                reason: `CONFLICT: Mobile matches ${contactByMobile.name} and Name matches ${contactByName.name}. Skipped auto-alignment.`
                            });
                        }

                        if (associateId && mobile) contactCache.set(mobile, associateId);
                    }

                    if (associateId) {
                        const existingAssociates = inventory.associates || [];
                        if (!existingAssociates.some(a => a.contact && a.contact.toString() === associateId.toString())) {
                            const newAssociate = {
                                contact: associateId,
                                relationship: relationship || 'Associate'
                            };
                            updates.associates = [...existingAssociates, newAssociate];
                        }
                    }
                }

                // 4. Save Updates
                if (Object.keys(updates).length > 0) {
                    await Inventory.findByIdAndUpdate(inventory._id, { $set: updates });
                }

            } catch (itemErr) {
                console.error(`[BULK OWNER UPDATE] Error at row ${i + 1}:`, itemErr);
                results.errors.push({ row: i + 1, item: unitNo, reason: itemErr.message });
            }
        }

        res.status(200).json({
            success: true,
            message: `Bulk update complete. Matched Properties: ${results.inventoryMatched}, New Contacts: ${results.contactsCreated}`,
            successCount: results.inventoryMatched,
            newCount: results.contactsCreated,
            updatedCount: results.inventoryMatched,
            errorCount: results.errors.length,
            errors: results.errors,
            results // Keep for debugging if needed
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
