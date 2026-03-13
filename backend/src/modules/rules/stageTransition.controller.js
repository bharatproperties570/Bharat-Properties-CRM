/**
 * Stage Transition Rules Controller
 * CRUD for stage transition rules stored in SystemSetting.
 *
 * GET  /api/rules/stage-transitions          — Fetch all rules
 * POST /api/rules/stage-transitions          — Save rules (full replace via upsert)
 * PUT  /api/rules/stage-transitions/:ruleId  — Update single rule
 * DEL  /api/rules/stage-transitions/:ruleId  — Delete single rule
 * POST /api/rules/stage-transitions/seed     — Seed defaults
 */

import SystemSetting from '../systemSettings/system.model.js';
import { DEFAULT_STAGE_RULES, invalidateRulesCache } from '../../services/StageTransitionEngine.js';
import { AppError } from '../../middlewares/error.middleware.js';
import { v4 as uuidv4 } from 'uuid';

// ─── GET ALL RULES ──────────────────────────────────────────────────────────
export const getStageTransitionRules = async (req, res, next) => {
    try {
        const setting = await SystemSetting.findOne({ key: 'stage_transition_rules' }).lean();
        const rules = setting?.value?.rules || DEFAULT_STAGE_RULES;

        res.status(200).json({
            success: true,
            count: rules.length,
            data: rules,
            isDefault: !setting
        });
    } catch (error) {
        next(error);
    }
};

// ─── SAVE ALL RULES (full replacement) ─────────────────────────────────────
export const saveStageTransitionRules = async (req, res, next) => {
    try {
        const { rules } = req.body;

        if (!Array.isArray(rules)) {
            return next(new AppError('rules must be an array', 400));
        }

        // Assign IDs to any rules that don't have one
        const processedRules = rules.map(rule => ({
            ...rule,
            id: rule.id || uuidv4(),
            active: rule.active !== false,
            priority: rule.priority || 10
        }));

        await SystemSetting.findOneAndUpdate(
            { key: 'stage_transition_rules' },
            {
                key: 'stage_transition_rules',
                category: 'sales_config',
                value: { rules: processedRules },
                description: 'Activity outcome → stage transition rules',
                isPublic: true,
                active: true
            },
            { upsert: true, new: true }
        );

        invalidateRulesCache();

        res.status(200).json({
            success: true,
            count: processedRules.length,
            data: processedRules
        });
    } catch (error) {
        next(error);
    }
};

// ─── ADD A SINGLE RULE ──────────────────────────────────────────────────────
export const addStageTransitionRule = async (req, res, next) => {
    try {
        const newRule = {
            ...req.body,
            id: req.body.id || uuidv4(),
            active: req.body.active !== false,
            priority: req.body.priority || 10
        };

        const setting = await SystemSetting.findOne({ key: 'stage_transition_rules' }).lean();
        const existingRules = setting?.value?.rules || [];
        const updatedRules = [...existingRules, newRule];

        await SystemSetting.findOneAndUpdate(
            { key: 'stage_transition_rules' },
            {
                key: 'stage_transition_rules',
                category: 'sales_config',
                value: { rules: updatedRules },
                description: 'Activity outcome → stage transition rules',
                isPublic: true,
                active: true
            },
            { upsert: true, new: true }
        );

        invalidateRulesCache();
        res.status(201).json({ success: true, data: newRule });
    } catch (error) {
        next(error);
    }
};

// ─── UPDATE A SINGLE RULE ───────────────────────────────────────────────────
export const updateStageTransitionRule = async (req, res, next) => {
    try {
        const { ruleId } = req.params;
        const setting = await SystemSetting.findOne({ key: 'stage_transition_rules' }).lean();
        const rules = setting?.value?.rules || DEFAULT_STAGE_RULES;

        const idx = rules.findIndex(r => r.id === ruleId);
        if (idx === -1) return next(new AppError('Rule not found', 404));

        rules[idx] = { ...rules[idx], ...req.body, id: ruleId };

        await SystemSetting.findOneAndUpdate(
            { key: 'stage_transition_rules' },
            { value: { rules } },
            { upsert: true }
        );

        invalidateRulesCache();
        res.status(200).json({ success: true, data: rules[idx] });
    } catch (error) {
        next(error);
    }
};

// ─── DELETE A SINGLE RULE ───────────────────────────────────────────────────
export const deleteStageTransitionRule = async (req, res, next) => {
    try {
        const { ruleId } = req.params;
        const setting = await SystemSetting.findOne({ key: 'stage_transition_rules' }).lean();
        const rules = (setting?.value?.rules || []).filter(r => r.id !== ruleId);

        await SystemSetting.findOneAndUpdate(
            { key: 'stage_transition_rules' },
            { value: { rules } },
            { upsert: true }
        );

        invalidateRulesCache();
        res.status(200).json({ success: true, message: 'Rule deleted', count: rules.length });
    } catch (error) {
        next(error);
    }
};

// ─── SEED DEFAULTS ──────────────────────────────────────────────────────────
export const seedDefaultRules = async (req, res, next) => {
    try {
        await SystemSetting.findOneAndUpdate(
            { key: 'stage_transition_rules' },
            {
                key: 'stage_transition_rules',
                category: 'sales_config',
                value: { rules: DEFAULT_STAGE_RULES },
                description: 'Activity outcome → stage transition rules',
                isPublic: true,
                active: true
            },
            { upsert: true, new: true }
        );

        invalidateRulesCache();
        res.status(200).json({
            success: true,
            message: 'Default rules seeded',
            count: DEFAULT_STAGE_RULES.length,
            data: DEFAULT_STAGE_RULES
        });
    } catch (error) {
        next(error);
    }
};
