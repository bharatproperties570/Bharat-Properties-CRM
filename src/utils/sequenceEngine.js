/**
 * Sequences Engine Core Logic
 * Handles trigger evaluation, step scheduling, and exit condition checks.
 */

/**
 * Evaluates if a lead/contact should enter a sequence based on its trigger.
 */
export const evaluateSequenceTrigger = (entity, trigger, type = 'lead') => {
    if (!entity || !trigger) return false;

    switch (trigger.type) {
        case 'onCreated':
            return true; // Usually called immediately after creation

        case 'onStageChange':
            return entity.stage === trigger.targetStage;

        case 'onScoreBandEntry':
            const score = entity.score || 0;
            return score >= trigger.minScore && score <= trigger.maxScore;

        case 'onInactivity':
            const lastActivityDate = new Date(entity.lastActivityAt || entity.updatedAt);
            const daysInactive = (new Date() - lastActivityDate) / (1000 * 60 * 60 * 24);
            return daysInactive >= trigger.days;

        default:
            return false;
    }
};

/**
 * Calculates the execution time for a sequence step.
 */
export const calculateStepExecutionTime = (baseTime, dayOffset, timeOfDay = '09:00') => {
    const scheduledDate = new Date(baseTime);
    scheduledDate.setDate(scheduledDate.getDate() + dayOffset);

    const [hours, minutes] = timeOfDay.split(':').map(Number);
    scheduledDate.setHours(hours, minutes, 0, 0);

    return scheduledDate;
};

/**
 * Checks if a sequence should stop for an entity.
 */
export const checkExitConditions = (entity, sequence, context = {}) => {
    // Global Exit Conditions
    if (entity.stage === 'Closed Won' || entity.stage === 'Converted') return true;
    if (entity.stage === 'Closed Lost') return true;

    // Sequence Specific Exit Conditions
    if (sequence.exitConditions) {
        if (sequence.exitConditions.onDealCreated && context.dealCreated) return true;
        if (sequence.exitConditions.onManualStop) return false; // Managed by UI
    }

    return false;
};

/**
 * Logic to decide if sequence should pause.
 */
export const shouldPauseSequence = (lastAction) => {
    const pauseTriggers = ['Call - Interested', 'Meeting Scheduled', 'Site Visit Scheduled', 'WhatsApp Reply'];
    return pauseTriggers.includes(lastAction);
};
