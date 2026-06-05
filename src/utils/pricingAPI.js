/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * PRICING INTELLIGENCE API — Frontend Service Layer
 * Bharat Properties CRM — Phase 2
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
import { api } from './api';

export const pricingAPI = {
    /**
     * Fetch price intelligence: orientation analysis + price bands + market benchmark
     * for a given inventory or deal.
     */
    suggest: (params) =>
        api.get('/pricing/suggest', { params }).then(r => r.data),

    /**
     * Get raw benchmark for a specific location × subCategory
     */
    getBenchmark: (params) =>
        api.get('/pricing/benchmark', { params }).then(r => r.data),

    /**
     * Get market pulse KPIs for dashboard (trending / stable / down markets)
     */
    getMarketPulse: (params) =>
        api.get('/pricing/market-pulse', { params }).then(r => r.data),

    /**
     * Get price journey analysis for a specific deal
     */
    getDealAnalysis: (dealId) =>
        api.get(`/pricing/deal-analysis/${dealId}`).then(r => r.data),

    /**
     * Trigger benchmark aggregation (admin action)
     */
    aggregate: (body = { trailingDays: 90 }) =>
        api.post('/pricing/aggregate', body).then(r => r.data),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const POSITIONING_CONFIG = {
    undervalued: {
        label: 'Undervalued 🔵',
        shortLabel: 'Undervalued',
        color: '#2563eb',
        bg: '#eff6ff',
        border: '#bfdbfe',
        icon: 'fa-arrow-trend-down',
        tip: 'Price is 10%+ below market average. Strong investor opportunity.',
    },
    fair: {
        label: 'Fair Value 🟢',
        shortLabel: 'Fair',
        color: '#16a34a',
        bg: '#f0fdf4',
        border: '#bbf7d0',
        icon: 'fa-check-circle',
        tip: 'Price aligns with current market. Ready for standard negotiation.',
    },
    overpriced: {
        label: 'Overpriced 🔴',
        shortLabel: 'Overpriced',
        color: '#dc2626',
        bg: '#fef2f2',
        border: '#fecaca',
        icon: 'fa-arrow-trend-up',
        tip: 'Price is 15%+ above market average. Expect strong buyer pushback.',
    },
    no_data: {
        label: 'No Data',
        shortLabel: 'N/A',
        color: '#94a3b8',
        bg: '#f8fafc',
        border: '#e2e8f0',
        icon: 'fa-question-circle',
        tip: 'Insufficient closed deal data in this location for benchmark.',
    },
};

export const TREND_CONFIG = {
    upward:             { label: 'Market Appreciating ↑', color: '#16a34a', icon: 'fa-arrow-trend-up' },
    stable:             { label: 'Market Stable →',       color: '#d97706', icon: 'fa-minus' },
    downward:           { label: 'Market Declining ↓',    color: '#dc2626', icon: 'fa-arrow-trend-down' },
    insufficient_data:  { label: 'Insufficient Data',     color: '#94a3b8', icon: 'fa-question-circle' },
};

export const PERSONA_CONFIG = {
    investor:  { label: 'Best for Investor',  color: '#7c3aed', bg: '#f5f3ff', icon: 'fa-chart-line' },
    end_user:  { label: 'Best for End User',  color: '#0369a1', bg: '#eff6ff', icon: 'fa-home' },
    neutral:   { label: 'General Listing',    color: '#64748b', bg: '#f8fafc', icon: 'fa-building' },
};

/**
 * Format INR amount to short Indian notation
 * e.g. 9500000 → "₹95 Lakh" | 10000000 → "₹1 Cr"
 */
export function formatINRShort(amount) {
    if (!amount || isNaN(amount)) return '—';
    const n = Math.round(amount);
    if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
    if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)} L`;
    if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`;
    return `₹${n.toLocaleString('en-IN')}`;
}

export function formatINRFull(amount) {
    if (!amount || isNaN(amount)) return '—';
    return '₹ ' + Math.round(amount).toLocaleString('en-IN');
}
