/**
 * Distribution Engine - Backend Implementation
 * Handles automated assignment of Leads, Deals, and Activities based on Business Rules.
 */
import User from "../../models/User.js";
import Team from "../../models/Team.js";
import Lead from "../../models/Lead.js";
import DistributionRule from "../../models/DistributionRule.js";

/**
 * Evaluates conditions against entity data.
 */
const evaluateConditions = (conditions, data) => {
    if (!conditions || conditions.length === 0) return true;

    const getNestedValue = (obj, path) => {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    const evaluateSingle = (fieldValue, operator, value) => {
        if (fieldValue === undefined || fieldValue === null) return false;
        const strVal = String(fieldValue).toLowerCase();
        const target = String(value).toLowerCase();

        switch (operator) {
            case 'equals': return strVal === target;
            case 'notEquals': return strVal !== target;
            case 'contains': return strVal.includes(target);
            case 'greaterThan': return parseFloat(fieldValue) > parseFloat(value);
            case 'lessThan': return parseFloat(fieldValue) < parseFloat(value);
            case 'in': return value.split(',').map(v => v.trim().toLowerCase()).includes(strVal);
            default: return false;
        }
    };

    let result = true;
    let currentLogic = 'AND';

    for (let i = 0; i < conditions.length; i++) {
        const cond = conditions[i];
        const val = getNestedValue(data, cond.field);
        const met = evaluateSingle(val, cond.operator, cond.value);

        if (i === 0) result = met;
        else {
            if (currentLogic === 'AND') result = result && met;
            else result = result || met;
        }
        currentLogic = cond.logic || 'AND';
    }
    return result;
};

/**
 * Calculates real-time workload for an agent.
 */
const calculateWorkload = async (agentId) => {
    const activeLeads = await Lead.countDocuments({ 
        $or: [{ owner: agentId }, { 'assignment.assignedTo': agentId }],
        stage: { $nin: ['Closed', 'Lost', 'Converted'] } 
    });
    // Add other module counts if necessary
    return activeLeads;
};

/**
 * Core Distribution Logic
 */
/**
 * Core Distribution Logic
 * @param {Object} entity - The Mongoose document or data object
 * @param {String} triggerEvent - The event trigger (onCreate, onWebCapture, etc.)
 * @returns {Promise<Object|null>} - Returns the assignment details { assignedTo, ruleName }
 */
export const distributeEntity = async (entity, triggerEvent) => {
    try {
        const module = entity.constructor.modelName ? entity.constructor.modelName.toLowerCase() + 's' : 'leads';
        console.log(`[Distribution] 🤖 Orchestrating ${module} for event: ${triggerEvent}`);

        const entityData = entity.toObject ? entity.toObject() : entity;

        // 1. Fetch active rules for this module and trigger
        const rules = await DistributionRule.find({ 
            enabled: true, 
            module, 
            triggerEvent 
        }).sort({ priority: -1 });

        if (rules.length === 0) {
            console.log(`[Distribution] ℹ️ No active rules for ${module}/${triggerEvent}`);
            return null;
        }

        for (const rule of rules) {
            // 2. Check conditions
            if (!evaluateConditions(rule.conditions, entityData)) continue;

            console.log(`[Distribution] ✅ Matching Rule: "${rule.name}"`);

            // 3. Resolve eligible agents
            const agentIds = rule.assignmentTarget.ids;
            if (!agentIds || agentIds.length === 0) continue;

            const eligibleUsers = await User.find({ 
                _id: { $in: agentIds }, 
                status: 'Active', 
                availability: 'Available' 
            }).lean();

            if (eligibleUsers.length === 0) {
                console.warn(`[Distribution] ⚠️ All targeted agents for "${rule.name}" are Offline/Unavailable.`);
                if (rule.fallbackTarget?.id) {
                    const fallbackId = rule.fallbackTarget.id;
                    await performAssignment(entity, fallbackId, rule.name + " (Fallback)");
                    return { assignedTo: fallbackId, ruleName: rule.name + " (Fallback)" };
                }
                continue;
            }

            // 4. Distribution Logic
            let assignedTo = null;

            switch (rule.distributionType) {
                case 'roundRobin': {
                    const nextIdx = (rule.lastAssignedIndex + 1) % eligibleUsers.length;
                    assignedTo = eligibleUsers[nextIdx]._id;
                    await DistributionRule.findByIdAndUpdate(rule._id, { lastAssignedIndex: nextIdx });
                    break;
                }

                case 'loadBased': {
                    let lowestLoad = Infinity;
                    for (const user of eligibleUsers) {
                        const load = await calculateWorkload(user._id);
                        const weightData = rule.assignmentTarget.weights?.get(user._id.toString()) || { cap: 100 };
                        const loadRatio = load / (weightData.cap || 100);
                        
                        if (loadRatio < lowestLoad) {
                            lowestLoad = loadRatio;
                            assignedTo = user._id;
                        }
                    }
                    break;
                }

                default:
                    assignedTo = eligibleUsers[0]._id;
            }

            if (assignedTo) {
                console.log(`[Distribution] 🎯 Assigned to UserID: ${assignedTo} via "${rule.name}"`);
                await performAssignment(entity, assignedTo, rule.name);
                return { assignedTo, ruleName: rule.name };
            }
        }

        return null;
    } catch (error) {
        console.error(`[Distribution Error]:`, error);
        return null;
    }
};

/**
 * Helper to update the entity with the assignment
 */
const performAssignment = async (entity, assignedTo, ruleName) => {
    const updatePayload = {
        owner: assignedTo,
        'assignment.assignedTo': assignedTo,
        'assignment.assignedAt': new Date(),
        'assignment.ruleName': ruleName
    };

    if (entity.constructor.modelName) {
        // It's a Mongoose document
        await entity.constructor.findByIdAndUpdate(entity._id, { $set: updatePayload });
    } else if (entity._id) {
        // It's a plain object with ID, assume Lead model for now or try to detect
        const Lead = (await import('../../models/Lead.js')).default;
        await Lead.findByIdAndUpdate(entity._id, { $set: updatePayload });
    }
};
