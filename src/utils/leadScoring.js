/**
 * leadScoring.js — Display Layer (v3 — Backend Authoritative)
 *
 * ⚠️ IMPORTANT: As of v3, all scoring is computed EXCLUSIVELY by the backend.
 *   - Primary source: lead.leadScore (computed by LeadScoringService.js in MongoDB)
 *   - Primary activity score: lead.activityScore (backend-computed)
 *   - Score breakdown for explainability: lead.scoreBreakdown
 *
 * This file now only provides:
 *   1. getDisplayScore(lead)    — returns the backend-stored score for display
 *   2. calculateLeadScore(...)  — FALLBACK ONLY (used if leadScore not yet computed)
 *
 * Do NOT use calculateLeadScore() as the authoritative source.
 * All changes to scoring weights/logic should be made via Settings > Scoring Configuration
 * which updates SystemSetting key 'lead_scoring_config' on the backend.
 */

// ─── PRIMARY: Read backend-computed score ─────────────────────────────────────
/**
 * Get the display score from the backend-persisted lead.leadScore.
 * Falls back to 0 if not computed yet (triggers from LeadScoringService on activity/enrichment events).
 *
 * @param {Object} lead - Lead document with leadScore, activityScore, scoreBreakdown
 * @returns {{ total: number, activityScore: number, temperature: Object, intent: string, breakdown: Object }}
 */
export const getDisplayScore = (lead) => {
    const total = Math.max(0, Math.min(100, lead?.leadScore || 0));
    const activityScore = lead?.activityScore || 0;
    const breakdown = lead?.scoreBreakdown || {};

    // Determine temperature from breakdown (backend computed) or derive here
    const temperature = breakdown.temperature || deriveTemperature(total);
    const intent = breakdown.intent || deriveIntent(total);

    return { total, activityScore, temperature, intent, breakdown };
};

const deriveTemperature = (score) => {
    if (score >= 81) return { label: 'SUPER HOT', class: 'super-hot', color: '#7c3aed' };
    if (score >= 61) return { label: 'HOT', class: 'hot', color: '#ef4444' };
    if (score >= 31) return { label: 'WARM', class: 'warm', color: '#f59e0b' };
    return { label: 'COLD', class: 'cold', color: '#64748b' };
};

const deriveIntent = (score) => {
    if (score >= 80) return 'Closing Soon';
    if (score >= 60) return 'High Intent';
    if (score >= 30) return 'Nurture';
    return 'Low Intent';
};

// ─── FALLBACK: Frontend calculation (used only when backend score absent) ─────
/**
 * @deprecated Use getDisplayScore(lead) instead. This fallback remains for components
 * that haven't migrated yet. Will be removed in a future cleanup.
 */
export const calculateLeadScore = (lead, activities = [], config = {}) => {
    const {
        scoringAttributes = {},
        activityMasterFields = {},
        sourceQualityScores = {},
        inventoryFitScores = {},
        decayRules = {},
        stageMultipliers = {},
        scoreBands = {}
    } = config;

    if (!Array.isArray(activities)) activities = [];

    // Helper: Safely get points (case-insensitive)
    const getAttr = (obj, key) => {
        if (!obj || !key) return 0;
        const normalizedKey = key.toLowerCase();
        const actualKey = Object.keys(obj).find(k => k.toLowerCase() === normalizedKey);
        return actualKey ? (obj[actualKey]?.points || 0) : 0;
    };

    const getMult = (obj, key) => {
        if (!obj || !key) return 1.0;
        const normalizedKey = key.toLowerCase();
        const actualKey = Object.keys(obj).find(k => k.toLowerCase() === normalizedKey);
        return actualKey ? (obj[actualKey]?.value || 1.0) : 1.0;
    };

    let debugLog = {};

    // --- A. STATIC BASE SCORE (from enrichment engine — formula + keyword signals) ---
    // This is the enrichment engine's output (no activities counted there).
    // If enrichment hasn't run yet, fall back to attribute-based calculation.
    let staticBase = 0;

    if (lead.enrichment_formula_score != null) {
        // Use the stored enrichment result (most accurate — already run by backend)
        // intent_index includes keyword boost on top of formula score
        staticBase = lead.intent_index || lead.enrichment_formula_score || 0;
        debugLog.staticBase = { source: 'enrichment', value: staticBase };
    } else {
        // Fallback: compute from attributes directly (when enrichment hasn't run yet)
        let attributeScore = 0;
        const hasReq = lead.detailedReq && Object.keys(lead.detailedReq).length > 2;
        if (hasReq) attributeScore += getAttr(scoringAttributes, 'requirement');
        if (lead.budgetMatch === 'perfect') attributeScore += getAttr(scoringAttributes, 'budget');
        if (lead.locationPref === 'level1') attributeScore += getAttr(scoringAttributes, 'location');
        if (lead.timeline === 'urgent') attributeScore += getAttr(scoringAttributes, 'timeline');
        if (lead.payment && lead.payment.length > 0) attributeScore += getAttr(scoringAttributes, 'payment');
        staticBase = attributeScore;
        debugLog.staticBase = { source: 'attributes_fallback', value: staticBase };
    }

    // --- B. ACTIVITY SCORE (Dynamic Behaviour — counted ONLY here, not in enrichment) ---
    // This is safe because enrichmentEngine.calculateIntentIndex() no longer counts activities.
    let activityScore = 0;
    activities.forEach(act => {
        const actName = (act.type || act.activityType || '').toLowerCase();
        const actDef = activityMasterFields?.activities?.find(a => (a.name || '').toLowerCase() === actName);

        if (actDef) {
            const purpName = (act.purpose || act.details?.purpose || act.subject || '').toLowerCase();
            const purpDef = actDef.purposes?.find(p => (p.name || '').toLowerCase() === purpName);

            if (purpDef) {
                let outcomeLabel = (act.outcome || act.details?.completionResult || act.details?.outcome || '').toLowerCase();

                // Site Visit: scan nested visitedProperties for result
                if (!outcomeLabel && actName === 'site visit' && Array.isArray(act.details?.visitedProperties)) {
                    const priority = { 'very interested': 1, 'shortlisted': 2, 'somewhat interested': 3 };
                    const foundResult = act.details.visitedProperties
                        .map(p => (p.result || '').toLowerCase())
                        .filter(r => r)
                        .sort((a, b) => (priority[a] || 99) - (priority[b] || 99))[0];
                    if (foundResult) outcomeLabel = foundResult;
                }

                const outcome = purpDef.outcomes?.find(o => {
                    const label = (o.label || '').toLowerCase();
                    return label === outcomeLabel || outcomeLabel.includes(label) || label.includes(outcomeLabel);
                });
                if (outcome) activityScore += (outcome.score || 0);
            }
        }
    });
    debugLog.activity = activityScore;

    // --- C. SOURCE QUALITY SCORE ---
    let sourceScore = 0;
    const srcMap = {
        'referral': 'referral', 'reference': 'referral',
        'direct': 'walkIn', 'walk-in': 'walkIn', 'walk in': 'walkIn',
        'google': 'google', 'google ads': 'google',
        'fb': 'socialMedia', 'facebook': 'socialMedia', 'instagram': 'socialMedia', 'ig': 'socialMedia', 'social': 'socialMedia',
        '99acres': 'portal', 'magicbricks': 'portal', 'housing': 'portal', 'portal': 'portal',
        'cold call': 'coldCall'
    };

    const sourceVal = (typeof lead.source === 'object' && lead.source)
        ? (lead.source.lookup_value || lead.source.label || lead.source.name || '')
        : (lead.source || '');
    const normalizedSourceVal = sourceVal.toString().toLowerCase().trim();
    const srcKey = srcMap[normalizedSourceVal] || 'coldCall';
    sourceScore += getAttr(sourceQualityScores, srcKey);
    debugLog.source = sourceScore;

    // --- D. INVENTORY FIT SCORE ---
    let fitScore = 0;
    const matchCount = parseInt(lead.matched || 0);
    if (matchCount >= 5) fitScore += getAttr(inventoryFitScores, 'match5Plus');
    else if (matchCount === 0 && activities.length > 0) fitScore += getAttr(inventoryFitScores, 'none');
    if (lead.priceFit === 'good') fitScore += getAttr(inventoryFitScores, 'priceDev5');
    debugLog.fit = fitScore;

    // --- E. TIME DECAY PENALTY ---
    let decayPenalty = 0;
    const lastActDate = new Date(lead.lastActivityDate || lead.updatedAt || new Date());
    const diffDays = Math.ceil(Math.abs(new Date() - lastActDate) / (1000 * 60 * 60 * 24));
    if (diffDays >= 30) decayPenalty += getAttr(decayRules, 'inactive30');
    else if (diffDays >= 14) decayPenalty += getAttr(decayRules, 'inactive14');
    else if (diffDays >= 7) decayPenalty += getAttr(decayRules, 'inactive7');
    debugLog.decay = decayPenalty;

    // --- F. STAGE MULTIPLIER (applied last to the TOTAL, not just one component) ---
    const stageKeyMap = {
        'new': 'incoming', 'incoming': 'incoming',
        'prospect': 'prospect', 'contacted': 'prospect', 'interested': 'prospect', 'qualified': 'prospect',
        'opportunity': 'opportunity', 'meeting scheduled': 'opportunity',
        'negotiation': 'negotiation', 'booked': 'negotiation', 'closed won': 'negotiation', 'won': 'negotiation',
        'stalled': 'incoming'
    };

    const stageVal = (typeof lead.stage === 'object' && lead.stage)
        ? (lead.stage.lookup_value || lead.stage.label || lead.stage.name || 'New')
        : (lead.stage || 'New');
    const normalizedStageVal = stageVal.toString().toLowerCase().trim();
    const stageKey = stageKeyMap[normalizedStageVal] || 'prospect';
    const multiplier = getMult(stageMultipliers, stageKey);

    // --- FINAL CALCULATION ---
    // All components added first, then multiplier applied once (no triple inflation)
    const rawScore = (staticBase + activityScore + sourceScore + fitScore + decayPenalty) * multiplier;

    let finalScore = Math.round(rawScore);
    if (finalScore > 100) finalScore = 100;
    if (finalScore < 0) finalScore = 0;

    debugLog.multiplier = multiplier;
    debugLog.rawBeforeMultiplier = staticBase + activityScore + sourceScore + fitScore + decayPenalty;

    return {
        total: finalScore,
        breakdown: debugLog,
        temperature: getLeadTemperature(finalScore, scoreBands),
        intent: getAIIntent(finalScore)
    };
};

export const getLeadTemperature = (score, scoreBands = {}) => {
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
    return {
        label: cold.label || 'COLD',
        class: 'cold',
        color: cold.color || '#64748b'
    };
};

export const getAIIntent = (score) => {
    if (score >= 80) return 'Closing Soon';
    if (score >= 60) return 'High Intent';
    if (score >= 30) return 'Nurture';
    return 'Low Intent';
};
