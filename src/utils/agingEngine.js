/**
 * Pipeline Ageing & Decay Intelligence — v2
 * Deal Health Score Computation
 * Commission Leakage Detection
 * Deal Death (Stall) Detection
 * Owner Risk Factor
 */

// ─── DEFAULT CONFIG ────────────────────────────────────────────────────────────
export const DEFAULT_AGING_RULES = {
    negotiationMaxDays: { value: 15, label: 'Negotiation Risk Threshold (days)', action: 'Risk Flag' },
    negotiationStalledDays: { value: 21, label: 'Negotiation Stalled Threshold (days)', action: 'Auto Stall' },
    activityGapDays: { value: 7, label: 'Activity Gap Warning (days)', action: 'Score Penalty' },
    bookedNoAgreementDays: { value: 10, label: 'Booked → Agreement Max Days', action: 'Admin Alert' },
    prospectMaxDays: { value: 30, label: 'Prospect Stale Threshold (days)', action: 'Risk Flag' },
    opportunityMaxDays: { value: 21, label: 'Opportunity Risk Threshold (days)', action: 'Risk Flag' },
};

export const DEFAULT_HEALTH_CONFIG = {
    stageWeight: { weight: 30, label: 'Stage Weight' },
    scoreWeight: { weight: 30, label: 'Lead Score Weight' },
    agepenalty: { weight: 15, label: 'Age Penalty (from aging rules)' },
    riskPenalty: { weight: 15, label: 'Risk Signal Penalty' },
    ownerRiskWeight: { weight: 10, label: 'Owner Responsiveness Weight' },
    thresholds: {
        green: { min: 70, label: 'Healthy', color: '#10b981', icon: 'fa-heart' },
        yellow: { min: 40, label: 'Watch', color: '#f59e0b', icon: 'fa-eye' },
        red: { min: 0, label: 'At Risk', color: '#ef4444', icon: 'fa-exclamation-triangle' },
    }
};

export const DEFAULT_FORECAST_CONFIG = {
    commissionRate: { value: 2.0, label: 'Commission Rate (%)', unit: '%' },
    commissionLeakageThreshold: { value: 50000, label: 'Commission Leakage Alert (₹)', unit: '₹' },
    showWeighted: { value: true, label: 'Show Weighted Pipeline Value' },
    showExpected: { value: true, label: 'Show Expected Commission' },
    showStageWise: { value: true, label: 'Show Stage-wise Breakdown' },
};

export const DEFAULT_INTENT_SIGNALS = {
    visitRepeat: { weight: 15, label: 'Repeat Site Visit', active: true, icon: 'fa-redo' },
    offerRevisions: { weight: 12, label: 'Offer Revisions Count', active: true, icon: 'fa-file-invoice' },
    legalDocRequest: { weight: 18, label: 'Legal Doc Requested', active: true, icon: 'fa-file-contract' },
    budgetGapPct: { weight: -10, label: 'Budget Gap % (penalty)', active: true, icon: 'fa-money-bill-wave' },
    familyVisit: { weight: 20, label: 'Family Brought for Visit', active: true, icon: 'fa-users' },
    whatsappResponse: { weight: 5, label: 'WhatsApp Response Rate', active: true, icon: 'fa-whatsapp' },
};

// ─── IMPROVEMENT 6: STAGE DENSITY CONFIG ─────────────────────────────────────
/** Target avg days per stage for density dashboard benchmarking */
export const DEFAULT_STAGE_DENSITY_TARGETS = {
    New: { targetDays: 1, label: 'New' },
    Prospect: { targetDays: 7, label: 'Prospect' },
    Qualified: { targetDays: 7, label: 'Qualified' },
    Opportunity: { targetDays: 14, label: 'Opportunity' },
    Negotiation: { targetDays: 21, label: 'Negotiation' },
    Booked: { targetDays: 30, label: 'Booked' },
};

// ─── CORE: AGING ──────────────────────────────────────────────────────────────
/**
 * Compute pipeline age for a lead/deal.
 */
export const computeAging = (createdAt, stageChangedAt, lastActivityAt) => {
    const now = new Date();
    const totalDays = Math.floor((now - new Date(createdAt)) / 86400000);
    const stageDays = stageChangedAt ? Math.floor((now - new Date(stageChangedAt)) / 86400000) : totalDays;
    const activityGapDays = lastActivityAt ? Math.floor((now - new Date(lastActivityAt)) / 86400000) : totalDays;
    return { totalDays, stageDays, activityGapDays };
};

// ─── RISK FLAGS ────────────────────────────────────────────────────────────────
export const computeRiskFlags = (currentStage, { stageDays, activityGapDays }, agingRules = DEFAULT_AGING_RULES) => {
    const flags = [];

    if (currentStage === 'Negotiation' && stageDays > agingRules.negotiationMaxDays.value)
        flags.push({ type: 'negotiation_stale', message: `Negotiation for ${stageDays} days (>${agingRules.negotiationMaxDays.value})`, severity: 'high' });

    if (activityGapDays > agingRules.activityGapDays.value)
        flags.push({ type: 'activity_gap', message: `No activity for ${activityGapDays} days`, severity: 'medium' });

    if (currentStage === 'Booked' && stageDays > agingRules.bookedNoAgreementDays.value)
        flags.push({ type: 'booked_no_agreement', message: `Booked ${stageDays} days without agreement`, severity: 'high' });

    if (currentStage === 'Prospect' && stageDays > agingRules.prospectMaxDays.value)
        flags.push({ type: 'prospect_stale', message: `Prospect stale for ${stageDays} days`, severity: 'medium' });

    if (currentStage === 'Opportunity' && stageDays > agingRules.opportunityMaxDays.value)
        flags.push({ type: 'opportunity_stale', message: `Opportunity stale for ${stageDays} days`, severity: 'high' });

    return flags;
};

// ─── IMPROVEMENT 3: DEAL DEATH DETECTION ─────────────────────────────────────
/**
 * Compute owner response rate from activity gap days.
 * Replaces the hardcoded default of 80 — Bug 3 fix.
 *
 * @param {number} activityGapDays - days since last activity on this deal/lead
 * @param {number} avgResponseDays - average response time (optional, from activity history)
 * @returns {number} 0–100 response rate
 */
export const computeOwnerResponseRate = (activityGapDays = 0, avgResponseDays = null) => {
    // Primary signal: how long since last activity
    let rate;
    if (activityGapDays <= 2) rate = 100;  // Same day / next day = fully responsive
    else if (activityGapDays <= 5) rate = 85;
    else if (activityGapDays <= 7) rate = 70;
    else if (activityGapDays <= 14) rate = 50;
    else if (activityGapDays <= 21) rate = 35;
    else if (activityGapDays <= 30) rate = 20;
    else rate = 10;  // > 30 days = ghost owner

    // Secondary signal: average response time across history (if available)
    if (avgResponseDays !== null) {
        const responseBonus = avgResponseDays <= 1 ? 10 : avgResponseDays <= 3 ? 5 : 0;
        rate = Math.min(100, rate + responseBonus);
    }

    return rate;
};

// ─── ACTIVITY SCORE FOR DEAL HEALTH ──────────────────────────────────────────
/**
 * Compute an activity-driven score for deal health.
 * Mirrors leadScoring.js activity logic but applied to deal-level activities.
 *
 * Positive outcomes (interest signals): +ve points
 * Negative outcomes (rejection signals): -ve points
 * Recency multiplier: last 7 days x1.5, last 30 days x1.0, older x0.5
 *
 * @param {Array} activities   - array of activity objects { type, details, completedAt, status }
 * @param {Object} activityMasterFields - config from PropertyConfigContext
 * @returns {number} 0–100 activity score
 */
export const computeActivityScore = (activities = [], activityMasterFields = {}) => {
    if (!Array.isArray(activities) || activities.length === 0) return 0;

    // Positive outcome keyword signals
    const POSITIVE_KEYWORDS = [
        'interested', 'connected', 'accepted', 'conducted', 'visited', 'positive',
        'agreed', 'shortlisted', 'follow up', 'booked', 'offer accepted'
    ];
    const NEGATIVE_KEYWORDS = [
        'not interested', 'rejected', 'no answer', 'cancelled', 'wrong number',
        'no show', 'did not visit', 'lost', 'withdrawn', 'no response'
    ];

    const now = new Date();
    let rawScore = 0;
    let scoredCount = 0;

    activities.forEach(act => {
        if (act.status !== 'Completed') return; // Only completed activities count

        const completedAt = act.completedAt || act.updatedAt || act.createdAt;
        const daysAgo = completedAt
            ? Math.floor((now - new Date(completedAt)) / 86400000)
            : 30;

        // Recency multiplier
        const multiplier = daysAgo <= 7 ? 1.5 : daysAgo <= 30 ? 1.0 : 0.5;

        // Outcome quality
        const outcome = (
            act.details?.meetingOutcomeStatus ||
            act.details?.callOutcome ||
            act.details?.completionResult ||
            act.details?.mailStatus || ''
        ).toLowerCase();

        let points = 3; // Base: completed activity = 3 points
        if (POSITIVE_KEYWORDS.some(k => outcome.includes(k))) points = 10;
        else if (NEGATIVE_KEYWORDS.some(k => outcome.includes(k))) points = -5;

        // Activity type bonus: Site Visit > Meeting > Call > Task
        const typeBonus = act.type === 'Site Visit' ? 5
            : act.type === 'Meeting' ? 3
                : act.type === 'Call' ? 1
                    : 0;

        rawScore += (points + typeBonus) * multiplier;
        scoredCount++;
    });

    if (scoredCount === 0) return 0;

    // Normalize: cap at 25 (this maps to the 25% weight in computeDealHealth)
    return Math.max(0, Math.min(25, Math.round(rawScore)));
};

/**
 * Detect if a deal has stalled (Deal Death).
 *
 * Rules:
 * - Negotiation > 21 days AND no offer revision in last 21 days → Stalled
 * - Opportunity > 30 days AND no activity in last 14 days → Stalled
 *
 * @param {string}  stage
 * @param {number}  stageDays         - days in current stage
 * @param {Date|null} lastOfferChangedAt
 * @param {number}  activityGapDays
 * @param {Object}  agingRules
 * @returns {{ stalled: boolean, reason: string, severity: 'critical'|'warning'|null }}
 */
export const computeDealDeath = (stage, stageDays, lastOfferChangedAt, activityGapDays = 0, agingRules = DEFAULT_AGING_RULES) => {
    const stalledDays = agingRules.negotiationStalledDays?.value ?? 21;

    if (stage === 'Negotiation') {
        const offerDaysAgo = lastOfferChangedAt
            ? Math.floor((new Date() - new Date(lastOfferChangedAt)) / 86400000)
            : stageDays;

        if (stageDays > stalledDays && offerDaysAgo >= stalledDays) {
            return {
                stalled: true,
                reason: `Negotiation stalled: ${stageDays} days in stage, no offer change for ${offerDaysAgo} days`,
                severity: 'critical',
                suggestedAction: 'Revive with new offer or mark Closed Lost',
            };
        }

        if (stageDays > stalledDays * 0.7 && activityGapDays > 7) {
            return {
                stalled: true,
                reason: `Negotiation at risk: ${stageDays} days in stage, last activity ${activityGapDays} days ago`,
                severity: 'warning',
                suggestedAction: 'Schedule follow-up immediately',
            };
        }
    }

    if (stage === 'Opportunity' && stageDays > 30 && activityGapDays > 14) {
        return {
            stalled: true,
            reason: `Opportunity stalled: ${stageDays} days in stage, no activity for ${activityGapDays} days`,
            severity: 'warning',
            suggestedAction: 'Re-engage or re-qualify the lead',
        };
    }

    return { stalled: false, reason: null, severity: null, suggestedAction: null };
};

// ─── IMPROVEMENT 4: DEAL HEALTH WITH OWNER RISK + ACTIVITY SCORE ─────────────
/**
 * Compute deal health score (0–100).
 *
 * v3 Formula:
 *   health = (stageScore × 0.25) + (leadScore × 0.25) + (activityScore × 0.25)
 *            − riskPenalty − ownerRisk
 *
 * @param {number} leadScore          0–100
 * @param {string} stage
 * @param {Array}  riskFlags
 * @param {Object} healthConfig
 * @param {number} ownerResponseRate  0–100 (use computeOwnerResponseRate(); NOT hardcoded 80)
 * @param {Array}  activities[]       deal/lead activities for activity score computation
 * @param {Object} activityMasterFields
 * @returns {{ score, label, color, icon, ownerRisk, activityScore }}
 */
export const computeDealHealth = (
    leadScore,
    stage,
    riskFlags = [],
    healthConfig = DEFAULT_HEALTH_CONFIG,
    ownerResponseRate = 80,
    activities = [],
    activityMasterFields = {}
) => {
    const STAGE_SCORES = {
        'New': 5, 'Prospect': 15, 'Qualified': 30, 'Opportunity': 50,
        'Negotiation': 65, 'Booked': 80, 'Closed Won': 100, 'Closed Lost': 0,
        'Open': 10, 'Stalled': 20, 'Quote': 25,
    };

    const stageScore = STAGE_SCORES[stage] || 10;
    const riskPenalty = riskFlags.filter(f => f.severity === 'high').length * 10 +
        riskFlags.filter(f => f.severity === 'medium').length * 5;

    // Owner risk: response rate < 40 → penalty (max 15 pts)
    const ownerRisk = ownerResponseRate < 40
        ? Math.round((40 - ownerResponseRate) / 40 * 15)
        : 0;
    const ownerLabel = ownerResponseRate >= 70 ? 'Responsive' : ownerResponseRate >= 40 ? 'Slow' : 'Non-Responsive';

    // Activity score (0–25) — outcome quality + recency
    const actScore = computeActivityScore(activities, activityMasterFields);

    // v3 Formula: Stage(25%) + LeadScore(25%) + ActivityScore(25%) − Risks − OwnerRisk
    const health = Math.max(0, Math.min(100,
        (stageScore * 0.25) + (leadScore * 0.25) + actScore - riskPenalty - ownerRisk
    ));

    const { green, yellow, red } = healthConfig.thresholds;
    let label, color, icon;
    if (health >= green.min) { label = green.label; color = green.color; icon = 'fa-heart'; }
    else if (health >= yellow.min) { label = yellow.label; color = yellow.color; icon = 'fa-eye'; }
    else { label = red.label; color = red.color; icon = 'fa-exclamation-triangle'; }

    return {
        score: Math.round(health),
        label,
        color,
        icon,
        activityScore: actScore,
        ownerRisk: { penalty: ownerRisk, rate: ownerResponseRate, label: ownerLabel }
    };
};

// ─── IMPROVEMENT 5: COMMISSION LEAKAGE DETECTION ─────────────────────────────
/**
 * Detect commission leakage: a deal with low health but high potential commission.
 *
 * @param {number} dealHealth          0–100 (from computeDealHealth)
 * @param {number} commission          commission value in ₹
 * @param {number} threshold           leakage threshold in ₹ (default from forecastConfig)
 * @returns {{ leakage: boolean, severity: 'critical'|'warning'|null, message: string }}
 */
export const detectCommissionLeakage = (dealHealth, commission, threshold = 50000) => {
    if (dealHealth < 40 && commission > threshold) {
        return {
            leakage: true,
            severity: 'critical',
            message: `🚨 Critical: Deal health ${dealHealth}% with ₹${commission.toLocaleString()} commission at risk`,
            action: 'Immediate intervention required — escalate to senior manager',
        };
    }
    if (dealHealth < 55 && commission > threshold * 0.7) {
        return {
            leakage: true,
            severity: 'warning',
            message: `⚠️ Warning: Deal health ${dealHealth}% with ₹${commission.toLocaleString()} commission at risk`,
            action: 'Schedule review meeting within 48 hours',
        };
    }
    return { leakage: false, severity: null, message: null, action: null };
};

// ─── IMPROVEMENT 6: STAGE DENSITY COMPUTATION ────────────────────────────────
/**
 * Compute stage density metrics from a list of leads/deals.
 * Each lead must have: { stage, stageChangedAt, createdAt, isLost }
 *
 * Returns: conversion %, drop-off %, avg days per stage, bottleneck detection.
 */
export const computeStageDensity = (leads = [], targets = DEFAULT_STAGE_DENSITY_TARGETS) => {
    const ORDERED_STAGES = ['New', 'Prospect', 'Qualified', 'Opportunity', 'Negotiation', 'Booked', 'Closed Won'];

    const stageGroups = {};
    ORDERED_STAGES.forEach(s => { stageGroups[s] = []; });
    leads.forEach(lead => {
        if (stageGroups[lead.stage]) stageGroups[lead.stage].push(lead);
    });

    const total = leads.length || 1;
    const result = [];

    ORDERED_STAGES.forEach((stage, idx) => {
        const group = stageGroups[stage] || [];
        const count = group.length;
        const conversionPct = Math.round((count / total) * 100);

        const nextStage = ORDERED_STAGES[idx + 1];
        const nextCount = nextStage ? (stageGroups[nextStage] || []).length : 0;
        const conversionRate = count > 0 ? Math.round((nextCount / count) * 100) : 0;
        const dropOffRate = count > 0 ? 100 - conversionRate : 0;

        // Avg days in stage (from stageChangedAt if available, else createdAt)
        const daysInStage = group.map(l => {
            const from = new Date(l.stageChangedAt || l.createdAt);
            return Math.floor((new Date() - from) / 86400000);
        });
        const avgDays = daysInStage.length > 0
            ? Math.round(daysInStage.reduce((a, b) => a + b, 0) / daysInStage.length)
            : 0;

        const target = targets[stage]?.targetDays ?? 14;
        const isBottleneck = avgDays > target * 1.5 && count > 0;

        result.push({
            stage,
            count,
            conversionPct,           // % of all leads currently in this stage
            conversionRate,           // % that progress to next stage
            dropOffRate,              // % that don't progress (stall or lost)
            avgDays,
            targetDays: target,
            isBottleneck,
            color: isBottleneck ? '#ef4444' : avgDays > target ? '#f59e0b' : '#10b981',
        });
    });

    return result;
};

// ─── WEIGHTED FORECAST ─────────────────────────────────────────────────────────
/**
 * Compute weighted pipeline value using stage probability.
 *
 * @param {number} dealValue
 * @param {number} stageProbability  - from getStageProbability() or STAGE_PIPELINE
 * @param {number} commissionRate    - e.g. 2.0 (%)
 */
export const computeForecast = (dealValue, stageProbability, commissionRate = 2.0) => {
    const weightedValue = dealValue * (stageProbability / 100);
    const commission = dealValue * (commissionRate / 100);
    const expectedCommission = weightedValue * (commissionRate / 100);
    return { weightedValue, commission, expectedCommission };
};
