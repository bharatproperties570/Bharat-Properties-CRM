/**
 * Lead Scoring Engine
 * Strictly follows PDF Logic for Bharat Properties CRM
 */

export const SCORING_CRITERIA = {
    FORM_MAX: 52,
    REQUIREMENT: {
        propertyType: 2,
        subType: 2,
        unitType: 2,
        area: 2,
        facing: 1,
        road: 1,
        direction: 1,
        propertyUnitType: 1
    },
    BUDGET: {
        PERFECT: 10,
        SLIGHTLY_LOWER: 6,
        MISMATCH: 2
    },
    LOCATION: {
        LEVEL_1: 10, // <= 1km / 1 project
        LEVEL_2: 8,  // <= 3km / 3 projects
        LEVEL_3: 5,  // <= 6km / 6 projects
        LEVEL_4: 2   // > 6km
    },
    TIMELINE: {
        URGENT: 10,
        FIFTEEN_DAYS: 7,
        ONE_MONTH: 5,
        NOT_CONFIRMED: 0
    },
    PAYMENT: {
        SELF: 5,
        LOAN: 3,
        WHITE: 2,
        COLLECTOR: 5,
        FLEXIBLE: 5,
        MAX: 10
    },
    SOURCE: {
        TIER_1: 5, // Old Client, Walk-In, Friends, Relative, Channel Partner
        TIER_2: 4, // Hoarding, Own Website
        TIER_3: 3, // Marketplace (99Acres etc)
        TIER_4: 2, // SMS, Google, LinkedIn
        TIER_5: 1  // Social Media
    }
};

export const ACTIVITY_POINTS = {
    CONNECTED_CALL: 10,
    WHATSAPP_REPLY: 6,
    VISIT_SCHEDULED: 8,
    VISIT_COMPLETED: 12,
    EMAIL_OPEN: 2,
    INACTIVITY_7D: -5,
    FOLLOWUP_MISSED: -10
};

/**
 * Calculates Total Lead Score
 */
export const calculateLeadScore = (lead, activities = []) => {
    // 1. Lead Form Score (Max 52)
    let formScore = 0;
    const reqBreakdown = {};

    // A. Requirement (Max 32) - Simplified for mock env (assume 1 point per specific detail provided)
    // In a real app, this checks if field is NOT EMPTY
    Object.keys(SCORING_CRITERIA.REQUIREMENT).forEach(key => {
        if (lead.detailedReq && lead.detailedReq[key]) {
            const pts = SCORING_CRITERIA.REQUIREMENT[key];
            formScore += pts;
            reqBreakdown[key] = pts;
        } else {
            reqBreakdown[key] = 0;
        }
    });

    // B. Budget Match Logic (Max 10)
    let budgetScore = SCORING_CRITERIA.BUDGET.MISMATCH;
    if (lead.budgetMatch === 'perfect') budgetScore = SCORING_CRITERIA.BUDGET.PERFECT;
    else if (lead.budgetMatch === 'slightly_lower') budgetScore = SCORING_CRITERIA.BUDGET.SLIGHTLY_LOWER;
    formScore += budgetScore;

    // C. Location Preference (Max 10)
    let locScore = SCORING_CRITERIA.LOCATION.LEVEL_4;
    if (lead.locationPref === 'level1') locScore = SCORING_CRITERIA.LOCATION.LEVEL_1;
    else if (lead.locationPref === 'level2') locScore = SCORING_CRITERIA.LOCATION.LEVEL_2;
    else if (lead.locationPref === 'level3') locScore = SCORING_CRITERIA.LOCATION.LEVEL_3;
    formScore += locScore;

    // D. Timeline (Max 10)
    let timeScore = SCORING_CRITERIA.TIMELINE.NOT_CONFIRMED;
    if (lead.timeline === 'urgent') timeScore = SCORING_CRITERIA.TIMELINE.URGENT;
    else if (lead.timeline === '15days') timeScore = SCORING_CRITERIA.TIMELINE.FIFTEEN_DAYS;
    else if (lead.timeline === '1month') timeScore = SCORING_CRITERIA.TIMELINE.ONE_MONTH;
    formScore += timeScore;

    // E. Payment (Max 10 Cumulative)
    let payScore = 0;
    if (Array.isArray(lead.payment)) {
        lead.payment.forEach(cond => {
            payScore += SCORING_CRITERIA.PAYMENT[cond.toUpperCase()] || 0;
        });
    }
    payScore = Math.min(payScore, SCORING_CRITERIA.PAYMENT.MAX);
    formScore += payScore;

    // F. Source Score (Max 5)
    let srcScore = 1;
    const src = lead.source?.toLowerCase() || '';
    if (['walk-in', 'old client', 'friends', 'relative', 'channel partner'].includes(src)) srcScore = 5;
    else if (['hoarding', 'own website'].includes(src)) srcScore = 4;
    else if (['99acres', 'magicbricks', 'whatsapp', 'cold calling'].includes(src)) srcScore = 3;
    else if (['sms', 'google', 'linkedin'].includes(src)) srcScore = 2;
    formScore += srcScore;

    // 2. Task & Communication Score (Dynamic)
    let activityScore = 0;
    activities.forEach(act => {
        activityScore += ACTIVITY_POINTS[act.type] || 0;
    });

    const total = formScore + activityScore;

    return {
        total,
        formScore,
        activityScore,
        breakdown: {
            requirement: Object.values(reqBreakdown).reduce((a, b) => a + b, 0),
            budget: budgetScore,
            location: locScore,
            timeline: timeScore,
            payment: payScore,
            source: srcScore,
            activity: activityScore
        },
        temperature: getLeadTemperature(total),
        intent: getAIIntent(total)
    };
};

export const getLeadTemperature = (score) => {
    if (score >= 80) return { label: 'HOT', class: 'hot', color: '#ef4444' };
    if (score >= 60) return { label: 'WARM', class: 'warm', color: '#f59e0b' };
    if (score >= 40) return { label: 'COOL', class: 'cool', color: '#3b82f6' };
    return { label: 'COLD', class: 'cold', color: '#64748b' };
};

export const getAIIntent = (score) => {
    if (score >= 75) return 'High Intent';
    if (score >= 50) return 'Medium Intent';
    return 'Low Intent';
};
