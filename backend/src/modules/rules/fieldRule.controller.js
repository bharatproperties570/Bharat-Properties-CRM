import FieldRule from "./fieldRule.model.js";
import { applyRules } from "../../utils/ruleEngine.js";
import { AppError } from "../../middlewares/error.middleware.js";

/**
 * Get field rules by module
 */
export const getFieldRulesByModule = async (req, res, next) => {
    try {
        const { module } = req.params;
        const { active = 'true' } = req.query;

        const query = { module };
        if (active !== undefined) query.active = active === 'true';

        const rules = await FieldRule.find(query).sort({ priority: 1 });

        res.status(200).json({
            success: true,
            count: rules.length,
            data: rules
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Evaluate field rules for an entity
 */
export const evaluateFieldRules = async (req, res, next) => {
    try {
        const { module, context = 'view' } = req.params;
        const entity = req.body;

        const rules = await FieldRule.find({ module, active: true }).sort({ priority: 1 });

        const result = applyRules(entity, rules, context);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create field rule
 */
export const createFieldRule = async (req, res, next) => {
    try {
        const rule = await FieldRule.create(req.body);

        res.status(201).json({
            success: true,
            data: rule
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update field rule
 */
export const updateFieldRule = async (req, res, next) => {
    try {
        const rule = await FieldRule.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!rule) {
            throw new AppError('Field rule not found', 404);
        }

        res.status(200).json({
            success: true,
            data: rule
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete field rule
 */
export const deleteFieldRule = async (req, res, next) => {
    try {
        const rule = await FieldRule.findByIdAndDelete(req.params.id);

        if (!rule) {
            throw new AppError('Field rule not found', 404);
        }

        res.status(200).json({
            success: true,
            message: 'Field rule deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};
