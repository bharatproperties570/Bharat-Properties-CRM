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
import { createNotification } from "./notification.controller.js";
import Project from "../models/Project.js"; // Added to resolve [matchDeals] population error
import { safeRedisCall } from "../src/config/redis.js";

// --- OPTIMIZATION: In-Memory Lookup Cache (Process Scoped) ---
const _lookupResolveCache = new Map();

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Robust ObjectId validator to prevent CastErrors for numeric or non-hex string values
const isValidObjectId = (val) => {
    if (!val) return false;
    if (val instanceof mongoose.Types.ObjectId) return true;
    if (typeof val === 'string') {
        return /^[0-9a-fA-F]{24}$/.test(val);
    }
    if (typeof val === 'object' && val.toString) {
        return /^[0-9a-fA-F]{24}$/.test(val.toString());
    }
    return false;
};

const resolveFilter = async (type, value) => {
    if (!value) return null;
    if (isValidObjectId(value)) return new mongoose.Types.ObjectId(value.toString());

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

const resolveLookup = async (type, value, createIfMissing = true) => {
    if (!value) return null;
    if (isValidObjectId(value)) return new mongoose.Types.ObjectId(value.toString());

    const cacheKey = `${type}:${String(value).toLowerCase()}`;
    if (_lookupResolveCache.has(cacheKey)) return _lookupResolveCache.get(cacheKey);

    const escapedValue = escapeRegExp(value);
    const re = new RegExp(`^${escapedValue}$`, 'i');
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: re } });

    if (!lookup && createIfMissing) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }

    if (lookup) {
        if (_lookupResolveCache.size > 200) _lookupResolveCache.clear();
        _lookupResolveCache.set(cacheKey, lookup._id);
        return lookup._id;
    }
    return null;
};

export const matchDeals = async (req, res) => {
    try {
        const { 
            leadId, 
            budgetFlexibility = 20, 
            sizeFlexibility = 20,
            weights: weightsParam,
            showOtherCities: showOtherCitiesParam
        } = req.query;
        
        const showOtherCities = showOtherCitiesParam === 'true';

        if (!leadId) {
            return res.status(400).json({ success: false, error: "leadId is required" });
        }

        // Parse weights (default if missing)
        let weights = { location: 30, type: 20, budget: 25, size: 25 };
        if (weightsParam) {
            try {
                const parsed = typeof weightsParam === 'string' ? JSON.parse(weightsParam) : weightsParam;
                if (parsed && typeof parsed === 'object') {
                    weights = { ...weights, ...parsed };
                }
            } catch (e) {
                console.error("Error parsing weights:", e);
            }
        }

        const bFlex = parseFloat(budgetFlexibility) / 100;
        const sFlex = parseFloat(sizeFlexibility) / 100;

        // ─── 0. Pre-fetch ALL lookups for high-speed resolution (including inventory-specific types) ───
        const lookupTypes = [
            'Category', 'Intent', 'SubCategory', 'Status', 'PropertyType', 'UnitType',
            'Locality', 'Area', 'Location', 'Size', 'City', 'State', 'Requirement',
            // Inventory-specific lookup types (critical for WhatsApp variable resolution)
            'Facing', 'Direction', 'RoadWidth', 'BuiltupType', 'Orientation'
        ];
        const allLookups = await Lookup.find({ 
            lookup_type: { $in: lookupTypes } 
        }).lean();
        const lookupIdMap = new Map(allLookups.map(l => [String(l._id), l.lookup_value]));
        const lookupValueMap = new Map(allLookups.map(l => [String(l.lookup_value).toLowerCase(), l]));

        const getLookupValueLocal = (val) => {
            if (!val) return "";
            if (val.lookup_value) return String(val.lookup_value).toLowerCase();
            const idStr = String(val._id || val);
            const resolved = lookupIdMap.get(idStr);
            if (resolved) return resolved.toLowerCase();
            // If it's a raw string that's not an ID, return it
            if (!/^[0-9a-fA-F]{24}$/.test(idStr)) return idStr.toLowerCase();
            return "";
        };

        const getLookupLabelLocal = (val) => {
            if (!val) return "Not Set";
            if (val.lookup_value) return val.lookup_value;
            const idStr = String(val._id || val);
            const resolved = lookupIdMap.get(idStr);
            if (resolved) return resolved;
            if (!/^[0-9a-fA-F]{24}$/.test(idStr)) return idStr;
            return "Unknown";
        };

        /**
         * ENTERPRISE FIX: Resolve a raw ObjectId (or string) to its human-readable lookup_value.
         * Returns the original value if it's already a non-ObjectId string.
         * Returns null if unresolvable.
         */
        const resolveToLabel = (val) => {
            if (!val) return null;
            if (typeof val === 'object' && val.lookup_value) return val.lookup_value;
            const idStr = String(val._id || val).trim();
            if (!/^[0-9a-fA-F]{24}$/.test(idStr)) return idStr; // already a string
            return lookupIdMap.get(idStr) || null; // resolve from prefetched map
        };

        /**
         * ENTERPRISE FIX: Enrich a populated inventoryId object — replace all ObjectId
         * lookup references with their human-readable string values so that the frontend
         * can use them directly in template variables without needing client-side lookups.
         */
        const enrichInventoryLookups = (inv) => {
            if (!inv || typeof inv !== 'object') return inv;
            const enriched = { ...inv };
            // Core inventory lookup fields → enrich in place
            const lookupFields = ['facing', 'direction', 'roadWidth', 'builtupType', 'orientation',
                                  'category', 'subCategory', 'unitType', 'sizeConfig', 'sizeType'];
            for (const field of lookupFields) {
                if (enriched[field] !== undefined && enriched[field] !== null) {
                    const resolved = resolveToLabel(enriched[field]);
                    if (resolved) enriched[`${field}_label`] = resolved;
                    // Also overwrite if it was an ObjectId (raw ID → label)
                    const raw = enriched[field];
                    const rawStr = typeof raw === 'object' ? String(raw._id || raw) : String(raw);
                    if (/^[0-9a-fA-F]{24}$/.test(rawStr) && resolved) {
                        enriched[field] = resolved; // Replace ObjectId with human-readable string
                    }
                }
            }
            // Enrich address sub-fields
            if (enriched.address) {
                const addr = { ...enriched.address };
                ['city', 'state', 'locality', 'location', 'area'].forEach(f => {
                    if (addr[f]) {
                        const resolved = resolveToLabel(addr[f]);
                        if (resolved) addr[f] = resolved;
                    }
                });
                enriched.address = addr;
            }
            return enriched;
        };

        // ─── 1. Fetch Lead ────────────────────────────────────────────────────────
        const lead = await Lead.findById(leadId).lean();
        if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });

        // ─── 2. Extract Lead Signals with Robust Resolution ──────────────────────
        const leadReq = getLookupValueLocal(lead.requirement);
        const leadReqLabel = getLookupLabelLocal(lead.requirement);

        const leadCats = (Array.isArray(lead.propertyType) ? lead.propertyType : [])
            .map(c => getLookupValueLocal(c))
            .filter(Boolean);
        const leadCatsLabel = (Array.isArray(lead.propertyType) ? lead.propertyType : [])
            .map(c => getLookupLabelLocal(c))
            .filter(l => l !== "Unknown")
            .join(' / ') || 'any';

        // Multi-signal location array for broad recall
        const leadProjects = (Array.isArray(lead.projectName) ? lead.projectName : [])
            .map(p => String(p || "").toLowerCase()).filter(Boolean);
        const leadSector = String(lead.sector || "").toLowerCase();
        const leadLocValue = getLookupValueLocal(lead.location);
        const leadLocArea = getLookupValueLocal(lead.locArea);
        const leadLocCity = getLookupValueLocal(lead.locCity);
        const leadBlocks = (Array.isArray(lead.locBlock) ? lead.locBlock : []).map(b => String(b || "").toLowerCase()).filter(Boolean);

        // Budget signals
        const lBudgetMin = parseFloat(lead.budgetMin) || 0;
        const lBudgetMax = parseFloat(lead.budgetMax) > 0 ? parseFloat(lead.budgetMax) : Infinity;

        // Area/Size signals
        const lAreaMin = parseFloat(lead.areaMin) || 0;
        const lAreaMax = parseFloat(lead.areaMax) > 0 ? parseFloat(lead.areaMax) : 0;

        // ─── 3. Fetch potential deals ─────────────────────────────────────────────
        let visibilityFilter = {};
        try {
            visibilityFilter = await getVisibilityFilter(req.user);
        } catch (e) {
            console.warn('[matchDeals] Visibility filter failed, using open filter:', e.message);
        }

        console.log(`[MATCH_DEBUG] Lead: ${lead.firstName} | Req: ${leadReq} (${leadReqLabel}) | Cats: ${leadCatsLabel} | Budget: ${lBudgetMin}-${lBudgetMax}`);

        const query = {
            ...visibilityFilter,
            isVisible: { $ne: false },
            stage: { $nin: ["Cancelled", "Closed Lost", "Sold Out"] }
        };

        const deals = await Deal.find(query).populate('inventoryId').lean();

        // 4. Activity Intelligence: Fetch Dispatch Proof
        const dispatchActivities = await Activity.find({
            entityId: leadId,
            type: 'Marketing',
            status: 'Completed'
        }).sort({ performedAt: -1 }).lean();

        const dispatchMap = new Map();
        dispatchActivities.forEach(act => {
            const invId = String(act.details?.inventoryId || "");
            if (invId && !dispatchMap.has(invId)) {
                dispatchMap.set(invId, {
                    date: act.performedAt,
                    channels: act.details?.results?.filter(r => r.status === 'success').map(r => r.channel) || []
                });
            }
        });

        // 5. Score and Map
        const excludedDeals = [];

        const matchingDeals = deals
            .map(deal => {
                const dealIntent = getLookupValueLocal(deal.intent);
                const dealIntentLabel = getLookupLabelLocal(deal.intent);
                const dealCategory = getLookupValueLocal(deal.category);
                const dealCategoryLabel = getLookupLabelLocal(deal.category);
                const dealLabel = deal.projectName || (deal.inventoryId?.projectName) || String(deal._id).slice(-6);

                // Phase 3B: Intent exclusion with reason capture
                let intentMatched = !dealIntent || !leadReq;
                if (!intentMatched) {
                    const d = dealIntent;
                    const l = leadReq;
                    if ((d.includes("sell") || d.includes("sale")) && (l.includes("buy") || l.includes("purchase") || l.includes("req"))) intentMatched = true;
                    else if ((d.includes("rent") || d.includes("lease")) && (l.includes("rent") || l.includes("lease"))) intentMatched = true;
                    else if ((d.includes("buy") || d.includes("purchase")) && (l.includes("sell") || l.includes("sale"))) intentMatched = true;
                    else if (d === l || d.includes(l) || l.includes(d)) intentMatched = true;
                }

                if (!intentMatched) {
                    excludedDeals.push({
                        _id: deal._id, projectName: dealLabel,
                        unitNo: deal.unitNo || deal.inventoryId?.unitNo, 
                        price: deal.price || deal.quotePrice,
                        excludeReason: `Intent mismatch — deal is listed as "${dealIntentLabel}" but lead requires "${leadReqLabel}"`
                    });
                    return null;
                }

                // Phase 3B: Category exclusion
                let catMatched = !dealCategory || leadCats.length === 0;
                if (!catMatched) {
                    catMatched = (
                        (dealCategory.includes("res") && leadCats.some(c => c.includes("res"))) ||
                        (dealCategory.includes("comm") && leadCats.some(c => c.includes("comm"))) ||
                        (dealCategory.includes("plot") && leadCats.some(c => c.includes("plot"))) ||
                        (dealCategory.includes("agri") && leadCats.some(c => c.includes("agri"))) ||
                        leadCats.some(c => dealCategory.includes(c) || c.includes(dealCategory))
                    );
                }

                if (!catMatched) {
                    excludedDeals.push({
                        _id: deal._id, projectName: dealLabel,
                        unitNo: deal.unitNo || deal.inventoryId?.unitNo,
                        price: deal.price || deal.quotePrice,
                        excludeReason: `Category mismatch — deal is "${dealCategoryLabel}" but lead wants "${leadCatsLabel}"`
                    });
                    return null;
                }

                // --- CITY ENFORCEMENT (User Requested Toggle) ---
                const dealCity = getLookupValueLocal(deal.inventoryId?.address?.city);
                const leadCityMatch = leadLocCity && dealCity && leadLocCity === dealCity;
                
                if (leadLocCity && dealCity && !leadCityMatch && !showOtherCities) {
                    excludedDeals.push({
                        _id: deal._id, projectName: dealLabel,
                        unitNo: deal.unitNo || deal.inventoryId?.unitNo,
                        price: deal.price || deal.quotePrice,
                        excludeReason: `City Mismatch — Lead is looking in "${leadLocCity}" but this property is in "${dealCity}". (Toggle 'Show All Cities' to include)`
                    });
                    return null;
                }

                // --- SCORING ENGINE ---
                let score = 0;
                const matchDetails = [];
                const scoreBreakdown = {
                    location: { earned: 0, max: weights.location || 30, label: 'No location signal' },
                    type:     { earned: 0, max: weights.type || 20,     label: 'No type data' },
                    budget:   { earned: 0, max: weights.budget || 25,   label: 'No budget set' },
                    size:     { earned: 0, max: weights.size || 25,     label: 'No size data' }
                };

                // 1. LOCATION PRECISION (Weight: 30%)
                const locWeight = weights.location || 30;
                const dealProjName = (deal.projectName || deal.inventoryId?.projectName || "").toLowerCase();
                const dealSector = (deal.sector || deal.inventoryId?.sector || "").toLowerCase();
                const dealLocality = getLookupValueLocal(deal.location || deal.inventoryId?.address?.locality);
                const dealBlock = (deal.block || deal.inventoryId?.block || "").toLowerCase();

                const locSignalsMatch = [
                    leadProjects.some(p => p && (dealProjName.includes(p) || p.includes(dealProjName))),
                    leadSector && dealSector && (dealSector.includes(leadSector) || leadSector.includes(dealSector)),
                    leadLocArea && (dealLocality.includes(leadLocArea) || dealSector.includes(leadLocArea) || dealProjName.includes(leadLocArea)),
                    leadLocCity && dealCity && (dealCity.includes(leadLocCity) || leadLocCity.includes(dealCity)),
                    leadLocValue && (dealProjName.includes(leadLocValue) || dealLocality.includes(leadLocValue) || dealSector.includes(leadLocValue)),
                    leadBlocks.some(b => b && dealBlock.includes(b))
                ];

                const locMatchCount = locSignalsMatch.filter(Boolean).length;
                if (locMatchCount >= 2) {
                    score += locWeight;
                    scoreBreakdown.location = { earned: locWeight, max: locWeight, label: 'Strong multi-signal match' };
                    matchDetails.push("Location Match");
                } else if (locMatchCount === 1) {
                    score += locWeight * 0.7;
                    scoreBreakdown.location = { earned: Math.round(locWeight * 0.7), max: locWeight, label: 'Partial location signal' };
                    matchDetails.push("Area Correlation");
                } else {
                    scoreBreakdown.location = { earned: 0, max: locWeight, label: leadSector || leadLocArea || leadLocCity ? 'No matching location found' : 'Lead has no location set' };
                }

                // 2. TYPE SYMMETRY (Weight: 20%)
                const typeWeight = weights.type || 20;
                const leadSubs = (Array.isArray(lead.subType) ? lead.subType : []).map(s => getLookupValueLocal(s)).filter(Boolean);
                const dealSub = getLookupValueLocal(deal.subCategory || deal.inventoryId?.subCategory);

                if (leadSubs.length > 0 && dealSub && leadSubs.some(s => dealSub.includes(s) || s.includes(dealSub))) {
                    score += typeWeight;
                    scoreBreakdown.type = { earned: typeWeight, max: typeWeight, label: 'Exact unit specification match' };
                    matchDetails.push("Category Alignment");
                } else if (leadCats.length > 0 && dealCategory && leadCats.some(t => dealCategory.includes(t) || t.includes(dealCategory))) {
                    score += typeWeight * 0.75;
                    scoreBreakdown.type = { earned: Math.round(typeWeight * 0.75), max: typeWeight, label: `Category match: ${dealCategoryLabel}` };
                    matchDetails.push("Category Alignment");
                } else if (leadCats.length === 0) {
                    score += typeWeight * 0.4;
                    scoreBreakdown.type = { earned: Math.round(typeWeight * 0.4), max: typeWeight, label: 'No specific type preference set' };
                }

                // 3. BUDGET NORMALIZATION (Weight: 25%)
                const budgetWeight = weights.budget || 25;
                const dealPrice = parseFloat(deal.price || deal.quotePrice) || 0;
                if (dealPrice > 0 && lBudgetMax > 0) {
                    if (dealPrice >= lBudgetMin && dealPrice <= lBudgetMax) {
                        score += budgetWeight;
                        scoreBreakdown.budget = { earned: budgetWeight, max: budgetWeight, label: `₹${(dealPrice/100000).toFixed(1)}L is within budget range` };
                        matchDetails.push("Budget Fit");
                    } else {
                        const lowBound = lBudgetMin * (1 - bFlex);
                        const highBound = lBudgetMax === Infinity ? Infinity : lBudgetMax * (1 + bFlex);
                        if (dealPrice >= lowBound && dealPrice <= highBound) {
                            score += budgetWeight * 0.7;
                            scoreBreakdown.budget = { earned: Math.round(budgetWeight * 0.7), max: budgetWeight, label: `₹${(dealPrice/100000).toFixed(1)}L within ±${budgetFlexibility}% tolerance` };
                            matchDetails.push("Budget Fit");
                        } else {
                            const aboveBudget = dealPrice > lBudgetMax;
                            scoreBreakdown.budget = { earned: 0, max: budgetWeight, label: `₹${(dealPrice/100000).toFixed(1)}L is ${aboveBudget ? 'above' : 'below'} budget range` };
                        }
                    }
                } else if (dealPrice === 0) {
                    score += budgetWeight * 0.3;
                    scoreBreakdown.budget = { earned: Math.round(budgetWeight * 0.3), max: budgetWeight, label: 'Price not set — partial credit' };
                    matchDetails.push("Price TBA");
                }

                // 4. SIZE ALIGNMENT (Weight: 25%)
                const sizeWeight = weights.size || 25;
                const dealSize = parseFloat(deal.size || deal.inventoryId?.size) || 0;
                if (dealSize > 0 && lAreaMax > 0) {
                    const aMin = lAreaMin * (1 - sFlex);
                    const aMax = lAreaMax * (1 + sFlex);
                    if (dealSize >= aMin && dealSize <= aMax) {
                        score += sizeWeight;
                        scoreBreakdown.size = { earned: sizeWeight, max: sizeWeight, label: `${dealSize} Sq.Yd. within preferred range` };
                        matchDetails.push("Size Fit");
                    } else if (dealSize >= lAreaMin * (1 - sFlex * 2) && dealSize <= lAreaMax * (1 + sFlex * 2)) {
                        score += sizeWeight * 0.5;
                        scoreBreakdown.size = { earned: Math.round(sizeWeight * 0.5), max: sizeWeight, label: `${dealSize} Sq.Yd. — approximate range` };
                        matchDetails.push("Approx Size Match");
                    } else {
                        scoreBreakdown.size = { earned: 0, max: sizeWeight, label: `${dealSize} Sq.Yd. is outside preferred range` };
                    }
                } else if (dealSize === 0 || lAreaMax === 0) {
                    score += sizeWeight * 0.3;
                    scoreBreakdown.size = { earned: Math.round(sizeWeight * 0.3), max: sizeWeight, label: lAreaMax === 0 ? 'Lead has no area preference' : 'Inventory size not recorded' };
                }

                // --- MATCH DECAY ---
                const invId = String(deal.inventoryId?._id || deal._id);
                const lastDispatch = dispatchMap.get(invId) || null;
                let decayFactor = 1;
                let sharedStatus = null;
                let daysSinceShared = null;

                if (lastDispatch?.date) {
                    daysSinceShared = (Date.now() - new Date(lastDispatch.date)) / (1000 * 60 * 60 * 24);
                    if (daysSinceShared < 3) { decayFactor = 0.5; sharedStatus = 'hot'; }
                    else if (daysSinceShared < 7) { decayFactor = 0.75; sharedStatus = 'recent'; }
                    else if (daysSinceShared < 30) { decayFactor = 0.9; sharedStatus = 'stale'; }
                }

                const decayedScore = score * decayFactor;
                if (decayedScore < 5) return null;

                // Enrich inventoryId with resolved lookup strings (prevents ObjectId leakage in WhatsApp variables)
                const enrichedInventory = enrichInventoryLookups(deal.inventoryId);

                return {
                    ...deal,
                    inventoryId: enrichedInventory,
                    score: Math.min(Math.round(decayedScore), 100),
                    rawScore: Math.min(Math.round(score), 100),
                    isPinned: lead.pinnedMatches?.some(id => String(id) === String(deal.inventoryId?._id || deal.inventoryId || deal._id)),
                    matchDetails,
                    scoreBreakdown,
                    lastDispatch,
                    sharedStatus,
                    daysSinceShared: daysSinceShared ? Math.round(daysSinceShared) : null,
                    // Re-inject labels for UI consistency
                    intent: { lookup_value: dealIntentLabel },
                    category: { lookup_value: dealCategoryLabel },
                    location: { lookup_value: dealLocality || dealSector || dealProjName }
                };
            })
            .filter(Boolean);

        const sorted = matchingDeals.sort((a,b) => b.score - a.score).slice(0, 50);

        // ─── SMART SUGGESTIONS ────────────────────────────────────────────────────
        const smartSuggestions = [];
        const allPrices = deals.map(d => parseFloat(d.price || d.quotePrice) || 0).filter(p => p > 0);
        const minAvailablePrice = allPrices.length ? Math.min(...allPrices) : 0;

        if (lBudgetMax > 0 && minAvailablePrice > 0 && lBudgetMax < minAvailablePrice) {
            smartSuggestions.push({
                type: 'budget_too_low',
                icon: 'fa-rupee-sign',
                severity: 'high',
                title: 'Budget Below Inventory Range',
                message: `Lead's max budget (₹${(lBudgetMax/100000).toFixed(1)}L) is below available inventory (starts from ₹${(minAvailablePrice/100000).toFixed(1)}L).`,
                action: 'Increase Budget Tolerance'
            });
        }

        if (!leadSector && !leadLocArea && !leadLocCity && leadProjects.length === 0) {
            smartSuggestions.push({
                type: 'missing_location',
                icon: 'fa-map-marker-alt',
                severity: 'high',
                title: 'No Location Signal Set',
                message: 'Adding a sector, city, or project preference would significantly improve match relevance.',
                action: 'Add Location in Quick Fill'
            });
        }

        const nearBudget = deals.filter(d => {
            const p = parseFloat(d.price || d.quotePrice) || 0;
            return p > lBudgetMax && p <= lBudgetMax * 1.4;
        });
        if (nearBudget.length > 0 && sorted.length < 5) {
            smartSuggestions.push({
                type: 'tolerance_increase',
                icon: 'fa-sliders-h',
                severity: 'low',
                title: `${nearBudget.length} Near-Miss Deals`,
                message: `${nearBudget.length} deals are within 40% of lead's budget. Increase Budget Tolerance to see them.`,
                action: 'Increase Budget Tolerance'
            });
        }

        if (excludedDeals.filter(d => d.excludeReason.includes('Intent')).length >= 3) {
            smartSuggestions.push({
                type: 'intent_mismatch',
                icon: 'fa-exchange-alt',
                severity: 'medium',
                title: 'Deals Excluded by Intent Filter',
                message: 'Multiple deals were excluded due to intent mismatch. Review lead requirement type.',
                action: 'Review Lead Requirement'
            });
        }

        if (lAreaMax === 0) {
            smartSuggestions.push({
                type: 'missing_area',
                icon: 'fa-ruler-combined',
                severity: 'low',
                title: 'No Area Preference Set',
                message: 'Adding an area range enables precise size scoring.',
                action: 'Add Area in Quick Fill'
            });
        }

        return res.status(200).json({
            success: true,
            count: sorted.length,
            data: sorted,
            excludedCount: excludedDeals.length,
            excluded: excludedDeals.slice(0, 10),
            suggestions: smartSuggestions
        });
    } catch (error) {
        console.error("[CRITICAL_MATCH_ERROR]:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        });
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

export const sanitizeDeal = async (req, res) => {
    try {
        const deal = await Deal.findById(req.params.id)
            .populate('inventoryId')
            .populate('projectId')
            .populate('contactId')
            .populate('owner')
            .populate('associatedContact');

        if (!deal) return res.status(404).json({ success: false, message: "Deal not found" });

        // Manual Enrichment for category/intent to prevent CastError if they are strings
        const enrichField = async (field, type) => {
            const val = deal[field];
            if (!val) return;
            if (isValidObjectId(val)) {
                const lookup = await Lookup.findById(val).select('lookup_value').lean();
                if (lookup) deal[field] = lookup;
            } else if (typeof val === 'string') {
                const lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapeRegExp(val)}$`, 'i') } }).lean();
                deal[field] = lookup || { _id: null, lookup_value: val };
            }
        };

        await enrichField('category', 'Category');
        await enrichField('intent', 'Intent');
        await enrichField('subCategory', 'SubCategory');

        const inv = deal.inventoryId || {};
        const proj = deal.projectId || {};

        // 1. Generate Shareable ID if missing
        if (!deal.shareableId) {
            const shortId = Math.random().toString(36).substring(2, 7).toUpperCase();
            deal.shareableId = `BP-${shortId}`;
        }

        // 2. Format Price
        let formattedPrice = "Price on Request";
        const price = deal.price || deal.quotePrice;
        if (price) {
            if (price >= 10000000) formattedPrice = `₹ ${(price / 10000000).toFixed(2)} Cr`;
            else if (price >= 100000) formattedPrice = `₹ ${(price / 100000).toFixed(2)} Lac`;
            else formattedPrice = `₹ ${price.toLocaleString('en-IN')}`;
        }

        // 🧠 SENIOR PROFESSIONAL: Robust Lookup Resolver
        const resolveValue = async (val) => {
            if (!val) return null;
            if (typeof val === 'object') {
                if (val.lookup_value) return val.lookup_value;
                if (val.name) return val.name;
                if (val.fullName) return val.fullName;
                return null;
            }
            if (isValidObjectId(val)) {
                const lookup = await Lookup.findById(val).select('lookup_value').lean();
                return lookup?.lookup_value || null;
            }
            return val;
        };

        // Resolve core fields
        const catName = await resolveValue(deal.category) || "Property";
        const intentName = await resolveValue(deal.intent) || "Deal";
        const projName = deal.projectName || (await resolveValue(proj.name)) || proj.name || "Prime Project";
        const displayLocation = await resolveValue(deal.location) || await resolveValue(inv.address?.locality) || await resolveValue(inv.address?.location) || deal.location || "Sector 4, Kurukshetra";

        // 🧠 SENIOR PROFESSIONAL: Comprehensive Spec Extraction
        // We aggregate standard fields and custom specs from both Deal and Inventory
        const unitSpecSource = {
            category: await resolveValue(deal.category || inv.category),
            subCategory: await resolveValue(deal.subCategory || inv.subCategory),
            unitType: await resolveValue(deal.unitType || inv.unitType),
            direction: await resolveValue(deal.direction || inv.direction),
            orientation: await resolveValue(deal.orientation || inv.orientation),
            facing: await resolveValue(deal.facing || inv.facing),
            roadWidth: await resolveValue(deal.roadWidth || inv.roadWidth),
            ownership: deal.ownership || inv.ownership,
            sizeLabel: deal.sizeLabel || inv.sizeLabel || (inv.sizeConfig ? await resolveValue(inv.sizeConfig) : null),
            width: deal.width || deal.frontage || inv.width || inv.frontage,
            length: deal.length || deal.depth || inv.length || inv.depth,
            ...((deal.unitSpecification?.toObject ? deal.unitSpecification.toObject() : deal.unitSpecification) || {}),
            ...((inv.unitSpecification?.toObject ? inv.unitSpecification.toObject() : inv.unitSpecification) || {})
        };

        const locIntelSource = {
            sector: inv.sector || (await resolveValue(inv.address?.locality)),
            city: await resolveValue(inv.address?.city),
            landmark: inv.address?.landmark,
            ...(deal.locationIntelligence || inv.locationIntelligence || {})
        };

        const builtup = deal.builtupDetails || inv.builtupDetails || [];

        const formatSection = async (title, obj) => {
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
            const blacklist = ['_id', 'unitNo', 'unitNumber', 'hNo', 'houseNo', 'plotNo', 'owner', 'contact', 'mobile', 'phone', 'ownerContact'];
            const resolvedLines = [];

            for (const [k, v] of Object.entries(obj)) {
                if (blacklist.includes(k)) continue;
                const resolvedVal = await resolveValue(v);
                if (resolvedVal === undefined || resolvedVal === null || resolvedVal === '' || resolvedVal === false || resolvedVal === '-') continue;
                
                const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
                resolvedLines.push(`${label}: ${resolvedVal}`);
            }
            return resolvedLines.length > 0 ? { title, lines: resolvedLines } : null;
        };

        const detailedSections = [
            await formatSection("Unit Specification", unitSpecSource),
            await formatSection("Location Intelligence", locIntelSource),
            builtup.length > 0 ? { 
                title: "Built-up Details", 
                lines: await Promise.all(builtup.map(async b => {
                    const floor = b.floor || 'Floor';
                    const area = b.totalArea || b.area || '';
                    const unit = b.unit || 'Sq.Ft';
                    return `${floor}: ${area} ${unit}`;
                }))
            } : null
        ].filter(Boolean);
        
        deal.broadcastMetadata = {
            title: `${projName} | ${deal.unitType || catName} for ${intentName}`,
            description: deal.remarks || `Excellent ${deal.unitType || ''} ${catName} available in ${displayLocation}. High potential for ${intentName}.`,
            price: formattedPrice,
            location: displayLocation,
            images: deal.documents?.filter(d => d.url?.match(/\.(jpg|jpeg|png|webp)$/i)).map(d => d.url) || [],
            features: [
                `${deal.size || inv.size || ''} ${deal.sizeUnit || inv.sizeUnit || 'Sq.Ft'}`,
                deal.unitType || (await resolveValue(inv.unitType)),
                deal.block ? `Block ${deal.block}` : (inv.block ? `Block ${inv.block}` : null),
                unitSpecSource.orientation ? `Facing ${unitSpecSource.orientation}` : null,
                unitSpecSource.facing ? `Facing ${unitSpecSource.facing}` : null,
                unitSpecSource.roadWidth ? `${unitSpecSource.roadWidth} Road` : null
            ].filter(Boolean),
            detailedSections,
            isReady: true,
            lastSanitizedAt: new Date()
        };

        await deal.save();
        res.json({ success: true, data: deal.broadcastMetadata, shareableId: deal.shareableId });
    } catch (error) {
        console.error("[ERROR] sanitizeDeal failed:", error);
        res.status(500).json({ success: false, error: error.message || "Internal server error during sanitization" });
    }
};



export const getDeals = async (req, res) => {
    console.log(">> getDeals API started");
    console.time("getDeals_Total");
    try {
        const { 
            page = 1, limit = 25, search = "", sortBy, sortOrder,
            projectId, inventoryId, category, subCategory, 
            status, contactPhone 
        } = req.query;

        // 🚀 SENIOR OPTIMIZATION: Redis Cache Layer for List View (Page 1)
        const isPageOne = Number(page) === 1 && !search;
        const cacheKey = `deals_list_v3:${req.user._id}:${JSON.stringify(req.query)}`;
        
        if (isPageOne) {
            const cachedData = await safeRedisCall('get', cacheKey);
            if (cachedData) {
                return res.json(JSON.parse(cachedData));
            }
        }

        const visibilityFilter = await getVisibilityFilter(req.user);

        // ─── DYNAMIC SORTING (Senior Professional Optimization) ───
        const finalSortBy = sortBy || 'updatedAt';
        const finalSortOrder = parseInt(sortOrder) || -1;
        const sortOption = { [finalSortBy]: finalSortOrder };

        // [ENTERPRISE FILTERS] Multi-Source Visibility & Query Resolution
        let query = { ...visibilityFilter, isVisible: { $ne: false } };

        if (search) {
            query = {
                ...query,
                $or: [
                    { dealId: { $regex: search, $options: "i" } },
                    { unitNo: { $regex: search, $options: "i" } },
                    { location: { $regex: search, $options: "i" } },
                    { projectName: { $regex: search, $options: "i" } }
                ]
            };
        }

        // ROBUST MULTI-FILTER RESOLUTION
        const resolveMultiFilter = async (type, value) => {
            if (!value) return null;
            const values = Array.isArray(value) ? value : String(value).split(',').filter(Boolean);
            if (values.length === 0) return null;

            const ids = await Promise.all(values.map(val => resolveFilter(type, val)));
            const validIds = ids.filter(Boolean);
            return validIds.length > 0 ? { $in: validIds } : null;
        };

        const { 
            direction, facing, roadWidth, block, range, location: queryLocation, 
            minPrice, maxPrice, dealType, transactionType, source,
            intent: queryIntent, stage: queryStage, unitType: queryUnitType,
            projectName: queryProjectName, project: queryProject,
            sizeType, minSize, maxSize
        } = req.query;

        if (category) query.category = await resolveMultiFilter('Category', category);
        if (subCategory) query.subCategory = await resolveMultiFilter('SubCategory', subCategory);
        if (status) query.status = await resolveMultiFilter('Status', status);

        // Project & Name Filters
        const finalProjectName = queryProjectName || queryProject;
        if (finalProjectName) {
            query.projectName = { $regex: new RegExp(`^${escapeRegExp(finalProjectName)}$`, 'i') };
        }
        
        // Orientation Filters (Joined via Inventory)
        if (direction || facing || roadWidth) {
            const invQuery = {};
            if (direction) invQuery.direction = await resolveMultiFilter('Direction', direction);
            if (facing) invQuery.facing = await resolveMultiFilter('Facing', facing);
            if (roadWidth) invQuery.roadWidth = await resolveMultiFilter('RoadWidth', roadWidth);
            
            const matchingInvs = await Inventory.find(invQuery).select('_id').lean();
            query.inventoryId = { $in: matchingInvs.map(i => i._id) };
        }

        // Project & Block Filters
        if (projectId) query.projectId = projectId;
        if (block) {
            const blocks = Array.isArray(block) ? block : block.split(',').filter(Boolean);
            if (blocks.length > 0) query.block = { $in: blocks.map(b => new RegExp(`^${escapeRegExp(b)}$`, 'i')) };
        }

        // Deal State Filters
        if (queryIntent) query.intent = await resolveMultiFilter('Intent', queryIntent);
        if (queryStage) {
            const stages = Array.isArray(queryStage) ? queryStage : queryStage.split(',').filter(Boolean);
            if (stages.length > 0) query.stage = { $in: stages };
        }
        if (queryUnitType) {
            const unitTypes = Array.isArray(queryUnitType) ? queryUnitType : queryUnitType.split(',').filter(Boolean);
            if (unitTypes.length > 0) query.unitType = { $in: unitTypes };
        }

        // Size & Type Filters
        if (sizeType) query.sizeLabel = await resolveMultiFilter('Size', sizeType);
        if (minSize || maxSize) {
            query.size = {};
            if (minSize) query.size.$gte = parseFloat(minSize);
            if (maxSize) query.size.$lte = parseFloat(maxSize);
        }

        // Budget & Detail Filters
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }
        if (dealType) query.dealType = { $in: Array.isArray(dealType) ? dealType : dealType.split(',') };
        if (transactionType) query.transactionType = { $in: Array.isArray(transactionType) ? transactionType : transactionType.split(',') };
        if (source) query.source = { $in: Array.isArray(source) ? source : source.split(',') };

        if (projectId) query.projectId = projectId;
        if (inventoryId) query.inventoryId = inventoryId;

        if (contactPhone) {
            const cleanPhone = contactPhone.replace(/[^0-9]/g, "").slice(-10);
            const phoneRegex = new RegExp(`${cleanPhone}$`);
            
            // Find contacts/leads with this phone first to get their IDs
            const [contacts, leads] = await Promise.all([
                Contact.find({ "phones.number": phoneRegex }).select('_id').lean(),
                Lead.find({ mobile: phoneRegex }).select('_id').lean()
            ]);
            
            const entityIds = [
                ...contacts.map(c => c._id),
                ...leads.map(l => l._id)
            ];

            if (entityIds.length > 0) {
                query.$or = query.$or || [];
                query.$or.push(
                    { owner: { $in: entityIds } },
                    { associatedContact: { $in: entityIds } },
                    { "partyStructure.owner": { $in: entityIds } },
                    { "partyStructure.buyer": { $in: entityIds } }
                );
            }
        }

        if (req.query.contactId) {
            const contactIds = req.query.contactId.split(',').filter(id => id && isValidObjectId(id));
            
            if (contactIds.length > 0) {
                query.$or = query.$or || [];
                
                // Smart Identity Matching (Phone/Email) to resolve linked/cross-entities (Lead <-> Contact)
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

                const allIds = [...contactIds];
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

                // 1. Exact & Resolved ID Matching
                query.$or.push(
                    { owner: { $in: uniqueIds } },
                    { "partyStructure.owner": { $in: uniqueIds } },
                    { associatedContact: { $in: uniqueIds } },
                    { "partyStructure.buyer": { $in: uniqueIds } }
                );
    
                // 2. Legacy fallback for phone/email string representations in DB fields
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

        // 🏎️ SENIOR OPTIMIZATION: Lean population for summary list view
        const dealListProjection = {
            _id: 1, dealId: 1, projectName: 1, unitNo: 1, unitType: 1, propertyType: 1,
            category: 1, subCategory: 1, location: 1, intent: 1, size: 1, sizeLabel: 1,
            price: 1, ratePrice: 1, pricingMode: 1, stage: 1, status: 1,
            dealProbability: 1, dealScore: 1, createdAt: 1, isVisible: 1,
            owner: 1, assignedTo: 1, inventoryId: 1, team: 1, latitude: 1, longitude: 1
        };

        const dealListPopulateFields = [
            { path: 'inventoryId', select: 'projectName unitNo unitNumber block city location area size sizeUnit sizeLabel sizeConfig unitSpecification latitude longitude lat lng' },
            { path: 'projectId', select: 'name latitude longitude lat lng' },
            { path: 'owner', select: 'name phones', model: 'Contact' },
            { path: 'assignedTo', select: 'fullName name email' },
            { path: 'assignment.assignedTo', select: 'fullName name email' },
            { path: 'assignment.team', select: 'name' },
            { path: 'team', select: 'name' },
            { path: 'teams', select: 'name' }
        ];

        // ⚠️ SENIOR NOTE: We removed category, intent, status from populateFields because they are Mixed 
        // and might contain strings instead of ObjectIds, causing CastErrors. 
        // We will resolve them manually after pagination.

        // ⚠️ SENIOR NOTE: We removed category, intent, status from populateFields because they are Mixed 
        // and might contain strings instead of ObjectIds, causing CastErrors. 
        // We will resolve them manually after pagination.

        // 🏎️ SENIOR OPTIMIZATION: Parallelize Pagination and Aggregation
        let categoryStatsPromise = Promise.resolve([]);
        
        if (Number(page) === 1) {
            categoryStatsPromise = Deal.aggregate([
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
            ]).then(async (categoryStatsAgg) => {
                const categoryMapStats = new Map(categoryStatsAgg.map(s => [String(s._id), s.count]));
                const categories = await Lookup.find({ lookup_type: 'Category' }).lean();
                return categories.map(cat => ({
                    name: cat.lookup_value,
                    count: categoryMapStats.get(String(cat._id)) || categoryMapStats.get(cat.lookup_value) || 0
                }));
            });
        }

        // Execute queries concurrently
        console.log(">> getDeals API: starting Promise.all");
        console.time("getDeals_Paginate_Category");
        const [results, categoryCounts] = await Promise.all([
            paginate(Deal, query, Number(page), Number(limit), sortOption, dealListPopulateFields, null, dealListProjection),
            categoryStatsPromise
        ]);
        console.timeEnd("getDeals_Paginate_Category");
        console.log(">> getDeals API: finished Promise.all");

        // Fetch latest activities for owners and associates
        const contactIds = results.records.reduce((acc, deal) => {
            if (deal.owner?._id) acc.push(deal.owner._id);
            if (deal.associatedContact?._id) acc.push(deal.associatedContact._id);
            return acc;
        }, []);

        console.time("getDeals_Activity_Fetch");
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
        console.timeEnd("getDeals_Activity_Fetch");

        // --- OPTIMIZATION 10: Batch Inventory Fetch & Fallback Unlinked Matching ---
        console.time("getDeals_Inventory_Fetch");
        const inventoryIdsToFetch = [...new Set(results.records.map(d => d.inventoryId?._id || d.inventoryId).filter(Boolean))];
        const unlinkedDeals = results.records.filter(d => !d.inventoryId && d.projectName && d.unitNo);

        const inventoryMap = new Map();
        const unlinkedInventoryMap = new Map();

        if (inventoryIdsToFetch.length > 0) {
            const inventories = await Inventory.find({ _id: { $in: inventoryIdsToFetch } })
                .populate({ path: 'owners', model: 'Contact' })
                .populate({ path: 'associates.contact', model: 'Contact' })
                .select('+sizeLabel +sizeConfig') // Ensure these are included if they were excluded by default
                .lean();
            inventories.forEach(inv => inventoryMap.set(String(inv._id), inv));
        }

        if (unlinkedDeals.length > 0) {
            const unlinkedQuery = {
                $or: unlinkedDeals.map(d => ({
                    projectName: { $regex: new RegExp(`^${escapeRegExp(d.projectName)}$`, 'i') },
                    unitNo: { $regex: new RegExp(`^${escapeRegExp(d.unitNo)}$`, 'i') }
                }))
            };
            const unlinkedInventories = await Inventory.find(unlinkedQuery)
                .populate({ path: 'owners', model: 'Contact' })
                .populate({ path: 'associates.contact', model: 'Contact' })
                .select('+sizeLabel +sizeConfig')
                .lean();
            
            unlinkedInventories.forEach(inv => {
                const key = `${String(inv.projectName).toLowerCase().trim()}_${String(inv.unitNo).toLowerCase().trim()}`;
                unlinkedInventoryMap.set(key, inv);
            });
        }
        console.timeEnd("getDeals_Inventory_Fetch");

        // --- [ENTERPRISE HARDENING]: Live Multi-Source Sync & Manual Lookup Resolution ---
        console.time("getDeals_Lookup_Resolution");
        const lookupTypes = ['Category', 'Intent', 'SubCategory', 'Status', 'PropertyType', 'UnitType', 'Locality', 'Area', 'Location', 'Size', 'City', 'State'];
        const allLookups = await Lookup.find({ 
            lookup_type: { $in: lookupTypes } 
        }).lean();
        const lookupMap = new Map(allLookups.map(l => [String(l._id), l]));
        const lookupValueMap = new Map(allLookups.map(l => [String(l.lookup_value).toLowerCase(), l]));

        const enrichWithLookup = (item, field) => {
            const val = item[field];
            if (!val) return;
            if (isValidObjectId(val)) {
                item[field] = lookupMap.get(String(val)) || val;
            } else if (typeof val === 'string') {
                item[field] = lookupValueMap.get(val.toLowerCase()) || { lookup_value: val };
            }
        };

        const enrichedRecords = results.records.map((deal) => {
            const dealObj = deal.toObject ? deal.toObject() : deal;
            
            // Live enrichment from inventory Map (O(1))
            const invId = dealObj.inventoryId?._id || dealObj.inventoryId;
            let inventory = invId ? inventoryMap.get(String(invId)) : null;

            if (!inventory && dealObj.projectName && dealObj.unitNo) {
                const key = `${String(dealObj.projectName).toLowerCase().trim()}_${String(dealObj.unitNo).toLowerCase().trim()}`;
                inventory = unlinkedInventoryMap.get(key);
            }

            if (inventory) {
                if (inventory.owners?.[0]) dealObj.owner = inventory.owners[0];
                if (inventory.associates?.[0]?.contact) dealObj.associatedContact = inventory.associates[0].contact;
                
                // Metadata labels should always be live from the source of truth (Inventory)
                dealObj.projectName = inventory.projectName || dealObj.projectName;
                dealObj.block = inventory.block || dealObj.block;
                dealObj.unitNo = inventory.unitNo || inventory.unitNumber || dealObj.unitNo;
                dealObj.location = inventory.location || inventory.address?.locality || dealObj.location;
                dealObj.propertyType = inventory.propertyType || dealObj.propertyType;
                dealObj.unitType = inventory.unitType || dealObj.unitType;
                dealObj.category = inventory.category || dealObj.category;
                dealObj.subCategory = inventory.subCategory || dealObj.subCategory;
                
                const size = inventory.size || dealObj.size;
                const sizeUnit = inventory.sizeUnit || inventory.size_unit || inventory.unit || dealObj.sizeUnit;
                const sizeLabel = inventory.sizeLabel || inventory.size_label || inventory.unitSpecification?.sizeLabel || dealObj.sizeLabel;
                const sizeConfig = inventory.sizeConfig || inventory.size_config || inventory.unitSpecification?.sizeConfig || dealObj.sizeConfig;
                const unitSpec = inventory.unitSpecification || dealObj.unitSpecification;

                dealObj.size = size;
                dealObj.sizeUnit = sizeUnit;
                dealObj.sizeLabel = sizeLabel;
                dealObj.sizeConfig = sizeConfig;
                dealObj.unitSpecification = unitSpec;
                
                if (typeof dealObj.inventoryId === 'object' && dealObj.inventoryId !== null) {
                    const inv = dealObj.inventoryId;
                    inv.projectName = inventory.projectName || inv.projectName;
                    inv.unitNo = inventory.unitNo || inv.unitNumber || inv.unitNo;
                    inv.location = inventory.location || inventory.address?.locality || inv.location;
                    inv.category = inventory.category || inv.category;
                    inv.propertyType = inventory.propertyType || inv.propertyType;
                    inv.unitType = inventory.unitType || inv.unitType;
                    inv.sizeLabel = sizeLabel;
                    inv.sizeConfig = sizeConfig;
                    inv.size = size;
                    inv.sizeUnit = sizeUnit;
                    inv.unitSpecification = unitSpec;
                }
            }

            // Perform manual lookup resolution for categorical fields (Handles ObjectIds and Strings)
            enrichWithLookup(dealObj, 'category');
            enrichWithLookup(dealObj, 'subCategory');
            enrichWithLookup(dealObj, 'propertyType');
            enrichWithLookup(dealObj, 'intent');
            enrichWithLookup(dealObj, 'status');
            enrichWithLookup(dealObj, 'location');
            enrichWithLookup(dealObj, 'unitType');
            enrichWithLookup(dealObj, 'sizeConfig');

            if (dealObj.inventoryId && typeof dealObj.inventoryId === 'object') {
                enrichWithLookup(dealObj.inventoryId, 'location');
                enrichWithLookup(dealObj.inventoryId, 'category');
                enrichWithLookup(dealObj.inventoryId, 'propertyType');
                enrichWithLookup(dealObj.inventoryId, 'unitType');
                enrichWithLookup(dealObj.inventoryId, 'sizeConfig');
            }
            
            const ownerId = dealObj.owner?._id || dealObj.owner;
            const assocId = dealObj.associatedContact?._id || dealObj.associatedContact;

            const ownerActivity = ownerId ? activityMap[ownerId.toString()] : null;
            const associateActivity = assocId ? activityMap[assocId.toString()] : null;

            dealObj.lastActivity = [ownerActivity, associateActivity]
                .filter(Boolean)
                .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))[0] || null;

            return dealObj;
        });
        console.timeEnd("getDeals_Lookup_Resolution");

        const responseObj = {
            success: true,
            ...results,
            categoryStats: categoryCounts,
            records: enrichedRecords
        };

        if (isPageOne) {
            // Cache for 60 seconds to relieve DB pressure during heavy dashboard usage
            await safeRedisCall('setex', cacheKey, 60, JSON.stringify(responseObj));
        }

        res.json(responseObj);
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
            { path: 'team' },
            { path: 'teams' }
        ];

        const visibilityFilter = await getVisibilityFilter(req.user);

        // 🚀 SENIOR OPTIMIZATION: Parallel Data Fetching via Unified API Request
        const isUnified = req.query.unified === 'true';

        const [deal, activities, matchingLeads] = await Promise.all([
            Deal.findOne({ _id: req.params.id, ...visibilityFilter }).populate(populateFields),
            isUnified ? Activity.find({ entityType: 'Deal', entityId: req.params.id }).sort({ performedAt: -1 }).lean() : Promise.resolve(null),
            isUnified ? Lead.find({ status: { $nin: ['Closed', 'Junk'] } }).sort({ createdAt: -1 }).limit(15).lean() : Promise.resolve(null)
        ]);

        if (!deal) {
            return res.status(404).json({ success: false, error: "Deal not found or access denied" });
        }

        const dealObj = deal.toObject ? deal.toObject() : deal;

        // --- [ENTERPRISE HARDENING]: Live Multi-Source Sync (Detail View) ---
        let inventory = null;
        if (deal.inventoryId) {
            const Inventory = mongoose.model('Inventory');
            inventory = await Inventory.findById(deal.inventoryId)
                .populate({ path: 'owners', model: 'Contact' })
                .populate({ path: 'associates.contact', model: 'Contact' })
                .lean();
        } else if (deal.projectName && deal.unitNo) {
            const Inventory = mongoose.model('Inventory');
            inventory = await Inventory.findOne({
                projectName: { $regex: new RegExp(`^${escapeRegExp(deal.projectName)}$`, 'i') },
                unitNo: { $regex: new RegExp(`^${escapeRegExp(deal.unitNo)}$`, 'i') }
            })
                .populate({ path: 'owners', model: 'Contact' })
                .populate({ path: 'associates.contact', model: 'Contact' })
                .lean();
        }
            
            if (inventory) {
                if (inventory.owners?.[0]) dealObj.owner = inventory.owners[0];
                if (inventory.associates?.[0]?.contact) dealObj.associatedContact = inventory.associates[0].contact;
                
                dealObj.projectName = inventory.projectName || dealObj.projectName;
                dealObj.block = inventory.block || dealObj.block;
                dealObj.unitNo = inventory.unitNo || inventory.unitNumber || dealObj.unitNo;
                dealObj.location = inventory.location || inventory.address?.locality || dealObj.location;
                dealObj.propertyType = inventory.propertyType || dealObj.propertyType;
                dealObj.unitType = inventory.unitType || dealObj.unitType;
                dealObj.category = inventory.category || dealObj.category;
                dealObj.subCategory = inventory.subCategory || dealObj.subCategory;

                // Add Size Metadata
                dealObj.size = inventory.size || dealObj.size;
                dealObj.sizeUnit = inventory.sizeUnit || inventory.unit || dealObj.sizeUnit;
                dealObj.sizeLabel = inventory.sizeLabel || inventory.size_label || inventory.unitSpecification?.sizeLabel || dealObj.sizeLabel;
                dealObj.sizeConfig = inventory.sizeConfig || inventory.size_config || inventory.unitSpecification?.sizeConfig || dealObj.sizeConfig;
                dealObj.unitSpecification = inventory.unitSpecification || dealObj.unitSpecification;
                
                // Redundancy for nested object
                if (typeof dealObj.inventoryId === 'object' && dealObj.inventoryId !== null) {
                    const inv = dealObj.inventoryId;
                    inv.projectName = inventory.projectName || inv.projectName;
                    inv.unitNo = inventory.unitNo || inventory.unitNumber || inv.unitNo;
                    inv.location = inventory.location || inventory.address?.locality || inv.location;
                    inv.category = inventory.category || inv.category;
                    inv.propertyType = inventory.propertyType || inv.propertyType;
                    inv.unitType = inventory.unitType || inv.unitType;
                    inv.sizeLabel = inventory.sizeLabel || inventory.size_label || inventory.unitSpecification?.sizeLabel || inv.sizeLabel;
                    inv.sizeConfig = inventory.sizeConfig || inventory.size_config || inventory.unitSpecification?.sizeConfig || inv.sizeConfig;
                    inv.size = inventory.size || inv.size;
                    inv.sizeUnit = inventory.sizeUnit || inventory.unit || inv.sizeUnit;
                    inv.unitSpecification = inventory.unitSpecification || inv.unitSpecification;
                }
            }

        // Manual Enrichment for Mixed fields - MUST BE AFTER INVENTORY MERGE
        const resolveLookupInDoc = async (doc) => {
            const fields = ['category', 'subCategory', 'intent', 'status', 'propertyType', 'location', 'unitType', 'sizeConfig'];
            for (const field of fields) {
                const val = doc[field];
                if (!val) continue;

                if (typeof val === 'string' && !isValidObjectId(val)) {
                    // It's a raw string, find or create the lookup
                    const lookupTypeMap = {
                        category: 'Category', subCategory: 'SubCategory', intent: 'Intent', 
                        status: 'Status', propertyType: 'PropertyType', location: 'Locality', unitType: 'UnitType', sizeConfig: 'Size'
                    };
                    const lookupType = lookupTypeMap[field] || 'Location';
                    const lookupId = await resolveLookup(lookupType, val);
                    const lookup = await Lookup.findById(lookupId).lean();
                    doc[field] = lookup || { _id: lookupId, lookup_value: val };
                } else if (isValidObjectId(val) || (typeof val === 'object' && val._id)) {
                    // It's an ID or already an object, attempt to populate if not already
                    const targetId = val._id || val;
                    if (!val.lookup_value) {
                        const lookup = await Lookup.findById(targetId).lean();
                        if (lookup) doc[field] = lookup;
                    }
                }
            }
        };

        await resolveLookupInDoc(dealObj);
        if (dealObj.inventoryId && typeof dealObj.inventoryId === 'object') {
            await resolveLookupInDoc(dealObj.inventoryId);
        }

        const responseData = {
            success: true,
            data: dealObj,
            deal: dealObj
        };

        if (isUnified) {
            responseData.activities = activities || [];
            responseData.matchingLeads = matchingLeads || [];
            // Adding a mocked live score to avoid another network call (you can expand this later)
            responseData.liveScore = { score: 85, color: '#10b981', label: 'Hot' };
        }

        res.json(responseData);
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
        'category', 'subCategory', 'assignedTo', 'team', 
        'partyStructure.owner', 'partyStructure.buyer', 'partyStructure.channelPartner', 'partyStructure.internalRM',
        'assignment.assignedTo'
    ];
    const sanitized = { ...data };

    const sanitizeValue = (val) => {
        if (val === "" || val === undefined || val === null) return null;
        if (typeof val === 'object' && !Array.isArray(val)) {
            return val._id || null;
        }
        return val;
    };

    refFields.forEach(field => {
        if (field.includes('.')) {
            const parts = field.split('.');
            if (parts[0] in data && data[parts[0]] && typeof data[parts[0]] === 'object') {
                if (parts[1] in data[parts[0]]) {
                    sanitized[parts[0]] = { ...sanitized[parts[0]] };
                    sanitized[parts[0]][parts[1]] = sanitizeValue(data[parts[0]][parts[1]]);
                }
            }
        } else {
            if (field in data) {
                sanitized[field] = sanitizeValue(data[field]);
            }
        }
    });
    return sanitized;
};

export const addDeal = async (req, res) => {
    console.log('[DEBUG] Incoming Add Deal Payload:', JSON.stringify(req.body, null, 2));
    try {
        const sanitizedData = sanitizeData(req.body);

        // 🔒 Enterprise Isolation: Auto-tag with creator's department and teams
        if (req.user) {
            if (req.user.department && !sanitizedData.department) sanitizedData.department = req.user.department;
            if (req.user.teams && req.user.teams.length > 0 && (!sanitizedData.teams || sanitizedData.teams.length === 0)) {
                sanitizedData.teams = req.user.teams.map(t => t._id || t);
            }
        }

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

            // --- [ENTERPRISE HARDENING]: Coordinate-Based Duplicate Check ---
            // Fetch policy from SystemSettings (Default: strict)
            const SystemSetting = mongoose.model('SystemSetting');
            const dupPolicy = await SystemSetting.findOne({ key: 'crm_duplicate_policy' }).lean();
            const isStrict = dupPolicy ? (dupPolicy.value === 'strict') : true;

            if (isStrict) {
                const coordQuery = {
                    $or: [
                        { inventoryId: sanitizedData.inventoryId },
                        { 
                            projectName: sanitizedData.projectName,
                            block: sanitizedData.block,
                            unitNo: sanitizedData.unitNo
                        }
                    ],
                    stage: { $nin: ['Cancelled', 'Closed Lost', 'Closed', 'Closed Won', 'Sold Out'] }
                };

                const duplicateDeal = await Deal.findOne(coordQuery);
                if (duplicateDeal) {
                    return res.status(400).json({
                        success: false,
                        error: `DUPLICATE DEAL DETECTED: An active deal (#${duplicateDeal.dealId || duplicateDeal._id}) already exists for this unit coordinates (${sanitizedData.projectName}, ${sanitizedData.block}-${sanitizedData.unitNo}). Duplicate deals are restricted to maintain professional pipeline integrity.`
                    });
                }
            }
        }

        // [ENTERPRISE HARDENING]: Persistence Layer
        // If owner/associate are missing but inventoryId is present, snapshot them from Inventory
        if (sanitizedData.inventoryId && (!sanitizedData.owner || !sanitizedData.associatedContact)) {
            const inventory = await Inventory.findById(sanitizedData.inventoryId)
                .populate({ path: 'owners', model: 'Contact' })
                .populate({ path: 'associates.contact', model: 'Contact' });
            
            if (inventory) {
                if (!sanitizedData.owner && inventory.owners?.[0]) {
                    sanitizedData.owner = inventory.owners[0]._id;
                    if (!sanitizedData.partyStructure) sanitizedData.partyStructure = {};
                    sanitizedData.partyStructure.owner = inventory.owners[0]._id;
                }
                if (!sanitizedData.associatedContact && inventory.associates?.[0]?.contact) {
                    sanitizedData.associatedContact = inventory.associates[0].contact._id;
                }
                
                // Also snapshot location/unit details for permanence
                if (!sanitizedData.projectName) sanitizedData.projectName = inventory.projectName;
                if (!sanitizedData.unitNo) sanitizedData.unitNo = inventory.unitNo;
                if (!sanitizedData.location) sanitizedData.location = inventory.location || inventory.address?.locality;
                if (!sanitizedData.category) sanitizedData.category = inventory.category;
                if (!sanitizedData.propertyType) sanitizedData.propertyType = inventory.propertyType;
                if (!sanitizedData.unitType) sanitizedData.unitType = inventory.unitType;
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
                'websiteMetadata.description': deal.description || deal.remarks || 'Check out this new property listing at Bharat Properties.'
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
                    dealId: dealWithConfig.dealId || dealWithConfig._id.toString().slice(-6).toUpperCase(),
                    projectName: dealWithConfig.projectName || 'the property'
                }).catch(e => console.error('[SMS Trigger Error] New Deal failed:', e.message));
            }

            // ─── PHASE 7: Automated Discovery (SaaS Proactivity) ──────────────
            // Proactively find matching leads for this new property
            if (deal.inventoryId) {
                import('../services/discovery.service.js').then(m => {
                    m.runProactiveDiscoveryForInventory(deal.inventoryId);
                }).catch(e => console.error("[DISCOVERY_TRIGGER_ERROR]", e));
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
        console.error("[ADD_DEAL_ERROR]", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateDeal = async (req, res) => {
    console.log(`[DealController] updateDeal for ID: ${req.params.id}`, { body: req.body });
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: "Invalid Deal ID format" });
        }
        const sanitizedData = sanitizeData(req.body);
        console.log(`[DealController] Sanitized Payload:`, JSON.stringify(sanitizedData, null, 2));

        // ━━ Security: Enforce visibility for updates ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const visibilityFilter = await getVisibilityFilter(req.user);
        const existing = await Deal.findOne({ _id: req.params.id, ...visibilityFilter })
            .select('stage stageHistory stageChangedAt createdAt assignedTo assignment projectName')
            .lean();

        if (existing) {
            const now = new Date();
            const historyUpdate = {};
            let requiresHistoryUpdate = false;

            // 1. Stage History
            const newStage = sanitizedData.stage;
            if (newStage && newStage !== existing.stage) {
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
                    stage: newStage,
                    enteredAt: now,
                    triggeredBy: sanitizedData.triggeredBy || 'manual_override',
                    reason: sanitizedData.stageSyncReason || sanitizedData.reason || "Stage manually updated"
                };
                sanitizedData.stageChangedAt = now;
            }

            // 2. Assignment History
            const newRM = sanitizedData.assignedTo || sanitizedData.assignment?.assignedTo;
            const oldRM = existing.assignedTo || existing.assignment?.assignedTo;
            if (newRM && String(newRM) !== String(oldRM)) {
                requiresHistoryUpdate = true;
                historyUpdate.$push = historyUpdate.$push || {};
                historyUpdate.$push['assignment.history'] = {
                    assignedTo: newRM,
                    assignedBy: req.user?.id,
                    assignedAt: now,
                    notes: sanitizedData.assignmentNote || sanitizedData.reason || "Deal reassigned"
                };

                // Audit Log Assignment
                const AuditLog = mongoose.model('AuditLog');
                await AuditLog.logEntityUpdate(
                    'assignment_changed',
                    'deal',
                    req.params.id,
                    existing.projectName || 'Active Deal',
                    req.user?.id || null,
                    { before: oldRM, after: newRM },
                    `Deal reassigned to a new owner.`
                );

                // [NOTIFICATION] Notify new owner of reassignment
                if (String(newRM) !== String(req.user?.id)) {
                    await createNotification(
                        newRM,
                        'assignment',
                        '🔄 Deal Reassigned to You',
                        `Deal for project "${existing.projectName}" has been reassigned to you.`,
                        `/deals/${req.params.id}`,
                        { dealId: req.params.id, type: 'deal_reassigned' }
                    ).catch(() => {});
                }
            }

            // [NOTIFICATION] High-Value Stage Change
            const milestoneStages = ['Won', 'Booked', 'Token Received', 'Sold Out'];
            if (sanitizedData.stage && sanitizedData.stage !== existing.stage) {
                const ownerId = sanitizedData.assignedTo || existing.assignedTo || existing.owner;
                if (ownerId && String(ownerId) !== String(req.user?.id)) {
                    await createNotification(
                        ownerId,
                        'deal',
                        `🔥 Deal Stage: ${sanitizedData.stage}`,
                        `Deal for project "${existing.projectName}" moved to ${sanitizedData.stage}.`,
                        `/deals/${req.params.id}`,
                        { dealId: req.params.id, stage: sanitizedData.stage }
                    ).catch(() => {});
                }

                // 🌟 SENIOR ADDITION: Global Team Notification for High-Value Stages
                if (milestoneStages.includes(sanitizedData.stage)) {
                    // Notify managers or team leads
                    const User = mongoose.model('User');
                    const managers = await User.find({ 
                        $or: [{ role: 'manager' }, { role: 'admin' }],
                        _id: { $ne: req.user?.id } 
                    }).select('_id').lean();
                    
                    for (const mgr of managers) {
                        await createNotification(
                            mgr._id,
                            'deal',
                            `💰 Achievement: Deal ${sanitizedData.stage}!`,
                            `Great news! A deal for "${existing.projectName}" has reached ${sanitizedData.stage} status.`,
                            `/deals/${req.params.id}`,
                            { dealId: req.params.id, type: 'milestone' }
                        ).catch(() => {});
                    }
                }
            }
            if (requiresHistoryUpdate) {
                const atomicUpdate = { ...historyUpdate };
                delete atomicUpdate.$push;
                
                // 1. Update exiting stage details ($set) to avoid path collision
                if (Object.keys(atomicUpdate).length > 0) {
                    await Deal.findByIdAndUpdate(req.params.id, { $set: atomicUpdate });
                }
                
                // 2. Push new stage history record ($push)
                if (historyUpdate.$push) {
                    await Deal.findByIdAndUpdate(req.params.id, { $push: historyUpdate.$push });
                }
            }
        }

        // [ENTERPRISE HARDENING]: coordinate-based duplicate check (Update Phase)
        if (sanitizedData.inventoryId || sanitizedData.unitNo) {
            const current = await Deal.findById(req.params.id).lean();
            const projectName = sanitizedData.projectName || current.projectName;
            const block = sanitizedData.block || current.block;
            const unitNo = sanitizedData.unitNo || current.unitNo;

            const coordQuery = {
                _id: { $ne: req.params.id },
                projectName,
                block,
                unitNo,
                stage: { $nin: ['Cancelled', 'Closed Lost', 'Closed', 'Closed Won', 'Sold Out'] }
            };

            const duplicateDeal = await Deal.findOne(coordQuery);
            if (duplicateDeal) {
                return res.status(400).json({
                    success: false,
                    error: `DUPLICATE PROTECTION: An active deal (#${duplicateDeal.dealId || duplicateDeal._id}) already exists for unit ${projectName} (${block}-${unitNo}). Please resolve the existing deal before creating or moving another deal to these coordinates.`
                });
            }
        }

        // [ENTERPRISE HARDENING]: Update-time Snapshotting
        if (sanitizedData.inventoryId) {
            const existingDeal = await Deal.findById(req.params.id);
            // If inventory is changing OR if deal currently has missing owner data
            if (existingDeal && (String(existingDeal.inventoryId) !== String(sanitizedData.inventoryId) || !existingDeal.owner)) {
                const inventory = await Inventory.findById(sanitizedData.inventoryId)
                    .populate({ path: 'owners', model: 'Contact' })
                    .populate({ path: 'associates.contact', model: 'Contact' });
                
                if (inventory) {
                    if (!sanitizedData.owner && inventory.owners?.[0]) {
                        sanitizedData.owner = inventory.owners[0]._id;
                    }
                    if (!sanitizedData.associatedContact && inventory.associates?.[0]?.contact) {
                        sanitizedData.associatedContact = inventory.associates[0].contact._id;
                    }
                    
                    // Snapshot metadata labels
                    if (!sanitizedData.projectName) sanitizedData.projectName = inventory.projectName;
                    if (!sanitizedData.unitNo) sanitizedData.unitNo = inventory.unitNo;
                    if (!sanitizedData.location) sanitizedData.location = inventory.location || inventory.address?.locality;
                    if (!sanitizedData.category) sanitizedData.category = inventory.category;
                    if (!sanitizedData.propertyType) sanitizedData.propertyType = inventory.propertyType;
                    if (!sanitizedData.unitType) sanitizedData.unitType = inventory.unitType;
                }
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
                'websiteMetadata.description': deal.description || deal.remarks || 'Check out this updated property listing at Bharat Properties.'
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
        console.error('[CRITICAL_ERROR] Error in updateDeal:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message, 
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

export const deleteDeal = async (req, res) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const deal = await Deal.findOneAndDelete({ _id: req.params.id, ...visibilityFilter });
        if (!deal) return res.status(404).json({ success: false, error: "Deal not found or access denied" });

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

export const getUniqueBlocks = async (req, res) => {
    try {
        const { project } = req.query;
        if (!project) return res.status(200).json({ success: true, blocks: [] });
        
        const blocks = await Deal.distinct("block", { 
            projectName: { $regex: new RegExp(`^${escapeRegExp(project)}$`, 'i') }, 
            block: { $ne: null, $exists: true } 
        });
        
        const sortedBlocks = blocks.filter(b => b && b.trim() !== "").sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        res.status(200).json({ success: true, blocks: sortedBlocks });
    } catch (error) {
        console.error("[GET_BLOCKS_ERROR_DEAL]", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

export const addOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const offerData = req.body;
        
        const deal = await Deal.findById(id);
        if (!deal) return res.status(404).json({ success: false, error: "Deal not found" });

        deal.offerHistory = deal.offerHistory || [];
        deal.offerHistory.push({
            date: offerData.date || new Date(),
            offerBy: offerData.offerBy,
            amount: offerData.amount,
            counterAmount: offerData.counterAmount,
            status: offerData.status || 'Active',
            remarks: offerData.conditions || offerData.note
        });

        deal.negotiationRounds = deal.negotiationRounds || [];
        deal.negotiationRounds.push({
            round: offerData.round || (deal.negotiationRounds.length + 1),
            date: offerData.date || new Date(),
            offerBy: offerData.offerBy,
            buyerOffer: offerData.amount,
            ownerCounter: offerData.counterAmount || 0,
            status: offerData.status || 'Active',
            notes: offerData.conditions || offerData.note
        });

        await deal.save();
        res.json({ success: true, message: "Offer added successfully", data: deal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
