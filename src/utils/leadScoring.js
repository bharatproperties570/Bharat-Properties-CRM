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
        stageMultipliers = {}
    } = config;

    // Safety check for activities
    if (!Array.isArray(activities)) activities = [];

    // Helper: Safely get points
    const getAttr = (obj, key) => obj?.[key]?.points || 0;
    const getMult = (obj, key) => obj?.[key]?.value || 1.0;

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
        // Find matching activity definition
        const actDef = activityMasterFields?.activities?.find(a => a.name === act.type);
        if (actDef) {
            const purpDef = actDef.purposes?.find(p => p.name === act.purpose);
            if (purpDef) {
                // Check mapped outcome
                const outcome = purpDef.outcomes?.find(o => o.label === act.outcome);
                if (outcome) activityScore += (outcome.score || 0);
            }
        }
    });
    debugLog.activity = activityScore;

    // --- C. SOURCE QUALITY SCORE ---
    let sourceScore = 0;
    const srcMap = {
        'Referral': 'referral',
        'Direct': 'walkIn', // Example mapping
        'Google': 'google',
        'Facebook': 'socialMedia',
        'Instagram': 'socialMedia',
        '99Acres': 'portal',
        'MagicBricks': 'portal',
        'Housing': 'portal',
        'Cold Call': 'coldCall'
    };
    const srcKey = srcMap[lead.source] || 'coldCall'; // Default to lowest if unknown
    sourceScore += getAttr(sourceQualityScores, srcKey);
    debugLog.source = sourceScore;

    // --- D. INVENTORY FIT SCORE ---
    let fitScore = 0;
    // Mock logic: assume 'matched' count is on lead object
    const matchCount = parseInt(lead.matched || 0);
    if (matchCount >= 5) fitScore += getAttr(inventoryFitScores, 'match5Plus');
    else if (matchCount === 0) fitScore += getAttr(inventoryFitScores, 'none');

    // Price deviation (Mock: checking a flag)
    if (lead.priceFit === 'good') fitScore += getAttr(inventoryFitScores, 'priceDev5');

    debugLog.fit = fitScore;

    // --- E. TIME DECAY PENALTY ---
    let decayPenalty = 0;
    // Calculate days since last activity
    const lastActDate = new Date(lead.lastActivityDate || new Date());
    const now = new Date();
    const diffTime = Math.abs(now - lastActDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 30) decayPenalty += getAttr(decayRules, 'inactive30');
    else if (diffDays >= 14) decayPenalty += getAttr(decayRules, 'inactive14'); // Note: logic might needed to be non-cumulative or cumulative depending on user intent. Usually non-cumulative thresholds.
    else if (diffDays >= 7) decayPenalty += getAttr(decayRules, 'inactive7');

    // Ensure penalty is negative (config usually has negative points, but we add them)
    // If config has positive numbers for penalty, subtract. Here config has negative usually.
    // Let's assume config points are negative like -5. So we add.

    debugLog.decay = decayPenalty; // This will Likely be negative

    // --- F. STAGE MULTIPLIER ---
    let multiplier = 1.0;
    const stageKeyMap = {
        'New': 'incoming',
        'Prospect': 'prospect',
        'Opportunity': 'opportunity',
        'Negotiation': 'negotiation'
    };
    const stageKey = stageKeyMap[lead.stage] || 'prospect';
    multiplier = getMult(stageMultipliers, stageKey);

    // --- FINAL CALCULATION ---
    let rawScore = (attributeScore + activityScore + sourceScore + fitScore + decayPenalty) * multiplier;

    // Round and Cap
    let finalScore = Math.round(rawScore);
    if (finalScore > 100) finalScore = 100;
    if (finalScore < 0) finalScore = 0;

    return {
        total: finalScore,
        breakdown: debugLog,
        temperature: getLeadTemperature(finalScore),
        intent: getAIIntent(finalScore)
    };
};

export const getLeadTemperature = (score) => {
    if (score >= 81) return { label: 'SUPER HOT', class: 'super-hot', color: '#7c3aed' };
    if (score >= 61) return { label: 'HOT', class: 'hot', color: '#ef4444' };
    if (score >= 31) return { label: 'WARM', class: 'warm', color: '#f59e0b' };
    return { label: 'COLD', class: 'cold', color: '#64748b' };
};

export const getAIIntent = (score) => {
    if (score >= 80) return 'Closing Soon';
    if (score >= 60) return 'High Intent';
    if (score >= 30) return 'Nurture';
    return 'Low Intent';
};
