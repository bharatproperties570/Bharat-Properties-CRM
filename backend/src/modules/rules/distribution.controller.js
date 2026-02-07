import DistributionRule from "./distribution.model.js";
import { AppError } from "../../middlewares/error.middleware.js";

/**
 * Get distribution rules by entity
 */
export const getDistributionRulesByEntity = async (req, res, next) => {
    try {
        const { entity } = req.params;
        const { active = 'true' } = req.query;

        const query = { entity };
        if (active !== undefined) query.active = active === 'true';

        const rules = await DistributionRule.find(query).sort({ priority: 1 });

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
 * Get all distribution rules
 */
export const getAllDistributionRules = async (req, res, next) => {
    try {
        const rules = await DistributionRule.find().sort({ entity: 1, priority: 1 });

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
 * Create distribution rule
 */
export const createDistributionRule = async (req, res, next) => {
    try {
        const rule = await DistributionRule.create(req.body);

        res.status(201).json({
            success: true,
            data: rule
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update distribution rule
 */
export const updateDistributionRule = async (req, res, next) => {
    try {
        const rule = await DistributionRule.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!rule) {
            throw new AppError('Distribution rule not found', 404);
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
 * Delete distribution rule
 */
export const deleteDistributionRule = async (req, res, next) => {
    try {
        const rule = await DistributionRule.findByIdAndDelete(req.params.id);

        if (!rule) {
            throw new AppError('Distribution rule not found', 404);
        }

        res.status(200).json({
            success: true,
            message: 'Distribution rule deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};
