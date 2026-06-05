import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import Lookup from "../models/Lookup.js";
import Activity from "../models/Activity.js";
import User from "../models/User.js";

import Contact from "../models/Contact.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js"; // REQUIRED for population
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { getVisibilityFilter } from "../utils/visibility.js";
import { toSqFt } from '../utils/pricingUtils.js';
import { paginate } from "../utils/pagination.js";

import DuplicationRule from "../models/DuplicationRule.js";
import { normalizePhone } from "../utils/normalization.js";
import { resolveLookup, resolveHierarchicalAddress } from "../utils/lookupResolver.js";
import Deal from "../models/Deal.js"; // Explicitly load to prevent registration errors
import { syncDocumentsToContact } from "../utils/sync.js";
import { createNotification } from "./notification.controller.js";


const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Resolves multi-select filters (names or IDs) to a MongoDB $in query
 * supports ObjectIds, String IDs, and raw names for Mixed fields.
 */
/**
 * 🚀 [SENIOR] Enterprise-Grade Multi-Filter Resolver
 * Handles:
 * 1. Raw ObjectIds (from frontend or DB)
 * 2. String Names (resolves to IDs via Lookup collection)
 * 3. Mixed types in DB (ID vs Nested Object vs String)
 */
const resolveMultiFilter = async (type, values) => {
    if (!values) return null;
    let vals = Array.isArray(values) ? values : String(values).split(',').map(s => s.trim()).filter(Boolean);
    if (vals.length === 0) return null;

    const results = { ids: [], names: [], idStrings: [] };

    await Promise.all(vals.map(async (v) => {
        const trimmedVal = String(v).trim();
        
        // CASE 1: Value is already an ObjectId
        if (mongoose.Types.ObjectId.isValid(trimmedVal)) {
            const objId = new mongoose.Types.ObjectId(trimmedVal);
            results.ids.push(objId);
            results.idStrings.push(trimmedVal);
            
            // Backfill name for mixed-type matching
            const lookup = await mongoose.model('Lookup').findById(objId).select('lookup_value').lean();
            if (lookup?.lookup_value) results.names.push(lookup.lookup_value.trim());
            return;
        }
        
        // CASE 2: Value is a Name string
        results.names.push(trimmedVal);
        
        // Find corresponding IDs in Lookup collection (Whitespace & Case Insensitive)
        const lookups = await mongoose.model('Lookup').find({ 
            lookup_type: type, 
            lookup_value: { $regex: new RegExp(`^\\s*${escapeRegExp(trimmedVal)}\\s*$`, 'i') } 
        }).select('_id lookup_value').lean();
        
        if (lookups.length > 0) {
            lookups.forEach(l => {
                results.ids.push(l._id);
                results.idStrings.push(l._id.toString());
                if (l.lookup_value) results.names.push(l.lookup_value.trim());
            });
        }
    }));

    // Deduplicate all possible matches
    const allMatches = [...new Set([
        ...results.ids.map(id => id.toString()), 
        ...results.idStrings, 
        ...results.names
    ])];

    // Deduplicate all possible matches (Polymorphic: IDs + Strings + Names)
    // 🚀 [SENIOR HARDENING] Use flexible Regex for all names
    // This allows matching "3 BHK" against "3 BHK Apartment" or "3 BHK Villa" 
    // ensuring consistency with global search behavior.
    const nameRegexes = results.names.map(name => new RegExp(escapeRegExp(name.trim()), 'i'));

    const finalValues = [...new Set([
        ...results.ids, 
        ...results.idStrings, 
        ...nameRegexes
    ])];

    if (finalValues.length === 0) return null;

    return { $in: finalValues };
};

/**
 * 🚀 [SENIOR UTILITY] Apply Deep Filter for Mixed-type Lookup Fields
 * Handles:
 * 1. Direct value match { field: { $in: values } }
 * 2. Nested ID match { 'field._id': { $in: values } }
 * 3. Nested lookup_value match { 'field.lookup_value': { $in: values } }
 * 4. Nested name match { 'field.name': { $in: values } }
 */
const applyDeepFilter = (query, field, filterValue) => {
    if (!filterValue) return;

    const conditions = [
        { [field]: filterValue },
        { [`${field}._id`]: filterValue },
        { [`${field}.id`]: filterValue },
        { [`${field}.lookup_value`]: filterValue },
        { [`${field}.name`]: filterValue }
    ];

    if (query.$or) {
        if (!query.$and) {
            const existingOr = query.$or;
            delete query.$or;
            query.$and = [{ $or: existingOr }];
        }
        query.$and.push({ $or: conditions });
    } else {
        query.$or = conditions;
    }
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
            minSize, maxSize, sizeMin, sizeMax, sizeType,
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
                { projectName: { $regex: search, $options: "i" } },
                { sizeLabel: { $regex: search, $options: "i" } },
                { sizeType: { $regex: search, $options: "i" } },
                { "sizeType.lookup_value": { $regex: search, $options: "i" } },
                { "sizeConfig.lookup_value": { $regex: search, $options: "i" } }
            ];
            
            // If the search term is a number, try matching against numeric size
            const searchNum = parseFloat(search.replace(/,/g, ''));
            if (!isNaN(searchNum)) {
                searchConditions.push({ "size.value": searchNum });
                searchConditions.push({ "size": searchNum });
            }

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
        const sizeTypeReq = sizeType || req.query['sizeType[]'];
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
            applyDeepFilter(query, 'status', statusFilter);
        }

        const categoryFilter = await resolveMultiFilter('Category', categoryReq);
        applyDeepFilter(query, 'category', categoryFilter);

        const subCategoryFilter = await resolveMultiFilter('SubCategory', subCategoryReq);
        applyDeepFilter(query, 'subCategory', subCategoryFilter);
        
        // 🚀 [SENIOR] Property Type / Size Type Filter (e.g. 1 BHK, 2 BHK, Shop, etc.)
        // Resolve against both 'PropertyType' and 'Size' to ensure full coverage (parity with frontend resolveInventoryLookup)
        const sizeTypeFilter1 = await resolveMultiFilter('PropertyType', sizeTypeReq);
        const sizeTypeFilter2 = await resolveMultiFilter('Size', sizeTypeReq);
        
        // Combine values from both resolutions
        const combinedValues = [
            ...(sizeTypeFilter1?.$in || []),
            ...(sizeTypeFilter2?.$in || [])
        ];
        
        const sizeTypeFilter = combinedValues.length > 0 ? { $in: [...new Set(combinedValues)] } : null;

        if (sizeTypeFilter) {
            // Special case: Size Type can be in sizeType, sizeConfig, or sizeLabel
            const conditions = [
                { sizeType: sizeTypeFilter },
                { 'sizeType._id': sizeTypeFilter },
                { 'sizeType.lookup_value': sizeTypeFilter },
                { sizeConfig: sizeTypeFilter },
                { 'sizeConfig._id': sizeTypeFilter },
                { 'sizeConfig.lookup_value': sizeTypeFilter },
                { sizeLabel: sizeTypeFilter }
            ];

            if (query.$or) {
                if (!query.$and) {
                    const existingOr = query.$or;
                    delete query.$or;
                    query.$and = [{ $or: existingOr }];
                }
                query.$and.push({ $or: conditions });
            } else {
                query.$or = conditions;
            }
        }

        const unitTypeFilter = await resolveMultiFilter('UnitType', unitTypeReq);
        applyDeepFilter(query, 'unitType', unitTypeFilter);


        // [ORIENTATION FILTERS]
        const directionFilter = await resolveMultiFilter('Direction', req.query.direction || req.query['direction[]']);
        applyDeepFilter(query, 'direction', directionFilter);

        const roadWidthFilter = await resolveMultiFilter('RoadWidth', req.query.roadWidth || req.query['roadWidth[]']);
        applyDeepFilter(query, 'roadWidth', roadWidthFilter);

        const facingFilter = await resolveMultiFilter('Facing', req.query.facing || req.query['facing[]']);
        applyDeepFilter(query, 'facing', facingFilter);
        
        // [SIZE RANGE FILTERS]
        const finalMinSize = minSize || sizeMin;
        const finalMaxSize = maxSize || sizeMax;
        if (finalMinSize || finalMaxSize) {
            const min = finalMinSize ? parseFloat(String(finalMinSize).replace(/,/g, '')) : NaN;
            const max = finalMaxSize ? parseFloat(String(finalMaxSize).replace(/,/g, '')) : NaN;

            if (!isNaN(min) || !isNaN(max)) {
                // Support both new { value, unit } structure and legacy flat number structure
                const sizeConditions = [];
                
                const buildQuery = (m, x) => {
                    const q = {};
                    if (!isNaN(m)) q.$gte = m;
                    if (!isNaN(x)) q.$lte = x;
                    return q;
                };

                const rangeQuery = buildQuery(min, max);
                sizeConditions.push({ 'size.value': rangeQuery });
                sizeConditions.push({ 'size': rangeQuery });

                if (query.$or) {
                    // If we already have an $or (e.g. from phone search), we must wrap in $and
                    if (!query.$and) {
                        const existingOr = query.$or;
                        delete query.$or;
                        query.$and = [{ $or: existingOr }];
                    }
                    query.$and.push({ $or: sizeConditions });
                } else {
                    query.$or = sizeConditions;
                }
            }
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
            { path: "owners", select: "name phones emails title personalAddress correspondenceAddress" },
            { path: "associates.contact", select: "name phones emails title personalAddress correspondenceAddress" },
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
        const activeCount = stats.active?.[0]?.count || 0;
        const inactiveCount = stats.inactive?.[0]?.count || 0;

        // Enrichment: Resolve category names for stats and merge duplicates safely
        const categoryResultIds = Array.isArray(categoryStatsAggregation)
            ? categoryStatsAggregation.map(c => c._id).filter(id => id && mongoose.Types.ObjectId.isValid(id))
            : [];
        const categoryDocs = categoryResultIds.length > 0
            ? await Lookup.find({ _id: { $in: categoryResultIds } }).select('lookup_value').lean()
            : [];
        const categoryMap = new Map(categoryDocs.map(d => [d._id.toString(), d.lookup_value]));

        const categoryStatsMap = new Map();
        if (Array.isArray(categoryStatsAggregation)) {
            categoryStatsAggregation.forEach(c => {
                const rawName = categoryMap.get(c._id?.toString()) || String(c._id || 'Unknown');
                const name = rawName.trim().toUpperCase();
                categoryStatsMap.set(name, (categoryStatsMap.get(name) || 0) + c.count);
            });
        }

        const categoryStats = Array.from(categoryStatsMap.entries()).map(([name, count]) => ({
            name,
            count
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

        // Check for deals and their intents
        const inventoryIds = results.records.map(item => item._id);
        const deals = await Deal.find({ inventoryId: { $in: inventoryIds } })
            .select('inventoryId intent')
            .populate('intent', 'lookup_value')
            .lean();

        // Create a map of inventoryId -> [intents]
        const inventoryDealMap = new Map();
        deals.forEach(d => {
            const invId = d.inventoryId?.toString();
            if (invId) {
                const intentVal = String(d.intent?.lookup_value || d.intent || '').toLowerCase();
                if (!inventoryDealMap.has(invId)) inventoryDealMap.set(invId, new Set());
                inventoryDealMap.get(invId).add(intentVal);
            }
        });

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

            // Address lookups (Inventory)
            if (itemObj.address) {
                const addrFields = ['city', 'state', 'locality', 'area', 'location', 'pincode', 'tehsil', 'postOffice'];
                addrFields.forEach(f => {
                    const val = itemObj.address[f];
                    if (val && mongoose.Types.ObjectId.isValid(val)) uniqueLookupIds.add(val.toString());
                });
            }

            // Contact Address lookups (Owners & Associates)
            const resolveContactAddrs = (contact) => {
                if (!contact) return;
                const addrFields = ['city', 'state', 'locality', 'area', 'location', 'pincode', 'pinCode', 'tehsil', 'postOffice'];
                ['personalAddress', 'correspondenceAddress'].forEach(addrType => {
                    if (contact[addrType]) {
                        addrFields.forEach(f => {
                            const val = contact[addrType][f];
                            if (val && mongoose.Types.ObjectId.isValid(val)) uniqueLookupIds.add(val.toString());
                        });
                    }
                });
            };

            if (Array.isArray(itemObj.owners)) itemObj.owners.forEach(resolveContactAddrs);
            if (Array.isArray(itemObj.associates)) itemObj.associates.forEach(a => resolveContactAddrs(a.contact));
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

        // --- Market Gap Integration (Pricing Intelligence) ---
        const uniquePricingParams = new Set();
        results.records.forEach(item => {
            let locVal = item.address?.locality || item.address?.location || item.address?.area;
            if (locVal && mongoose.Types.ObjectId.isValid(locVal)) {
                locVal = lookupMap.get(locVal.toString())?.lookup_value || locVal.toString();
            } else if (typeof locVal === 'object' && locVal?.lookup_value) {
                locVal = locVal.lookup_value;
            }
            
            let subCatVal = item.subCategory;
            if (subCatVal && mongoose.Types.ObjectId.isValid(subCatVal)) {
                subCatVal = lookupMap.get(subCatVal.toString())?.lookup_value || subCatVal.toString();
            } else if (typeof subCatVal === 'object' && subCatVal?.lookup_value) {
                subCatVal = subCatVal.lookup_value;
            }
            
            if (locVal && subCatVal && typeof locVal === 'string' && typeof subCatVal === 'string') {
                uniquePricingParams.add(`${locVal}|${subCatVal}`);
            }
        });

        const benchmarkMap = new Map();
        if (uniquePricingParams.size > 0) {
            const PricingBenchmark = mongoose.models.PricingBenchmark || mongoose.model('PricingBenchmark');
            const queries = Array.from(uniquePricingParams).map(param => {
                const [loc, subCat] = param.split('|');
                return { location: loc, subCategory: subCat, period: 'trailing-90d' };
            });
            if (queries.length > 0) {
                const benchmarks = await PricingBenchmark.find({ $or: queries }).lean();
                benchmarks.forEach(bm => {
                    benchmarkMap.set(`${bm.location}|${bm.subCategory}`, bm);
                });
            }
        }

        results.records = results.records.map((item) => {
            const itemObj = { ...item };
            
            // Hydrate Categorical
            categoricalFields.forEach(f => {
                const val = itemObj[f];
                if (val && mongoose.Types.ObjectId.isValid(val)) {
                    itemObj[f] = lookupMap.get(val.toString()) || val;
                } else if (Array.isArray(val)) {
                    const uniqueMap = new Map();
                    val.forEach(v => {
                        if (!v) return;
                        let id = null;
                        let label = null;

                        if (mongoose.Types.ObjectId.isValid(v)) {
                            id = v.toString();
                            const resolved = lookupMap.get(id);
                            label = resolved?.lookup_value || id;
                        } else if (typeof v === 'object' && v) {
                            const possibleId = v._id?.toString() || v.id?.toString();
                            if (possibleId && mongoose.Types.ObjectId.isValid(possibleId)) {
                                id = possibleId;
                                const resolved = lookupMap.get(id);
                                label = v.lookup_value || resolved?.lookup_value || id;
                            } else if (v.lookup_value) {
                                label = v.lookup_value;
                            }
                        } else if (typeof v === 'string') {
                            label = v;
                        }

                        if (label) {
                            const cleanLabel = label.trim();
                            const key = cleanLabel.toLowerCase();
                            if (!uniqueMap.has(key)) {
                                uniqueMap.set(key, id ? { _id: id, lookup_value: cleanLabel } : { lookup_value: cleanLabel });
                            }
                        }
                    });
                    itemObj[f] = Array.from(uniqueMap.values());
                }
            });

            // Hydrate Address
            const hydrateAddr = (addrObj) => {
                if (!addrObj || typeof addrObj !== 'object') return;
                const addrFields = ['city', 'state', 'locality', 'area', 'location', 'pincode', 'tehsil', 'postOffice'];
                addrFields.forEach(f => {
                    const val = addrObj[f];
                    if (val && mongoose.Types.ObjectId.isValid(val)) {
                        addrObj[f] = lookupMap.get(val.toString()) || val;
                    }
                });
            };

            if (itemObj.address) hydrateAddr(itemObj.address);

            // Hydrate Contact Addresses
            if (Array.isArray(itemObj.owners)) itemObj.owners.forEach(o => {
                hydrateAddr(o.personalAddress);
                hydrateAddr(o.correspondenceAddress);
            });
            if (Array.isArray(itemObj.associates)) itemObj.associates.forEach(a => {
                if (a.contact) {
                    hydrateAddr(a.contact.personalAddress);
                    hydrateAddr(a.contact.correspondenceAddress);
                }
            });

            // Hydrate Relational
            if (itemObj.assignedTo && mongoose.Types.ObjectId.isValid(itemObj.assignedTo)) itemObj.assignedTo = userMap.get(itemObj.assignedTo.toString()) || itemObj.assignedTo;
            if (itemObj.team && mongoose.Types.ObjectId.isValid(itemObj.team)) itemObj.team = teamMap.get(itemObj.team.toString()) || itemObj.team;
            if (Array.isArray(itemObj.teams)) itemObj.teams = itemObj.teams.map(t => (t && mongoose.Types.ObjectId.isValid(t)) ? (teamMap.get(t.toString()) || t) : t);
            if (itemObj.projectId && mongoose.Types.ObjectId.isValid(itemObj.projectId)) itemObj.projectId = projectMap.get(itemObj.projectId.toString()) || itemObj.projectId;

            const dealIntents = Array.from(itemObj._id ? (inventoryDealMap.get(itemObj._id.toString()) || []) : []);
            let primaryDealIntent = null;
            if (dealIntents.length > 0) {
                if (dealIntents.includes('sell')) primaryDealIntent = 'sell';
                else if (dealIntents.includes('rent')) primaryDealIntent = 'rent';
                else if (dealIntents.includes('lease')) primaryDealIntent = 'lease';
                else primaryDealIntent = dealIntents[0];
            }

            // --- Compute Market Gap ---
            let marketGapPct = null;
            let bmLoc = itemObj.address?.locality || itemObj.address?.location || itemObj.address?.area;
            if (bmLoc && typeof bmLoc === 'object') bmLoc = bmLoc.lookup_value;
            
            let bmSubCat = itemObj.subCategory;
            if (bmSubCat && typeof bmSubCat === 'object' && !Array.isArray(bmSubCat)) bmSubCat = bmSubCat.lookup_value;
            else if (Array.isArray(bmSubCat) && bmSubCat.length > 0) bmSubCat = bmSubCat[0].lookup_value || bmSubCat[0];

            if (bmLoc && bmSubCat && typeof bmLoc === 'string' && typeof bmSubCat === 'string') {
                const bm = benchmarkMap.get(`${bmLoc}|${bmSubCat}`);
                if (bm && bm.avgClosedRPU && itemObj.price?.value && itemObj.size?.value) {
                    const sqFtSize = toSqFt(itemObj.size.value, itemObj.size.unit || 'Sq.Ft.');
                    if (sqFtSize > 0) {
                        const rpu = itemObj.price.value / sqFtSize;
                        const diff = rpu - bm.avgClosedRPU;
                        marketGapPct = Math.round((diff / bm.avgClosedRPU) * 100);
                    }
                }
            }

            return {
                ...itemObj,
                hasDeal: dealIntents.length > 0,
                dealIntents,
                primaryDealIntent,
                marketGapPct
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
            { path: "teams", select: "name" },
            { path: "ownerHistory.contactId", model: 'Contact', select: "name phones" },
            { path: "ownerHistory.author", model: 'User', select: "fullName name" }
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

        // 🚀 [SENIOR] Hydrate ownerHistory entries: use populated contact data if stored name/mobile is missing
        if (Array.isArray(inventoryData.ownerHistory)) {
            inventoryData.ownerHistory = inventoryData.ownerHistory.map(entry => {
                const enriched = { ...entry };
                const contact = entry.contactId;
                if (contact && typeof contact === 'object') {
                    if (!enriched.contactName) enriched.contactName = contact.name || '';
                    if (!enriched.contactMobile) enriched.contactMobile = contact.phones?.[0]?.number || '';
                    // Keep contactId as plain ID string for frontend (avoid circular ref)
                    enriched.contactId = contact._id || entry.contactId;
                }
                if (entry.author && typeof entry.author === 'object') {
                    enriched.authorName = entry.author.fullName || entry.author.name || '';
                }
                return enriched;
            });
        }

        console.log(`[DIAGNOSTIC] ✅ Success: ${inventory.projectName} | Deals found: ${deals.length} | Media: ${inventoryData.media.length} | OwnerHistory: ${inventoryData.ownerHistory?.length || 0}`);
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
        if (data.category !== undefined) data.category = await resolveLookup('Category', data.category);
        if (data.subCategory !== undefined) data.subCategory = await resolveLookup('SubCategory', data.subCategory);
        if (data.unitType !== undefined) data.unitType = await resolveLookup('UnitType', data.unitType);
        if (data.status !== undefined) data.status = await resolveLookup('Status', data.status); else if (!data.status) data.status = await resolveLookup('Status', 'Inactive');
        if (data.facing !== undefined) data.facing = await resolveLookup('Facing', data.facing);
        if (data.direction !== undefined) data.direction = await resolveLookup('Direction', data.direction);
        if (data.orientation !== undefined) data.orientation = await resolveLookup('Orientation', data.orientation);
        if (data.intent !== undefined) data.intent = await resolveLookup('Intent', data.intent);
        if (data.builtupType !== undefined) data.builtupType = await resolveLookup('BuiltupType', data.builtupType);
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

        // Fetch current Inv early for tracking changes and interaction logs
        const currentInv = await Inventory.findById(req.params.id).populate('owners associates.contact');
        if (!currentInv) {
            return res.status(404).json({ success: false, error: "Inventory item not found" });
        }

        // 🚀 [SENIOR HARDENED] Single-Source-of-Truth Ownership History Tracking
        // Backend is the SOLE authority for ownerHistory — frontend should NOT send ownerHistory.
        // We detect additions + removals here and push both atomically.
        if (data.owners !== undefined && Array.isArray(data.owners)) {
            const currentOwnerIds = currentInv.owners?.map(o => (o._id?.toString() || o.toString())) || [];
            const newOwnerIds = data.owners.map(o => o.toString());

            const removedOwnerIds = currentOwnerIds.filter(id => !newOwnerIds.includes(id));
            const addedOwnerIds   = newOwnerIds.filter(id => !currentOwnerIds.includes(id));

            const ownerHistoryEntries = [];
            const ownerSources = data.ownerSources || {};

            // Additions
            if (addedOwnerIds.length > 0) {
                addedOwnerIds.forEach(id => {
                    ownerHistoryEntries.push({
                        date: new Date(),
                        author: req.user?._id || null,
                        contactId: id,
                        role: 'Property Owner',
                        type: 'Added',
                        source: ownerSources[id] || 'Manual Update'
                    });
                });
            }

            // Removals
            if (removedOwnerIds.length > 0) {
                removedOwnerIds.forEach(id => {
                    // Try to find if there's a reason provided for removal. If not, default to Manual Update.
                    // Usually, the reason is associated with the *new* owner (e.g., Transfer), so we might just use that 
                    // or default to 'Manual Update' for the removed entry.
                    const removalReason = 'Removed from current profile';
                    ownerHistoryEntries.push({
                        date: new Date(),
                        author: req.user?._id || null,
                        contactId: id,
                        role: 'Property Owner',
                        type: 'Removed',
                        source: removalReason
                    });
                });

                // Auto-Tag removed owners as previous_owner_unit_project
                try {
                    const unitLabel    = currentInv.unitNo || currentInv.unitNumber || 'unit';
                    const projectLabel = currentInv.projectName ? currentInv.projectName.replace(/\s+/g, '') : 'project';
                    const tagToAdd = `previous_owner_${unitLabel}_${projectLabel}`.toLowerCase();
                    await Contact.updateMany(
                        { _id: { $in: removedOwnerIds } },
                        { $addToSet: { tags: tagToAdd } }
                    );
                } catch (tagErr) {
                    console.error('[InventorySync] Failed to auto-tag removed owners:', tagErr.message);
                }
            }

            if (ownerHistoryEntries.length > 0) {
                if (!data.$push) data.$push = {};
                data.$push.ownerHistory = { $each: ownerHistoryEntries };
            }
        }

        // Strip ownerHistory and ownerSources from direct $set — backend is sole authority via $push above
        delete data.ownerHistory;
        delete data.ownerSources;

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
                    data[field] = await resolveLookup(type, data[field]);
                } else if (isStrictId) {
                    // 🛡️ [DATA INTEGRITY] Ensure string IDs are cast to proper ObjectIds for Mixed field consistency
                    data[field] = new mongoose.Types.ObjectId(data[field]);
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
            if (!data.$push) data.$push = {};
            data.$push.history = { $each: historyToPush };
            
            // [ENTERPRISE] Create Unified Activity Log for Timeline Parity
            // This ensures that interaction intelligence is visible on all related timelines.
            try {
                if (currentInv) {
                    for (const interaction of data.interactions) {
                        const relatedTo = [
                            { id: currentInv._id, name: currentInv.unitNo || 'Property', model: 'Inventory' }
                        ];

                        // Add Owners
                        if (currentInv.owners && currentInv.owners.length > 0) {
                            currentInv.owners.forEach(owner => {
                                const ownerId = owner._id || owner;
                                if (!relatedTo.some(r => r.id.toString() === ownerId.toString())) {
                                    relatedTo.push({ id: ownerId, name: owner.name || 'Owner', model: 'Contact' });
                                }
                            });
                        }

                        // Add Associates
                        if (currentInv.associates && currentInv.associates.length > 0) {
                            currentInv.associates.forEach(assoc => {
                                const contactId = assoc.contact?._id || assoc.contact;
                                if (contactId && !relatedTo.some(r => r.id.toString() === contactId.toString())) {
                                    relatedTo.push({ id: contactId, name: assoc.contact?.name || assoc.name || 'Associate', model: 'Contact' });
                                }
                            });
                        }

                        // Special Case: If a specific owner/associate name was selected but not found in formal links
                        // (e.g. legacy data or manual name entry), we've already added them if they were in currentInv.
                        // But we ensure the logic is robust.

                        await Activity.create({
                            type: 'Feedback',
                            subject: interaction.details?.result ? `Interaction: ${interaction.details.result}` : 'Property Interaction Logged',
                            description: interaction.note || 'Interaction recorded on property profile.',
                            status: 'Completed',
                            performedBy: interaction.actor || (req.user ? (req.user.fullName || req.user.name) : 'System'),
                            dueDate: interaction.date || new Date(),
                            entityType: 'Inventory',
                            entityId: currentInv._id,
                            relatedTo,
                            details: {
                                ...interaction.details,
                                source: 'InventoryProfile'
                            },
                            department: currentInv.department,
                            teams: currentInv.teams
                        });
                    }
                }
            } catch (actErr) {
                console.error("[InventorySync] Failed to create activity log:", actErr.message);
            }
            
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

export const bulkUpdateInventory = async (req, res) => {
    try {
        const { ids, updates } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: "Invalid IDs provided" });
        }
        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: "No updates provided" });
        }

        const visibilityFilter = await getVisibilityFilter(req.user);
        
        const result = await Inventory.updateMany(
            { _id: { $in: ids }, ...visibilityFilter },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, error: "No matching inventory items found or permission denied" });
        }

        res.status(200).json({ 
            success: true, 
            message: `${result.modifiedCount} items updated successfully out of ${result.matchedCount} matched.` 
        });
    } catch (error) {
        console.error("[BULK_UPDATE_ERROR]", error);
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
                    builtupType: await resolveLookup('BuiltupType', item.builtupType || item['Builtup Type']),

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
                        country: await resolveLookup('Country', item.country || item['Country'] || 'India'),
                        state: null,
                        city: null,
                        locality: null,
                        area: null,
                        location: null,
                        tehsil: null,
                        postOffice: item.postOffice || item['Post Office'],
                        pincode: null
                    },

                    // 🚀 [SENIOR] Hierarchical Resolution via Centralized Utility
                    async resolveHierarchicalAddress() {
                        const rawAddr = {
                            hNo: item.hNo || item['H No'],
                            street: item.street || item['Street'],
                            country: item.country || item['Country'] || 'India',
                            state: item.state || item['State'],
                            city: item.city || item['City'] || item['City Name'],
                            tehsil: item.tehsil || item['Tehsil'],
                            pincode: rawPincode,
                            area: rawLocality
                        };
                        
                        const resolved = await resolveHierarchicalAddress(rawAddr);
                        this.address = resolved;
                        this.locArea = resolved.area;
                        this.locZip = resolved.pincode;
                    },
                    locSector: item.block || item.sector || item['Block'] || item['Sector'],
                    latitude: item.lat || item.latitude || item['Latitude'],
                    longitude: item.lng || item.longitude || item['Longitude'],

                    ownerName: item.ownerName || item['Owner Name'],
                    ownerPhone: item.ownerPhone || item['Owner Phone'],
                    ownerEmail: item.ownerEmail || item['Owner Email'],
                    ownerAddress: item.ownerAddress || item['Owner Address'],
                    ownerFatherName: item.ownerFatherName || item['Owner Father Name'] || item.fatherName || item['Father Name'],

                    teams: await resolveTeam(item.teams || globalTeams),
                    team: await resolveTeam(item.team || item['Team'] || (globalTeams.length > 0 ? globalTeams[0] : null)),
                    visibleTo: item.visibleTo || item['Visible To'] || 'Everyone'
                };

                // Trigger Hierarchical Resolution
                await result.resolveHierarchicalAddress();

                result.category = await resolveLookup('Category', item.category || item.type || item['Category'] || item['Property Category']);
                result.subCategory = await resolveLookup('SubCategory', item.subCategory || item['SubCategory'] || item['Property Category']);
                result.unitType = await resolveLookup('UnitType', item.unitType || item['Unit Type']);

                const sizeResult = await resolveSizeLookup(
                    item.sizeLabel || item.sizeConfig || item['Size Label'] || item['Size Label*'],
                    result.projectName,
                    result.block,
                    item.category || item['Category'],
                    item.subCategory || item['Sub Category']
                );
                result.sizeConfig = sizeResult?.id;
                result.status = await resolveLookup('Status', item.status || item['Status'] || 'Inactive');

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

                // 🚀 [SENIOR] Robust Owner Mapping: Support varied headers for Owner Details
                const ownerName = item.ownerName || item['Owner Name'] || item['Property Owner'] || item['Owner'] || item['Name'];
                const ownerPhone = item.ownerPhone || item['Owner Phone'] || item['Property Owner Phone'] || item['Mobile'] || item['Phone'];
                const ownerEmail = item.ownerEmail || item['Owner Email'] || item['Property Owner Email'] || item['Email'];
                const ownerFatherName = item.ownerFatherName || item['Owner Father Name'] || item['Father Name'] || item['FatherName'];

                if (ownerName || ownerPhone || ownerEmail) {
                    try {
                        const contactKey = `${ownerName || ''}:${ownerPhone || ''}:${ownerEmail || ''}`.toLowerCase();
                        let contact = null;

                        if (contactCache.has(contactKey)) {
                            contact = { _id: contactCache.get(contactKey) };
                        } else {
                            const query = [];
                            if (ownerPhone) query.push({ 'phones.number': String(ownerPhone) });
                            if (ownerEmail) query.push({ 'emails.address': String(ownerEmail).toLowerCase() });

                            if (query.length > 0) {
                                contact = await Contact.findOne({ $or: query }).select('_id name personalAddress').lean();
                            }
                            
                            // 🚀 [SENIOR] Advanced Matching: Name + FatherName + HouseNumber + Location
                            if (!contact && ownerName) {
                                const nameQuery = { name: { $regex: new RegExp(`^${escapeRegExp(ownerName)}$`, 'i') } };
                                if (ownerFatherName) {
                                    nameQuery.fatherName = { $regex: new RegExp(`^${escapeRegExp(ownerFatherName)}$`, 'i') };
                                }
                                
                                // Address component matching for high-precision deduplication
                                if (result.address?.hNo) {
                                    nameQuery['personalAddress.hNo'] = result.address.hNo;
                                }
                                if (result.address?.location) {
                                    nameQuery['personalAddress.location'] = result.address.location;
                                }

                                contact = await Contact.findOne(nameQuery).select('_id name personalAddress').lean();
                            }

                            // Fallback to name-only if precision matching fails but we definitely have a name
                            if (!contact && ownerName && !ownerFatherName && !result.address?.hNo) {
                                contact = await Contact.findOne({ name: { $regex: new RegExp(`^${escapeRegExp(ownerName)}$`, 'i') } }).select('_id name personalAddress').lean();
                            }

                            // 🚀 Enterprise Grade: Short Code Tagging (First 3 chars of each word)
                            const shortProject = (result.projectName || 'Prop')
                                .split(/\s+/)
                                .map(word => word.substring(0, 3))
                                .join('')
                                .replace(/[^a-zA-Z0-9]/g, '');
                            const propertyTag = `${shortProject}_${(result.unitNo || '').replace(/\s+/g, '')}`;

                            if (!contact) {
                                const newContactData = {
                                    name: ownerName || 'Unknown Owner',
                                    fatherName: ownerFatherName,
                                    phones: ownerPhone ? [{ number: String(ownerPhone), type: 'Personal' }] : [],
                                    emails: ownerEmail ? [{ address: String(ownerEmail).toLowerCase(), type: 'Personal' }] : [],
                                    personalAddress: result.address, // Sync address from inventory
                                    source: await resolveLookup('Source', 'Inventory Import'),
                                    assignedTo: result.assignedTo,
                                    owner: result.assignedTo,
                                    team: result.team,
                                    teams: result.teams,
                                    visibleTo: result.visibleTo,
                                    tags: ['Property Owner', propertyTag]
                                };
                                contact = await Contact.create(newContactData);
                            } else {
                                // 🚀 Update existing contact with assignment, tagging, and address
                                const updatePayload = {
                                    $addToSet: { 
                                        tags: { $each: ['Property Owner', propertyTag] }
                                    },
                                    $set: {
                                        owner: result.assignedTo,
                                        team: result.team,
                                        teams: result.teams,
                                        visibleTo: result.visibleTo
                                    }
                                };
                                
                                if (ownerPhone) {
                                    updatePayload.$addToSet.phones = { number: String(ownerPhone), type: 'Personal' };
                                }
                                if (ownerEmail) {
                                    updatePayload.$addToSet.emails = { address: String(ownerEmail).toLowerCase(), type: 'Personal' };
                                }

                                // 🚀 [SENIOR] Precise Address Merging to ensure text fields (hNo, street, area) reflect
                                if (result.address) {
                                    Object.entries(result.address).forEach(([key, val]) => {
                                        if (val !== undefined && val !== null) {
                                            updatePayload.$set[`personalAddress.${key}`] = val;
                                        }
                                    });
                                }

                                await Contact.findByIdAndUpdate(contact._id, updatePayload);
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
        const { rows, data, resolutions, dryRun = false, ownerUpdateMode = 'APPEND' } = req.body;
        const finalRows = rows || data;

        // 🕵️ [DIAGNOSTIC] Log first item to verify mapping
        if (finalRows && finalRows.length > 0) {
            console.log(`[BULK_OWNER_DIAG] First Row Sample:`, JSON.stringify(finalRows[0]));
        }

        if (!finalRows || !Array.isArray(finalRows)) {
            return res.status(400).json({ success: false, error: "Invalid data provided (rows/data missing)" });
        }

        console.log(`[BULK OWNER UPDATE] ${dryRun ? '[DRY RUN] ' : ''}Processing ${finalRows.length} records`);

        const results = {
            total: finalRows.length,
            inventoryMatched: 0,
            inventoryNotFound: 0,
            contactsCreated: 0,
            contactsFound: 0,
            noMobileCount: 0,
            conflicts: [], // 🛡️ ENTERPRISE: Structured conflicts for UI resolution
            plannedUpdates: [], // 🚀 [SENIOR] Detailed field-level diffs for review
            duplicates: [], // 🚀 Track all matches for UI transparency
            errors: []
        };

        const lookupCache = new Map();
        const userCache = new Map();
        const teamCache = new Map();
        const contactCache = new Map(); // Local cache to prevent redundant DB hits in same batch
        const unitsClearedInThisBatch = new Set(); // Tracks units whose old owners were cleared this batch

        // Internal cached helpers for batch efficiency
        const cachedResolveLookup = async (type, val) => {
            return resolveLookup(type, val);
        };

        const cachedResolveUser = async (id) => {
            if (!id) return null;
            const strId = String(id).trim();
            if (userCache.has(strId.toLowerCase())) return userCache.get(strId.toLowerCase());
            
            const escaped = escapeRegExp(strId);
            const res = await User.findOne({ 
                $or: [
                    { _id: mongoose.Types.ObjectId.isValid(strId) ? strId : null },
                    { fullName: { $regex: new RegExp(`^${escaped}$`, 'i') } },
                    { name: { $regex: new RegExp(`^${escaped}$`, 'i') } },
                    { username: { $regex: new RegExp(`^${escaped}$`, 'i') } },
                    { email: strId.toLowerCase() }
                ] 
            }).select('_id').lean();
            const result = res?._id || null;
            userCache.set(strId.toLowerCase(), result);
            return result;
        };

        const cachedResolveTeam = async (id) => {
            if (!id) return null;
            if (teamCache.has(id)) return teamCache.get(id);
            const res = await Team.findOne({ 
                $or: [
                    { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
                    { name: { $regex: new RegExp(`^${escapeRegExp(id)}$`, 'i') } }
                ] 
            }).select('_id').lean();
            const result = res?._id || null;
            teamCache.set(id, result);
            return result;
        };

        for (let i = 0; i < finalRows.length; i++) {
            const row = finalRows[i];
            
            // 🚀 [SENIOR] Robust Header Mapping for Bulk Update
            const projectName = row.projectName || row['Project Name'] || row['Project'] || '';
            const block = row.block || row['Block'] || row['Phase'] || '';
            const unitNo = row.unitNo || row['Unit Number'] || row['Unit No'] || row['Unit'] || '';
            
            const ownerName = row.ownerName || row['Owner Name'] || row['Name'] || '';
            const ownerFatherName = row.fatherName || row.ownerFatherName || row['Father Name'] || row['Owner Father Name'] || row['FatherName'] || '';
            const ownerMobile = row.ownerMobile || row['Owner Mobile'] || row['Mobile'] || row['Phone'] || row['Mobile Number'] || '';
            
            const ownerHNo = row.ownerHNo || row['Owner House No'] || row['House No'] || row['House Number'] || row['HNo'] || '';
            const ownerStreet = row.ownerStreet || row['Owner Street'] || row['Street'] || '';
            const ownerLocality = row.ownerLocality || row['Owner Locality'] || row['Locality'] || row['Sector'] || '';
            const ownerArea = row.ownerArea || row['Owner Area'] || row['Area'] || '';
            const ownerCity = row.ownerCity || row['Owner City'] || row['City'] || '';
            const ownerState = row.ownerState || row['Owner State'] || row['State'] || '';
            const ownerPinCode = row.ownerPinCode || row['Owner Pincode'] || row['Pin Code'] || row['Pincode'] || '';
            const ownerEmail = row.ownerEmail || row['Owner Email'] || row['Email'] || '';

            const {
                module,
                associateName,
                associateMobile,
                associateEmail,
                relationship
            } = row;

            // 🚀 [SENIOR] Support both nested 'assignment' object and flat root headers with common aliases
            const rawAssignedTo = row.assignedTo || row.assigned_to || row.owner || row.Assign || row.assign || row.assignment?.assignedTo;
            const rawTeam = row.team || row.Team || row.assignment?.team;
            const rawVisibleTo = row.visibleTo || row.visible_to || row.Visibility || row.visibility || row.VisibleTo || row.assignment?.visibleTo || 'Everyone';

            // Row Identifier for resolutions
            const rowKey = `row_${i}`;

            try {
                // 1. Find Inventory Record (Resilient Matching)
                const cleanProject = String(projectName || '').trim();
                const cleanBlock = String(block || '').trim();
                const cleanUnit = String(unitNo || '').trim();
                const absoluteRow = (row._rowIdx !== undefined ? row._rowIdx + 1 : i + 1);

                const inventoryQuery = {
                    projectName: { $regex: new RegExp(`^\\s*${escapeRegExp(cleanProject)}\\s*$`, 'i') },
                    $or: [
                        { unitNo: { $regex: new RegExp(`^\\s*${escapeRegExp(cleanUnit)}\\s*$`, 'i') } },
                        { unitNumber: { $regex: new RegExp(`^\\s*${escapeRegExp(cleanUnit)}\\s*$`, 'i') } }
                    ]
                };

                // Enterprise Grade: Handle optional blocks and variations (Null vs Empty vs N/A)
                if (cleanBlock && cleanBlock !== 'N/A' && cleanBlock !== '-') {
                    inventoryQuery.block = { $regex: new RegExp(`^\\s*${escapeRegExp(cleanBlock)}\\s*$`, 'i') };
                } else {
                    // If no block provided in file, look for records where block is empty, null, or N/A
                    inventoryQuery.$and = [
                        { $or: [
                            { block: { $in: [null, "", undefined, "N/A", "-"] } },
                            { block: { $regex: /^\s*$/ } }
                        ]}
                    ];
                }

                const inventory = await Inventory.findOne(inventoryQuery)
                    .populate({ path: 'owners', select: 'name' })
                    .select('_id projectName unitNo owners associates assignedTo team visibleTo').lean();

                if (!inventory) {
                    results.inventoryNotFound++;
                    results.errors.push({ 
                        row: absoluteRow, 
                        item: cleanUnit || 'Unknown Unit', 
                        reason: `Inventory not found. Check if Project "${cleanProject}", Block "${cleanBlock || 'Any'}", and Unit "${cleanUnit}" exist in the system.` 
                    });
                    continue;
                }

                results.inventoryMatched++;

                const updates = {};
                // Enterprise Grade: Short Code Tagging
                const shortProject = (inventory.projectName || 'Prop')
                    .split(/\s+/)
                    .map(word => word.substring(0, 3))
                    .join('')
                    .replace(/[^a-zA-Z0-9]/g, '');
                const propertyTag = `${shortProject}_${(inventory.unitNo || '').replace(/\s+/g, '')}`;

                // Resolution of assignment details (CACHED)
                const resolvedUser = await cachedResolveUser(rawAssignedTo);
                const rowAssignedTo = resolvedUser || req.user._id; // Only fallback if Excel is empty, otherwise use resolved
                const rowTeam = (await cachedResolveTeam(rawTeam)) || req.user.team;
                const rowVisibleTo = rawVisibleTo;

                const assignmentUpdate = {
                    assignedTo: rowAssignedTo,
                    owner: rowAssignedTo,
                    team: rowTeam,
                    visibleTo: rowVisibleTo,
                    assignment: {
                        assignedTo: rowAssignedTo,
                        team: Array.isArray(rowTeam) ? rowTeam : [rowTeam],
                        visibleTo: rowVisibleTo
                    }
                };

                const commonSource = await cachedResolveLookup('Source', 'Unified Import Center');

                let ownerId = null;
                const activeModule = module || 'propertyOwners';

                const hNo = String(ownerHNo || '').trim();
                const locality = String(ownerLocality || '').trim();
                
                const personalAddress = {
                    hNo: hNo || '',
                    street: String(ownerStreet || '').trim() || '',
                    location: locality || '',
                    area: String(ownerArea || '').trim() || '',
                    city: String(ownerCity || '').trim() || '',
                    state: String(ownerState || '').trim() || '',
                    pincode: String(ownerPinCode || '').trim() || ''
                };

                // 2. Resolve/Create Owner (With Legal Identity & Assignment)
                if (activeModule === 'propertyOwners') {
                    const name = String(ownerName || '').trim();
                    const fatherName = String(ownerFatherName || '').trim();
                    const mobileRaw = String(ownerMobile || '').trim();
                    const mobile = mobileRaw ? normalizePhone(mobileRaw) : null;
                    const email = String(ownerEmail || '').trim();

                    if (!mobile) results.noMobileCount++;

                    const resolution = resolutions[rowKey]?.owner; 
                    const compositeKey = `${name}|${fatherName}|${hNo}|${locality}`.toLowerCase();

                    if (mobile && contactCache.has(mobile)) {
                        ownerId = contactCache.get(mobile);
                        results.contactsFound++;
                        results.duplicates.push({ name: 'Cached Contact', mobile: mobile });
                    } else if (!mobile && name && contactCache.has(compositeKey)) {
                        ownerId = contactCache.get(compositeKey);
                        results.contactsFound++;
                        results.duplicates.push({ name: 'Cached Contact (Identity)', mobile: 'In-File Duplicate' });
                    } else {
                        // 🚀 [HARDENED] Search for existing contact (Mobile first, then Legal Identity)
                        let contactByMobile = mobile ? await Contact.findOne({ 'phones.number': mobile }) : null;
                        
                        // 🚀 [HARDENED] Name Normalization for matching (Strip Sh., Shri, Late, Mr. etc)
                        const normalizeName = (n) => String(n || '').replace(/^(Sh\.|Shri|Sh|Mr\.|Mr|Mrs\.|Mrs|Late|Lt\.)\s+/i, '').trim();
                        const normName = normalizeName(name);
                        const normFather = normalizeName(fatherName);

                        let contactByLegal = null;
                        if (normName) {
                            const legalQuery = { 
                                name: { $regex: new RegExp(`^\\s*(${escapeRegExp(name)}|${escapeRegExp(normName)})\\s*$`, 'i') }
                            };
                            
                            // 🚀 [SENIOR] Tier 2 & 3 Matching logic
                            const matchConditions = [];
                            
                            // Condition A: Name + exact Father Name match
                            if (normFather) {
                                matchConditions.push({ fatherName: { $regex: new RegExp(`^\\s*(${escapeRegExp(fatherName)}|${escapeRegExp(normFather)})\\s*$`, 'i') } });
                            }
                            
                            // Condition B: Name + Address match (If FatherName is missing or mismatches)
                            if (hNo || locality || ownerCity) {
                                const addrConditions = [];
                                if (hNo) addrConditions.push({ 'personalAddress.hNo': { $regex: new RegExp(`^\\s*${escapeRegExp(hNo)}\\s*$`, 'i') } });
                                if (locality) {
                                    const resolvedLocId = await cachedResolveLookup('Area', locality);
                                    if (resolvedLocId) addrConditions.push({ 'personalAddress.location': resolvedLocId });
                                }
                                if (ownerCity) addrConditions.push({ 'personalAddress.city': { $regex: new RegExp(`^\\s*${escapeRegExp(ownerCity)}\\s*$`, 'i') } });
                                
                                if (addrConditions.length > 0) {
                                    // Combine address conditions with AND because we want all provided address parts to match for it to be considered a duplicate
                                    matchConditions.push({ $and: addrConditions });
                                }
                            }
                            
                            if (matchConditions.length > 0) {
                                legalQuery.$or = matchConditions;
                                contactByLegal = await Contact.findOne(legalQuery).populate('personalAddress.location');
                            } else if (!mobile) {
                                // 🚀 [FIXED] If no mobile, no father name, no address provided, fallback to matching just by name
                                // The user explicitly wants intra-database duplicates to be matched even if only name is provided
                                contactByLegal = await Contact.findOne(legalQuery).populate('personalAddress.location');
                            }
                        }

                        const existingContact = contactByMobile || contactByLegal;

                        // Evaluate Diffs FIRST to determine if it's a Perfect Match or a Conflict
                        if (existingContact) {
                            const diffs = [];
                            if (name && existingContact.name !== name) diffs.push({ field: 'Name', old: existingContact.name, new: name });
                            if (fatherName && existingContact.fatherName !== fatherName) diffs.push({ field: 'Father Name', old: existingContact.fatherName, new: fatherName });
                            const addrFields = ['hNo', 'street', 'location', 'area', 'city', 'state', 'pincode'];
                            addrFields.forEach(f => {
                                const newVal = personalAddress[f];
                                const oldVal = existingContact.personalAddress?.[f];
                                const oldDisplayVal = (f === 'location' && oldVal?.lookup_value) ? oldVal.lookup_value : oldVal;
                                if (newVal && String(oldDisplayVal || '').trim() !== String(newVal).trim()) {
                                    diffs.push({ field: `Address ${f.toUpperCase()}`, old: oldDisplayVal, new: newVal });
                                }
                            });

                            // Route ONLY actual data mismatches to Conflict UI
                            if (diffs.length > 0) {
                                // CASE: Conflict Detected (Allow Edit/Merge for all mobile matches)
                                if (!resolution) {
                                    results.conflicts.push({
                                        row: i + 1, rowKey, type: 'owner', unitNo, mobile: mobile || 'N/A',
                                        providedName: name, providedFatherName: fatherName,
                                        providedHNo: hNo, providedLoc: locality,
                                        existingName: existingContact.name, existingFatherName: existingContact.fatherName,
                                        existingHNo: existingContact.personalAddress?.hNo,
                                        existingLoc: existingContact.personalAddress?.location?.lookup_value || existingContact.personalAddress?.location,
                                        reason: diffs.length > 0 ? 'Data Mismatch (' + diffs.map(d => d.field).join(', ') + ')' : 'Manual Review Requested'
                                    });
                                    ownerId = "CONFLICT_PENDING";
                                } else {
                                    // Handle Conflict Resolutions
                                    if (resolution === 'UPDATE_SYSTEM') {
                                        if (name) existingContact.name = name;
                                        if (fatherName) existingContact.fatherName = fatherName;
                                        const resolvedAddress = await resolveHierarchicalAddress(personalAddress);
                                        existingContact.personalAddress = { ...(existingContact.personalAddress?.toObject?.() || existingContact.personalAddress || {}), ...resolvedAddress };
                                        existingContact.markModified('personalAddress');
                                        Object.assign(existingContact, assignmentUpdate);
                                        if (!existingContact.tags) existingContact.tags = [];
                                        [ 'Property Owner', propertyTag ].forEach(t => { if (!existingContact.tags.includes(t)) existingContact.tags.push(t); });
                                        await existingContact.save();
                                        ownerId = existingContact._id;
                                        results.contactsFound++;
                                        results.duplicates.push({ name: existingContact.name, mobile: mobile || existingContact.phones?.[0]?.number, _id: existingContact._id });
                                    } else if (resolution === 'KEEP_SYSTEM') {
                                        ownerId = existingContact._id;
                                        results.contactsFound++;
                                        results.duplicates.push({ name: existingContact.name, mobile: mobile || existingContact.phones?.[0]?.number, _id: existingContact._id });
                                    } else if (resolution === 'CREATE_NEW') {
                                        const resolvedAddress = await resolveHierarchicalAddress(personalAddress);
                                        const newContact = await Contact.create({
                                            name: name || 'Unknown Owner', fatherName: fatherName,
                                            phones: mobile ? [{ number: mobile, type: 'Personal' }] : [],
                                            emails: email ? [{ address: email, type: 'Personal' }] : [],
                                            personalAddress: resolvedAddress, ...assignmentUpdate, source: commonSource,
                                            tags: ['Property Owner', propertyTag]
                                        });
                                        ownerId = newContact._id;
                                        results.contactsCreated++;
                                    } else if (resolution === 'CUSTOM_MERGE') {
                                        const customData = resolutions[rowKey]?.customData || {};
                                        if (customData.name) existingContact.name = customData.name;
                                        if (customData.fatherName) existingContact.fatherName = customData.fatherName;
                                        
                                        const addressToResolve = customData.personalAddress ? { ...personalAddress, ...customData.personalAddress } : personalAddress;
                                        const resolvedAddress = await resolveHierarchicalAddress(addressToResolve);
                                        existingContact.personalAddress = { ...(existingContact.personalAddress?.toObject?.() || existingContact.personalAddress || {}), ...resolvedAddress };
                                        existingContact.markModified('personalAddress');
                                        
                                        Object.assign(existingContact, assignmentUpdate);
                                        if (!existingContact.tags) existingContact.tags = [];
                                        [ 'Property Owner', propertyTag ].forEach(t => { if (!existingContact.tags.includes(t)) existingContact.tags.push(t); });
                                        
                                        await existingContact.save();
                                        ownerId = existingContact._id;
                                        results.contactsFound++;
                                        results.duplicates.push({ name: existingContact.name, mobile: mobile || existingContact.phones?.[0]?.number, _id: existingContact._id });
                                    }
                                }
                            } else {
                                // CASE: Perfect Match (No Diffs at all)
                                ownerId = existingContact._id;
                                results.contactsFound++;
                                results.duplicates.push({ name: existingContact.name, mobile: mobile || existingContact.phones?.[0]?.number, _id: existingContact._id });

                                if (!dryRun) {
                                    if (!existingContact.tags) existingContact.tags = [];
                                    [ 'Property Owner', propertyTag ].forEach(t => {
                                        if (!existingContact.tags.includes(t)) existingContact.tags.push(t);
                                    });
                                    Object.assign(existingContact, assignmentUpdate);
                                    await existingContact.save();
                                }
                            }
                        }
                        // CASE: New Contact
                        else {
                            if (dryRun) {
                                ownerId = "SIMULATED_ID";
                                results.contactsCreated++;
                            } else {
                                const resolvedAddress = await resolveHierarchicalAddress(personalAddress);
                                const newContact = await Contact.create({
                                    name: name || 'Unknown Owner', fatherName: fatherName,
                                    phones: mobile ? [{ number: mobile, type: 'Personal' }] : [],
                                    emails: email ? [{ address: email, type: 'Personal' }] : [],
                                    personalAddress: resolvedAddress, ...assignmentUpdate, source: commonSource,
                                    tags: ['Property Owner', propertyTag]
                                });
                                ownerId = newContact._id;
                                results.contactsCreated++;
                            }
                        }

                        // 🚀 [FIXED] Cache by BOTH Mobile and Composite key to prevent intra-batch duplicates
                        if (ownerId && ownerId !== "CONFLICT_PENDING") {
                            if (mobile) contactCache.set(mobile, ownerId);
                            if (name) contactCache.set(compositeKey, ownerId);
                        }
                    }
                    if (ownerId && ownerId !== "CONFLICT_PENDING") {
                        const existingOwners = inventory.owners || [];
                        const existingOwnerIds = existingOwners.map(o => (o._id ? o._id.toString() : o.toString()));
                        const invIdStr = inventory._id.toString();

                        // 🚀 [NEW] Ownership Conflict Detection
                        if (existingOwnerIds.length > 0 && !existingOwnerIds.includes(ownerId.toString())) {
                            const resolution = resolutions[rowKey]?.ownership;

                            if (!resolution) {
                                results.conflicts.push({
                                    row: i + 1,
                                    rowKey,
                                    type: 'ownership',
                                    unitNo,
                                    mobile: mobile || 'N/A',
                                    existingOwnerNames: existingOwners.map(o => o.name || 'Unknown').join(', '),
                                    newOwnerName: name || 'Unknown Owner',
                                    reason: 'Property already has different owner(s)'
                                });
                                ownerId = "CONFLICT_PENDING";
                            } else {
                                if (resolution !== 'SKIP_UPDATE' && !dryRun) {
                                    let finalOwners = [...existingOwnerIds];
                                    let removedOwnerIds = [];

                                    if (resolution === 'REPLACE_OWNER' && !unitsClearedInThisBatch.has(invIdStr)) {
                                        removedOwnerIds = [...existingOwnerIds];
                                        finalOwners = [];
                                        unitsClearedInThisBatch.add(invIdStr);
                                    }

                                    if (!finalOwners.includes(ownerId.toString())) {
                                        finalOwners.push(ownerId.toString());
                                    }

                                    updates.owners = finalOwners;

                                    if (removedOwnerIds.length > 0) {
                                        const ownerHistoryEntries = removedOwnerIds.map(id => ({
                                            date: new Date(),
                                            author: req.user?._id || inventory.assignedTo || null,
                                            contactId: id,
                                            role: 'Owner',
                                            type: 'Removed',
                                            source: 'Import'
                                        }));
                                        
                                        if (!updates.$push) updates.$push = {};
                                        if (!updates.$push.ownerHistory) updates.$push.ownerHistory = { $each: [] };
                                        updates.$push.ownerHistory.$each.push(...ownerHistoryEntries);

                                        try {
                                            const unitLabel = inventory.unitNo || inventory.unitNumber || 'unit';
                                            const projectLabel = inventory.projectName ? inventory.projectName.replace(/\s+/g, '') : 'project';
                                            const tagToAdd = `previous_owner_${unitLabel}_${projectLabel}`.toLowerCase();
                                            
                                            const Contact = mongoose.models.Contact || mongoose.model('Contact');
                                            await Contact.updateMany(
                                                { _id: { $in: removedOwnerIds } },
                                                { $addToSet: { tags: tagToAdd } }
                                            );
                                        } catch (tagErr) {
                                            console.error("[InventorySync] Failed to auto-tag removed owners:", tagErr.message);
                                        }
                                    }
                                }
                            }
                        } else if (!dryRun) {
                            // No conflict, just append (it's the first owner, or already an owner)
                            let finalOwners = [...existingOwnerIds];
                            if (!finalOwners.includes(ownerId.toString())) {
                                finalOwners.push(ownerId.toString());
                            }
                            updates.owners = finalOwners;
                        }
                    }
                }

                // 3. Resolve/Create Associate
                if (associateMobile || associateName) {
                    let associateId = null;
                    const mobile = String(associateMobile || '').trim();
                    const name = String(associateName || '').trim();

                    // 🚀 [FIXED] Associate Composite Key should only use Associate's own data (name and mobile)
                    const associateCompositeKey = `assoc|${name}|${mobile}`.toLowerCase();

                    if (mobile && contactCache.has(mobile)) {
                        associateId = contactCache.get(mobile);
                    } else if (!mobile && name && contactCache.has(associateCompositeKey)) {
                        associateId = contactCache.get(associateCompositeKey);
                    } else {
                        // 🚀 [HARDENED] Associate Matching: Mobile first.
                        // We do NOT use the Owner's address (hNo, locality) to match the Associate.
                        let contactByMobile = mobile ? await Contact.findOne({ 'phones.number': mobile }) : null;
                        
                        let contactByLegal = null;
                        if (!mobile && name) {
                            // If no mobile is provided for associate, try a strict name match as fallback.
                            const legalQuery = { 
                                name: { $regex: new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`, 'i') }
                            };
                            // In a robust system, matching only by name is risky, but it's the only fallback here.
                            contactByLegal = await Contact.findOne(legalQuery);
                        }

                        const existingContact = contactByMobile || contactByLegal;

                        if (existingContact) {
                            associateId = existingContact._id;
                            if (!dryRun) {
                                // 🚀 Update tags and assignment for existing associate
                                await Contact.findByIdAndUpdate(associateId, {
                                    $addToSet: { tags: { $each: ['Property Owner', 'Associate', propertyTag] } },
                                    $set: {
                                        owner: rowAssignedTo,
                                        team: rowTeam,
                                        teams: Array.isArray(rowTeam) ? rowTeam : [rowTeam],
                                        visibleTo: rowVisibleTo
                                    }
                                });
                            }
                        } else if (!dryRun) {
                            // 🚀 [FIXED] Do NOT inherit Owner's address for the Associate
                            const newContact = await Contact.create({
                                name: name || 'Unknown Associate',
                                phones: mobile ? [{ number: mobile, type: 'Personal' }] : [],
                                emails: associateEmail ? [{ address: associateEmail, type: 'Personal' }] : [],
                                personalAddress: {}, // Empty address since Associate address fields are not in the mapping
                                ...assignmentUpdate,
                                source: await cachedResolveLookup('Source', 'Bulk Owner Update'),
                                tags: ['Property Owner', 'Associate', propertyTag]
                            });
                            associateId = newContact._id;
                        } else {
                            associateId = "SIMULATED_ID";
                        }
                        
                        if (associateId && associateId !== "SIMULATED_ID") {
                            if (mobile) contactCache.set(mobile, associateId);
                            if (name) contactCache.set(associateCompositeKey, associateId);
                        }
                    }

                    if (associateId && associateId !== "SIMULATED_ID" && !dryRun) {
                        const existingAssociates = inventory.associates || [];
                        const existingIndex = existingAssociates.findIndex(a => a.contact && a.contact.toString() === associateId.toString());
                        
                        if (existingIndex > -1) {
                            // 🚀 [SENIOR] Synchronize Relationship for existing associate
                            existingAssociates[existingIndex].relationship = relationship || existingAssociates[existingIndex].relationship || 'Associate';
                            updates.associates = existingAssociates;
                        } else {
                            // Add new associate
                            updates.associates = [...existingAssociates, { contact: associateId, relationship: relationship || 'Associate' }];
                        }
                    }
                }

                // 4. Save Updates (Inventory Assignment Persistence)
                if (!dryRun) {
                    updates.assignedTo = rowAssignedTo;
                    updates.team = rowTeam;
                    updates.visibleTo = rowVisibleTo;

                    const mongoUpdate = {};
                    const setOps = { ...updates };
                    delete setOps.$push;
                    
                    if (Object.keys(setOps).length > 0) {
                        mongoUpdate.$set = setOps;
                    }
                    if (updates.$push) {
                        mongoUpdate.$push = updates.$push;
                    }

                    if (Object.keys(mongoUpdate).length > 0) {
                        await Inventory.findByIdAndUpdate(inventory._id, mongoUpdate);
                    }
                }

                // 🚀 [SENIOR] Track success for Audit Trail
                results.successLogs = results.successLogs || [];
                results.successLogs.push({
                    unitNo: unitNo,
                    project: projectName,
                    block: block,
                    status: dryRun ? 'Validated' : (ownerId === "CONFLICT_PENDING" ? 'Conflict Pending' : 'Processed')
                });

            } catch (itemErr) {
                console.error(`Error processing row ${i + 1}:`, itemErr);
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
            plannedUpdates: results.plannedUpdates,
            duplicates: results.duplicates || [], // 🚀 Return matches for UI transparency
            successLogs: results.successLogs,
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
        let query = { block: { $ne: null, $exists: true } };
        
        if (project) {
            query.projectName = { $regex: new RegExp(`^${escapeRegExp(project)}$`, 'i') };
        }
        
        const blocks = await Inventory.distinct("block", query);
        
        const sortedBlocks = blocks.filter(b => b && b.trim() !== "").sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        res.status(200).json({ success: true, blocks: sortedBlocks });
    } catch (error) {
        console.error("[GET_BLOCKS_ERROR]", error);
        res.status(500).json({ success: false, error: "Failed to fetch blocks" });
    }
};

/**
 * Enterprise Elite Suggested Owners Engine v2
 * High-performance, secure, and fuzzy matching for property stakeholders.
 */
export const getSuggestedOwners = async (req, res) => {
    try {
        const { id } = req.params;
        const inventory = await Inventory.findById(id).lean();
        if (!inventory) return res.status(404).json({ success: false, message: "Inventory not found" });

        // 1. [NORMALIZATION] Prepare search vectors
        const unitRaw = (inventory.unitNo || inventory.unitNumber || "").trim();
        if (!unitRaw) return res.status(200).json({ success: true, data: [] });

        // Fuzzy unit pattern: Matches "101" in "101", "A-101", "101/B", "Flat 101"
        const fuzzyUnitPattern = new RegExp(`.*${escapeRegExp(unitRaw)}.*`, 'i');
        
        const existingContactIds = [
            ...(inventory.owners || []),
            ...(inventory.associates || []).map(a => a.contact)
        ].map(c => c?.toString()).filter(Boolean);

        // 2. [SECURITY] Apply Hardened Visibility Filters
        const visibilityFilter = await getVisibilityFilter(req.user);

        // Helper to resolve Lookup ObjectId vs raw string mismatch (critical for imported data)
        const resolveQueryValues = async (val, lookupType) => {
            if (!val) return [];
            const values = [val];
            const isObjectId = mongoose.Types.ObjectId.isValid(val);
            if (isObjectId) {
                const lookup = await Lookup.findById(val).lean();
                if (lookup && lookup.lookup_value) {
                    values.push(lookup.lookup_value);
                }
                values.push(val.toString());
            } else {
                const lookup = await Lookup.findOne({ 
                    lookup_type: lookupType, 
                    lookup_value: { $regex: new RegExp(`^${escapeRegExp(val.toString())}$`, 'i') } 
                }).lean();
                if (lookup) {
                    values.push(lookup._id);
                    values.push(lookup._id.toString());
                }
            }
            return values;
        };

        const cityQueryValues = await resolveQueryValues(inventory.address?.city, 'City');

        const fuzzyUnitPersonal = [{ 'personalAddress.hNo': { $regex: fuzzyUnitPattern } }];
        const blankUnitPersonal = [
            { 'personalAddress.hNo': { $in: [null, "", undefined] } },
            { 'personalAddress.hNo': { $exists: false } }
        ];

        const fuzzyUnitCorrespondence = [{ 'correspondenceAddress.hNo': { $regex: fuzzyUnitPattern } }];
        const blankUnitCorrespondence = [
            { 'correspondenceAddress.hNo': { $in: [null, "", undefined] } },
            { 'correspondenceAddress.hNo': { $exists: false } }
        ];

        // First Query: Exact/Fuzzy House Number matches
        const exactSearchQueries = [];
        // Second Query: Blank House Number matches
        const fallbackSearchQueries = [];

        if (cityQueryValues.length > 0) {
            exactSearchQueries.push({
                $or: [
                    { $or: fuzzyUnitPersonal, 'personalAddress.city': { $in: cityQueryValues } },
                    { $or: fuzzyUnitCorrespondence, 'correspondenceAddress.city': { $in: cityQueryValues } }
                ]
            });
            fallbackSearchQueries.push({
                $or: [
                    { $or: blankUnitPersonal, 'personalAddress.city': { $in: cityQueryValues } },
                    { $or: blankUnitCorrespondence, 'correspondenceAddress.city': { $in: cityQueryValues } }
                ]
            });
        }

        const locationVal = inventory.address?.location || inventory.address?.area || inventory.address?.locality || inventory.projectName;
        if (locationVal) {
            const locationQueryValues = [];
            const fieldsToResolve = [
                { val: inventory.address?.location, type: 'Location' },
                { val: inventory.address?.area, type: 'Area' },
                { val: inventory.address?.locality, type: 'Locality' },
                { val: inventory.projectName, type: 'Project' }
            ];
            for (const item of fieldsToResolve) {
                if (item.val) {
                    const resolved = await resolveQueryValues(item.val, item.type);
                    locationQueryValues.push(...resolved);
                }
            }
            if (locationQueryValues.length === 0 && locationVal) {
                locationQueryValues.push(locationVal);
            }

            exactSearchQueries.push({
                $or: [
                    { $or: fuzzyUnitPersonal, $or: [ { 'personalAddress.location': { $in: locationQueryValues } }, { 'personalAddress.area': { $in: locationQueryValues } }, { 'personalAddress.locality': { $in: locationQueryValues } } ] },
                    { $or: fuzzyUnitCorrespondence, $or: [ { 'correspondenceAddress.location': { $in: locationQueryValues } }, { 'correspondenceAddress.area': { $in: locationQueryValues } }, { 'correspondenceAddress.locality': { $in: locationQueryValues } } ] }
                ]
            });

            fallbackSearchQueries.push({
                $or: [
                    { $or: blankUnitPersonal, $or: [ { 'personalAddress.location': { $in: locationQueryValues } }, { 'personalAddress.area': { $in: locationQueryValues } }, { 'personalAddress.locality': { $in: locationQueryValues } } ] },
                    { $or: blankUnitCorrespondence, $or: [ { 'correspondenceAddress.location': { $in: locationQueryValues } }, { 'correspondenceAddress.area': { $in: locationQueryValues } }, { 'correspondenceAddress.locality': { $in: locationQueryValues } } ] }
                ]
            });
        }

        if (exactSearchQueries.length === 0 && fallbackSearchQueries.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        // 3. [EXECUTION] Run Exact matches first
        let suggestedContacts = [];
        if (exactSearchQueries.length > 0) {
            suggestedContacts = await Contact.find({ 
                $and: [
                    { $or: exactSearchQueries },
                    { _id: { $nin: existingContactIds } },
                    visibilityFilter
                ]
            })
            .select('name phones emails personalAddress correspondenceAddress title visibleTo assignedTo assignment teams')
            .limit(10)
            .lean();
        }

        // If we didn't fill the 10 spots, fetch fallbacks (blank unit matches)
        if (suggestedContacts.length < 10 && fallbackSearchQueries.length > 0) {
            const alreadyFetchedIds = [...existingContactIds, ...suggestedContacts.map(c => c._id.toString())];
            const fallbacks = await Contact.find({
                $and: [
                    { $or: fallbackSearchQueries },
                    { _id: { $nin: alreadyFetchedIds } },
                    visibilityFilter
                ]
            })
            .select('name phones emails personalAddress correspondenceAddress title visibleTo assignedTo assignment teams')
            .limit(10 - suggestedContacts.length)
            .lean();
            
            suggestedContacts = [...suggestedContacts, ...fallbacks];
        }


        // 4. [HYDRATION] Resolve all lookup references for UI parity
        const uniqueLookupIds = new Set();
        suggestedContacts.forEach(c => {
            const addrFields = ['city', 'state', 'locality', 'area', 'location', 'pincode', 'pinCode', 'tehsil', 'postOffice'];
            ['personalAddress', 'correspondenceAddress'].forEach(type => {
                if (c[type]) {
                    addrFields.forEach(f => {
                        const val = c[type][f];
                        if (val && mongoose.Types.ObjectId.isValid(val)) uniqueLookupIds.add(val.toString());
                    });
                }
            });
            if (c.title && mongoose.Types.ObjectId.isValid(c.title)) uniqueLookupIds.add(c.title.toString());
        });

        const lookups = uniqueLookupIds.size > 0 
            ? await Lookup.find({ _id: { $in: [...uniqueLookupIds] } }).select('lookup_value').lean() 
            : [];
        const lookupMap = new Map(lookups.map(l => [l._id.toString(), l.lookup_value]));

        // 5. [SCORING] Finalize Data & Rank by matching vectors
        const finalData = suggestedContacts.map(c => {
            const cObj = { ...c };
            const hydrate = (addr) => {
                if (!addr) return;
                const addrFields = ['city', 'state', 'locality', 'area', 'location', 'pincode', 'pinCode', 'tehsil', 'postOffice'];
                addrFields.forEach(f => {
                    const val = addr[f];
                    if (val && mongoose.Types.ObjectId.isValid(val)) addr[f] = lookupMap.get(val.toString()) || val;
                });
            };
            hydrate(cObj.personalAddress);
            hydrate(cObj.correspondenceAddress);
            if (cObj.title && mongoose.Types.ObjectId.isValid(cObj.title)) cObj.title = lookupMap.get(cObj.title.toString()) || cObj.title;
            
            // Intelligence Scoring with Prioritization Rules
            let score = 0;
            const personalHNo = (cObj.personalAddress?.hNo || "").toString().trim();
            const corresHNo = (cObj.correspondenceAddress?.hNo || "").toString().trim();
            
            const matchHNo = (hNo) => {
                if (!hNo) return 0; // Blank/empty
                const val = hNo.toLowerCase();
                const unit = unitRaw.toLowerCase();
                if (val === unit) return 100; // Exact H.No Match (Highest Priority)
                if (val.includes(unit)) return 80; // Partial Match (Second Priority)
                return -1; // Mismatch
            };

            const personalScore = matchHNo(personalHNo);
            const corresScore = matchHNo(corresHNo);
            
            // Determine maximum score. If both are blank, it remains a suggested option at low priority.
            const maxScore = Math.max(personalScore, corresScore);
            if (maxScore > 0) {
                score = maxScore;
            } else if (personalScore === 0 && corresScore === 0) {
                score = 20; // Blank House Number Option (Match option kept)
            } else {
                score = 0; // Fallback Mismatch
            }
            
            cObj.matchConfidence = score;
            return cObj;
        }).sort((a, b) => b.matchConfidence - a.matchConfidence);

        res.status(200).json({ success: true, data: finalData });
    } catch (error) {
        console.error("[ENTERPRISE_SUGGESTED_OWNERS_ERROR]", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
