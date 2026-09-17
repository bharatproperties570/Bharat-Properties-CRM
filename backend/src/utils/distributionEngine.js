/**
 * Distribution Engine - Backend Implementation
 * Handles automated assignment of Leads, Deals, and Activities based on Business Rules.
 */
import mongoose from "mongoose";
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
import { withMongoTransaction } from "../../utils/withMongoTransaction.js";
import AutomationLog from "../../models/AutomationLog.js";

export const distributeEntity = async (entity, triggerEvent, isRetry = false, pendingLogId = null) => {
    try {
        const moduleName = entity.constructor.modelName ? entity.constructor.modelName.toLowerCase() + 's' : 'leads';
        console.log(`[Distribution] 🤖 Orchestrating ${moduleName} for event: ${triggerEvent}`);

        const entityData = entity.toObject ? entity.toObject() : entity;

        // Idempotency / Duplicate assignment protection
        let EntityModel = entity.constructor;
        if (!EntityModel.modelName) {
            EntityModel = Lead;
        }
        const existingEntity = await EntityModel.findById(entity._id).select('owner').lean();
        if (existingEntity && existingEntity.owner) {
            console.log(`[Distribution] ⚠️ Entity ${entity._id} already has an owner. Bypassing distribution.`);
            return null;
        }

        // 1. Fetch active rules outside transaction to save lock time
        const rules = await DistributionRule.find({ 
            enabled: true, 
            module: moduleName, 
            triggerEvent 
        }).sort({ priority: -1 });

        if (rules.length === 0) {
            console.log(`[Distribution] ℹ️ No active rules for ${moduleName}/${triggerEvent}`);
            return null;
        }

        let assignedTo = null;
        let matchedRule = null;

        const result = await withMongoTransaction(async (session) => {
            // Re-verify it hasn't been assigned
            const recheck = await EntityModel.findById(entity._id).select('owner').session(session).lean();
            if (recheck && recheck.owner) {
                 return null;
            }

            for (const rule of rules) {
                if (!evaluateConditions(rule.conditions, entityData)) continue;

                console.log(`[Distribution] ✅ Matching Rule: "${rule.name}"`);

                let agentIds = [];
                if (rule.assignmentTarget.type === 'team') {
                    const teamIds = rule.assignmentTarget.ids;
                    const usersInTeams = await User.find({ teams: { $in: teamIds } }).select('_id').session(session).lean();
                    agentIds = usersInTeams.map(u => u._id.toString());
                } else {
                    agentIds = rule.assignmentTarget.ids.map(id => id.toString());
                }

                if (!agentIds || agentIds.length === 0) continue;

                let eligibleUsers = await User.find({ 
                    _id: { $in: agentIds }, 
                    status: 'Active', 
                    availability: 'Available' 
                }).session(session).lean();

                eligibleUsers = eligibleUsers.filter(isUserAvailableAndOnShift);

                if (eligibleUsers.length === 0) {
                    if (rule.fallbackTarget?.id) {
                        const fallbackId = rule.fallbackTarget.id;
                        const fallbackUser = await User.findById(fallbackId).session(session).lean();
                        if (fallbackUser && fallbackUser.availability === 'Available' && isUserAvailableAndOnShift(fallbackUser)) {
                            assignedTo = fallbackId;
                            rule.name = rule.name + " (Fallback)";
                            matchedRule = rule;
                            break;
                        }
                    }
                    continue; // try next rule
                }

                switch (rule.distributionType) {
                    case 'roundRobin':
                    case 'locationBased':
                    case 'scoreBased':
                    case 'sourceBased': {
                        // The index needs to be incremented only if an agent is selected.
                        let bandAgents = eligibleUsers;
                        
                        if (rule.distributionType === 'locationBased') {
                            const location = entityData.locCity || entityData.locArea || entityData.location;
                            if (location) bandAgents = eligibleUsers.filter(u => u.territories && u.territories.includes(location));
                        } else if (rule.distributionType === 'scoreBased') {
                            const score = entityData.leadScore || 0;
                            let band = 'cold';
                            if (score >= 81) band = 'superHot'; else if (score >= 61) band = 'hot'; else if (score >= 31) band = 'warm';
                            const bandAgentIds = rule.assignmentTarget.weights?.get(band);
                            if (bandAgentIds && Array.isArray(bandAgentIds)) bandAgents = eligibleUsers.filter(u => bandAgentIds.includes(u._id.toString()));
                        } else if (rule.distributionType === 'sourceBased') {
                            const source = entityData.source;
                            const sourceAgentIds = rule.assignmentTarget.weights?.get(source);
                            if (sourceAgentIds && Array.isArray(sourceAgentIds)) bandAgents = eligibleUsers.filter(u => sourceAgentIds.includes(u._id.toString()));
                        }

                        if (bandAgents.length > 0) {
                            const updatedRule = await DistributionRule.findByIdAndUpdate(
                                rule._id,
                                { $inc: { lastAssignedIndex: 1 } },
                                { new: true, session }
                            );
                            assignedTo = bandAgents[updatedRule.lastAssignedIndex % bandAgents.length]._id;
                        } else {
                            assignedTo = eligibleUsers[0]._id;
                        }
                        break;
                    }

                    case 'loadBased': {
                        const userIds = eligibleUsers.map(u => u._id);
                        const counts = await Lead.aggregate([
                            { $match: { $or: [{ owner: { $in: userIds } }, { 'assignment.assignedTo': { $in: userIds } }], stage: { $nin: ['Closed', 'Lost', 'Converted'] } } },
                            { $group: { _id: '$owner', count: { $sum: 1 } } }
                        ]).session(session);
                        
                        const workloadMap = {};
                        userIds.forEach(id => workloadMap[id.toString()] = 0);
                        counts.forEach(c => { if(c._id) workloadMap[c._id.toString()] = c.count; });
                        
                        let lowestLoad = Infinity;
                        for (const user of eligibleUsers) {
                            const load = workloadMap[user._id.toString()];
                            const capacityLimit = user.preferences?.capacityLimit || 100;
                            const loadRatio = load / capacityLimit;
                            if (loadRatio < lowestLoad) { lowestLoad = loadRatio; assignedTo = user._id; }
                        }
                        break;
                    }

                    case 'skillBased': {
                        let bestScore = -1;
                        for (const user of eligibleUsers) {
                            let score = 0;
                            const skills = user.skills || {};
                            if (entityData.budget && skills.budgetRange) {
                                const budget = parseFloat(entityData.budget);
                                if (budget >= (skills.budgetRange.min || 0) && budget <= (skills.budgetRange.max || Infinity)) score += 3;
                            }
                            if (entityData.propertyType && skills.propertyTypes) {
                                if (skills.propertyTypes.includes(entityData.propertyType)) score += 2;
                            }
                            if (score > bestScore) { bestScore = score; assignedTo = user._id; }
                        }
                        if (!assignedTo) assignedTo = eligibleUsers[0]._id;
                        break;
                    }
                    default:
                        assignedTo = eligibleUsers[0]._id;
                }

                if (assignedTo) {
                    matchedRule = rule;
                    break; // Break the rules loop, we found an assignee!
                }
            } // end rules loop

            if (assignedTo && matchedRule) {
                // 1. Assign owner
                const assignRes = await performAssignment(entity, assignedTo, matchedRule.name, session);
                if (!assignRes) {
                    // It was concurrently assigned (owner not null anymore)
                    return null;
                }
                
                // 2. Create durable event
                const idempotencyKey = `LeadDistribution:${entity._id}`;
                await AutomationLog.findOneAndUpdate(
                    { idempotencyKey },
                    {
                        $setOnInsert: {
                            ruleType: 'AutomatedAction',
                            ruleId: matchedRule._id,
                            targetEntityId: entity._id,
                            targetModule: 'LeadDistribution',
                            status: 'pending',
                            executedAt: new Date(),
                            idempotencyKey,
                            details: {
                                eventName: assignRes.eventName,
                                assignedTo,
                                ruleName: matchedRule.name
                            }
                        }
                    },
                    { upsert: true, new: true, session }
                );

                if (pendingLogId) {
                    await AutomationLog.findByIdAndUpdate(pendingLogId, { status: 'success' }, { session });
                }
                return { assignedTo, ruleName: matchedRule.name, eventName: assignRes.eventName, idempotencyKey };
            }
            
            return null; // Exhausted rules
        }); // End withMongoTransaction

        if (result && result.idempotencyKey) {
            console.log(`[Distribution] 🎯 Assigned to UserID: ${result.assignedTo} via "${result.ruleName}". Queueing durable event...`);
            await distributionQueue.add('process_durable_event', { 
                idempotencyKey: result.idempotencyKey 
            }, { 
                jobId: result.idempotencyKey,
                removeOnComplete: true 
            });
            return { assignedTo: result.assignedTo, ruleName: result.ruleName };
        } else if (!isRetry) {
            // No rules matched or all fell through
            console.log(`[Distribution] ⏳ No eligible agents found across rules. Queuing entity ${entity._id}`);
            await distributionQueue.add('distribute', { entity, triggerEvent });
        }
        
        return null;
    } catch (error) {
        console.error(`[Distribution Error]:`, error);
        return null;
    }
};

const performAssignment = async (entity, assignedTo, ruleName, session) => {
    const updatePayload = {
        owner: assignedTo,
        'assignment.assignedTo': assignedTo,
        'assignment.assignedAt': new Date(),
        'assignment.ruleName': ruleName
    };

    let updatedDoc;
    let EntityModel = entity.constructor;
    let modelName;

    if (!EntityModel.modelName) {
        modelName = 'Lead';
        EntityModel = (await import('../../models/Lead.js')).default;
    } else {
        modelName = EntityModel.modelName;
    }

    updatedDoc = await EntityModel.findOneAndUpdate(
        { _id: entity._id, owner: { $in: [null, undefined] } }, 
        { $set: updatePayload }, 
        { new: true, session }
    );

    if (updatedDoc) {
        const eventName = `${modelName.toUpperCase()}_UPDATED`;
        return { updatedDoc, eventName };
    }
    return null;
};
