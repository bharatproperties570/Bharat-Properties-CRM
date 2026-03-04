/**
 * Lead Scoring Engine - Final Formula Implementation
 * Formula: (Attribute + Activity + Source + Fit - Decay) * Multiplier
 * Max Cap: 100 (soft cap, can go higher but UI treats >80 as Super Hot)
 */

export const calculateLeadScore = (lead, activities = [], config = {}) => {
    // Destructure all new config sections
    const {
        scoringAttributes = {},
        activityMasterFields = {},
        sourceQualityScores = {},
        inventoryFitScores = {},
        decayRules = {},
        stageMultipliers = {},
        scoreBands = {}
    } = config;

    // Safety check for activities
    if (!Array.isArray(activities)) activities = [];

    // Helper: Safely get points (Case-insensitive)
    const getAttr = (obj, key) => {
        if (!obj || !key) return 0;
        const normalizedKey = key.toLowerCase();
        // Find key in object regardless of case
        const actualKey = Object.keys(obj).find(k => k.toLowerCase() === normalizedKey);
        return actualKey ? (obj[actualKey]?.points || 0) : 0;
    };

    const getMult = (obj, key) => {
        if (!obj || !key) return 1.0;
        const normalizedKey = key.toLowerCase();
        const actualKey = Object.keys(obj).find(k => k.toLowerCase() === normalizedKey);
        return actualKey ? (obj[actualKey]?.value || 1.0) : 1.0;
    };

    let debugLog = {}; // For Explainability

    // --- A. ATTRIBUTE SCORE (Static Intent) ---
    let attributeScore = 0;

    // 1. Detailed Requirement (Max 32)
    const hasReq = lead.detailedReq && Object.keys(lead.detailedReq).length > 2;
    if (hasReq) attributeScore += getAttr(scoringAttributes, 'requirement');

    // 2. Budget Match (Max 10)
    if (lead.budgetMatch === 'perfect') attributeScore += getAttr(scoringAttributes, 'budget');

    // 3. Location Match (Max 10)
    if (lead.locationPref === 'level1') attributeScore += getAttr(scoringAttributes, 'location');

    // 4. Timeline (Max 10)
    if (lead.timeline === 'urgent') attributeScore += getAttr(scoringAttributes, 'timeline');

    // 5. Payment (Max 10)
    if (lead.payment && lead.payment.length > 0) attributeScore += getAttr(scoringAttributes, 'payment');

    debugLog.attribute = attributeScore;

    // --- B. ACTIVITY SCORE (Dynamic Behaviour) ---
    let activityScore = 0;
    activities.forEach(act => {
        // Find matching activity definition (Case-insensitive)
        const actName = (act.type || act.activityType || '').toLowerCase();
        const actDef = activityMasterFields?.activities?.find(a => (a.name || '').toLowerCase() === actName);

        if (actDef) {
            const purpName = (act.purpose || act.details?.purpose || act.subject || '').toLowerCase();
            const purpDef = actDef.purposes?.find(p => (p.name || '').toLowerCase() === purpName);

            if (purpDef) {
                // Check mapped outcome (Case-insensitive) - check completions from modal specifically
                let outcomeLabel = (act.outcome || act.details?.completionResult || act.details?.outcome || '').toLowerCase();

                // Professional Fix: Scan nested properties for Site Visits
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
        'referral': 'referral',
        'reference': 'referral',
        'direct': 'walkIn',
        'walk-in': 'walkIn',
        'walk in': 'walkIn',
        'google': 'google',
        'google ads': 'google',
        'fb': 'socialMedia',
        'facebook': 'socialMedia',
        'instagram': 'socialMedia',
        'ig': 'socialMedia',
        'social': 'socialMedia',
        '99acres': 'portal',
        'magicbricks': 'portal',
        'housing': 'portal',
        'portal': 'portal',
        'cold call': 'coldCall'
    };

    // Normalize source (handle object or string)
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
    else if (matchCount === 0) {
        // Only penalize if they've been active but found nothing
        if (activities.length > 0) fitScore += getAttr(inventoryFitScores, 'none');
    }

    // Price deviation (Mock: checking a flag)
    if (lead.priceFit === 'good') fitScore += getAttr(inventoryFitScores, 'priceDev5');

    debugLog.fit = fitScore;

    // --- E. TIME DECAY PENALTY ---
    let decayPenalty = 0;
    const lastActDate = new Date(lead.lastActivityDate || lead.updatedAt || new Date());
    const now = new Date();
    const diffTime = Math.abs(now - lastActDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 30) decayPenalty += getAttr(decayRules, 'inactive30');
    else if (diffDays >= 14) decayPenalty += getAttr(decayRules, 'inactive14');
    else if (diffDays >= 7) decayPenalty += getAttr(decayRules, 'inactive7');

    debugLog.decay = decayPenalty;

    // --- F. STAGE MULTIPLIER ---
    let multiplier = 1.0;
    const stageKeyMap = {
        'new': 'incoming',
        'incoming': 'incoming',
        'prospect': 'prospect',
        'contacted': 'prospect',
        'interested': 'prospect',
        'qualified': 'prospect',
        'opportunity': 'opportunity',
        'meeting scheduled': 'opportunity',
        'negotiation': 'negotiation',
        'booked': 'negotiation', // Cap at negotiation multiplier
        'closed won': 'negotiation',
        'won': 'negotiation',
        'stalled': 'incoming'
    };

    // Normalize stage (handle object or string)
    const stageVal = (typeof lead.stage === 'object' && lead.stage)
        ? (lead.stage.lookup_value || lead.stage.label || lead.stage.name || 'New')
        : (lead.stage || 'New');

    const normalizedStageVal = stageVal.toString().toLowerCase().trim();
    const stageKey = stageKeyMap[normalizedStageVal] || 'prospect';
    multiplier = getMult(stageMultipliers, stageKey);

    // --- FINAL CALCULATION ---
    // (A + B + C + D + E) * Multiplier
    let rawScore = (attributeScore + activityScore + sourceScore + fitScore + decayPenalty) * multiplier;

    // Round and Cap
    let finalScore = Math.round(rawScore);
    if (finalScore > 100) finalScore = 100;
    if (finalScore < 0) finalScore = 0;

    return {
        total: finalScore,
        breakdown: debugLog,
        temperature: getLeadTemperature(finalScore, scoreBands),
        intent: getAIIntent(finalScore)
    };
};

export const getLeadTemperature = (score, scoreBands = {}) => {
    // Priority 1: User defined Scoring Bands from Settings
    if (scoreBands.superHot && score >= (scoreBands.superHot.min || 81)) {
        return { label: scoreBands.superHot.label || 'SUPER HOT', class: 'super-hot', color: scoreBands.superHot.color || '#7c3aed' };
    }
    if (scoreBands.hot && score >= (scoreBands.hot.min || 61)) {
        return { label: scoreBands.hot.label || 'HOT', class: 'hot', color: scoreBands.hot.color || '#ef4444' };
    }
    if (scoreBands.warm && score >= (scoreBands.warm.min || 31)) {
        return { label: scoreBands.warm.label || 'WARM', class: 'warm', color: scoreBands.warm.color || '#f59e0b' };
    }

    // Fallback: Default Cold
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
