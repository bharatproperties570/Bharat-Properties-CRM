import ScoringRule from "./scoring.model.js";
import { calculateScore } from "../../utils/ruleEngine.js";
import { AppError } from "../../middlewares/error.middleware.js";

/**
 * Get all scoring rules
 */
export const getScoringRules = async (req, res, next) => {
    try {
        const { active = 'true', category } = req.query;

        const query = {};
        if (active !== undefined) query.active = active === 'true';
        if (category) query.category = category;

        const rules = await ScoringRule.find(query).sort({ category: 1, weight: -1 });

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
 * Calculate lead score
 */
export const calculateLeadScore = async (req, res, next) => {
    try {
        const lead = req.body;

        const rules = await ScoringRule.find({ active: true });

        const score = calculateScore(lead, rules);

        res.status(200).json({
            success: true,
            data: {
                score,
                rulesApplied: rules.length
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create scoring rule
 */
export const createScoringRule = async (req, res, next) => {
    try {
        const rule = await ScoringRule.create(req.body);

        res.status(201).json({
            success: true,
            data: rule
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update scoring rule
 */
export const updateScoringRule = async (req, res, next) => {
    try {
        const rule = await ScoringRule.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!rule) {
            throw new AppError('Scoring rule not found', 404);
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
 * Delete scoring rule
 */
export const deleteScoringRule = async (req, res, next) => {
    try {
        const rule = await ScoringRule.findByIdAndDelete(req.params.id);

        if (!rule) {
            throw new AppError('Scoring rule not found', 404);
        }

        res.status(200).json({
            success: true,
            message: 'Scoring rule deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};
