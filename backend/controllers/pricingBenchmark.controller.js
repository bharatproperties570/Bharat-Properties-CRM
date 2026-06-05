/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * PRICING BENCHMARK CONTROLLER — Enterprise Grade
 * Bharat Properties CRM — Phase 1 Foundation
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Endpoints:
 *   POST /api/pricing/aggregate       → Run aggregation on closed deals
 *   GET  /api/pricing/suggest         → Smart price bands for an inventory/deal
 *   GET  /api/pricing/benchmark       → Get benchmark for a location × subCategory
 *   GET  /api/pricing/market-pulse    → Dashboard KPI: trending markets
 *   GET  /api/pricing/deal-analysis/:dealId → Price journey analysis for a deal
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import mongoose from 'mongoose';
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import PricingBenchmark from '../models/PricingBenchmark.js';
import Lookup from '../models/Lookup.js';
import {
    getAreaUnit,
    calcRatePerUnit,
    calcOrientationPremium,
    calcMarketPositioning,
    calcPriceBands,
    calcBuyerPersona,
    formatINR,
    toSqFt,
    fromSqFt,
    AREA_UNIT_LABELS,
    AREA_CONVERSIONS
} from '../utils/pricingUtils.js';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Resolve a Lookup ObjectId to its human-readable string value.
 */
const resolveLookupStr = async (idOrStr) => {
    if (!idOrStr) return '';
    if (mongoose.Types.ObjectId.isValid(String(idOrStr))) {
        const doc = await Lookup.findById(idOrStr).select('lookup_value').lean();
        return doc?.lookup_value || '';
    }
    return typeof idOrStr === 'object' ? (idOrStr.lookup_value || '') : String(idOrStr);
};

/**
 * Normalize a location string to a consistent format for grouping.
 * e.g. "  sector 20, mohali " → "Sector 20, Mohali"
 */
const normalizeLocation = (str) => {
    if (!str) return '';
    return String(str)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Extract the best location string from a deal, checking multiple fields.
 */
const getDealLocation = (deal) => {
    return normalizeLocation(
        deal.sector ||
        deal.location ||
        deal.projectName ||
        (deal.address?.locality) ||
        (deal.address?.area) ||
        ''
    );
};

/**
 * Get period string for a given trailing-days window.
 */
const getPeriodLabel = (trailingDays) => `trailing-${trailingDays}d`;

// ─── CONTROLLER: AGGREGATE BENCHMARKS ────────────────────────────────────────

/**
 * POST /api/pricing/aggregate
 * Aggregates closed deals into PricingBenchmark documents.
 * Can be called from:
 *   - Manual trigger (admin)
 *   - Nightly cron job
 * 
 * Body: { trailingDays: 90 }
 */
export const aggregateBenchmarks = async (req, res) => {
    try {
        const { trailingDays = 90 } = req.body;
        const period = getPeriodLabel(trailingDays);
        const sinceDate = new Date(Date.now() - trailingDays * 24 * 60 * 60 * 1000);

        // 1. Fetch all closed deals with price & inventory in the period
        const closedDeals = await Deal.find({
            stage: { $in: ['Closed', 'Closed Won'] },
            price: { $gt: 0 },
            createdAt: { $gte: sinceDate }
        })
        .select('price quotePrice offerHistory subCategory category location sector projectName address size sizeUnit sizeConfig inventoryId facing direction roadWidth orientation closedAt createdAt')
        .lean();

        if (!closedDeals.length) {
            return res.json({ status: 'success', message: 'No closed deals found in period', processed: 0 });
        }

        // 2. Resolve subCategory strings and compute per-deal rate
        const enriched = [];
        for (const deal of closedDeals) {
            const subCatStr   = await resolveLookupStr(deal.subCategory);
            const facingStr   = await resolveLookupStr(deal.facing);
            const directionStr = await resolveLookupStr(deal.direction);
            const roadWidthStr = await resolveLookupStr(deal.roadWidth);
            const orientStr   = await resolveLookupStr(deal.orientation);

            if (!subCatStr) continue;

            const areaValue = deal.size?.value || parseFloat(deal.size) || 0;
            const areaUnit  = deal.size?.unit || deal.sizeUnit || 'Sq.Ft.';

            const { ratePerUnit, areaUnit: stdUnit, areaInStdUnit } = calcRatePerUnit(
                deal.price,
                areaValue,
                areaUnit,
                subCatStr
            );

            if (!ratePerUnit || ratePerUnit <= 0) continue;

            // Best offer price (last offer in offerHistory)
            const lastOffer = deal.offerHistory?.length
                ? deal.offerHistory[deal.offerHistory.length - 1]
                : null;
            const { ratePerUnit: offerRPU } = lastOffer?.amount
                ? calcRatePerUnit(lastOffer.amount, areaValue, areaUnit, subCatStr)
                : { ratePerUnit: null };

            const location = getDealLocation(deal);
            if (!location) continue;

            enriched.push({
                location,
                subCategory: subCatStr,
                areaUnit: stdUnit,
                closedRPU: ratePerUnit,
                quotedRPU: deal.quotePrice
                    ? calcRatePerUnit(deal.quotePrice, areaValue, areaUnit, subCatStr).ratePerUnit
                    : null,
                expectedRPU: null, // Deal model 'price' IS expected; quote is what we pitched
                offerRPU,
                facing: facingStr,
                direction: directionStr,
                roadWidth: roadWidthStr,
                orientation: orientStr,
                dealId: deal._id,
            });
        }

        if (!enriched.length) {
            return res.json({ status: 'success', message: 'No enrichable deals found', processed: 0 });
        }

        // 3. Group by location × subCategory
        const groups = {};
        for (const item of enriched) {
            const key = `${item.location}||${item.subCategory}`;
            if (!groups[key]) groups[key] = { ...item, items: [] };
            groups[key].items.push(item);
        }

        // 4. Compute statistics for each group and upsert
        let upsertCount = 0;
        for (const [key, group] of Object.entries(groups)) {
            const items = group.items;
            const dealCount = items.length;

            // Skip groups with < 3 deals (unreliable benchmark)
            if (dealCount < 3) continue;

            const avg = (arr, field) => {
                const vals = arr.map(i => i[field]).filter(v => v !== null && !isNaN(v));
                return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
            };
            const minVal = (arr, field) => {
                const vals = arr.map(i => i[field]).filter(v => v !== null && !isNaN(v));
                return vals.length ? Math.round(Math.min(...vals)) : null;
            };
            const maxVal = (arr, field) => {
                const vals = arr.map(i => i[field]).filter(v => v !== null && !isNaN(v));
                return vals.length ? Math.round(Math.max(...vals)) : null;
            };
            const median = (arr, field) => {
                const vals = arr.map(i => i[field]).filter(v => v !== null && !isNaN(v)).sort((a, b) => a - b);
                if (!vals.length) return null;
                const mid = Math.floor(vals.length / 2);
                return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
            };

            const avgClosedRPU = avg(items, 'closedRPU');
            const avgQuotedRPU = avg(items, 'quotedRPU');
            const avgOfferRPU  = avg(items, 'offerRPU');

            // Negotiation gap: (quoted - closed) / quoted
            const validGapItems = items.filter(i => i.quotedRPU && i.closedRPU);
            const avgNegotiationGapPct = validGapItems.length
                ? Math.round(validGapItems.reduce((acc, i) => acc + ((i.quotedRPU - i.closedRPU) / i.quotedRPU) * 100, 0) / validGapItems.length * 10) / 10
                : null;

            // Buyer discount gap: (quoted - offer) / quoted
            const validDiscountItems = items.filter(i => i.quotedRPU && i.offerRPU);
            const avgBuyerDiscountPct = validDiscountItems.length
                ? Math.round(validDiscountItems.reduce((acc, i) => acc + ((i.quotedRPU - i.offerRPU) / i.quotedRPU) * 100, 0) / validDiscountItems.length * 10) / 10
                : null;

            // Trend: compare to previous period benchmark
            let trend = 'insufficient_data';
            let trendPct = null;
            const prevBenchmark = await PricingBenchmark.findOne({
                location: group.location,
                subCategory: group.subCategory,
                period: getPeriodLabel(180)
            }).lean();
            if (prevBenchmark?.avgClosedRPU && avgClosedRPU) {
                trendPct = Math.round(((avgClosedRPU - prevBenchmark.avgClosedRPU) / prevBenchmark.avgClosedRPU) * 100 * 10) / 10;
                if (trendPct > 3) trend = 'upward';
                else if (trendPct < -3) trend = 'downward';
                else trend = 'stable';
            }

            await PricingBenchmark.findOneAndUpdate(
                { location: group.location, subCategory: group.subCategory, period },
                {
                    $set: {
                        areaUnit: group.areaUnit,
                        dealCount,
                        avgClosedRPU,
                        minClosedRPU:  minVal(items, 'closedRPU'),
                        maxClosedRPU:  maxVal(items, 'closedRPU'),
                        medianClosedRPU: median(items, 'closedRPU'),
                        avgQuotedRPU,
                        minQuotedRPU:  minVal(items, 'quotedRPU'),
                        maxQuotedRPU:  maxVal(items, 'quotedRPU'),
                        avgOfferRPU,
                        minOfferRPU:   minVal(items, 'offerRPU'),
                        maxOfferRPU:   maxVal(items, 'offerRPU'),
                        avgNegotiationGapPct,
                        avgBuyerDiscountPct,
                        trend,
                        trendPct,
                        computedAt: new Date(),
                        isStale: false,
                        dataSourceIds: items.map(i => i.dealId),
                    }
                },
                { upsert: true, new: true }
            );
            upsertCount++;
        }

        return res.json({
            status: 'success',
            message: `Benchmark aggregation complete`,
            processed: enriched.length,
            benchmarksUpdated: upsertCount,
            period,
        });

    } catch (err) {
        console.error('[PricingBenchmark] Aggregation error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ─── CONTROLLER: SMART PRICE SUGGESTION ──────────────────────────────────────

/**
 * GET /api/pricing/suggest?inventoryId=xxx OR ?dealId=xxx
 * Returns price bands + orientation analysis + market positioning for a property.
 */
export const suggestPrice = async (req, res) => {
    try {
        const { inventoryId, dealId } = req.query;

        let inventory = null;
        let deal = null;

        if (dealId && mongoose.Types.ObjectId.isValid(dealId)) {
            deal = await Deal.findById(dealId).lean();
            if (deal?.inventoryId) {
                inventory = await Inventory.findById(deal.inventoryId).lean();
            }
        }

        if (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) {
            inventory = await Inventory.findById(inventoryId).lean();
        }

        if (!inventory && !deal) {
            return res.status(400).json({ status: 'error', message: 'inventoryId or dealId required' });
        }

        // Resolve orientation strings
        const source = inventory || deal;
        const [subCatStr, facingStr, directionStr, roadWidthStr, orientStr] = await Promise.all([
            resolveLookupStr(source.subCategory),
            resolveLookupStr(inventory?.facing || deal?.facing),
            resolveLookupStr(inventory?.direction || deal?.direction),
            resolveLookupStr(inventory?.roadWidth || deal?.roadWidth),
            resolveLookupStr(inventory?.orientation || deal?.orientation),
        ]);

        // Area & rate-per-unit
        const priceValue = inventory?.price?.value || deal?.price || 0;
        const areaValue  = source.size?.value || parseFloat(source.size) || 0;
        const areaUnit   = source.size?.unit || source.sizeUnit || 'Sq.Ft.';
        const rateResult = calcRatePerUnit(priceValue, areaValue, areaUnit, subCatStr);

        // Orientation premium
        const orientationAnalysis = calcOrientationPremium({
            facing:      facingStr,
            direction:   directionStr,
            roadWidth:   roadWidthStr,
            orientation: orientStr,
        });

        // Find benchmark
        const location = normalizeLocation(
            inventory?.sector || inventory?.city || deal?.sector || deal?.location || ''
        );

        const benchmark = await PricingBenchmark.findOne({
            location: { $regex: new RegExp(location.split(',')[0], 'i') },
            subCategory: { $regex: new RegExp(subCatStr, 'i') },
        }).sort({ computedAt: -1 }).lean();

        // Market positioning
        const marketPositioning = benchmark?.avgClosedRPU
            ? calcMarketPositioning(rateResult.ratePerUnit, benchmark.avgClosedRPU, orientationAnalysis.totalPremiumPct)
            : 'no_data';

        // Price bands
        const priceBands = benchmark?.avgClosedRPU
            ? calcPriceBands(benchmark.avgClosedRPU, rateResult.areaInStdUnit, orientationAnalysis.totalPremiumPct)
            : null;

        // Buyer persona
        const buyerPersona = calcBuyerPersona(marketPositioning, orientationAnalysis.orientationScore);

        return res.json({
            status: 'success',
            data: {
                // Property info
                subCategory: subCatStr,
                location,
                areaUnit: rateResult.areaUnit,
                areaUnitLabel: rateResult.areaUnitLabel,
                areaInStdUnit: rateResult.areaInStdUnit,
                currentPrice: priceValue,
                currentRatePerUnit: rateResult.ratePerUnit,

                // Orientation analysis
                orientationAnalysis: {
                    facing:              facingStr,
                    direction:           directionStr,
                    roadWidth:           roadWidthStr,
                    orientation:         orientStr,
                    facingPremiumPct:    orientationAnalysis.facingPremium,
                    directionPremiumPct: orientationAnalysis.directionPremium,
                    roadWidthPremiumPct: orientationAnalysis.roadWidthPremium,
                    unitPremiumPct:      orientationAnalysis.orientationPremium,
                    totalPremiumPct:     orientationAnalysis.totalPremiumPct,
                    orientationScore:    orientationAnalysis.orientationScore,
                    tags:                orientationAnalysis.tags,
                },

                // Market benchmark
                benchmark: benchmark ? {
                    location:            benchmark.location,
                    period:              benchmark.period,
                    dealCount:           benchmark.dealCount,
                    avgClosedRPU:        benchmark.avgClosedRPU,
                    avgOfferRPU:         benchmark.avgOfferRPU,
                    avgNegotiationGapPct: benchmark.avgNegotiationGapPct,
                    trend:               benchmark.trend,
                    trendPct:            benchmark.trendPct,
                    areaUnitLabel:       AREA_UNIT_LABELS[benchmark.areaUnit] || '',
                } : null,

                // Intelligence outputs
                marketPositioning,
                buyerPersona,

                // Price bands (only if benchmark exists)
                priceBands: priceBands ? {
                    aggressive: { value: priceBands.aggressive, label: formatINR(priceBands.aggressive), note: 'Quick Sale (-8%)' },
                    fair:       { value: priceBands.fair,       label: formatINR(priceBands.fair),       note: 'Fair Market Value' },
                    patient:    { value: priceBands.patient,    label: formatINR(priceBands.patient),    note: 'Hold for Premium (+10%)' },
                } : null,
            }
        });

    } catch (err) {
        console.error('[PricingBenchmark] Suggest error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ─── CONTROLLER: GET BENCHMARK ────────────────────────────────────────────────

/**
 * GET /api/pricing/benchmark?location=Sector 20, Mohali&subCategory=Residential Plot&period=trailing-90d
 */
export const getBenchmark = async (req, res) => {
    try {
        const { location, subCategory, period = 'trailing-90d' } = req.query;
        if (!location || !subCategory) {
            return res.status(400).json({ status: 'error', message: 'location and subCategory required' });
        }

        const benchmark = await PricingBenchmark.findOne({
            location: { $regex: new RegExp(location.split(',')[0].trim(), 'i') },
            subCategory: { $regex: new RegExp(subCategory.trim(), 'i') },
            period,
        }).lean();

        return res.json({
            status: 'success',
            data: benchmark || null,
            hasData: !!benchmark,
            minDealsRequired: 3,
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ─── CONTROLLER: MARKET PULSE (DASHBOARD KPI) ─────────────────────────────────

/**
 * GET /api/pricing/market-pulse?limit=5
 * Returns top trending / overpriced / hot micro-markets for dashboard.
 */
export const getMarketPulse = async (req, res) => {
    try {
        const { limit = 5 } = req.query;

        const [hotMarkets, stableMarkets, downMarkets] = await Promise.all([
            PricingBenchmark.find({ trend: 'upward', isStale: false, dealCount: { $gte: 3 } })
                .sort({ trendPct: -1 })
                .limit(parseInt(limit))
                .select('location subCategory avgClosedRPU trendPct dealCount areaUnit')
                .lean(),

            PricingBenchmark.find({ trend: 'stable', isStale: false, dealCount: { $gte: 5 } })
                .sort({ dealCount: -1 })
                .limit(parseInt(limit))
                .select('location subCategory avgClosedRPU trendPct dealCount areaUnit')
                .lean(),

            PricingBenchmark.find({ trend: 'downward', isStale: false, dealCount: { $gte: 3 } })
                .sort({ trendPct: 1 })
                .limit(parseInt(limit))
                .select('location subCategory avgClosedRPU trendPct dealCount areaUnit')
                .lean(),
        ]);

        return res.json({
            status: 'success',
            data: { hotMarkets, stableMarkets, downMarkets }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// ─── CONTROLLER: DEAL PRICE JOURNEY ANALYSIS ──────────────────────────────────

/**
 * GET /api/pricing/deal-analysis/:dealId
 * Returns the full price journey (Expected → Quoted → Offer → Closed)
 * with gap percentages and market comparison.
 */
export const getDealPriceAnalysis = async (req, res) => {
    try {
        const { dealId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(dealId)) {
            return res.status(400).json({ status: 'error', message: 'Invalid dealId' });
        }

        const deal = await Deal.findById(dealId).lean();
        if (!deal) return res.status(404).json({ status: 'error', message: 'Deal not found' });

        const inventory = deal.inventoryId
            ? await Inventory.findById(deal.inventoryId).lean()
            : null;

        // Resolve key strings
        const subCatStr = await resolveLookupStr(deal.subCategory || inventory?.subCategory);

        const areaValue = deal.size?.value || inventory?.size?.value || parseFloat(deal.size) || 0;
        const areaUnit  = deal.size?.unit || deal.sizeUnit || inventory?.size?.unit || 'Sq.Ft.';

        // Price points
        const expectedPrice = deal.price || null;          // Seller's expected price
        const quotedPrice   = deal.quotePrice || null;     // Our quoted price
        const lastOffer     = deal.offerHistory?.length
            ? deal.offerHistory[deal.offerHistory.length - 1]
            : null;
        const offerPrice    = lastOffer?.amount || null;   // Buyer's best offer
        const closedPrice   = deal.stage === 'Closed' || deal.stage === 'Closed Won'
            ? (deal.closedPrice || expectedPrice)
            : null;

        // Calculate rates per unit for each price point
        const calcRate = (price) => price
            ? calcRatePerUnit(price, areaValue, areaUnit, subCatStr).ratePerUnit
            : null;

        const expectedRPU = calcRate(expectedPrice);
        const quotedRPU   = calcRate(quotedPrice);
        const offerRPU    = calcRate(offerPrice);
        const closedRPU   = calcRate(closedPrice);

        // Gap calculations
        const gapPct = (a, b) => (a && b && b > 0)
            ? Math.round(((a - b) / b) * 100 * 10) / 10
            : null;

        const negotiationGap   = gapPct(expectedPrice, closedPrice); // Seller drop
        const buyerDiscountPct = gapPct(quotedPrice, offerPrice);    // Buyer discount asked

        // Benchmark for market comparison
        const location = normalizeLocation(deal.sector || deal.location || '');
        const benchmark = subCatStr && location
            ? await PricingBenchmark.findOne({
                location: { $regex: new RegExp(location.split(',')[0], 'i') },
                subCategory: { $regex: new RegExp(subCatStr, 'i') },
            }).sort({ computedAt: -1 }).lean()
            : null;

        return res.json({
            status: 'success',
            data: {
                dealId,
                stage: deal.stage,
                subCategory: subCatStr,
                areaUnit: getAreaUnit(subCatStr),
                areaUnitLabel: AREA_UNIT_LABELS[getAreaUnit(subCatStr)],

                // Price Journey
                priceJourney: {
                    expected: { price: expectedPrice, ratePerUnit: expectedRPU, label: 'Seller Expected', pct: 100 },
                    quoted:   { price: quotedPrice,   ratePerUnit: quotedRPU,   label: 'Our Quote',       pct: expectedPrice ? Math.round((quotedPrice / expectedPrice) * 1000) / 10 : null },
                    offer:    { price: offerPrice,    ratePerUnit: offerRPU,    label: "Buyer's Offer",   pct: expectedPrice ? Math.round((offerPrice / expectedPrice) * 1000) / 10 : null },
                    closed:   { price: closedPrice,   ratePerUnit: closedRPU,   label: 'Final Closed',    pct: expectedPrice ? Math.round((closedPrice / expectedPrice) * 1000) / 10 : null },
                },

                // Gaps
                analysis: {
                    negotiationGapPct:  negotiationGap,    // % drop from expected to closed
                    buyerDiscountAskedPct: buyerDiscountPct, // % gap buyer pushed for
                    marketCompare: benchmark?.avgClosedRPU && closedRPU
                        ? {
                            marketAvgRPU:    benchmark.avgClosedRPU,
                            dealRPU:         closedRPU,
                            vsMarketPct:     gapPct(closedRPU, benchmark.avgClosedRPU),
                            marketTrend:     benchmark.trend,
                            positioning:     closedRPU > benchmark.avgClosedRPU * 1.15
                                ? 'Above Market'
                                : closedRPU < benchmark.avgClosedRPU * 0.90
                                ? 'Below Market (Good for Buyer)'
                                : 'Fair Market'
                        }
                        : null,
                },
            }
        });

    } catch (err) {
        console.error('[PricingBenchmark] Deal analysis error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
};
