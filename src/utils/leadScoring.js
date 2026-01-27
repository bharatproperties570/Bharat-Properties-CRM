/**
 * Lead Scoring Engine
 * Uses Dynamic Configuration from PropertyConfigContext
 */

/**
 * Calculates Total Lead Score
 * @param {Object} lead - The lead object
 * @param {Array} activities - List of activities for this lead
 * @param {Object} config - { scoringAttributes, activityMasterFields }
 */
export const calculateLeadScore = (lead, activities = [], config = {}) => {
    const { scoringAttributes = {}, activityMasterFields = {} } = config;

    // Helper to get attribute point safely
    const getAttrPoint = (key) => scoringAttributes[key]?.points || 0;

    // 1. Lead Form Score
    let formScore = 0;
    const reqBreakdown = {};

    // A. Requirement (Mapped to 'requirement' attribute)
    // For mock env, simple check if detailedReq has keys
    if (lead.detailedReq) {
        const reqKeys = Object.keys(lead.detailedReq).length;
        // Simple logic: If > 3 fields filled, give full requirement points, else partial?
        // Let's keep it simple: if detailedReq exists and has meaningful data
        if (reqKeys > 0) {
            const pts = getAttrPoint('requirement');
            formScore += pts;
            reqBreakdown['requirement'] = pts;
        }
    }

    // B. Budget Match
    const budgetPts = getAttrPoint('budget'); // Max points for perfect
    let budgetScore = 2; // Default low
    if (lead.budgetMatch === 'perfect') budgetScore = budgetPts;
    else if (lead.budgetMatch === 'slightly_lower') budgetScore = Math.floor(budgetPts * 0.6);
    formScore += budgetScore;

    // C. Location Preference
    const locPts = getAttrPoint('location');
    let locScore = 2;
    if (lead.locationPref === 'level1') locScore = locPts;
    else if (lead.locationPref === 'level2') locScore = Math.floor(locPts * 0.8);
    // ... simplifications for other levels
    formScore += locScore;

    // D. Timeline
    const timePts = getAttrPoint('timeline');
    let timeScore = 0;
    if (lead.timeline === 'urgent') timeScore = timePts;
    else if (lead.timeline === '15days') timeScore = Math.floor(timePts * 0.7);
    formScore += timeScore;

    // E. Payment
    const payPts = getAttrPoint('payment');
    let payScore = 0;
    if (Array.isArray(lead.payment) && lead.payment.length > 0) {
        payScore = payPts; // Simplified: Any clean payment plan = points
    }
    formScore += payScore;

    // F. Source
    const srcPts = getAttrPoint('source');
    let srcScore = 0;
    // Assume specific high quality sources get points
    const highIntentSources = ['walk-in', 'old client', 'referral', 'channel partner'];
    if (highIntentSources.includes(lead.source?.toLowerCase())) {
        srcScore = srcPts;
    }
    formScore += srcScore;

    // 2. Activity Score (Deep Search in Hierarchy)
    let activityScore = 0;
    activities.forEach(act => {
        // Find activity in master fields
        const actDef = activityMasterFields?.activities?.find(a => a.name === act.type || a.name === act.activityType);
        if (actDef) {
            // Find purpose
            const purposeName = act.purpose || act.callPurpose || act.meetingPurpose || act.emailPurpose || act.visitType || act.agenda;
            const purpDef = actDef.purposes?.find(p => p.name === purposeName);

            if (purpDef) {
                // Find outcome
                const outcomeLabel = act.outcome || act.result || act.callOutcome || act.completionResult || act.meetingOutcomeStatus;

                // Special handling: outcome might be just "Connected" (Status) or "Thinking" (Result)
                // We sum points for BOTH Status and Result if they exist and have scores

                // Check Status/Outcome first
                const outcomeObj = purpDef.outcomes.find(o => o.label === outcomeLabel);
                if (outcomeObj) activityScore += (outcomeObj.score || 0);

                // Check Completion Result if separate (e.g. Call Result after Status connected)
                if (act.completionResult && act.completionResult !== outcomeLabel) {
                    const resObj = purpDef.outcomes.find(o => o.label === act.completionResult);
                    if (resObj) activityScore += (resObj.score || 0);
                }
            }
        }
    });

    const total = formScore + activityScore;

    return {
        total,
        formScore,
        activityScore,
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
