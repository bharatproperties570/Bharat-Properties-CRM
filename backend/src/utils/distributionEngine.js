/**
 * Distribution Engine - Backend Implementation
 * Handles automated assignment of Leads, Deals, and Activities based on Business Rules.
 */
import User from "../../models/User.js";
import Team from "../../models/Team.js";
import Lead from "../../models/Lead.js";
import DistributionRule from "../../models/DistributionRule.js";
import eventBus from "../../services/EventBus.js"; // IMPORT EVENTBUS
import { distributionQueue } from "../queues/queueManager.js"; // QUEUE SYSTEM

/**
 * Checks if a user is currently on shift based on preferences.workingHours
 * and verifies they are not currently Out Of Office (OOO)
 */
const isUserAvailableAndOnShift = (user) => {
    // 1. Check Out of Office
    if (user.outOfOffice?.active) {
        if (!user.outOfOffice.until || new Date(user.outOfOffice.until) > new Date()) {
            return false; // User is on active leave
        }
    }

    // 2. Check Shift Timings
    if (!user.preferences?.workingHours) return true; // Default to available
    const { start, end } = user.preferences.workingHours;
    if (!start || !end) return true;
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour + currentMinute / 60;
    
    const [startHour, startMinute] = start.split(':').map(Number);
    const startTime = startHour + (startMinute || 0) / 60;
    
    const [endHour, endMinute] = end.split(':').map(Number);
    const endTime = endHour + (endMinute || 0) / 60;
    
    return currentTime >= startTime && currentTime <= endTime;
};

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
 * Core Distribution Logic
 * @param {Object} entity - The Mongoose document or data object
 * @param {String} triggerEvent - The event trigger (onCreate, onWebCapture, etc.)
 * @param {Boolean} isRetry - Whether this is a retry from the queue
 * @returns {Promise<Object|null>} - Returns the assignment details { assignedTo, ruleName }
 */
export const distributeEntity = async (entity, triggerEvent, isRetry = false) => {
    try {
        const moduleName = entity.constructor.modelName ? entity.constructor.modelName.toLowerCase() + 's' : 'leads';
        console.log(`[Distribution] 🤖 Orchestrating ${moduleName} for event: ${triggerEvent}`);

        const entityData = entity.toObject ? entity.toObject() : entity;

        // 1. Fetch active rules for this module and trigger
        const rules = await DistributionRule.find({ 
            enabled: true, 
            module: moduleName, 
            triggerEvent 
        }).sort({ priority: -1 });

        if (rules.length === 0) {
            console.log(`[Distribution] ℹ️ No active rules for ${moduleName}/${triggerEvent}`);
            return null;
        }

        for (const rule of rules) {
            // 2. Check conditions
            if (!evaluateConditions(rule.conditions, entityData)) continue;

            console.log(`[Distribution] ✅ Matching Rule: "${rule.name}"`);

            // 3. Resolve eligible agents
            let agentIds = [];
            if (rule.assignmentTarget.type === 'team') {
                const teamIds = rule.assignmentTarget.ids;
                const usersInTeams = await User.find({ teams: { $in: teamIds } }).select('_id').lean();
                agentIds = usersInTeams.map(u => u._id.toString());
            } else {
                agentIds = rule.assignmentTarget.ids.map(id => id.toString());
            }

            if (!agentIds || agentIds.length === 0) continue;

            let eligibleUsers = await User.find({ 
                _id: { $in: agentIds }, 
                status: 'Active', 
                availability: 'Available' 
            }).lean();

            eligibleUsers = eligibleUsers.filter(isUserAvailableAndOnShift);

            if (eligibleUsers.length === 0) {
                console.warn(`[Distribution] ⚠️ All targeted agents for "${rule.name}" are Offline/Unavailable, OOO, or Off-shift.`);
                if (rule.fallbackTarget?.id) {
                    const fallbackId = rule.fallbackTarget.id;
                    const fallbackUser = await User.findById(fallbackId).lean();
                    if (fallbackUser && fallbackUser.availability === 'Available' && isUserAvailableAndOnShift(fallbackUser)) {
                        await performAssignment(entity, fallbackId, rule.name + " (Fallback)");
                        return { assignedTo: fallbackId, ruleName: rule.name + " (Fallback)" };
                    }
                }
                continue;
            }

            // 4. Distribution Logic
            let assignedTo = null;

            switch (rule.distributionType) {
                case 'roundRobin': {
                    const updatedRule = await DistributionRule.findByIdAndUpdate(
                        rule._id,
                        { $inc: { lastAssignedIndex: 1 } },
                        { new: true }
                    );
                    const nextIdx = updatedRule.lastAssignedIndex % eligibleUsers.length;
                    assignedTo = eligibleUsers[nextIdx]._id;
                    break;
                }

                case 'loadBased': {
                    const userIds = eligibleUsers.map(u => u._id);
                    const counts = await Lead.aggregate([
                        { 
                            $match: { 
                                $or: [
                                    { owner: { $in: userIds } },
                                    { 'assignment.assignedTo': { $in: userIds } }
                                ],
                                stage: { $nin: ['Closed', 'Lost', 'Converted'] } 
                            } 
                        },
                        { $group: { _id: '$owner', count: { $sum: 1 } } }
                    ]);
                    
                    const workloadMap = {};
                    userIds.forEach(id => workloadMap[id.toString()] = 0);
                    counts.forEach(c => { if(c._id) workloadMap[c._id.toString()] = c.count; });
                    
                    let lowestLoad = Infinity;
                    for (const user of eligibleUsers) {
                        const load = workloadMap[user._id.toString()];
                        const capacityLimit = user.preferences?.capacityLimit || 100;
                        const loadRatio = load / capacityLimit;
                        
                        if (loadRatio < lowestLoad) {
                            lowestLoad = loadRatio;
                            assignedTo = user._id;
                        }
                    }
                    break;
                }

                case 'locationBased': {
                    const location = entityData.locCity || entityData.locArea || entityData.location;
                    if (!location) {
                        assignedTo = eligibleUsers[0]._id;
                        break;
                    }
                    const locationAgents = eligibleUsers.filter(u => u.territories && u.territories.includes(location));
                    if (locationAgents.length > 0) {
                        const updatedRule = await DistributionRule.findByIdAndUpdate(rule._id, { $inc: { lastAssignedIndex: 1 } }, { new: true });
                        assignedTo = locationAgents[updatedRule.lastAssignedIndex % locationAgents.length]._id;
                    } else {
                        assignedTo = eligibleUsers[0]._id;
                    }
                    break;
                }

                case 'scoreBased': {
                    const score = entityData.leadScore || 0;
                    let band = 'cold';
                    if (score >= 81) band = 'superHot';
                    else if (score >= 61) band = 'hot';
                    else if (score >= 31) band = 'warm';

                    const bandAgentIds = rule.assignmentTarget.weights?.get(band);
                    let bandAgents = eligibleUsers;
                    if (bandAgentIds && Array.isArray(bandAgentIds)) {
                        bandAgents = eligibleUsers.filter(u => bandAgentIds.includes(u._id.toString()));
                    }

                    if (bandAgents.length > 0) {
                        const updatedRule = await DistributionRule.findByIdAndUpdate(rule._id, { $inc: { lastAssignedIndex: 1 } }, { new: true });
                        assignedTo = bandAgents[updatedRule.lastAssignedIndex % bandAgents.length]._id;
                    } else {
                        assignedTo = eligibleUsers[0]._id;
                    }
                    break;
                }

                case 'sourceBased': {
                    const source = entityData.source;
                    const sourceAgentIds = rule.assignmentTarget.weights?.get(source);
                    let sourceAgents = eligibleUsers;
                    if (sourceAgentIds && Array.isArray(sourceAgentIds)) {
                        sourceAgents = eligibleUsers.filter(u => sourceAgentIds.includes(u._id.toString()));
                    }
                    
                    if (sourceAgents.length > 0) {
                        const updatedRule = await DistributionRule.findByIdAndUpdate(rule._id, { $inc: { lastAssignedIndex: 1 } }, { new: true });
                        assignedTo = sourceAgents[updatedRule.lastAssignedIndex % sourceAgents.length]._id;
                    } else {
                        assignedTo = eligibleUsers[0]._id;
                    }
                    break;
                }

                case 'skillBased': {
                    let bestScore = -1;
                    let selectedAgent = null;

                    for (const user of eligibleUsers) {
                        let score = 0;
                        const skills = user.skills || {};
                        
                        if (entityData.budget && skills.budgetRange) {
                            const budget = parseFloat(entityData.budget);
                            if (budget >= (skills.budgetRange.min || 0) && budget <= (skills.budgetRange.max || Infinity)) {
                                score += 3;
                            }
                        }
                        
                        if (entityData.propertyType && skills.propertyTypes) {
                            if (skills.propertyTypes.includes(entityData.propertyType)) {
                                score += 2;
                            }
                        }

                        if (score > bestScore) {
                            bestScore = score;
                            selectedAgent = user._id;
                        }
                    }
                    assignedTo = selectedAgent || eligibleUsers[0]._id;
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

        // Exhausted all rules, no one available
        if (!isRetry) {
            console.log(`[Distribution] ⏳ No eligible agents found across rules. Queuing entity ${entity._id}`);
            await distributionQueue.add('distribute', { entity, triggerEvent });
        }
        return null;
    } catch (error) {
        console.error(`[Distribution Error]:`, error);
        return null;
    }
};

/**
 * Helper to update the entity with the assignment and emit events
 */
const performAssignment = async (entity, assignedTo, ruleName) => {
    const updatePayload = {
        owner: assignedTo,
        'assignment.assignedTo': assignedTo,
        'assignment.assignedAt': new Date(),
        'assignment.ruleName': ruleName
    };

    let updatedDoc;
    let modelName;

    if (entity.constructor.modelName) {
        modelName = entity.constructor.modelName;
        updatedDoc = await entity.constructor.findByIdAndUpdate(
            entity._id, 
            { $set: updatePayload }, 
            { new: true } // Need to get the updated document to emit
        );
    } else if (entity._id) {
        modelName = 'Lead'; // Assuming Lead by default for raw objects
        const Lead = (await import('../../models/Lead.js')).default;
        updatedDoc = await Lead.findByIdAndUpdate(
            entity._id, 
            { $set: updatePayload }, 
            { new: true }
        );
    }

    // Emit event so the AutomationEngine can react (e.g. sequence triggers, webhook firing)
    if (updatedDoc) {
        const eventName = `${modelName.toUpperCase()}_UPDATED`;
        eventBus.emit(eventName, updatedDoc);
        console.log(`[Distribution] 📢 Emitted ${eventName} after assigning to ${assignedTo}`);
    }
};
