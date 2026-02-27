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
    { id: 'new', label: 'New', color: '#94a3b8', icon: 'fa-star', probability: 5 },
    { id: 'prospect', label: 'Prospect', color: '#3b82f6', icon: 'fa-user', probability: 10 },
    { id: 'qualified', label: 'Qualified', color: '#8b5cf6', icon: 'fa-check-circle', probability: 25 },
    { id: 'opportunity', label: 'Opportunity', color: '#f59e0b', icon: 'fa-fire', probability: 40 },
    { id: 'negotiation', label: 'Negotiation', color: '#f97316', icon: 'fa-comments-dollar', probability: 65 },
    { id: 'booked', label: 'Booked', color: '#10b981', icon: 'fa-calendar-check', probability: 85 },
    { id: 'closed_won', label: 'Closed Won', color: '#059669', icon: 'fa-trophy', probability: 100 },
    { id: 'closed_lost', label: 'Closed Lost', color: '#ef4444', icon: 'fa-times-circle', probability: 0 },
    { id: 'stalled', label: 'Stalled', color: '#78716c', icon: 'fa-pause-circle', probability: 15 },
];

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
    Negotiation: { minActivities: 1, minDays: 0, label: 'Negotiation requires 1 activity before downgrade' },
    Opportunity: { minActivities: 1, minDays: 0, label: 'Opportunity requires 1 activity before downgrade' },
    Qualified: { minActivities: 1, minDays: 0, label: 'Qualified requires 1 activity before downgrade' },
    Booked: { minActivities: 2, minDays: 1, label: 'Booked requires 2 activities + 1 day before downgrade' },
    'Closed Won': { minActivities: 999, minDays: 999, label: 'Closed Won cannot be downgraded automatically' },
};

// Stage priority order (higher index = more advanced stage)
// 'Stalled' sits between Negotiation and Booked — it is a sideways/terminal state.
// 'Closed Lost' is the lowest terminal. Moving FROM Stalled TO active stages is recovery (always allowed).
const STAGE_ORDER = ['Closed Lost', 'New', 'Prospect', 'Qualified', 'Opportunity', 'Negotiation', 'Stalled', 'Booked', 'Closed Won'];

/** Returns true for terminal/sideways states that cannot be further downgraded. */
export const isTerminalStage = (stageName) =>
    stageName === 'Stalled' || stageName === 'Closed Lost' || stageName === 'Closed Won';

const getStageRank = (stageName) => {
    const idx = STAGE_ORDER.indexOf(stageName);
    return idx === -1 ? 1 : idx; // default to 'New' rank (1) if unknown
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
    // 1. Check explicit override rules (ordered by priority ascending — lower number = higher priority)
    const sortedRules = [...stageMappingRules]
        .filter(r => r.isActive)
        .sort((a, b) => (a.priority || 99) - (b.priority || 99));

    for (const rule of sortedRules) {
        const typeMatch = !rule.activityType || rule.activityType === activityType;
        const purpMatch = !rule.purpose || rule.purpose === purpose;
        const outcMatch = !rule.outcome || rule.outcome === outcome;
        if (typeMatch && purpMatch && outcMatch) {
            return rule.stage;
        }
    }

    // 2. Fall back to outcome.stage in activityMasterFields
    const activities = activityMasterFields?.activities || [];
    const act = activities.find(a => a.name === activityType);
    if (act) {
        const purp = act.purposes?.find(p => p.name === purpose);
        if (purp) {
            const out = purp.outcomes?.find(o => o.label === outcome);
            if (out?.stage) return out.stage;
        }
    }

    // 3. Fallback
    return 'New';
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
                const stageName = out.stage || 'New';
                rows.push({
                    activityType: act.name,
                    purpose: purp.name,
                    outcome: out.label,
                    stage: stageName,
                    score: out.score || 0,
                    probability: getStageProbability(stageName),
                });
            }
        }
    }
    return rows;
};
