/**
 * Triggers Engine - Event-Driven Control Layer
 * 
 * Core Principles:
 * - Triggers are event listeners, not executors
 * - Reaction layer, not decision layer
 * - Safety first: never corrupt data, bypass rules, or auto-decide critical actions
 * - Respect all business rules (Field Rules, Distribution, Sequences, Scoring)
 */

/**
 * Evaluate if a trigger's conditions are met
 * @param {Object} entity - The entity being evaluated (lead, activity, etc.)
 * @param {Object} conditions - Trigger conditions with operator and rules
 * @returns {boolean} - Whether conditions are met
 */
export const evaluateTriggerConditions = (entity, conditions) => {
    if (!conditions || !conditions.rules || conditions.rules.length === 0) {
        return true; // No conditions = always true
    }

    const { operator = 'AND', rules } = conditions;

    const evaluateRule = (rule) => {
        const { field, operator: ruleOp, value } = rule;
        const entityValue = getNestedValue(entity, field);

        switch (ruleOp) {
            case '==':
            case 'equals':
                return entityValue == value;
            case '!=':
            case 'not_equals':
                return entityValue != value;
            case '>':
            case 'greater_than':
                return Number(entityValue) > Number(value);
            case '>=':
            case 'greater_than_or_equal':
                return Number(entityValue) >= Number(value);
            case '<':
            case 'less_than':
                return Number(entityValue) < Number(value);
            case '<=':
            case 'less_than_or_equal':
                return Number(entityValue) <= Number(value);
            case 'contains':
                return String(entityValue).toLowerCase().includes(String(value).toLowerCase());
            case 'not_contains':
                return !String(entityValue).toLowerCase().includes(String(value).toLowerCase());
            case 'in':
                return Array.isArray(value) && value.includes(entityValue);
            case 'not_in':
                return Array.isArray(value) && !value.includes(entityValue);
            case 'is_empty':
                return !entityValue || entityValue === '' || (Array.isArray(entityValue) && entityValue.length === 0);
            case 'is_not_empty':
                return entityValue && entityValue !== '' && (!Array.isArray(entityValue) || entityValue.length > 0);
            default:
                console.warn(`Unknown operator: ${ruleOp}`);
                return false;
        }
    };

    const results = rules.map(evaluateRule);

    if (operator === 'AND') {
        return results.every(r => r === true);
    } else if (operator === 'OR') {
        return results.some(r => r === true);
    }

    return false;
};

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to get value from
 * @param {string} path - Dot notation path (e.g., 'contact.name')
 * @returns {*} - Value at path
 */
const getNestedValue = (obj, path) => {
    if (!path) return undefined;
    return path.split('.').reduce((current, key) => current?.[key], obj);
};

/**
 * Check if trigger event matches the fired event
 * @param {string} triggerEvent - Event defined in trigger
 * @param {string} firedEvent - Event that was fired
 * @param {Object} eventData - Additional event data
 * @returns {boolean} - Whether events match
 */
export const matchesEvent = (triggerEvent, firedEvent, eventData = {}) => {
    // Direct match
    if (triggerEvent === firedEvent) return true;

    // Wildcard matching
    if (triggerEvent.includes('*')) {
        const regex = new RegExp('^' + triggerEvent.replace('*', '.*') + '$');
        return regex.test(firedEvent);
    }

    // Field-specific matching (e.g., lead_field_updated with specific field)
    if (firedEvent === 'lead_field_updated' && triggerEvent.startsWith('lead_field_updated:')) {
        const fieldName = triggerEvent.split(':')[1];
        return eventData.field === fieldName;
    }

    return false;
};

/**
 * Validate trigger safety before execution
 * @param {Object} trigger - Trigger definition
 * @param {Object} entity - Entity being processed
 * @param {Object} context - Additional context (fieldRules, etc.)
 * @returns {Object} - { valid: boolean, reason: string }
 */
export const validateTriggerSafety = (trigger, entity, context = {}) => {
    const { fieldRules = [], entityType } = context;

    // Check if trigger is active
    if (!trigger.isActive) {
        return { valid: false, reason: 'Trigger is disabled' };
    }

    // Validate entity ownership exists (if applicable)
    if (entityType === 'lead' || entityType === 'deal') {
        if (!entity.owner && !entity.assignedTo) {
            return { valid: false, reason: 'Entity has no owner assigned' };
        }
    }

    // Check for restricted actions based on module
    const restrictedActions = getRestrictedActions(trigger.module);
    const hasRestrictedAction = trigger.actions?.some(action =>
        restrictedActions.includes(action.type)
    );

    if (hasRestrictedAction) {
        return { valid: false, reason: 'Trigger contains restricted action for this module' };
    }

    return { valid: true };
};

/**
 * Get restricted action types for a module
 * @param {string} module - Module name
 * @returns {Array} - List of restricted action types
 */
const getRestrictedActions = (module) => {
    const restrictions = {
        inventory: ['modify_price', 'change_owner', 'auto_status_change'],
        deals: ['auto_close', 'commission_payout', 'modify_price'],
        post_sale: ['auto_refund', 'backward_stage_movement', 'modify_payment'],
        communication: ['auto_stage_change', 'auto_deal_creation']
    };

    return restrictions[module] || [];
};

/**
 * Execute trigger actions
 * @param {Object} trigger - Trigger definition
 * @param {Object} entity - Entity that triggered the event
 * @param {Object} actionHandlers - Object containing action handler functions
 * @returns {Promise<Array>} - Array of execution results
 */
export const executeTriggerActions = async (trigger, entity, actionHandlers = {}) => {
    const results = [];

    for (const action of trigger.actions || []) {
        try {
            const startTime = Date.now();
            let result;

            switch (action.type) {
                case 'start_sequence':
                    if (actionHandlers.startSequence) {
                        result = await actionHandlers.startSequence(entity.id, action.sequenceId);
                    }
                    break;

                case 'stop_sequence':
                    if (actionHandlers.stopSequence) {
                        result = await actionHandlers.stopSequence(entity.id, action.sequenceId);
                    }
                    break;

                case 'send_notification':
                    if (actionHandlers.sendNotification) {
                        result = await actionHandlers.sendNotification({
                            target: action.target,
                            template: action.template,
                            entity,
                            data: action.data
                        });
                    }
                    break;

                case 'fire_automated_action':
                    if (actionHandlers.fireAutomatedAction) {
                        result = await actionHandlers.fireAutomatedAction(action.automatedActionId, entity);
                    }
                    break;

                case 'update_field':
                    // Only allowed for non-critical fields
                    if (actionHandlers.updateField && !isCriticalField(action.field)) {
                        result = await actionHandlers.updateField(entity.id, action.field, action.value);
                    }
                    break;

                case 'create_activity':
                    if (actionHandlers.createActivity) {
                        result = await actionHandlers.createActivity({
                            entityId: entity.id,
                            entityType: trigger.module,
                            ...action.activityData
                        });
                    }
                    break;

                default:
                    console.warn(`Unknown action type: ${action.type}`);
            }

            const executionTime = Date.now() - startTime;

            results.push({
                action: action.type,
                status: 'success',
                executionTime,
                result
            });

        } catch (error) {
            console.error(`Trigger action failed: ${action.type}`, error);
            results.push({
                action: action.type,
                status: 'failed',
                error: error.message
            });
        }
    }

    return results;
};

/**
 * Check if a field is critical and should not be auto-updated
 * @param {string} field - Field name
 * @returns {boolean} - Whether field is critical
 */
const isCriticalField = (field) => {
    const criticalFields = [
        'price', 'budget', 'amount', 'commission',
        'inventoryStatus', 'dealStatus', 'paymentStatus',
        'owner', 'assignedTo'
    ];

    return criticalFields.includes(field);
};

/**
 * Calculate trigger priority score for execution ordering
 * @param {Object} trigger - Trigger definition
 * @returns {number} - Priority score (higher = execute first)
 */
export const calculateTriggerPriority = (trigger) => {
    // Explicit priority takes precedence
    if (trigger.priority !== undefined) {
        return trigger.priority;
    }

    // Default priorities by module (higher = more critical)
    const modulePriorities = {
        post_sale: 100,
        deals: 90,
        inventory: 80,
        leads: 70,
        activities: 60,
        communication: 50,
        marketing: 40
    };

    return modulePriorities[trigger.module] || 50;
};

/**
 * Sort triggers by priority
 * @param {Array} triggers - Array of triggers
 * @returns {Array} - Sorted triggers (highest priority first)
 */
export const sortTriggersByPriority = (triggers) => {
    return [...triggers].sort((a, b) => {
        return calculateTriggerPriority(b) - calculateTriggerPriority(a);
    });
};

/**
 * Create execution log entry
 * @param {Object} trigger - Trigger that was executed
 * @param {Object} entity - Entity that triggered the event
 * @param {string} event - Event that was fired
 * @param {boolean} conditionsMet - Whether conditions were met
 * @param {Array} actionResults - Results of action execution
 * @returns {Object} - Log entry
 */
export const createExecutionLog = (trigger, entity, event, conditionsMet, actionResults = []) => {
    return {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        triggerId: trigger.id,
        triggerName: trigger.name,
        entityId: entity.id,
        entityType: trigger.module,
        event,
        conditionsMet,
        actionsExecuted: actionResults,
        executedAt: new Date().toISOString(),
        totalExecutionTime: actionResults.reduce((sum, r) => sum + (r.executionTime || 0), 0),
        success: actionResults.every(r => r.status === 'success')
    };
};

/**
 * Main trigger evaluation and execution function
 * @param {string} event - Event that was fired
 * @param {Object} entity - Entity that triggered the event
 * @param {Array} triggers - All active triggers
 * @param {Object} actionHandlers - Action handler functions
 * @param {Object} context - Additional context
 * @returns {Promise<Array>} - Array of execution logs
 */
export const evaluateAndExecuteTriggers = async (event, entity, triggers, actionHandlers, context = {}) => {
    const logs = [];

    // Filter triggers for this event and module
    const relevantTriggers = triggers.filter(trigger =>
        trigger.isActive &&
        trigger.module === context.entityType &&
        matchesEvent(trigger.event, event, context.eventData)
    );

    // Sort by priority
    const sortedTriggers = sortTriggersByPriority(relevantTriggers);

    // Execute each trigger
    for (const trigger of sortedTriggers) {
        // Validate safety
        const safetyCheck = validateTriggerSafety(trigger, entity, context);
        if (!safetyCheck.valid) {
            logs.push(createExecutionLog(trigger, entity, event, false, [{
                action: 'safety_check',
                status: 'failed',
                error: safetyCheck.reason
            }]));
            continue;
        }

        // Evaluate conditions
        const conditionsMet = evaluateTriggerConditions(entity, trigger.conditions);

        if (conditionsMet) {
            // Execute actions
            const actionResults = await executeTriggerActions(trigger, entity, actionHandlers);
            logs.push(createExecutionLog(trigger, entity, event, true, actionResults));
        } else {
            logs.push(createExecutionLog(trigger, entity, event, false, []));
        }
    }

    return logs;
};
