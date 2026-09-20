import DistributionRule from "../models/DistributionRule.js";
import { validateDistributionTargets, DistributionError } from "../src/validators/distributionTargetValidator.js";

export const getDistributionRules = async (req, res) => {
    try {
        const { module: moduleName } = req.query;
        const query = moduleName ? { module: moduleName } : {};
        const rules = await DistributionRule.find(query).lean();
        res.json(rules);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const normalizeDistributionRulePayload = (payload, existingRule = null) => {
    const normalized = { ...payload };

    // Map legacy 'entity' to 'module'
    if (normalized.entity && !normalized.module) {
        normalized.module = normalized.entity === 'lead' ? 'leads' : normalized.entity + 's';
    }
    
    // Map legacy 'isActive' to 'enabled'
    if (normalized.isActive !== undefined && normalized.enabled === undefined) {
        normalized.enabled = normalized.isActive;
    }

    // Map legacy 'logic' to 'distributionType'
    if (normalized.logic && !normalized.distributionType) {
        if (normalized.logic === 'ROUND_ROBIN') normalized.distributionType = 'roundRobin';
    }

    // Map legacy 'assignedAgents' to 'assignmentTarget'
    if (normalized.assignedAgents && !normalized.assignmentTarget) {
        normalized.assignmentTarget = {
            type: 'user',
            ids: normalized.assignedAgents
        };
    }

    // On UPDATE, preserve existing target if omitted in payload
    if (existingRule && !normalized.assignmentTarget && !normalized.assignedAgents) {
        normalized.assignmentTarget = existingRule.assignmentTarget;
    }

    // On UPDATE, preserve existing fallbackTarget if omitted in payload
    if (existingRule && !('fallbackTarget' in normalized)) {
        normalized.fallbackTarget = existingRule.fallbackTarget;
    }

    // On UPDATE, preserve existing triggerEvent if omitted in legacy payload
    if (existingRule && normalized.triggerEvent === undefined) {
        normalized.triggerEvent = existingRule.triggerEvent;
    }

    return normalized;
};

export const createDistributionRule = async (req, res) => {
    try {
        const normalizedData = normalizeDistributionRulePayload(req.body);
        
        // Strictly reject creation if triggerEvent is omitted (prevent wildcard/silent defaults)
        if (normalizedData.triggerEvent === undefined) {
            return res.status(400).json({ message: "triggerEvent is required and cannot be inferred for new rules." });
        }

        // Validate targets for referential integrity
        await validateDistributionTargets(normalizedData);

        const rule = await DistributionRule.create(normalizedData);
        res.status(201).json(rule);
    } catch (error) {
        if (error instanceof DistributionError) {
            return res.status(400).json({
                success: false,
                message: error.message,
                code: error.code,
                details: error.details
            });
        }
        res.status(500).json({ message: error.message });
    }
};

export const updateDistributionRule = async (req, res) => {
    try {
        const { id } = req.params;
        
        const existingRule = await DistributionRule.findById(id).lean();
        if (!existingRule) return res.status(404).json({ message: "Rule not found" });

        const normalizedData = normalizeDistributionRulePayload(req.body, existingRule);

        // Validate targets for referential integrity
        await validateDistributionTargets(normalizedData);

        const rule = await DistributionRule.findByIdAndUpdate(id, normalizedData, { new: true, runValidators: true });
        res.json(rule);
    } catch (error) {
        if (error instanceof DistributionError) {
            return res.status(400).json({
                success: false,
                message: error.message,
                code: error.code,
                details: error.details
            });
        }
        res.status(500).json({ message: error.message });
    }
};

export const deleteDistributionRule = async (req, res) => {
    try {
        const { id } = req.params;
        await DistributionRule.findByIdAndDelete(id);
        res.json({ message: "Rule deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
