/**
 * Field Rule Engine
 * 
 * "Field Rules = CRM Constitution"
 * 
 * This engine validates data against a set of configured rules.
 * It DOES NOT execute business logic or automation.
 * It ONLY validates, allows/restricts, and guides downstream engines.
 */

// Basic operators for condition builder
const OPERATORS = {
    EQUALS: 'equals',
    NOT_EQUALS: 'not_equals',
    CONTAINS: 'contains',
    NOT_CONTAINS: 'not_contains',
    GREATER_THAN: 'greater_than',
    LESS_THAN: 'less_than',
    IS_EMPTY: 'is_empty',
    IS_NOT_EMPTY: 'is_not_empty',
    IN: 'in',
    NOT_IN: 'not_in'
};

/**
 * Evaluate a single condition against data
 * @param {Object} data - The entity data (e.g., lead object)
 * @param {Object} condition - { field, operator, value }
 * @returns {Boolean}
 */
const evaluateCondition = (data, condition) => {
    const { field, operator, value } = condition;
    const fieldValue = data[field]; // Simple access, support dot notation if needed later

    switch (operator) {
        case OPERATORS.EQUALS:
            return fieldValue == value;
        case OPERATORS.NOT_EQUALS:
            return fieldValue != value;
        case OPERATORS.CONTAINS:
            return (fieldValue || '').toString().toLowerCase().includes((value || '').toString().toLowerCase());
        case OPERATORS.NOT_CONTAINS:
            return !(fieldValue || '').toString().toLowerCase().includes((value || '').toString().toLowerCase());
        case OPERATORS.GREATER_THAN:
            return Number(fieldValue) > Number(value);
        case OPERATORS.LESS_THAN:
            return Number(fieldValue) < Number(value);
        case OPERATORS.IS_EMPTY:
            return fieldValue === null || fieldValue === undefined || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
        case OPERATORS.IS_NOT_EMPTY:
            return !(fieldValue === null || fieldValue === undefined || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0));
        case OPERATORS.IN:
            return Array.isArray(value) ? value.includes(fieldValue) : false;
        case OPERATORS.NOT_IN:
            return Array.isArray(value) ? !value.includes(fieldValue) : true;
        default:
            return true;
    }
};

/**
 * Evaluate a group of conditions (AND/OR logic)
 * @param {Object} data 
 * @param {Object} rule - { matchType: 'AND' | 'OR', conditions: [] }
 */
const evaluateConditions = (data, rule) => {
    if (!rule.conditions || rule.conditions.length === 0) return true; // No conditions = applies always

    if (rule.matchType === 'OR') {
        return rule.conditions.some(condition => evaluateCondition(data, condition));
    } else {
        // Default AND
        return rule.conditions.every(condition => evaluateCondition(data, condition));
    }
};

/**
 * Validate an entity against a set of rules
 * @param {String} module - 'lead', 'contact', 'deal', etc.
 * @param {Object} data - The data object to validate
 * @param {Array} rules - Array of active rules for this module
 * @param {String} context - Current context e.g., 'save', 'stage_change' (optional)
 * 
 * @returns {Object} { isValid: Boolean, errors: {}, hiddenFields: [], readonlyFields: [] }
 */
export const validateEntity = (module, data, rules = [], context = null) => {
    const result = {
        isValid: true,
        errors: {}, // { fieldName: "Error message" }
        hiddenFields: [],
        readonlyFields: []
    };

    // Filter rules for this module and active status
    const activeRules = rules.filter(r => r.module === module && r.isActive);

    // Sort by priority (High priority processed last to overwrite if needed, or first? usually first fail blocks)
    // Actually, for validation, we want to collect ALL errors.

    activeRules.forEach(rule => {
        // 1. Check if the rule applies based on conditions (e.g. Stage >= Prospect)
        const applies = evaluateConditions(data, rule);

        if (applies) {
            // 2. Apply Rule Logic based on Type

            // MANDATORY CHECK
            if (rule.ruleType === 'MANDATORY') {
                const val = data[rule.field];
                const isEmpty = val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);

                if (isEmpty) {
                    result.isValid = false;
                    result.errors[rule.field] = rule.message || `${rule.field} is required.`;
                }
            }

            // READ ONLY CHECK (Frontend should use this to disable inputs)
            if (rule.ruleType === 'READ_ONLY') {
                result.readonlyFields.push(rule.field);
            }

            // HIDDEN CHECK
            if (rule.ruleType === 'HIDDEN') {
                result.hiddenFields.push(rule.field);
            }

            // CUSTOM VALIDATION (Regex, Range, etc.)
            if (rule.ruleType === 'VALIDATION' && rule.validationType) {
                const val = data[rule.field];
                if (val) { // Only validate if present
                    // Named Pattern Check
                    if (rule.validationType === 'PATTERN' && rule.patternName) {
                        const pattern = PATTERNS[rule.patternName];
                        if (pattern && !pattern.regex.test(val)) {
                            result.isValid = false;
                            result.errors[rule.field] = rule.message || pattern.message;
                        }
                    }
                    // Raw Regex Check
                    else if (rule.validationType === 'REGEX') {
                        const regex = new RegExp(rule.value);
                        if (!regex.test(val)) {
                            result.isValid = false;
                            result.errors[rule.field] = rule.message || `Invalid format for ${rule.field}`;
                        }
                    }
                    // Add more types like MIN/MAX length, numeric range etc.
                }
            }
        }
    });

    return result;
};

export const FIELD_RULE_TYPES = {
    MANDATORY: 'Mandatory',
    READ_ONLY: 'Read-Only',
    HIDDEN: 'Hidden',
    VALIDATION: 'Custom Validation',
    UNIQUE: 'Unique (Async Check)'
};

export const PATTERNS = {
    EMAIL: { regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email format" },
    INDIAN_MOBILE: { regex: /^[6-9]\d{9}$/, message: "Invalid 10-digit Indian Mobile Number" },
    PAN_CARD: { regex: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, message: "Invalid PAN Card Number" },
    GST_NUMBER: { regex: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, message: "Invalid GST Number" },
    PIN_CODE: { regex: /^[1-9][0-9]{5}$/, message: "Invalid PIN Code" }
};

export const MODULES = [
    'lead', 'contact', 'inventory', 'deal', 'activity', 'communication', 'marketing', 'post-sale'
];
