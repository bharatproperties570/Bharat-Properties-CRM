/**
 * Lead ↔ Deal Sync Engine
 *
 * Deterministic rules to compute a Deal's stage from linked leads.
 * Rules are evaluated top-down (highest priority wins).
 */

// Deal stage priority order for conflict resolution (highest index = higher priority)
export const DEAL_STAGE_PRIORITY = [
    'Open',
    'Prospect',
    'Qualified',
    'Opportunity',
    'Quote',
    'Negotiation',
    'Booked',
    'Closed Won',
    'Closed Lost',
];

export const DEFAULT_SYNC_RULES = [
    {
        id: 'rule_booked',
        priority: 1,
        label: 'Any lead Booked → Deal Booked',
        condition: 'ANY_LEAD',
        conditionStage: 'Booked',
        dealStage: 'Booked',
        isActive: true,
        isLocked: true, // Cannot be deleted, only disabled
    },
    {
        id: 'rule_closed_won',
        priority: 2,
        label: 'Any lead Closed Won → Deal Closed Won',
        condition: 'ANY_LEAD',
        conditionStage: 'Closed Won',
        dealStage: 'Closed Won',
        isActive: true,
        isLocked: true,
    },
    {
        id: 'rule_all_lost',
        priority: 3,
        label: 'All leads Closed Lost → Deal Open',
        condition: 'ALL_LEADS',
        conditionStage: 'Closed Lost',
        dealStage: 'Open',
        isActive: true,
        isLocked: true,
    },
    {
        id: 'rule_owner_withdrawal',
        priority: 4,
        label: 'Owner Withdrawal activity → Deal Closed Lost',
        condition: 'ACTIVITY',
        conditionActivity: 'Owner Withdrawal',
        dealStage: 'Closed Lost',
        dealReason: 'Owner Withdrawn',
        isActive: true,
        isLocked: false,
    },
];

/**
 * Compute the deal stage from linked leads using sync rules.
 *
 * @param {Array} leadStages - Array of stage strings for all linked leads
 * @param {Array} syncRules - The configured sync rules
 * @param {boolean} hasOwnerWithdrawal - Whether an owner withdrawal activity exists
 * @returns {{ stage: string, reason: string, ruleId: string }}
 */
export const computeDealStageFromLeads = (leadStages = [], syncRules = DEFAULT_SYNC_RULES, hasOwnerWithdrawal = false) => {
    const activeRules = [...syncRules].filter(r => r.isActive).sort((a, b) => a.priority - b.priority);

    for (const rule of activeRules) {
        // Owner withdrawal check
        if (rule.condition === 'ACTIVITY' && rule.conditionActivity === 'Owner Withdrawal' && hasOwnerWithdrawal) {
            return { stage: rule.dealStage, reason: rule.dealReason || rule.label, ruleId: rule.id };
        }

        // ANY lead in condition stage
        if (rule.condition === 'ANY_LEAD' && leadStages.some(s => s === rule.conditionStage)) {
            return { stage: rule.dealStage, reason: rule.label, ruleId: rule.id };
        }

        // ALL leads in condition stage
        if (rule.condition === 'ALL_LEADS' && leadStages.length > 0 && leadStages.every(s => s === rule.conditionStage)) {
            return { stage: rule.dealStage, reason: rule.label, ruleId: rule.id };
        }
    }

    // No rule matched — use highest priority stage among leads
    const highestStage = leadStages.reduce((best, current) => {
        const bestIdx = DEAL_STAGE_PRIORITY.indexOf(best);
        const currIdx = DEAL_STAGE_PRIORITY.indexOf(current);
        return currIdx > bestIdx ? current : best;
    }, 'Open');

    return { stage: highestStage, reason: 'Conflict resolution: highest priority lead stage', ruleId: null };
};
