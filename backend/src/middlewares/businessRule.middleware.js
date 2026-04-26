import FieldRule from "../../models/FieldRule.js";
import { evaluateCondition } from "../utils/ruleEngine.js";

/**
 * Middleware to enforce Business Field Rules (MANDATORY, READONLY, etc.)
 * @param {String} module - The module name (e.g., 'leads', 'deals')
 */
export const validateBusinessRules = (module) => {
    return async (req, res, next) => {
        try {
            const activeRules = await FieldRule.find({ module, isActive: true }).lean();
            if (!activeRules || activeRules.length === 0) {
                return next();
            }

            const data = req.body;
            const errors = [];

            for (const rule of activeRules) {
                // 1. Evaluate if the rule conditions match the current data
                // For 'MANDATORY' rules, we often check against the CURRENT state of the record + changes
                // But for simplicity in middleware, we check against req.body
                
                let isApplicable = true;
                if (rule.conditions && rule.conditions.length > 0) {
                    // Check if all conditions (AND) or any condition (OR) match
                    if (rule.matchType === 'OR') {
                        isApplicable = rule.conditions.some(cond => evaluateCondition(data, cond));
                    } else {
                        isApplicable = rule.conditions.every(cond => evaluateCondition(data, cond));
                    }
                }

                if (isApplicable) {
                    const fieldValue = data[rule.field];

                    switch (rule.ruleType) {
                        case 'MANDATORY':
                            if (fieldValue === undefined || fieldValue === null || fieldValue === "") {
                                errors.push({
                                    field: rule.field,
                                    message: rule.message || `${rule.field} is mandatory based on business rules.`
                                });
                            }
                            break;
                        
                        case 'READONLY':
                            if (req.method === 'PUT' || req.method === 'PATCH') {
                                if (fieldValue !== undefined) {
                                    // In a strict enterprise system, we might block or just strip it
                                    // For now, let's block to ensure users know why it didn't change
                                    errors.push({
                                        field: rule.field,
                                        message: `${rule.field} is read-only under current conditions.`
                                    });
                                }
                            }
                            break;

                        case 'HIDDEN':
                            if (fieldValue !== undefined) {
                                delete req.body[rule.field]; // Silently strip hidden fields
                            }
                            break;
                    }
                }
            }

            if (errors.length > 0) {
                return res.status(422).json({
                    success: false,
                    message: "Business Rule Validation Failed",
                    errors: errors
                });
            }

            next();
        } catch (error) {
            console.error(`[BUSINESS_RULE_MIDDLEWARE_ERROR] Module: ${module}`, error);
            next(); // Proceed anyway to avoid breaking the flow on system error
        }
    };
};
