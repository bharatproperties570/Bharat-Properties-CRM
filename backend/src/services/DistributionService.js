/**
 * DistributionService.js — Backend Auto-Assignment Engine
 *
 * Reads DistributionRule docs from MongoDB, matches conditions against a lead,
 * and assigns the lead to the best-matching agent.
 *
 * Round-robin state is persisted in SystemSetting key 'distribution_rr_state'
 * so it survives server restarts and is consistent across all backend instances.
 */

import DistributionRule from '../../models/DistributionRule.js';
import User from '../../models/User.js';
import Lead from '../../models/Lead.js';
import mongoose from 'mongoose';

// ─── Condition Evaluator ──────────────────────────────────────────────────────
const evaluateCondition = (data, { field, operator, value }) => {
    const fieldValue = data[field];
    switch (operator) {
        case 'equals': return String(fieldValue) === String(value);
        case 'not_equals': return String(fieldValue) !== String(value);
        case 'contains': return (fieldValue || '').toString().toLowerCase().includes((value || '').toString().toLowerCase());
        case 'is_empty': return !fieldValue || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
        case 'is_not_empty': return !!(fieldValue && fieldValue !== '' && !(Array.isArray(fieldValue) && fieldValue.length === 0));
        case 'greater_than': return Number(fieldValue) > Number(value);
        case 'less_than': return Number(fieldValue) < Number(value);
        case 'in': return Array.isArray(value) && value.includes(String(fieldValue));
        default: return true;
    }
};

const evaluateConditions = (conditions = [], data, matchType = 'AND') => {
    if (!conditions.length) return true;
    return matchType === 'OR'
        ? conditions.some(c => evaluateCondition(data, c))
        : conditions.every(c => evaluateCondition(data, c));
};

// ─── Round-Robin State (MongoDB-backed) ──────────────────────────────────────
const getRRState = async () => {
    try {
        const SystemSetting = mongoose.model('SystemSetting');
        const doc = await SystemSetting.findOne({ key: 'distribution_rr_state' }).lean();
        return doc?.value || {};
    } catch { return {}; }
};

const setRRState = async (state) => {
    try {
        const SystemSetting = mongoose.model('SystemSetting');
        await SystemSetting.findOneAndUpdate(
            { key: 'distribution_rr_state' },
            { $set: { key: 'distribution_rr_state', value: state, category: 'distribution' } },
            { upsert: true }
        );
    } catch (e) {
        console.warn('[DistributionService] Failed to persist RR state:', e.message);
    }
};

// ─── Load-Based: pick agent with fewest open leads ────────────────────────────
const pickLoadBased = async (agentIds) => {
    if (!agentIds?.length) return null;
    const counts = await Lead.aggregate([
        { $match: { owner: { $in: agentIds.map(id => new mongoose.Types.ObjectId(id)) } } },
        { $group: { _id: '$owner', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    agentIds.forEach(id => countMap[id] = 0);
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });
    const sorted = agentIds.slice().sort((a, b) => countMap[a] - countMap[b]);
    return sorted[0] || null;
};

// ─── Location-Based: match lead locArea/locCity to agent's territory ──────────
const pickLocationBased = async (agentIds, lead) => {
    if (!agentIds?.length) return null;
    const leadLocation = (lead.locArea || lead.locCity || '').toLowerCase();
    if (!leadLocation) return agentIds[0] || null;
    const agents = await User.find({ _id: { $in: agentIds }, territories: { $regex: leadLocation, $options: 'i' } }).lean();
    return agents[0]?._id?.toString() || agentIds[0] || null;
};

// ─── Main Export ──────────────────────────────────────────────────────────────
/**
 * Auto-assign a lead based on active DistributionRules.
 * @param {Object} lead - Mongoose lead document (pre-populated or plain object)
 * @returns {Promise<{ assignedTo: string, ruleName: string } | null>}
 */
export const autoAssign = async (lead) => {
    try {
        const rules = await DistributionRule.find({ isActive: true, entity: 'lead' })
            .populate('assignedAgents', '_id fullName email')
            .lean();

        if (!rules.length) return null;

        // Flatten lead for condition evaluation
        const leadData = {
            ...lead,
            source: lead.source?.lookup_value || lead.source?.toString() || lead.source,
            stage: lead.stage?.lookup_value || lead.stage?.toString() || lead.stage,
            location: lead.location?.lookup_value || lead.location?.toString() || lead.location,
            budget: lead.budget?.lookup_value || lead.budget?.toString() || lead.budget,
            requirement: lead.requirement?.lookup_value || lead.requirement?.toString() || lead.requirement,
            campaign: lead.campaign?.lookup_value || lead.campaign?.toString() || lead.campaign,
        };

        // Find first matching rule
        for (const rule of rules) {
            const conditionsMet = evaluateConditions(rule.conditions, leadData, rule.matchType || 'AND');
            if (!conditionsMet) continue;

            const agentIds = rule.assignedAgents.map(a => a._id.toString());
            if (!agentIds.length) continue;

            let assignedTo = null;

            switch (rule.logic) {
                case 'ROUND_ROBIN': {
                    const rrState = await getRRState();
                    const lastIdx = rrState[rule._id.toString()] || 0;
                    const nextIdx = lastIdx % agentIds.length;
                    assignedTo = agentIds[nextIdx];
                    // Persist next state
                    rrState[rule._id.toString()] = nextIdx + 1;
                    await setRRState(rrState);
                    break;
                }
                case 'LOAD_BASED': {
                    assignedTo = await pickLoadBased(agentIds);
                    break;
                }
                case 'LOCATION_BASED': {
                    assignedTo = await pickLocationBased(agentIds, leadData);
                    break;
                }
                case 'SKILL_BASED': {
                    // Fallback to round-robin for skill-based (skills not tracked in User model yet)
                    const rrState = await getRRState();
                    const lastIdx = rrState[`skill_${rule._id}`] || 0;
                    assignedTo = agentIds[lastIdx % agentIds.length];
                    rrState[`skill_${rule._id}`] = (lastIdx + 1);
                    await setRRState(rrState);
                    break;
                }
                default: {
                    assignedTo = agentIds[0];
                }
            }

            // Fallback agent
            if (!assignedTo && rule.fallbackAgent) {
                assignedTo = rule.fallbackAgent.toString();
            }

            if (assignedTo) {
                return { assignedTo, ruleName: rule.name, ruleId: rule._id.toString() };
            }
        }

        return null; // No rule matched
    } catch (err) {
        console.error('[DistributionService] autoAssign error:', err.message);
        return null;
    }
};
