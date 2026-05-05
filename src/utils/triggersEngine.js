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
 * @param {Object} entity - The current entity state
 * @param {Object} conditions - Trigger conditions
 * @param {Object} previousEntity - The previous entity state (optional)
 * @returns {boolean} - Whether conditions are met
 */
export const evaluateTriggerConditions = (entity, conditions, previousEntity = null) => {
    if (!conditions || !conditions.rules || conditions.rules.length === 0) {
        return true;
    }

    const { operator = 'AND', rules } = conditions;

    const evaluateRule = (rule) => {
        const { field, operator: ruleOp, value } = rule;
        const currentVal = getNestedValue(entity, field);
        const prevVal = previousEntity ? getNestedValue(previousEntity, field) : undefined;

        switch (ruleOp) {
            case '==':
            case 'equals':
                return currentVal == value;
            case '!=':
            case 'not_equals':
                return currentVal != value;
            case '>':
            case 'greater_than':
                return Number(currentVal) > Number(value);
            case '<':
            case 'less_than':
                return Number(currentVal) < Number(value);
            case 'contains':
                return String(currentVal || '').toLowerCase().includes(String(value).toLowerCase());
            case 'is_empty':
                return !currentVal || currentVal === '';
            case 'was_changed':
                return previousEntity !== null && currentVal !== prevVal;
            case 'changed_from':
                return previousEntity !== null && prevVal == value && currentVal !== prevVal;
            case 'changed_to':
                return previousEntity !== null && currentVal == value && currentVal !== prevVal;
            case 'in':
                return Array.isArray(value) && value.includes(currentVal);
            // ── Enterprise: Threshold Crossing Detection ──────────────────────────────
            // Fires ONLY when value crosses the threshold boundary — not on every evaluation.
            // Prevents duplicate actions when trigger re-evaluates on same entity.
            case 'crossed_above':
                // Score was BELOW threshold before, and is AT/ABOVE threshold now
                return previousEntity !== null &&
                    Number(prevVal) < Number(value) &&
                    Number(currentVal) >= Number(value);
            case 'crossed_below':
                // Score was AT/ABOVE threshold before, and is now BELOW threshold
                return previousEntity !== null &&
                    Number(prevVal) >= Number(value) &&
                    Number(currentVal) < Number(value);
            case '>=':
            case 'gte':
                return Number(currentVal) >= Number(value);
            case '<=':
            case 'lte':
                return Number(currentVal) <= Number(value);
            default:
                console.warn(`Unknown operator: ${ruleOp}`);
                return false;
        }
    };

    const results = rules.map(evaluateRule);
    return operator === 'AND' ? results.every(r => r) : results.some(r => r);
};

/**
 * Render a string template with entity data
 * @param {string} template - String with {{field}} placeholders
 * @param {Object} entity - Data source
 * @returns {string} - Rendered string
 */
export const renderTemplate = (template, entity) => {
    if (!template) return '';
    return template.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
        const val = getNestedValue(entity, path);
        return val !== undefined ? val : match;
    });
};

/**
 * Get nested value from object using dot notation
 */
const getNestedValue = (obj, path) => {
    if (!path) return undefined;
    return path.split('.').reduce((current, key) => current?.[key], obj);
};

/**
 * Check if trigger event matches the fired event
 */
export const matchesEvent = (triggerEvent, firedEvent) => {
    if (triggerEvent === firedEvent) return true;
    if (triggerEvent.includes('*')) {
        const regex = new RegExp('^' + triggerEvent.replace(/\*/g, '.*') + '$');
        return regex.test(firedEvent);
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
    const { entityType } = context;

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
        // ── CRITICAL: Leads module — Triggers MUST NOT change stage directly.
        // Stage transitions are exclusively managed by StageTransitionEngine.
        // Any trigger attempting auto_stage_change will be blocked.
        leads: ['auto_stage_change', 'force_stage_override'],
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
export const executeTriggerActions = async (trigger, entity, actionHandlers = {}, context = {}) => {
    const results = [];

    for (const action of trigger.actions || []) {
        try {
            const startTime = Date.now();
            let result;

            switch (action.type) {
                case 'start_sequence':
                    if (actionHandlers.startSequence) {
                        const targetId = action.target ? getNestedValue(entity, action.target) : entity.id;
                        result = await actionHandlers.startSequence(targetId, action.sequenceId);
                    }
                    break;

                case 'stop_sequence':
                    if (actionHandlers.stopSequence) {
                        const targetId = action.target ? getNestedValue(entity, action.target) : entity.id;
                        result = await actionHandlers.stopSequence(targetId, action.sequenceId);
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

                case 'send_communication':
                    if (actionHandlers.sendCommunication) {
                        result = await actionHandlers.sendCommunication({
                            channel: action.channel,
                            templateId: action.templateId,
                            entity,
                            context  // Forward full context so resolver can access {reason}, {time}, etc.
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
 * Check if a field is critical and should not be auto-updated by Triggers.
 *
 * Enterprise Rule: Stage and Score are EXCLUSIVELY managed by their own engines:
 *   - stage       → StageTransitionEngine  (backend, activity-driven)
 *   - leadScore   → LeadScoringService     (backend, multi-factor calculation)
 *   - dealStatus  → Deal workflow engine
 *
 * Triggers may REACT to these changes (via lead_stage_changed, lead_score_changed events)
 * but MUST NOT directly mutate these fields via update_field action.
 *
 * @param {string} field - Field name
 * @returns {boolean} - Whether field is critical
 */
const isCriticalField = (field) => {
    const criticalFields = [
        // ── Core Lifecycle Fields — Engine-Owned ──────────────────────────────
        'stage',            // → StageTransitionEngine exclusive
        'leadScore',        // → LeadScoringService exclusive
        'activityScore',    // → LeadScoringService exclusive
        'scoreBreakdown',   // → LeadScoringService exclusive
        // ── Financial Fields — Must not be auto-changed ───────────────────────
        'price', 'budget', 'amount', 'commission',
        // ── Deal/Status Lifecycle Fields ──────────────────────────────────────
        'inventoryStatus', 'dealStatus', 'paymentStatus',
        // ── Assignment Fields — Distribution Engine exclusive ─────────────────
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
 * @param {Object} entity - Current entity state
 * @param {Array} triggers - All triggers
 * @param {Object} actionHandlers - Action handlers
 * @param {Object} context - { entityType, previousEntity, depth }
 * @returns {Promise<Array>} - Execution logs
 */
export const evaluateAndExecuteTriggers = async (event, entity, triggers, actionHandlers, context = {}) => {
    const { entityType, previousEntity = null, depth = 0, triggeredBy = null } = context;
    const logs = [];

    // Safety: Infinite Loop Protection
    if (depth > 5) {
        console.error('Trigger execution depth limit reached (Circular reference suspected)');
        return [{
            triggerName: 'SYSTEM_PROTECTION',
            event,
            success: false,
            error: 'Infinite loop detected'
        }];
    }

    // ── Enterprise: Stage Engine Source Guard ─────────────────────────────────
    // When StageTransitionEngine fires lead_stage_changed, the context will carry
    // triggeredBy: 'stage_engine'. Any trigger listening on lead_stage_changed
    // is ALLOWED to react (notify, sequence, etc.) but BLOCKED from mutating stage.
    // This is enforced by isCriticalField('stage') in the update_field action handler.
    // Logging here makes the guard visible for debugging.
    if (triggeredBy === 'stage_engine' && event === 'lead_stage_changed') {
        console.log(`[TriggerEngine] lead_stage_changed fired by StageTransitionEngine — ` +
            `Triggers may react but cannot update 'stage' field. Source: stage_engine`);
    }

    // Filter relevant triggers
    const relevantTriggers = triggers.filter(trigger =>
        trigger.isActive &&
        trigger.module === entityType &&
        matchesEvent(trigger.event, event, context.eventData)
    );

    const sortedTriggers = sortTriggersByPriority(relevantTriggers);

    for (const trigger of sortedTriggers) {
        // Safety Check
        const safetyCheck = validateTriggerSafety(trigger, entity, context);
        if (!safetyCheck.valid) {
            logs.push(createExecutionLog(trigger, entity, event, false, [{
                action: 'safety_check',
                status: 'failed',
                error: safetyCheck.reason
            }]));
            continue;
        }

        // Evaluate Conditions (with previousEntity context)
        const conditionsMet = evaluateTriggerConditions(entity, trigger.conditions, previousEntity);

        if (conditionsMet) {
            // Pre-process actions (template rendering)
            const processedTrigger = {
                ...trigger,
                actions: trigger.actions?.map(action => ({
                    ...action,
                    data: action.data ? JSON.parse(renderTemplate(JSON.stringify(action.data), entity)) : action.data,
                    message: action.message ? renderTemplate(action.message, entity) : action.message
                }))
            };

            // Execute actions
            const actionResults = await executeTriggerActions(processedTrigger, entity, actionHandlers, context);
            logs.push(createExecutionLog(processedTrigger, entity, event, true, actionResults));
        } else {
            logs.push(createExecutionLog(trigger, entity, event, false, []));
        }
    }

    return logs;
};
