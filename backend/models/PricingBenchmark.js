/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * PRICING BENCHMARK MODEL — Enterprise Grade
 * Bharat Properties CRM — Phase 1 Foundation
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * This collection stores aggregated market pricing data per:
 *   location × subCategory × period
 * 
 * Populated by nightly cron jobs that aggregate closed deal data.
 * Used to power: Price Intelligence Cards, Smart Suggestor, Market Analytics
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import mongoose from 'mongoose';

const OrientationStatsSchema = new mongoose.Schema({
    count:          { type: Number, default: 0 },
    avgPremiumPct:  { type: Number, default: 0 },  // avg orientation premium % for this type
    avgRatePerUnit: { type: Number, default: 0 },   // avg closed rate for this orientation type
}, { _id: false });

const PricingBenchmarkSchema = new mongoose.Schema({

    // ── Dimension Keys (Composite Index) ──────────────────────────────
    location: {
        type: String,
        required: true,
        index: true,
        comment: 'Normalized location string: "Sector 20, Mohali" or "Zirakpur"'
    },
    subCategory: {
        type: String,
        required: true,
        index: true,
        comment: 'Resolved lookup_value: "Residential Plot", "Flat", etc.'
    },
    areaUnit: {
        type: String,
        required: true,
        enum: ['PER_SQ_FT', 'PER_SQ_YD', 'PER_KANAL', 'PER_ACRE', 'PER_MARLA'],
        comment: 'Standard unit for this subCategory — auto-determined by pricingUtils.getAreaUnit()'
    },
    period: {
        type: String,
        index: true,
        comment: 'ISO period string: "2024-Q2", "2024-06" (monthly), or "trailing-90d"'
    },

    // ── Aggregated Price Metrics ───────────────────────────────────────
    dealCount: { type: Number, default: 0 },            // # of deals in this dataset

    // Expected Price (seller demand)
    avgExpectedRPU:   { type: Number, default: null },   // avg rate per unit
    minExpectedRPU:   { type: Number, default: null },
    maxExpectedRPU:   { type: Number, default: null },

    // Quoted Price (agent's go-to-market price)
    avgQuotedRPU:     { type: Number, default: null },
    minQuotedRPU:     { type: Number, default: null },
    maxQuotedRPU:     { type: Number, default: null },

    // Offer Price (buyer's best offer — market reality)
    avgOfferRPU:      { type: Number, default: null },
    minOfferRPU:      { type: Number, default: null },
    maxOfferRPU:      { type: Number, default: null },

    // Closed Price (ground truth — Fair Market Value baseline)
    avgClosedRPU:     { type: Number, default: null },   // PRIMARY BENCHMARK
    minClosedRPU:     { type: Number, default: null },
    maxClosedRPU:     { type: Number, default: null },
    medianClosedRPU:  { type: Number, default: null },   // For skew-resistant analysis

    // ── Gap Analytics ──────────────────────────────────────────────────
    avgNegotiationGapPct: { type: Number, default: null }, // (Expected - Closed) / Expected × 100
    avgBuyerDiscountPct:  { type: Number, default: null }, // (Quoted - Offer) / Quoted × 100
    avgDaysToClose:       { type: Number, default: null }, // Avg deal velocity

    // ── Trend Analytics ───────────────────────────────────────────────
    trend: {
        type: String,
        enum: ['upward', 'stable', 'downward', 'insufficient_data'],
        default: 'insufficient_data'
    },
    trendPct: { type: Number, default: null }, // % change vs previous period (positive = up)

    // ── Orientation Breakdown (Premium Analysis by Type) ──────────────
    orientationStats: {
        // Facing types
        corner:       OrientationStatsSchema,
        parkFacing:   OrientationStatsSchema,
        mainRoad:     OrientationStatsSchema,
        normal:       OrientationStatsSchema,
        // Direction types
        north:        OrientationStatsSchema,
        east:         OrientationStatsSchema,
        northEast:    OrientationStatsSchema,
        south:        OrientationStatsSchema,
        west:         OrientationStatsSchema,
        // Road width brackets
        road30to40:   OrientationStatsSchema,  // 30-40 ft
        road40to60:   OrientationStatsSchema,  // 40-60 ft
        road60plus:   OrientationStatsSchema,  // 60+ ft
    },

    // ── Metadata ──────────────────────────────────────────────────────
    computedAt: { type: Date, default: Date.now, index: true },
    isStale: {
        type: Boolean,
        default: false,
        comment: 'Set to true if data is older than 180 days with no new deals'
    },
    dataSourceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Deal' }], // deal IDs included

}, {
    timestamps: true,
    collection: 'pricingbenchmarks'
});

// ── Compound Indexes for fast lookups ─────────────────────────────────────
PricingBenchmarkSchema.index({ location: 1, subCategory: 1, period: 1 }, { unique: true });
PricingBenchmarkSchema.index({ location: 1, subCategory: 1, trend: 1 });
PricingBenchmarkSchema.index({ computedAt: -1 });
PricingBenchmarkSchema.index({ isStale: 1 });

export default mongoose.model('PricingBenchmark', PricingBenchmarkSchema);
