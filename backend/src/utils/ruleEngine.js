/**
 * Business Rules Engine
 * Evaluates and executes rules based on conditions and actions
 */

/**
 * Evaluate a condition against an entity
 * @param {Object} entity - The data object to evaluate
 * @param {Object} condition - The condition to check
 * @returns {Boolean} - Whether the condition is met
 */
export const evaluateCondition = (entity, condition) => {
    if (!condition || Object.keys(condition).length === 0) {
        return true; // No condition means always true
    }

    const { field, operator, value } = condition;

    if (!field || !operator) {
        return false;
    }

    const entityValue = getNestedValue(entity, field);

    switch (operator) {
        case 'equals':
            return entityValue === value;
        case 'notEquals':
            return entityValue !== value;
        case 'contains':
            return String(entityValue).includes(value);
        case 'greaterThan':
            return Number(entityValue) > Number(value);
        case 'lessThan':
            return Number(entityValue) < Number(value);
        case 'greaterThanOrEqual':
            return Number(entityValue) >= Number(value);
        case 'lessThanOrEqual':
            return Number(entityValue) <= Number(value);
        case 'in':
            return Array.isArray(value) && value.includes(entityValue);
        case 'notIn':
            return Array.isArray(value) && !value.includes(entityValue);
        case 'isEmpty':
            return !entityValue || entityValue === '' || (Array.isArray(entityValue) && entityValue.length === 0);
        case 'isNotEmpty':
            return entityValue && entityValue !== '' && (!Array.isArray(entityValue) || entityValue.length > 0);
        default:
            return false;
    }
};

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - The object
 * @param {String} path - The path (e.g., 'user.profile.name')
 * @returns {*} - The value at the path
 */
const getNestedValue = (obj, path) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
};

/**
 * Apply rules to an entity
 * @param {Object} entity - The entity to apply rules to
 * @param {Array} rules - Array of rule objects
 * @param {String} context - Context for rule execution (e.g., 'create', 'update', 'view')
 * @returns {Object} - Result object with applied actions
 */
export const applyRules = (entity, rules, context = 'view') => {
    const result = {
        hiddenFields: [],
        readonlyFields: [],
        requiredFields: [],
        validationErrors: {},
        modifications: {}
    };

    if (!Array.isArray(rules)) {
        return result;
    }

    const activeRules = rules.filter(rule => rule.active !== false);

    activeRules.forEach(rule => {
        // Check if rule applies to this context
        if (rule.context && rule.context !== context) {
            return;
        }

        // Evaluate condition
        const conditionMet = evaluateCondition(entity, rule.condition);

        if (conditionMet) {
            // Apply action
            applyAction(result, rule.action);
        }
    });

    return result;
};

/**
 * Apply an action to the result
 * @param {Object} result - The result object to modify
 * @param {Object} action - The action to apply
 */
const applyAction = (result, action) => {
    if (!action) return;

    const { type, field, value, message } = action;

    switch (type) {
        case 'hide':
            if (field && !result.hiddenFields.includes(field)) {
                result.hiddenFields.push(field);
            }
            break;
        case 'show':
            result.hiddenFields = result.hiddenFields.filter(f => f !== field);
            break;
        case 'makeReadonly':
            if (field && !result.readonlyFields.includes(field)) {
                result.readonlyFields.push(field);
            }
            break;
        case 'makeEditable':
            result.readonlyFields = result.readonlyFields.filter(f => f !== field);
            break;
        case 'makeRequired':
            if (field && !result.requiredFields.includes(field)) {
                result.requiredFields.push(field);
            }
            break;
        case 'makeOptional':
            result.requiredFields = result.requiredFields.filter(f => f !== field);
            break;
        case 'setError':
            if (field && message) {
                result.validationErrors[field] = message;
            }
            break;
        case 'setValue':
            if (field) {
                result.modifications[field] = value;
            }
            break;
        default:
            break;
    }
};

/**
 * Calculate lead score based on scoring rules
 * @param {Object} lead - The lead object
 * @param {Array} scoringRules - Array of scoring rule objects
 * @returns {Number} - Calculated score
 */
export const calculateScore = (lead, scoringRules) => {
    if (!Array.isArray(scoringRules)) {
        return 0;
    }

    let totalScore = 0;

    const activeRules = scoringRules.filter(rule => rule.active !== false);

    activeRules.forEach(rule => {
        const conditionMet = evaluateCondition(lead, rule.condition);

        if (conditionMet) {
            totalScore += rule.weight || 0;
        }
    });

    return Math.max(0, Math.min(100, totalScore)); // Clamp between 0-100
};

export default {
    evaluateCondition,
    applyRules,
    calculateScore
};
