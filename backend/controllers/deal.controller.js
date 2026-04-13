import mongoose from "mongoose";
import Deal from "../models/Deal.js";
import Activity from "../models/Activity.js";
import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import Contact from "../models/Contact.js";
import { paginate } from "../utils/pagination.js";
import smsService from "../src/modules/sms/sms.service.js";
import Lookup from "../models/Lookup.js";
import AuditLog from "../models/AuditLog.js";
import { syncDocumentsToContact } from "../utils/sync.js";
import CampaignEngine from "../services/CampaignEngine.js";
import { getVisibilityFilter } from "../utils/visibility.js";
import Project from "../models/Project.js"; // Added to resolve [matchDeals] population error

// --- OPTIMIZATION: In-Memory Lookup Cache (Process Scoped) ---
const _lookupResolveCache = new Map();

export const matchDeals = async (req, res) => {
    try {
        const { 
            leadId, 
            budgetFlexibility = 20, 
            sizeFlexibility = 20,
            weights: weightsParam 
        } = req.query;

        if (!leadId) {
            return res.status(400).json({ success: false, error: "leadId is required" });
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

        const lead = await Lead.findById(leadId)
            .populate('requirement', 'lookup_value')
            .populate('propertyType', 'lookup_value')
            .populate('subType', 'lookup_value')
            .populate('facing', 'lookup_value')
            .populate('direction', 'lookup_value')
            .populate('roadWidth', 'lookup_value')
            .populate('location', 'lookup_value')
            .lean();

        if (!lead) {
            return res.status(404).json({ success: false, error: "Lead not found" });
        }

        const leadReq = String(lead.requirement?.lookup_value || lead.requirement || "").toLowerCase();
        const leadCats = (Array.isArray(lead.propertyType) ? lead.propertyType : [])
            .map(c => String(c?.lookup_value || c || "").toLowerCase())
            .filter(Boolean);

        // 1. Fetch potential deals
        const visibilityFilter = await getVisibilityFilter(req.user);

        // 🛠️ SENIOR DIAGNOSTIC LOG (Harden for potential undefined user)
        if (req.user) {
            console.log(`[VISIBLE_AUDIT] User: ${req.user.email}, Scope: ${req.user.dataScope}, Teams: ${JSON.stringify(req.user.teams?.map(t => t._id || t))}`);
        } else {
            console.log(`[VISIBLE_AUDIT] Anonymous request - Visibility restricted to public data.`);
        }
        console.log(`[VISIBLE_AUDIT] Generated Filter: ${JSON.stringify(visibilityFilter, null, 2)}`);

        const query = {
            ...visibilityFilter,
            isVisible: { $ne: false },
            stage: { $nin: ["Cancelled", "Closed Lost", "Sold Out"] }
        };

        const deals = await Deal.find(query)
            .populate('inventoryId')
            .populate('projectId')
            .populate('category', 'lookup_value', 'Lookup')
            .populate('intent', 'lookup_value', 'Lookup')
            .populate('subCategory', 'lookup_value', 'Lookup')
            .lean();

        // 2. Filter and Score
        const matchingDeals = deals.filter(deal => {
            // --- STAGE 1: HARD FILTERS ---
            const dealIntent = String(deal.intent?.lookup_value || deal.intent || "").toLowerCase();
            const dealCategory = String(deal.category?.lookup_value || deal.category || "").toLowerCase();

            // A. Intent Symmetry
            let intentMatched = false;
            if (dealIntent.includes("sell") && (leadReq.includes("buy") || leadReq.includes("purchase"))) intentMatched = true;
            else if (dealIntent.includes("rent") && (leadReq.includes("rent") || leadReq.includes("lease"))) intentMatched = true;
            else if (dealIntent.includes("lease") && (leadReq.includes("lease") || leadReq.includes("rent"))) intentMatched = true;
            else if ((dealIntent.includes("buy") || dealIntent.includes("purchase")) && leadReq.includes("sell")) intentMatched = true;

            if (!intentMatched) return false;

            // B. Category Alignment
            let catMatched = false;
            if (dealCategory.includes("res") && leadCats.some(c => c && c.includes("res"))) catMatched = true;
            else if (dealCategory.includes("comm") && leadCats.some(c => c && c.includes("comm"))) catMatched = true;
            else if (dealCategory.includes("ind") && leadCats.some(c => c && c.includes("ind"))) catMatched = true;
            else if (!dealCategory || (leadCats.length === 0)) catMatched = true;

            if (!catMatched) return false;

            return true;
        }).map(deal => {
            // --- STAGE 2: WEIGHTED SCORING ---
            let score = 0;
            const matchDetails = [];

            // 1. Sub-Category / Type (Weight: type)
            const dealSub = (deal.subCategory?.lookup_value || "").toLowerCase();
            const leadSubs = (lead.subType || []).filter(Boolean).map(s => String(s.lookup_value || s || "").toLowerCase());
            if (dealSub && leadSubs.some(s => s && s.includes(dealSub))) {
                score += (weights.type || 20);
                matchDetails.push("Unit Type Match");
            }

            // 2. Budget / Price (Weight: budget)
            const dealPrice = deal.price || deal.quotePrice || 0;
            if (dealPrice > 0) {
                const min = lead.budgetMin || 0;
                const max = lead.budgetMax || Infinity;
                if (dealPrice >= min && dealPrice <= max) {
                    score += (weights.budget || 25);
                    matchDetails.push("Budget Match");
                } else if (dealPrice >= min * (1 - bFlex) && dealPrice <= max * (1 + bFlex)) {
                    score += (weights.budget || 25) * 0.6;
                    matchDetails.push("Approximate Budget Match");
                }
            }

            // 3. Location (Weight: location)
            const dealLoc = String(deal.location?.lookup_value || deal.location?._id || deal.location || deal.projectName || "").toLowerCase();
            const leadLocArea = String(lead.locArea || "").toLowerCase();
            const leadSelectedLoc = String(lead.location?.lookup_value || lead.location?._id || lead.location || "").toLowerCase();
            const leadCity = String(lead.locCity || "").toLowerCase();
            const leadSector = String(lead.sector || "").toLowerCase();
            const leadProjects = Array.isArray(lead.projectName) ? lead.projectName : [];

            let locScore = 0;
            const locWeight = (weights.location || 30);

            // Tier 1: Project/ProjectName Match (Highest)
            if (deal.projectName && typeof deal.projectName === 'string' && leadProjects.some(p => p && typeof p === 'string' && deal.projectName.toLowerCase().includes(p.toLowerCase()))) {
                locScore = locWeight;
                matchDetails.push("Exact Project Match");
            } 
            // Tier 2: General Area Match
            else if ((leadLocArea && dealLoc.includes(leadLocArea)) || (leadSelectedLoc && dealLoc.includes(leadSelectedLoc))) {
                locScore = locWeight;
                matchDetails.push("Location Match");
            }
            else {
                // Tier 3: Granular Address Matching
                let addressPoints = 0;
                
                // Check Sector
                const dealSector = (deal.inventoryId?.sector || "").toLowerCase();
                if (leadSector && (dealSector.includes(leadSector) || leadSector.includes(dealSector))) {
                    addressPoints += locWeight * 0.7;
                    matchDetails.push("Sector Correlation");
                }
                
                // Check City
                const dealCity = (deal.inventoryId?.city || "").toLowerCase();
                if (leadCity && (dealCity.includes(leadCity) || leadCity.includes(dealCity))) {
                    addressPoints += locWeight * 0.3;
                    matchDetails.push("City match");
                }
                
                locScore = Math.min(addressPoints, locWeight);
            }
            
            score += locScore;

            // 4. Orientation / Size / Specs (Weight: size/orientation/specs)
            // For now, mapping orientation/specs/size under the 'size' weight for UI consistency
            let extraMatchPoints = 0;
            const sizeWeight = (weights.size || weights.orientation || 25);

            if (deal.inventoryId) {
                const inv = deal.inventoryId;
                const lFacing = (lead.facing || []).filter(Boolean).map(f => String(f._id || f));
                const lDir = (lead.direction || []).filter(Boolean).map(d => String(d._id || d));
                
                if (lFacing.includes(String(inv.facing))) extraMatchPoints += 5;
                if (lDir.includes(String(inv.direction))) extraMatchPoints += 5;
                
                // Transaction Type / Ownership match
                if (lead.transactionType && inv.ownership && lead.transactionType === inv.ownership) extraMatchPoints += 5;
            }
            
            if (extraMatchPoints > 0) {
                score += Math.min(extraMatchPoints, sizeWeight);
                matchDetails.push("Orientation & Specs Correlation");
            }

            return {
                ...deal,
                score: Math.min(score, 100),
                matchDetails
            };
        });

        const sorted = matchingDeals.sort((a,b) => b.score - a.score).slice(0, 50);
        return res.status(200).json({ success: true, count: sorted.length, data: sorted });
    } catch (error) {
        console.error("[matchDeals Error]:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const syncInventoryStatus = async (deal) => {
    if (!deal.inventoryId) return;

    let targetStatus = 'Active';
    if (deal.stage === 'Closed') {
        targetStatus = 'Sold Out';
    } else if (deal.stage === 'Booked') {
        targetStatus = 'Blocked';
    }

    await Inventory.findByIdAndUpdate(deal.inventoryId, { status: targetStatus });
};

export const getDeals = async (req, res) => {
    try {
        const { 
            page = 1, limit = 25, search = "", 
            projectId, inventoryId, category, subCategory, 
            status, contactPhone 
        } = req.query;
        const visibilityFilter = await getVisibilityFilter(req.user);

        // 🛠️ SENIOR DIAGNOSTIC LOG (Harden for potential undefined user)
        if (req.user) {
            console.log(`[VISIBLE_AUDIT] User: ${req.user.email}, Scope: ${req.user.dataScope}, Teams: ${JSON.stringify(req.user.teams?.map(t => t._id || t))}`);
        } else {
            console.log(`[VISIBLE_AUDIT] Anonymous request - Visibility restricted to public data.`);
        }
        console.log(`[VISIBLE_AUDIT] Generated Filter: ${JSON.stringify(visibilityFilter, null, 2)}`);

        let query = { ...visibilityFilter, isVisible: { $ne: false } };

        if (contactPhone) {
            query.$or = [
                { "partyStructure.buyer.mobile": { $regex: new RegExp(`${contactPhone}$`) } },
                { "partyStructure.owner.mobile": { $regex: new RegExp(`${contactPhone}$`) } }
            ];
        }

        // ROBUST FILTER RESOLUTION (Handle both Names and IDs)
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const resolveFilter = async (type, value) => {
            if (!value) return null;
            if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value.toString());

            const cacheKey = `${type}:${value}`;
            if (_lookupResolveCache.has(cacheKey)) return _lookupResolveCache.get(cacheKey);

            const lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapeRegExp(value)}$`, 'i') } });
            const result = lookup ? lookup._id : null;
            
            if (result) {
                if (_lookupResolveCache.size > 200) _lookupResolveCache.clear();
                _lookupResolveCache.set(cacheKey, result);
            }
            return result;
        };

        if (category) query.category = await resolveFilter('Category', category);
        if (subCategory) query.subCategory = await resolveFilter('SubCategory', subCategory);
        if (status) query.status = await resolveFilter('Status', status);

        if (search) {
            query = {
                $or: [
                    { dealId: { $regex: search, $options: "i" } },
                    { unitNo: { $regex: search, $options: "i" } },
                    { location: { $regex: search, $options: "i" } },
                    { projectName: { $regex: search, $options: "i" } }
                ]
            };
        }

        if (projectId) query.projectId = projectId;
        if (inventoryId) query.inventoryId = inventoryId;

        if (req.query.contactId) {
            const contactIds = req.query.contactId.split(',').filter(id => id && mongoose.Types.ObjectId.isValid(id));
            
            if (contactIds.length > 0) {
                query.$or = query.$or || [];
                
                // 1. Exact ID Matching
                query.$or.push(
                    { owner: { $in: contactIds } },
                    { "partyStructure.owner": { $in: contactIds } },
                    { associatedContact: { $in: contactIds } },
                    { "partyStructure.buyer": { $in: contactIds } }
                );
    
                // 2. Smart Identity Matching (Phone/Email) for Legacy data or Cross-Entity links
                const identities = await Promise.all(contactIds.map(async (id) => {
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
                const identityMatches = [];
                phones.forEach(phone => {
                    identityMatches.push(
                        { owner: phone },
                        { "partyStructure.owner": phone },
                        { associatedContact: phone },
                        { "partyStructure.buyer": phone }
                    );
                });
                emails.forEach(email => {
                    identityMatches.push(
                        { owner: email },
                        { "partyStructure.owner": email },
                        { associatedContact: email },
                        { "partyStructure.buyer": email }
                    );
                });
                query.$or.push(...identityMatches);
            }
        }
    }

        const populateFields = [
            { path: 'inventoryId' },
            { path: 'projectId' },
            { path: 'owner', select: 'name phones emails', model: 'Contact' },
            { path: 'associatedContact', select: 'name phones emails', model: 'Contact' },
            { path: 'assignedTo', select: 'fullName name email' },
            { path: 'partyStructure.buyer', select: 'name phones emails', model: 'Contact' },
            { path: 'partyStructure.channelPartner', select: 'name phones emails', model: 'Contact' },
            { path: 'partyStructure.internalRM', select: 'fullName name email' },
            { path: 'category', select: 'lookup_value', model: 'Lookup' },
            { path: 'subCategory', select: 'lookup_value', model: 'Lookup' },
            { path: 'intent', select: 'lookup_value', model: 'Lookup' },
            { path: 'status', select: 'lookup_value', model: 'Lookup' },
            { path: 'team', select: 'name' },
            { path: 'teams', select: 'name' }
        ];
        const results = await paginate(Deal, query, Number(page), Number(limit), { updatedAt: -1 }, populateFields);

        // --- OPTIMIZATION 11: Single Aggregation for Category Counts ---
        const categoryStatsAgg = await Deal.aggregate([
            { $match: { ...query } },
            {
                $lookup: {
                    from: 'inventories',
                    localField: 'inventoryId',
                    foreignField: '_id',
                    as: 'inventory'
                }
            },
            { $unwind: { path: '$inventory', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    activeCategory: { $ifNull: ["$category", "$inventory.category"] }
                }
            },
            {
                $group: {
                    _id: "$activeCategory",
                    count: { $sum: 1 }
                }
            }
        ]);

        const categoryMapStats = new Map(categoryStatsAgg.map(s => [String(s._id), s.count]));
        const categories = await Lookup.find({ lookup_type: 'Category' }).lean();
        const categoryCounts = categories.map(cat => ({
            name: cat.lookup_value,
            count: categoryMapStats.get(String(cat._id)) || categoryMapStats.get(cat.lookup_value) || 0
        }));

        // Fetch latest activities for owners and associates
        const contactIds = results.records.reduce((acc, deal) => {
            if (deal.owner?._id) acc.push(deal.owner._id);
            if (deal.associatedContact?._id) acc.push(deal.associatedContact._id);
            return acc;
        }, []);

        let activityMap = {};
        if (contactIds.length > 0) {
            const activities = await Activity.aggregate([
                { $match: { entityId: { $in: contactIds }, entityType: "Contact" } },
                { $sort: { performedAt: -1 } },
                { $group: { _id: "$entityId", lastActivity: { $first: "$$ROOT" } } }
            ]);
            activities.forEach(a => {
                activityMap[a._id.toString()] = a.lastActivity;
            });
        }

        // --- OPTIMIZATION 10: Batch Inventory Fetch ---
        const inventoryIdsToFetch = [...new Set(results.records.map(d => d.inventoryId?._id || d.inventoryId).filter(Boolean))];
        const inventoryMap = new Map();
        if (inventoryIdsToFetch.length > 0) {
            const inventories = await Inventory.find({ _id: { $in: inventoryIdsToFetch } })
                .populate({ path: 'owners', model: 'Contact' })
                .populate({ path: 'associates.contact', model: 'Contact' })
                .select('+sizeLabel +sizeConfig') // Ensure these are included if they were excluded by default
                .lean();
            inventories.forEach(inv => inventoryMap.set(String(inv._id), inv));
        }

        // Attach last activity and live owner to each deal
        const enrichedRecords = results.records.map((deal) => {
            const dealObj = deal.toObject ? deal.toObject() : deal;

            // Live Owner Sync: Use batched inventory data
            if (!dealObj.closingDetails?.isClosed && dealObj.inventoryId) {
                const invId = dealObj.inventoryId?._id || dealObj.inventoryId;
                const inventory = inventoryMap.get(String(invId));
                if (inventory) {
                    if (inventory.owners && inventory.owners.length > 0) {
                        const invOwner = inventory.owners[0];
                        // Only overwrite if it's a valid populated object (Contact)
                        if (invOwner && typeof invOwner === 'object' && (invOwner.name || invOwner.fullName || invOwner.lookup_value)) {
                            dealObj.owner = invOwner;
                        }
                    }
                    if (inventory.associates && inventory.associates.length > 0) {
                        const invAssoc = inventory.associates[0].contact;
                        // Sync if empty OR if it's just an ID string (failed population)
                        if (!dealObj.associatedContact || typeof dealObj.associatedContact === 'string') {
                            if (invAssoc && typeof invAssoc === 'object' && (invAssoc.name || invAssoc.fullName)) {
                                dealObj.associatedContact = invAssoc;
                            }
                        }
                    }
                }
            }

            // Pick the latest between owner and associate activity
            const ownerId = deal.owner && typeof deal.owner === 'object' ? deal.owner._id : deal.owner;
            const assocId = deal.associatedContact && typeof deal.associatedContact === 'object' ? deal.associatedContact._id : deal.associatedContact;

            const ownerActivity = ownerId ? activityMap[ownerId.toString()] : null;
            const associateActivity = assocId ? activityMap[assocId.toString()] : null;

            dealObj.lastActivity = [ownerActivity, associateActivity]
                .filter(Boolean)
                .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))[0] || null;

            return dealObj;
        });

        res.json({
            success: true,
            ...results,
            categoryStats: categoryCounts,
            records: enrichedRecords
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getDealById = async (req, res) => {
    try {
        const populateFields = [
            { path: 'inventoryId' },
            { path: 'projectId' },
            { path: 'owner', model: 'Contact' },
            { path: 'associatedContact', model: 'Contact' },
            { path: 'assignedTo' },
            { path: 'partyStructure.owner', model: 'Contact' },
            { path: 'partyStructure.buyer', model: 'Contact' },
            { path: 'partyStructure.channelPartner', model: 'Contact' },
            { path: 'partyStructure.internalRM' },
            { path: 'category', select: 'lookup_value', model: 'Lookup' },
            { path: 'subCategory', select: 'lookup_value', model: 'Lookup' },
            { path: 'intent', select: 'lookup_value', model: 'Lookup' },
            { path: 'status', select: 'lookup_value', model: 'Lookup' },
            { path: 'team' },
            { path: 'teams' }
        ];
        const deal = await Deal.findById(req.params.id).populate(populateFields);
        if (!deal) {
            return res.status(404).json({ success: false, error: "Deal not found" });
        }
        res.json({
            success: true,
            data: deal,
            deal: deal // Backward compatibility
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Helper to convert empty strings to null for reference fields to avoid CastError during population
 */
const sanitizeData = (data) => {
    const refFields = [
        'inventoryId', 'projectId', 'unitType', 'propertyType', 'location', 'intent',
        'status', 'dealType', 'transactionType', 'source', 'owner', 'associatedContact',
        'category', 'subCategory', 'assignedTo', 'team', 'partyStructure.owner',
        'partyStructure.buyer', 'partyStructure.channelPartner', 'partyStructure.internalRM'
    ];
    const sanitized = { ...data };

    // Recursive sanitizer for nested objects like partyStructure
    const sanitizeValue = (val) => {
        if (val === "" || val === undefined || val === null) return null;
        if (typeof val === 'object' && !Array.isArray(val)) {
            // Reference fields MUST be ObjectIds. 
            // If we have an object, try to get _id. If no _id, return null to avoid CastError.
            return val._id || null;
        }
        return val;
    };


    refFields.forEach(field => {
        if (field.includes('.')) {
            const parts = field.split('.');
            if (sanitized[parts[0]]) {
                sanitized[parts[0]][parts[1]] = sanitizeValue(sanitized[parts[0]][parts[1]]);
            }
        } else {
            sanitized[field] = sanitizeValue(sanitized[field]);
        }
    });
    return sanitized;
};

export const addDeal = async (req, res) => {
    console.log('[DEBUG] Incoming Add Deal Payload:', JSON.stringify(req.body, null, 2));
    try {
        const sanitizedData = sanitizeData(req.body);

        // Rule: One Deal per Type per Inventory
        if (sanitizedData.inventoryId && sanitizedData.intent) {
            const query = {
                inventoryId: sanitizedData.inventoryId,
                stage: { $nin: ['Cancelled', 'Closed Lost'] }
            };

            // If intent is provided, check for that specific intent
            if (sanitizedData.intent) {
                query.intent = sanitizedData.intent;
            }

            const existingDeals = await Deal.find(query);

            // 1. If any deal of this type is already 'Closed' or 'Won', lock the type permanently
            const hasClosed = existingDeals.some(d => ['Closed', 'Closed Won', 'Won'].includes(d.stage));
            if (hasClosed) {
                return res.status(400).json({
                    success: false,
                    error: `This inventory unit has already been Closed/Won for this transaction type. No further deals are allowed.`
                });
            }

            // 2. If any deal is active (Open, Quote, Negotiation, Booked), block new ones
            const activeDeal = existingDeals.find(d => ['Open', 'Quote', 'Negotiation', 'Booked'].includes(d.stage));
            if (activeDeal) {
                const intentName = typeof activeDeal.intent === 'object' ? activeDeal.intent?.lookup_value : (activeDeal.intent || 'active');
                return res.status(400).json({
                    success: false,
                    error: `An active ${intentName} deal already exists for this inventory unit (#${activeDeal.dealId || activeDeal._id}). Please close or cancel the existing deal first.`
                });
            }
        }

        const deal = await Deal.create(sanitizedData);

        // Trigger Sync if documents were provided during creation
        if (sanitizedData.documents && Array.isArray(sanitizedData.documents)) {
            const metadata = {
                projectName: deal.projectName,
                block: deal.block,
                unitNumber: deal.unitNo
            };
            await syncDocumentsToContact(sanitizedData.documents, metadata);
        }

        // BUG D3 FIX: Write initial stageHistory entry so time-in-stage metrics work from day 1
        await Deal.findByIdAndUpdate(deal._id, {
            $push: {
                stageHistory: {
                    stage: deal.stage || 'Open',
                    enteredAt: new Date(),
                    triggeredBy: 'system',
                    reason: 'Deal created'
                }
            },
            $set: { stageChangedAt: new Date() }
        });

        await syncInventoryStatus(deal);
        
        // 🌐 WEBSITE PUBLISHING: Auto-generate slug and metadata if requested
        if (sanitizedData.publishOn?.website) {
            const slugBase = `${deal.projectName || 'property'}-${deal.unitNo || deal._id.toString().slice(-6)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            await Deal.findByIdAndUpdate(deal._id, {
                isPublished: true,
                publishedAt: new Date(),
                'websiteMetadata.slug': slugBase,
                'websiteMetadata.title': deal.projectName || 'New Listing',
                'websiteMetadata.description': deal.remarks || 'Check out this new property listing at Bharat Properties.'
            });
        }

        // Audit Log Deal Conversion
        if (sanitizedData.owner || sanitizedData.partyStructure?.buyer) {
            await AuditLog.logEntityUpdate(
                'deal_converted',
                'deal',
                deal._id,
                deal.projectName || 'New Deal',
                req.user?.id,
                { before: null, after: deal.stage || 'Open' },
                `Lead/Contact converted into an active Deal (#${deal.dealId || deal._id}).`
            );
        }

        // BUG D4 FIX: Correctly extract phone from phones array (Contact model)
        try {
            // NOTE: 'category' is a Mixed field and 'intent' is a String; do not populate them as they have no 'ref'
            const dealWithConfig = await Deal.findById(deal._id).populate('owner associatedContact');
            
            const extractPhone = (contact) => {
                if (!contact) return null;
                // If populated, it has a phones array. If mixed/other, check for phone/mobile field as fallback.
                if (contact.phones && Array.isArray(contact.phones) && contact.phones.length > 0) {
                    return contact.phones[0].number;
                }
                return contact.phone || contact.mobile || null;
            };

            const phone = extractPhone(dealWithConfig.owner) || extractPhone(dealWithConfig.associatedContact);
            
            if (phone) {
                smsService.sendSMSWithTemplate(phone, 'deal_created', {
                    dealId: dealWithConfig.dealId || deal._id.toString().slice(-6).toUpperCase(),
                    projectName: dealWithConfig.projectName || 'the property'
                }).catch(e => console.error('[SMS Trigger Error] New Deal failed:', e.message));
            }
        } catch (smsError) {
            console.error('[Notification Error] SMS trigger isolated:', smsError.message);
        }

        // 🚀 AUTO-MARKETING: Fire campaign engine for new deal (fire-and-forget, non-blocking)
        CampaignEngine.launch(deal._id).catch(err =>
            console.error('[CampaignEngine] Auto-launch error for new deal:', err.message)
        );

        res.status(201).json({ success: true, data: deal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateDeal = async (req, res) => {
    console.log('[DEBUG] Incoming Update Deal Payload:', JSON.stringify(req.body, null, 2));
    try {
        const sanitizedData = sanitizeData(req.body);

        // ━━ Stage History: auto-track if stage is changing ━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (sanitizedData.stage) {
            const existing = await Deal.findById(req.params.id).select('stage stageHistory stageChangedAt createdAt').lean();
            if (existing && existing.stage !== sanitizedData.stage) {
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

                await Deal.findByIdAndUpdate(req.params.id, {
                    $set: historyUpdate,
                    $push: {
                        stageHistory: {
                            stage: sanitizedData.stage,
                            enteredAt: now,
                            triggeredBy: sanitizedData.triggeredBy || 'system',
                            reason: sanitizedData.stageSyncReason || null
                        }
                    }
                });

                sanitizedData.stageChangedAt = now;
            }
        }

        const deal = await Deal.findByIdAndUpdate(req.params.id, sanitizedData, { new: true });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
        
        // Trigger Sync if documents were updated
        if (sanitizedData.documents && Array.isArray(sanitizedData.documents)) {
            const metadata = {
                projectName: deal.projectName,
                block: deal.block,
                unitNumber: deal.unitNo
            };
            await syncDocumentsToContact(sanitizedData.documents, metadata);
        }

        await syncInventoryStatus(deal);

        // 🌐 WEBSITE PUBLISHING: Handle updates to publishing status
        if (sanitizedData.publishOn?.website && !deal.isPublished) {
            const slugBase = `${deal.projectName || 'property'}-${deal.unitNo || deal._id.toString().slice(-6)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            await Deal.findByIdAndUpdate(deal._id, {
                isPublished: true,
                publishedAt: new Date(),
                'websiteMetadata.slug': slugBase,
                'websiteMetadata.title': deal.projectName || 'Updated Listing',
                'websiteMetadata.description': deal.remarks || 'Check out this updated property listing at Bharat Properties.'
            });
        } else if (sanitizedData.publishOn && sanitizedData.publishOn.website === false && deal.isPublished) {
            await Deal.findByIdAndUpdate(deal._id, { isPublished: false });
        }

        // BUG D4 FIX: Correctly extract phone from phones array for stage updates
        if (sanitizedData.stage) {
            try {
                const dealPop = await Deal.findById(deal._id).populate('owner associatedContact');
                
                const extractPhone = (contact) => {
                    if (!contact) return null;
                    if (contact.phones && Array.isArray(contact.phones) && contact.phones.length > 0) {
                        return contact.phones[0].number;
                    }
                    return contact.phone || contact.mobile || null;
                };

                const phone = extractPhone(dealPop.owner) || extractPhone(dealPop.associatedContact);
                
                if (phone) {
                    smsService.sendSMSWithTemplate(phone, 'deal_stage_updated', {
                        dealId: dealPop.dealId || deal._id.toString().slice(-6).toUpperCase(),
                        stage: dealPop.stage
                    }).catch(e => console.error('[SMS Trigger Error] Deal stage failed:', e.message));
                }
            } catch (smsError) {
                console.error('[Notification Error] Stage SMS trigger isolated:', smsError.message);
            }
        }

        res.json({ success: true, data: deal, deal: deal });
        
        // 🚀 AUTO-MARKETING: Fire campaign engine if publishing flags or stage changed
        // This is non-blocking (fire-and-forget)
        setTimeout(() => {
            CampaignEngine.launch(deal._id).catch(err =>
                console.error('[CampaignEngine] Auto-launch error for updated deal:', err.message)
            );
        }, 100);
    } catch (error) {
        console.error('Error in updateDeal:', error);
        res.status(500).json({ success: false, error: error.message, message: error.message });
    }
};

export const deleteDeal = async (req, res) => {
    try {
        const deal = await Deal.findByIdAndDelete(req.params.id);
        if (!deal) return res.status(404).json({ success: false, error: "Deal not found" });

        // Reset inventory status if the deal was deleted
        if (deal.inventoryId) {
            await Inventory.findByIdAndUpdate(deal.inventoryId, { status: 'Available' });
        }

        res.json({ success: true, message: "Deal deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const bulkDeleteDeals = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, error: "Invalid IDs provided" });
        }

        // Reset inventory status for all deals being deleted
        const deals = await Deal.find({ _id: { $in: ids } }).select('inventoryId');
        const inventoryIds = deals.map(d => d.inventoryId).filter(Boolean);
        if (inventoryIds.length > 0) {
            await Inventory.updateMany({ _id: { $in: inventoryIds } }, { status: 'Available' });
        }

        await Deal.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, message: `${ids.length} deals deleted successfully` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const importDeals = async (req, res) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, error: "Invalid data format" });
        }

        const restructuredData = data.map(item => {
            return {
                projectName: item.projectName,
                block: item.block,
                unitNo: item.unitNo,
                unitType: item.unitType,
                propertyType: item.propertyType,
                category: item.category,
                subCategory: item.subCategory,
                size: item.size,
                location: item.location,
                intent: item.intent,
                price: parseFloat(item.price) || 0,
                quotePrice: parseFloat(item.quotePrice) || 0,
                pricingMode: item.pricingMode || 'Total',
                ratePrice: parseFloat(item.ratePrice) || 0,
                quoteRatePrice: parseFloat(item.quoteRatePrice) || 0,
                pricingNature: {
                    negotiable: item.negotiable === 'Yes' || item.negotiable === true,
                    fixed: item.fixed === 'Yes' || item.fixed === true
                },
                status: item.status || 'Open',
                dealType: item.dealType || 'Warm',
                transactionType: item.transactionType || 'Full White',
                flexiblePercentage: parseFloat(item.flexiblePercentage) || 50,
                ownerName: item.ownerName, // Using strict: false or customFields if needed, but schema has owner ref
                ownerPhone: item.ownerPhone,
                ownerEmail: item.ownerEmail,
                associatedContactName: item.associatedContactName,
                associatedContactPhone: item.associatedContactPhone,
                associatedContactEmail: item.associatedContactEmail,
                team: item.team,
                assignedTo: item.assignedTo,
                visibleTo: item.visibleTo || 'Public',
                remarks: item.remarks,
                latitude: item.latitude || item.lat,
                longitude: item.longitude || item.lng,
                date: item.date ? new Date(item.date) : new Date()
            };
        });

        await Deal.insertMany(restructuredData, { ordered: false });
        res.status(200).json({ success: true, message: `Successfully imported ${restructuredData.length} deals.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const closeDeal = async (req, res) => {
    try {
        const { id } = req.params;
        const { checklist, closingDate, remarks } = req.body;

        const deal = await Deal.findById(id).populate('inventoryId owner associatedContact partyStructure.buyer');
        if (!deal) return res.status(404).json({ success: false, error: "Deal not found" });

        // BUG D2 FIX: Write stageHistory entry when deal is closed
        const existing = await Deal.findById(id).select('stage stageHistory stageChangedAt createdAt').lean();
        if (existing && existing.stage !== 'Closed') {
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

            await Deal.findByIdAndUpdate(id, {
                $set: { ...historyUpdate, stageChangedAt: now },
                $push: {
                    stageHistory: {
                        stage: 'Closed',
                        enteredAt: now,
                        triggeredBy: 'manual_override',
                        reason: 'Deal officially closed via closing checklist'
                    }
                }
            });
        }

        // Update Deal
        deal.stage = 'Closed';
        deal.closingDetails = {
            isClosed: true,
            closingDate: closingDate || new Date(),
            checklist: checklist,
            remarks: remarks,
            feedbackStatus: { buyerContacted: false, sellerContacted: false }
        };
        await deal.save();

        // Update Inventory Status
        if (deal.inventoryId) {
            await Inventory.findByIdAndUpdate(deal.inventoryId, { status: 'Sold Out' });
        }

        // TODO: Notification trigger
        console.log(`[Notification] Triggering feedback for Deal ${id}`);

        res.json({ success: true, message: "Deal closed successfully", data: deal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
