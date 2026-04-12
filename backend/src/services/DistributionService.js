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
 * Auto-assign an entity based on active DistributionRules.
 * @param {Object} doc - Mongoose document or plain object
 * @param {string} entityType - 'lead', 'contact', 'deal', 'inventory', etc.
 * @returns {Promise<{ assignedTo: string, teams: string[], ruleName: string } | null>}
 */
export const autoAssign = async (doc, entityType = 'lead') => {
    try {
        const rules = await DistributionRule.find({ isActive: true, entity: entityType })
            .populate('assignedAgents', '_id fullName email')
            .populate('assignedTeams', '_id name')
            .lean();

        if (!rules.length) return null;

        // Flatten document for condition evaluation
        const data = {
            ...doc,
            source: doc.source?.lookup_value || doc.source?.toString() || doc.source,
            stage: doc.stage?.lookup_value || doc.stage?.toString() || doc.stage,
            location: doc.location?.lookup_value || doc.location?.toString() || doc.location,
            budget: doc.budget?.lookup_value || doc.budget?.toString() || doc.budget,
            requirement: doc.requirement?.lookup_value || doc.requirement?.toString() || doc.requirement,
            campaign: doc.campaign?.lookup_value || doc.campaign?.toString() || doc.campaign,
        };

        // Find first matching rule
        for (const rule of rules) {
            const conditionsMet = evaluateConditions(rule.conditions, data, rule.matchType || 'AND');
            if (!conditionsMet) continue;

            // Resolve all potential agents (Direct + Teams)
            let agentIds = (rule.assignedAgents || []).map(a => a._id.toString());
            const teamIds = (rule.assignedTeams || []).map(t => t._id.toString());
            
            if (teamIds.length > 0) {
                const teamUsers = await User.find({ teams: { $in: teamIds }, status: 'Active' }).select('_id');
                const teamUserIds = teamUsers.map(u => u._id.toString());
                agentIds = [...new Set([...agentIds, ...teamUserIds])];
            }
            
            if (!agentIds.length && !teamIds.length) continue;

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

            if (assignedTo || teamIds.length > 0) {
                return { 
                    assignedTo: assignedTo || null, 
                    teams: teamIds, 
                    ruleName: rule.name, 
                    ruleId: rule._id.toString() 
                };
            }
        }

        return null; // No rule matched
    } catch (err) {
        console.error('[DistributionService] autoAssign error:', err.message);
        return null;
    }
};
