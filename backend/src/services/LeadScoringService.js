/**
 * LeadScoringService — Unified Backend Scoring Engine (v3)
 *
 * SINGLE SOURCE OF TRUTH for all lead scoring.
 * Reads config from SystemSetting (key: 'lead_scoring_config').
 * Writes: lead.leadScore, lead.activityScore, lead.scoreBreakdown
 *
 * Formula:
 *   (StaticBase + ActivityScore + SourceScore + FitScore + DecayPenalty) × StageMultiplier
 *
 * StaticBase  = lead.intent_index (from enrichment engine — static signals + keywords)
 * ActivityScore = computed from Activity documents (ONLY here — not in enrichment)
 * DecayPenalty  = lead.decay_score (set by CronWorker — NOT touching intent_index)
 *
 * enrichment_formula_score / intent_index are NOT modified here — enrichment is a separate system.
 */

import Lead from '../../models/Lead.js';
import Activity from '../../models/Activity.js';
import SystemSetting from '../modules/systemSettings/system.model.js';
import AuditLog from '../../models/AuditLog.js';

// ─── DEFAULT CONFIG (used if SystemSetting not found) ───────────────────────
const DEFAULT_CONFIG = {
    scoringAttributes: {
        requirement: { label: 'Requirement Filed', points: 10 },
        budget: { label: 'Budget Defined', points: 10 },
        location: { label: 'Location Specified', points: 8 },
        timeline: { label: 'Timeline Provided', points: 7 },
        payment: { label: 'Payment Mode Known', points: 5 },
        email: { label: 'Email Available', points: 3 },
        propertyType: { label: 'Property Type Set', points: 4 }
    },
    activityMasterFields: {
        activities: [
            {
                name: 'Call',
                purposes: [
                    {
                        name: 'Introduction / First Contact',
                        outcomes: [
                            { label: 'Interested', score: 10 },
                            { label: 'Positive Response', score: 8 },
                            { label: 'Will Think', score: 5 },
                            { label: 'Call Back Later', score: 3 },
                            { label: 'Not Connected', score: 0 },
                            { label: 'Not Interested', score: -5 }
                        ]
                    },
                    {
                        name: 'Follow Up',
                        outcomes: [
                            { label: 'Interested', score: 12 },
                            { label: 'Very Interested', score: 15 },
                            { label: 'Meeting Confirmed', score: 20 },
                            { label: 'Will Think', score: 5 },
                            { label: 'Not Connected', score: 0 },
                            { label: 'Not Interested', score: -10 }
                        ]
                    }
                ]
            },
            {
                name: 'Site Visit',
                purposes: [
                    {
                        name: 'Property Tour',
                        outcomes: [
                            { label: 'Very Interested', score: 30 },
                            { label: 'Interested', score: 20 },
                            { label: 'Shortlisted', score: 25 },
                            { label: 'Somewhat Interested', score: 10 },
                            { label: 'Not Interested', score: -15 }
                        ]
                    }
                ]
            },
            {
                name: 'Meeting',
                purposes: [
                    {
                        name: 'Product Presentation',
                        outcomes: [
                            { label: 'Deal Likely', score: 35 },
                            { label: 'Very Interested', score: 25 },
                            { label: 'Interested', score: 15 },
                            { label: 'Not Interested', score: -10 }
                        ]
                    },
                    {
                        name: 'Negotiation Meeting',
                        outcomes: [
                            { label: 'Deal Agreed', score: 50 },
                            { label: 'Deal Likely', score: 35 },
                            { label: 'On Hold', score: -5 }
                        ]
                    }
                ]
            },
            {
                name: 'Email',
                purposes: [
                    {
                        name: 'General',
                        outcomes: [
                            { label: 'Replied - Interested', score: 8 },
                            { label: 'No Reply', score: 0 }
                        ]
                    }
                ]
            }
        ]
    },
    sourceQualityScores: {
        referral:    { label: 'Referral / Reference', points: 15 },
        walkIn:      { label: 'Walk-in / Direct', points: 12 },
        google:      { label: 'Google / Search Ads', points: 8 },
        socialMedia: { label: 'Social Media (FB/IG)', points: 6 },
        portal:      { label: 'Portal (99acres etc.)', points: 5 },
        coldCall:    { label: 'Cold Call / Outbound', points: 2 }
    },
    inventoryFitScores: {
        match5Plus:  { label: '5+ Inventory Matches', points: 10 },
        priceDev5:   { label: 'Price within 5% fit', points: 8 },
        none:        { label: 'No matches (with activity)', points: -5 }
    },
    decayRules: {
        inactive7:  { label: '7+ days inactive', points: -5 },
        inactive14: { label: '14+ days inactive', points: -10 },
        inactive30: { label: '30+ days inactive', points: -20 }
    },
    stageMultipliers: {
        incoming:    { label: 'Incoming / New', value: 1.0 },
        prospect:    { label: 'Prospect / Early', value: 1.1 },
        qualified:   { label: 'Qualified / Vetted', value: 1.15 },
        opportunity: { label: 'Opportunity / Hot', value: 1.25 },
        negotiation: { label: 'Negotiation / Closure', value: 1.45 },
        dormant:     { label: 'Stalled / Inactive', value: 0.5 }
    },
    scoreBands: {
        cold:     { label: 'COLD', min: 0,  max: 30,  color: '#64748b' },
        warm:     { label: 'WARM', min: 31, max: 60,  color: '#f59e0b' },
        hot:      { label: 'HOT',  min: 61, max: 80,  color: '#ef4444' },
        superHot: { label: 'SUPER HOT', min: 81, max: 100, color: '#7c3aed' }
    },
    scoringConfig: {
        behavioural: { enabled: true },
        decay:       { enabled: true }
    }
};

// ─── LOAD CONFIG from MongoDB (with in-memory cache for 60s) ─────────────────
let _configCache = null;
let _configCacheAt = 0;
const CONFIG_TTL_MS = 60 * 1000; // 60 seconds

export const loadScoringConfig = async () => {
    const now = Date.now();
    if (_configCache && (now - _configCacheAt) < CONFIG_TTL_MS) {
        return _configCache;
    }

    try {
        const setting = await SystemSetting.findOne({ key: 'lead_scoring_config' }).lean();
        _configCache = setting?.value || DEFAULT_CONFIG;
        _configCacheAt = now;
        return _configCache;
    } catch {
        return DEFAULT_CONFIG;
    }
};

export const invalidateScoringConfigCache = () => {
    _configCache = null;
    _configCacheAt = 0;
};

// ─── HELPERS ────────────────────────────────────────────────────────────────
const getAttrPoints = (obj, key) => {
    if (!obj || !key) return 0;
    const norm = key.toLowerCase();
    const match = Object.keys(obj).find(k => k.toLowerCase() === norm);
    return match ? (Number(obj[match]?.points) || 0) : 0;
};

const getMultiplierValue = (obj, key) => {
    if (!obj || !key) return 1.0;
    const norm = key.toLowerCase();
    const match = Object.keys(obj).find(k => k.toLowerCase() === norm);
    return match ? (Number(obj[match]?.value) || 1.0) : 1.0;
};

// ─── COMPUTE SCORE (pure function, no DB writes) ─────────────────────────────
export const computeLeadScore = (lead, activities = [], config = DEFAULT_CONFIG) => {
    const {
        scoringAttributes = {},
        activityMasterFields = {},
        sourceQualityScores = {},
        inventoryFitScores = {},
        decayRules = {},
        stageMultipliers = {},
        scoreBands = {},
        scoringConfig = {}
    } = config;

    const breakdown = {};

    // ── A. STATIC BASE (from enrichment engine output) ──────────────────────
    // enrichment engine already computed formula + keyword score → intent_index
    // We use it as our static base. If enrichment hasn't run, compute from attributes.
    let staticBase = 0;

    if (lead.enrichment_formula_score != null) {
        // Enrichment has run → use its combined output (formula + keywords)
        staticBase = lead.intent_index || lead.enrichment_formula_score || 0;
        breakdown.staticBase = { source: 'enrichment', value: staticBase };
    } else {
        // Fallback: compute from raw lead attributes directly
        let attrScore = 0;
        if (lead.requirement)               attrScore += getAttrPoints(scoringAttributes, 'requirement');
        if (lead.budgetMin || lead.budgetMax) attrScore += getAttrPoints(scoringAttributes, 'budget');
        if (lead.location)                  attrScore += getAttrPoints(scoringAttributes, 'location');
        if (lead.timeline)                  attrScore += getAttrPoints(scoringAttributes, 'timeline');
        if (lead.email)                     attrScore += getAttrPoints(scoringAttributes, 'email');
        if (lead.propertyType?.length > 0)  attrScore += getAttrPoints(scoringAttributes, 'propertyType');
        staticBase = attrScore;
        breakdown.staticBase = { source: 'attributes_fallback', value: staticBase };
    }

    // ── B. ACTIVITY SCORE (dynamic — ONLY counted here, NOT in enrichment) ──
    let activityScore = 0;
    const activityBehaviouralEnabled = scoringConfig?.behavioural?.enabled !== false;

    if (activityBehaviouralEnabled && Array.isArray(activities)) {
        activities.forEach(act => {
            if (act.status !== 'Completed') return; // Only completed activities score

            const actName = (act.type || '').toLowerCase();
            const actDef = activityMasterFields?.activities?.find(
                a => (a.name || '').toLowerCase() === actName
            );
            if (!actDef) return;

            const purpName = (
                act.details?.purpose ||
                act.details?.meetingPurpose ||
                act.details?.callPurpose ||
                act.subject || ''
            ).toLowerCase();
            const purpDef = actDef.purposes?.find(
                p => (p.name || '').toLowerCase() === purpName || purpName.includes((p.name || '').toLowerCase())
            );
            if (!purpDef) return;

            // Resolve outcome label
            let outcomeLabel = (
                act.completionResult ||
                act.details?.outcome ||
                act.details?.result ||
                act.details?.callResult ||
                ''
            ).toLowerCase();

            // Site Visit: check visitedProperties results
            if (!outcomeLabel && actName === 'site visit' && Array.isArray(act.details?.visitedProperties)) {
                const priority = { 'very interested': 1, 'shortlisted': 2, 'somewhat interested': 3 };
                outcomeLabel = act.details.visitedProperties
                    .map(p => (p.result || '').toLowerCase())
                    .filter(Boolean)
                    .sort((a, b) => (priority[a] || 99) - (priority[b] || 99))[0] || '';
            }

            const outcomeDef = purpDef.outcomes?.find(o => {
                const ol = (o.label || '').toLowerCase();
                return ol === outcomeLabel || outcomeLabel.includes(ol) || ol.includes(outcomeLabel);
            });
            if (outcomeDef) {
                activityScore += (Number(outcomeDef.score) || 0);
            }
        });
    }
    breakdown.activityScore = activityScore;

    // ── C. SOURCE QUALITY SCORE ──────────────────────────────────────────────
    let sourceScore = 0;
    const SOURCE_MAP = {
        'referral': 'referral', 'reference': 'referral',
        'direct': 'walkIn', 'walk-in': 'walkIn', 'walk in': 'walkIn', 'walkin': 'walkIn',
        'google': 'google', 'google ads': 'google', 'google adwords': 'google',
        'fb': 'socialMedia', 'facebook': 'socialMedia', 'instagram': 'socialMedia',
        'ig': 'socialMedia', 'social': 'socialMedia', 'social media': 'socialMedia',
        '99acres': 'portal', 'magicbricks': 'portal', 'housing': 'portal',
        'housing.com': 'portal', 'portal': 'portal', 'prop tiger': 'portal',
        'cold call': 'coldCall', 'outbound': 'coldCall'
    };

    const sourceVal = (
        typeof lead.source === 'object' && lead.source
            ? (lead.source.lookup_value || lead.source.label || lead.source.name || '')
            : (lead.source || '')
    ).toString().toLowerCase().trim();

    const srcKey = SOURCE_MAP[sourceVal] || 'coldCall';
    sourceScore = getAttrPoints(sourceQualityScores, srcKey);
    breakdown.sourceScore = sourceScore;

    // ── D. INVENTORY FIT SCORE ───────────────────────────────────────────────
    let fitScore = 0;
    const matchCount = parseInt(lead.interestedInventory?.length || 0);
    if (matchCount >= 5)                         fitScore += getAttrPoints(inventoryFitScores, 'match5Plus');
    else if (matchCount === 0 && activities.length > 0) fitScore += getAttrPoints(inventoryFitScores, 'none');
    breakdown.fitScore = fitScore;

    // ── E. TIME DECAY PENALTY (from cron-managed decay_score field) ──────────
    // CronWorker writes to lead.decay_score, NOT intent_index
    let decayPenalty = 0;
    const decayEnabled = scoringConfig?.decay?.enabled !== false;

    if (decayEnabled) {
        // Use the stored decay_score from CronWorker (accumulated inactivity penalty)
        decayPenalty = -(lead.decay_score || 0);

        // Also apply time-based decay from scoring config thresholds
        const lastActDate = new Date(lead.lastActivityAt || lead.updatedAt || new Date());
        const diffDays = Math.ceil(Math.abs(new Date() - lastActDate) / (1000 * 60 * 60 * 24));
        if (diffDays >= 30)      decayPenalty += getAttrPoints(decayRules, 'inactive30');
        else if (diffDays >= 14) decayPenalty += getAttrPoints(decayRules, 'inactive14');
        else if (diffDays >= 7)  decayPenalty += getAttrPoints(decayRules, 'inactive7');
    }
    breakdown.decayPenalty = decayPenalty;

    // ── F. STAGE MULTIPLIER ──────────────────────────────────────────────────
    const STAGE_KEY_MAP = {
        'new': 'incoming', 'incoming': 'incoming',
        'prospect': 'prospect', 'contacted': 'prospect', 'interested': 'prospect',
        'qualified': 'qualified', 'vetted': 'qualified',
        'opportunity': 'opportunity', 'meeting scheduled': 'opportunity', 'site visit done': 'opportunity',
        'negotiation': 'negotiation', 'booked': 'negotiation', 'closed won': 'negotiation', 'won': 'negotiation',
        'dormant': 'dormant', 'stalled': 'dormant', 'inactive': 'dormant', 'lost': 'dormant'
    };

    const stageVal = (
        typeof lead.stage === 'object' && lead.stage
            ? (lead.stage.lookup_value || lead.stage.label || lead.stage.name || 'New')
            : (lead.stage || 'New')
    ).toString().toLowerCase().trim();

    const stageKey = STAGE_KEY_MAP[stageVal] || 'prospect';
    const multiplier = getMultiplierValue(stageMultipliers, stageKey);
    breakdown.stageMultiplier = multiplier;
    breakdown.stageKey = stageKey;

    // ── FINAL CALCULATION ───────────────────────────────────────────────────
    const raw = staticBase + activityScore + sourceScore + fitScore + decayPenalty;
    breakdown.rawBeforeMultiplier = raw;

    let finalScore = Math.round(raw * multiplier);
    finalScore = Math.max(0, Math.min(100, finalScore));

    // Determine temperature band
    const temperature = getTemperature(finalScore, scoreBands);
    const intent = getIntent(finalScore);

    breakdown.total = finalScore;
    breakdown.temperature = temperature;
    breakdown.intent = intent;

    return {
        total: finalScore,
        activityScore,
        breakdown,
        temperature,
        intent
    };
};

// ─── COMPUTE AND SAVE to MongoDB ─────────────────────────────────────────────
/**
 * Compute the unified lead score and persist to MongoDB.
 * This is the ONLY function that writes leadScore + activityScore.
 *
 * @param {string|ObjectId} leadId
 * @param {Object} [options]
 * @param {string} [options.triggeredBy] - 'activity'|'manual'|'cron'|'import'
 * @returns {Promise<{leadId, score, activityScore, temperature, intent}>}
 */
export const computeAndSave = async (leadId, options = {}) => {
    const { triggeredBy = 'system' } = options;

    // Load lead with populated stage for multiplier resolution
    const lead = await Lead.findById(leadId)
        .populate('stage', 'lookup_value')
        .populate('source', 'lookup_value')
        .lean();

    if (!lead) {
        throw new Error(`LeadScoringService: Lead ${leadId} not found`);
    }

    // Load activities for this lead
    const activities = await Activity.find({
        entityType: 'Lead',
        entityId: leadId
    }).lean();

    // Load config (cached)
    const config = await loadScoringConfig();

    // Compute score (pure function, no DB side effects)
    const result = computeLeadScore(lead, activities, config);

    const prevScore = lead.leadScore || 0;

    // Persist to MongoDB
    await Lead.findByIdAndUpdate(leadId, {
        leadScore:      result.total,
        activityScore:  result.activityScore,
        scoreBreakdown: result.breakdown
    });

    // Audit if score changed significantly (±5 points)
    if (Math.abs(prevScore - result.total) >= 5) {
        try {
            await AuditLog.logEntityUpdate(
                'score_changed',
                'lead',
                leadId,
                `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
                null,
                { before: prevScore, after: result.total },
                `Score recalculated [${triggeredBy}]: ${result.breakdown.rawBeforeMultiplier} × ${result.breakdown.stageMultiplier} = ${result.total}`
            );
        } catch (_) { /* Non-critical — don't let audit failure break scoring */ }
    }

    return {
        leadId,
        score:         result.total,
        activityScore: result.activityScore,
        temperature:   result.temperature,
        intent:        result.intent,
        breakdown:     result.breakdown
    };
};

// ─── BATCH: Recompute all leads ───────────────────────────────────────────────
/**
 * Recalculate scores for all leads (or a filtered subset).
 * Used for bulk migrations or after scoring config changes.
 */
export const bulkRecompute = async (filter = {}, options = {}) => {
    const leads = await Lead.find(filter).select('_id').lean();
    let updated = 0;
    let failed = 0;

    for (const lead of leads) {
        try {
            await computeAndSave(lead._id, { triggeredBy: 'bulk_recalc', ...options });
            updated++;
        } catch (err) {
            console.error(`[LeadScoringService] Bulk failed for ${lead._id}:`, err.message);
            failed++;
        }
    }

    return { updated, failed, total: leads.length };
};

// ─── TEMPERATURE / INTENT HELPERS ────────────────────────────────────────────
export const getTemperature = (score, scoreBands = {}) => {
    if (scoreBands.superHot && score >= (scoreBands.superHot.min || 81)) {
        return { label: scoreBands.superHot.label || 'SUPER HOT', class: 'super-hot', color: scoreBands.superHot.color || '#7c3aed' };
    }
    if (scoreBands.hot && score >= (scoreBands.hot.min || 61)) {
        return { label: scoreBands.hot.label || 'HOT', class: 'hot', color: scoreBands.hot.color || '#ef4444' };
    }
    if (scoreBands.warm && score >= (scoreBands.warm.min || 31)) {
        return { label: scoreBands.warm.label || 'WARM', class: 'warm', color: scoreBands.warm.color || '#f59e0b' };
    }
    const cold = scoreBands.cold || {};
    return { label: cold.label || 'COLD', class: 'cold', color: cold.color || '#64748b' };
};

export const getIntent = (score) => {
    if (score >= 80) return 'Closing Soon';
    if (score >= 60) return 'High Intent';
    if (score >= 30) return 'Nurture';
    return 'Low Intent';
};

export default { computeAndSave, computeLeadScore, loadScoringConfig, invalidateScoringConfigCache, bulkRecompute };
