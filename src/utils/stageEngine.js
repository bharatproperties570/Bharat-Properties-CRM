/**
 * Stage Computation Engine v2
 *
 * Computes the stage of a lead/deal based on:
 * 1. Explicit override rules (stageMappingRules) — checked first, ordered by priority
 * 2. Default outcome.stage inside activityMasterFields hierarchy
 * 3. Fallback to 'New'
 *
 * IMPORTANT: Stages are computed, never manually edited.
 *
 * v2 Additions:
 * - Probability Calibration per stage
 * - Stage Stability Lock (prevent false regressions)
 */

// ─── STAGE PIPELINE ───────────────────────────────────────────────────────────
export const STAGE_PIPELINE = [
    {
        id: 'incoming',
        label: 'Incoming',
        subStages: ['Incoming', 'New', 'Inbound'],
        isTerminal: false,
        bucket: 'fresh',
        probability: 10,
        color: '#8b5cf6',
        icon: 'fa-inbox'
    },
    {
        id: 'prospect',
        label: 'Prospect',
        subStages: ['Prospect', 'Qualified', 'Warm'],
        isTerminal: false,
        bucket: 'prospect',
        probability: 20,
        color: '#3b82f6',
        icon: 'fa-user'
    },
    {
        id: 'opportunity',
        label: 'Opportunity',
        subStages: ['Opportunity', 'Hot', 'Quote'],
        isTerminal: false,
        bucket: 'opportunity',
        probability: 40,
        color: '#f59e0b',
        icon: 'fa-star'
    },
    {
        id: 'negotiation',
        label: 'Negotiation',
        subStages: ['Negotiation', 'Booked', 'Under Review'],
        isTerminal: false,
        bucket: 'negotiation',
        probability: 65,
        color: '#eab308',
        icon: 'fa-handshake'
    },
    {
        id: 'closed_won',
        label: 'Closed (Won)',
        subStages: [],
        isTerminal: true,
        bucket: 'closed',
        probability: 100,
        color: '#10b981',
        icon: 'fa-check-circle'
    },
    {
        id: 'closed_lost',
        label: 'Closed (Lost)',
        subStages: [],
        isTerminal: true,
        bucket: 'closed',
        probability: 0,
        color: '#ef4444',
        icon: 'fa-times-circle'
    },
    {
        id: 'closed_unqualified',
        label: 'Closed (Unqualified)',
        subStages: [],
        isTerminal: true,
        bucket: 'closed',
        probability: 0,
        color: '#6b7280',
        icon: 'fa-ban'
    }
];

export const STAGE_ORDER = STAGE_PIPELINE.map(s => s.id);
export const STAGE_LABELS = STAGE_PIPELINE.map(s => s.label);

// ─── IMPROVEMENT 2: PROBABILITY CALIBRATION ───────────────────────────────────
/**
 * Get win probability % for any stage.
 * Used in forecast: weighted pipeline value = dealValue × (probability / 100)
 */
export const getStageProbability = (stageName) => {
    const stage = STAGE_PIPELINE.find(s => s.label.toLowerCase() === (stageName || '').toLowerCase());
    return stage?.probability ?? 5;
};

// ─── IMPROVEMENT 1: STAGE STABILITY LOCK ──────────────────────────────────────
/**
 * Minimum activities required in the current stage before a downgrade is allowed.
 * Prevents false regressions (e.g., a re-intro call moving Negotiation → Prospect).
 */
export const STAGE_STABILITY_CONFIG = {
    Opportunity: { minActivities: 1, minDays: 0, label: 'Opportunity requires 1 activity before downgrade' },
    Negotiation: { minActivities: 1, minDays: 0, label: 'Negotiation requires 1 activity before downgrade' },
    'Closed (Won)': { minActivities: 999, minDays: 999, label: 'Closed deals cannot be downgraded automatically' },
    'Closed (Lost)': { minActivities: 999, minDays: 999, label: 'Closed deals cannot be downgraded automatically' },
    'Closed (Unqualified)': { minActivities: 999, minDays: 999, label: 'Closed deals cannot be downgraded automatically' }
};

// Stage priority order (higher index = more advanced stage)
// 'Closed Lost' is the lowest terminal.
// We use the exported STAGE_ORDER.

/** Returns true for terminal/sideways states that cannot be further downgraded. */
export const isTerminalStage = (stageName) =>
    stageName?.startsWith('Closed');

const getStageRank = (stageName) => {
    const idx = STAGE_ORDER.indexOf(stageName?.toLowerCase());
    return idx === -1 ? 1 : idx; // default to 1 if unknown
};

/**
 * Validate whether a stage transition (possible downgrade) is allowed.
 *
 * @param {string} currentStage  - current lead stage e.g. 'Negotiation'
 * @param {string} newStage      - proposed new stage e.g. 'Prospect'
 * @param {number} activitiesInCurrentStage - count of activities logged since last stage change
 * @param {number} daysInCurrentStage - days since last stage change
 * @param {Object} config - STAGE_STABILITY_CONFIG or custom override
 * @returns {{ allowed: boolean, reason: string }}
 */
export const validateStageTransition = (
    currentStage,
    newStage,
    activitiesInCurrentStage = 0,
    daysInCurrentStage = 0,
    config = STAGE_STABILITY_CONFIG
) => {
    const currentRank = getStageRank(currentStage);
    const newRank = getStageRank(newStage);

    // Upgrade always allowed (or moving out of a terminal/stalled state = recovery, always allowed)
    if (newRank >= currentRank) return { allowed: true, reason: 'Upgrade — no lock check needed' };
    if (isTerminalStage(currentStage)) return { allowed: true, reason: 'Recovery from terminal/stalled state — always allowed' };

    // Downgrade check
    const lock = config[currentStage];
    if (!lock) return { allowed: true, reason: 'No stability lock configured for this stage' };

    if (activitiesInCurrentStage < lock.minActivities) {
        return {
            allowed: false,
            reason: `Stage locked: ${lock.label}. Current activities: ${activitiesInCurrentStage}, required: ${lock.minActivities}.`
        };
    }

    if (daysInCurrentStage < lock.minDays) {
        return {
            allowed: false,
            reason: `Stage locked: Minimum ${lock.minDays} day(s) required in ${currentStage}. Current: ${daysInCurrentStage}.`
        };
    }

    return { allowed: true, reason: 'Stability check passed' };
};

// ─── CORE STAGE COMPUTATION ───────────────────────────────────────────────────
/**
 * Compute stage from activity metadata.
 *
 * @param {string} activityType   - e.g. 'Call', 'Meeting', 'Site Visit'
 * @param {string} purpose        - e.g. 'Introduction / First Contact'
 * @param {string} outcome        - e.g. 'Connected'
 * @param {Array}  stageMappingRules - explicit override rules from admin config
 * @param {Object} activityMasterFields - the activity master config { activities: [...] }
 * @returns {string} computed stage label
 */
export const computeStage = (activityType, purpose, outcome, stageMappingRules = [], activityMasterFields = {}) => {
    const actLower = (activityType || '').toLowerCase();
    const purpLower = (purpose || '').toLowerCase();
    const outLower = (outcome || '').toLowerCase();

    let computedStage = null; // No fallback — stay in current stage if no rule matches
    let requiredForms = []; // ← array (was single string)

    // 1. Check explicit override rules (ordered by priority ascending)
    const sortedRules = [...stageMappingRules]
        .filter(r => r.isActive)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0)); // Highest priority first (matching backend)

    for (const rule of sortedRules) {
        const typeMatch = !rule.activityType || rule.activityType === '*' || rule.activityType.toLowerCase() === actLower;
        const purpMatch = !rule.purpose || rule.purpose === '*' || rule.purpose.toLowerCase() === purpLower;
        const outcMatch = !rule.outcome || rule.outcome === '*' || rule.outcome.toLowerCase() === outLower;
        if (typeMatch && purpMatch && outcMatch) {
            computedStage = rule.stage;
            // Support both old single requiredForm and new requiredForms[]
            requiredForms = Array.isArray(rule.requiredForms)
                ? rule.requiredForms
                : (rule.requiredForm ? [rule.requiredForm] : []);
            return { stage: computedStage, requiredForms };
        }
    }

    // 2. Fall back to outcome.stage in activityMasterFields
    const activities = activityMasterFields?.activities || [];
    const act = activities.find(a => (a.name || '').toLowerCase() === actLower);
    if (act) {
        const purp = act.purposes?.find(p => (p.name || '').toLowerCase() === purpLower);
        if (purp) {
            const out = purp.outcomes?.find(o => (o.label || '').toLowerCase() === outLower);
            if (out?.stage) {
                computedStage = out.stage;
                requiredForms = Array.isArray(out.requiredForms)
                    ? out.requiredForms
                    : (out.requiredForm ? [out.requiredForm] : []);
                return { stage: computedStage, requiredForms };
            }
        }
    }

    // 3. Fallback
    return { stage: null, requiredForms: [] };
};

/**
 * Build a flat list of all outcome mappings from activityMasterFields.
 * Used by the Rule Table to display all rows.
 *
 * @returns {Array} [{ activityType, purpose, outcome, stage, score, probability }]
 */
export const flattenOutcomeMappings = (activityMasterFields = {}) => {
    const rows = [];
    const activities = activityMasterFields?.activities || [];
    for (const act of activities) {
        for (const purp of (act.purposes || [])) {
            for (const out of (purp.outcomes || [])) {
                const stageName = out.stage || 'Incoming';
                // Support both old requiredForm (string) and new requiredForms (array)
                const requiredForms = Array.isArray(out.requiredForms)
                    ? out.requiredForms
                    : (out.requiredForm ? [out.requiredForm] : []);
                // Fallback logic for legacy data that doesn't have an explicit status
                const fallbackStatus = act.name === 'Call' ? 'Connected' : (act.name === 'Email' ? 'Sent' : 'Conducted');
                rows.push({
                    activityType: act.name,
                    purpose: purp.name,
                    outcome: out.label,
                    status: out.status || fallbackStatus,
                    stage: stageName,
                    score: out.score || 0,
                    probability: getStageProbability(stageName),
                    requiredForms: requiredForms,
                    scoreModifier: out.scoreModifier || 0,
                    ruleId: out.ruleId || `${act.name}-${purp.name}-${out.label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                });
            }
        }
    }
    return rows;
};
