/**
 * Activity Sequence Guard
 *
 * Enforces the mandatory stage progression flow.
 * Returns warnings or errors when users attempt to skip stages.
 */

export const DEFAULT_STAGE_SEQUENCE = [
    { stage: 'New', order: 0, requiredActivity: null, icon: 'fa-star' },
    { stage: 'Prospect', order: 1, requiredActivity: 'Introduction / Call', icon: 'fa-user' },
    { stage: 'Qualified', order: 2, requiredActivity: 'Requirement Gathering', icon: 'fa-check-circle' },
    { stage: 'Opportunity', order: 3, requiredActivity: 'Follow-up / Site Visit', icon: 'fa-fire' },
    { stage: 'Negotiation', order: 4, requiredActivity: 'Negotiation Call', icon: 'fa-comments-dollar' },
    { stage: 'Booked', order: 5, requiredActivity: 'Token / Booking', icon: 'fa-calendar-check' },
    { stage: 'Closed Won', order: 6, requiredActivity: 'Agreement Signed', icon: 'fa-trophy' },
];

export const ENFORCEMENT_MODES = {
    OFF: 'off',      // No enforcement
    WARN: 'warn',     // Show warning but allow
    BLOCK: 'block',   // Hard block — cannot proceed
};

/**
 * Check if a stage transition is valid.
 *
 * @param {string} fromStage - Current stage
 * @param {string} toStage - Desired stage
 * @param {Array} completedActivities - Array of completed activity type strings for this lead
 * @param {string} enforcementMode - 'off' | 'warn' | 'block'
 * @returns {{ valid: boolean, mode: string, warning: string|null, skippedStages: string[] }}
 */
export const validateStageTransition = (fromStage, toStage, completedActivities = [], enforcementMode = ENFORCEMENT_MODES.WARN) => {
    if (enforcementMode === ENFORCEMENT_MODES.OFF) {
        return { valid: true, mode: enforcementMode, warning: null, skippedStages: [] };
    }

    const fromOrder = DEFAULT_STAGE_SEQUENCE.find(s => s.stage === fromStage)?.order ?? -1;
    const toOrder = DEFAULT_STAGE_SEQUENCE.find(s => s.stage === toStage)?.order ?? -1;

    // Backward moves (e.g. reopen) or same stage are allowed
    if (toOrder <= fromOrder) {
        return { valid: true, mode: enforcementMode, warning: null, skippedStages: [] };
    }

    // Check for skipped stages
    const skipped = DEFAULT_STAGE_SEQUENCE.filter(s => s.order > fromOrder && s.order < toOrder && s.requiredActivity);

    if (skipped.length === 0) {
        return { valid: true, mode: enforcementMode, warning: null, skippedStages: [] };
    }

    const skippedNames = skipped.map(s => s.stage);
    const missingActivities = skipped.map(s => s.requiredActivity).filter(Boolean);

    const warning = `Stage jump detected: ${fromStage} → ${toStage}. ` +
        `Missing stages: ${skippedNames.join(', ')}. ` +
        `Required activities: ${missingActivities.join(', ')}.`;

    return {
        valid: enforcementMode !== ENFORCEMENT_MODES.BLOCK,
        mode: enforcementMode,
        warning,
        skippedStages: skippedNames,
        missingActivities,
    };
};
