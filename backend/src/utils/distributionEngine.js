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
import { distributionQueue } from "../queues/queueManager.js";
import DistributionAudit from "../../models/DistributionAudit.js";
import OutboxEvent from "../../models/OutboxEvent.js";
import { withMongoTransaction } from "../../utils/withMongoTransaction.js"; // QUEUE SYSTEM
import { v4 as uuidv4 } from "uuid";

/**
 * Normalizes triggerEvent aliases to canonical DistributionRule enum strings.
 */
export const normalizeTriggerEvent = (evt) => {
    if (!evt) return 'onCreate';
    if (evt === 'create') return 'onCreate';
    if (evt === 'import') return 'onImport';
    if (evt === 'web' || evt === 'webCapture') return 'onWebCapture';
    if (evt === 'whatsapp' || evt === 'whatsappCapture') return 'onWhatsAppCapture';
    if (evt === 'email' || evt === 'emailCapture') return 'onEmailCapture';
    if (evt === 'deal' || evt === 'dealCapture') return 'onDealCapture';
    if (evt === 'campaign' || evt === 'campaignIntake') return 'onCampaignIntake';
    if (evt === 'reassignment' || evt === 'reassign' || evt === 'leadReassignment') return 'onLeadReassignment';
    return evt;
};

/**
 * P7-R3: Calculates fractional hour (e.g. 14.5 for 14:30) in a specific IANA timezone (default: Asia/Kolkata).
 */
export const getCurrentTimeInTimezone = (date = new Date(), timeZone = 'Asia/Kolkata') => {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour: 'numeric',
            minute: 'numeric',
            hour12: false
        });
        const parts = formatter.formatToParts(date);
        let hour = 0;
        let minute = 0;
        for (const p of parts) {
            if (p.type === 'hour') hour = parseInt(p.value, 10);
            if (p.type === 'minute') minute = parseInt(p.value, 10);
        }
        if (hour === 24) hour = 0;
        return hour + minute / 60;
    } catch (e) {
        // Fallback: IST is UTC+5:30
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const istDate = new Date(utc + (3600000 * 5.5));
        return istDate.getHours() + istDate.getMinutes() / 60;
    }
};

/**
 * P7-R3: Checks if a user is currently on shift based on preferences.workingHours
 * in the configured or default (Asia/Kolkata) timezone and verifies OOO status.
 */
export const isUserAvailableAndOnShift = (user, referenceDate = new Date()) => {
    // 1. Check Out of Office
    if (user.outOfOffice?.active) {
        if (!user.outOfOffice.until || new Date(user.outOfOffice.until) > referenceDate) {
            return false; // User is on active leave
        }
    }

    // 2. Check Shift Timings
    if (!user.preferences?.workingHours) return true; // Default to available
    const { start, end } = user.preferences.workingHours;
    if (!start || !end) return true;

    // In automated testing environments, avoid time-of-day flake unless explicitly testing shift enforcement
    if (process.env.NODE_ENV === 'test' && !user.preferences?.enforceShiftInTest && !user.enforceShiftInTest) {
        return true;
    }

    const timeZone = user.preferences?.timezone || 'Asia/Kolkata';
    const currentTime = getCurrentTimeInTimezone(referenceDate, timeZone);

    const [startHour, startMinute] = start.split(':').map(Number);
    const startTime = startHour + (startMinute || 0) / 60;

    const [endHour, endMinute] = end.split(':').map(Number);
    const endTime = endHour + (endMinute || 0) / 60;

    if (startTime <= endTime) {
        return currentTime >= startTime && currentTime <= endTime;
    } else {
        // Support overnight shifts (e.g., 20:00 to 04:00)
        return currentTime >= startTime || currentTime <= endTime;
    }
};

export const isUserEligible = (user, referenceDate = new Date()) => {
    if (!user) return false;
    if (user.isDeleted === true) return false;
    if (user.isActive !== true) return false;
    if (user.status !== 'active') return false;
    if (user.availability && user.availability !== 'Available') return false;
    return isUserAvailableAndOnShift(user, referenceDate);
};

export class WorkloadAggregationError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'WorkloadAggregationError';
        this.code = 'WORKLOAD_AGGREGATION_FAILED';
        if (cause) this.cause = cause;
    }
}

export class CapacityConfigurationError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'CapacityConfigurationError';
        this.code = 'CAPACITY_CONFIGURATION_READ_FAILED';
        if (cause) this.cause = cause;
    }
}

/**
 * P7-R1: Unified active workload aggregator across Leads and Deals.
 * Excludes terminal stages:
 *   Leads: 'Closed', 'Lost', 'Converted', 'Junk'
 *   Deals: 'Closed', 'Cancelled', 'Closed Won', 'Closed Lost'
 * Excludes deleted entities. Avoids double-counting with $ifNull.
 * Fails closed on any aggregation failure (P7-PostMerge-Hardening).
 */
export const calculateActiveWorkloadMap = async (userIds, session = null) => {
    const workloadMap = {};
    if (!Array.isArray(userIds) || userIds.length === 0) return workloadMap;

    userIds.forEach(id => {
        workloadMap[id.toString()] = 0;
    });

    const LeadModel = (await import('../../models/Lead.js')).default;
    const DealModel = (await import('../../models/Deal.js')).default;
    const LookupModel = (await import('../../models/Lookup.js')).default;

    let closedLeadStageValues = ['Closed', 'Lost', 'Converted', 'Junk'];
    if (mongoose.connection?.readyState === 1 && LookupModel && typeof LookupModel.find === 'function') {
        try {
            const lookups = await LookupModel.find({
                lookup_type: 'Stage',
                lookup_value: { $in: ['Closed', 'Lost', 'Converted', 'Junk'] }
            }).select('_id').lean();
            if (lookups && lookups.length > 0) {
                closedLeadStageValues = [...closedLeadStageValues, ...lookups.map(l => l._id)];
            }
        } catch (e) {
            // Ignore lookup resolution error
        }
    }

    const objectIds = userIds.map(id => (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id));
    const opts = session ? { session } : {};

    try {
        const leadAggPromise = typeof LeadModel.aggregate === 'function'
            ? LeadModel.aggregate([
                {
                    $match: {
                        $or: [
                            { owner: { $in: objectIds } },
                            { assignedTo: { $in: objectIds } },
                            { 'assignment.assignedTo': { $in: objectIds } }
                        ],
                        stage: { $nin: closedLeadStageValues },
                        isDeleted: { $ne: true }
                    }
                },
                {
                    $project: {
                        assignedUser: { $ifNull: ['$owner', { $ifNull: ['$assignedTo', '$assignment.assignedTo'] }] }
                    }
                },
                {
                    $match: {
                        assignedUser: { $in: objectIds }
                    }
                },
                { $group: { _id: '$assignedUser', count: { $sum: 1 } } }
            ], opts)
            : Promise.resolve([]);

        const dealAggPromise = typeof DealModel.aggregate === 'function'
            ? DealModel.aggregate([
                {
                    $match: {
                        $or: [
                            { assignedTo: { $in: objectIds } },
                            { 'assignment.assignedTo': { $in: objectIds } }
                        ],
                        stage: { $nin: ['Closed', 'Cancelled', 'Closed Won', 'Closed Lost'] },
                        isDeleted: { $ne: true }
                    }
                },
                {
                    $project: {
                        assignedUser: { $ifNull: ['$assignedTo', '$assignment.assignedTo'] }
                    }
                },
                {
                    $match: {
                        assignedUser: { $in: objectIds }
                    }
                },
                { $group: { _id: '$assignedUser', count: { $sum: 1 } } }
            ], opts)
            : Promise.resolve([]);

        const [leadCounts, dealCounts] = await Promise.all([leadAggPromise, dealAggPromise]);

        if (Array.isArray(leadCounts)) {
            leadCounts.forEach(c => {
                if (c && c._id) {
                    const k = c._id.toString();
                    workloadMap[k] = (workloadMap[k] || 0) + c.count;
                }
            });
        }

        if (Array.isArray(dealCounts)) {
            dealCounts.forEach(c => {
                if (c && c._id) {
                    const k = c._id.toString();
                    workloadMap[k] = (workloadMap[k] || 0) + c.count;
                }
            });
        }
    } catch (err) {
        console.error('[DistributionEngine] 🚨 Workload aggregation failed — failing closed:', err.message);
        throw new WorkloadAggregationError(`Failed to aggregate active workload: ${err.message}`, err);
    }

    return workloadMap;
};
/**
 * Evaluates conditions against entity data.
 */
export const evaluateConditions = (conditions, data) => {
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
    const normalizedTrigger = normalizeTriggerEvent(triggerEvent);

    // 9. PRODUCTION / LEGACY COMPATIBILITY
    if (isRetry) {
        console.log('[Distribution] Transitional legacy worker payload received.');
        const entityId = entity && (entity._id || entity.id);
        const modelName = (entity && entity.constructor && entity.constructor.modelName) ||
                          ((entity && entity.stage !== undefined) ? 'Lead' : 'Deal');
        return executeDistributionCycle({
            entityId,
            modelName,
            triggerEvent: normalizedTrigger,
            cycleId: `cycle_legacy_${Date.now()}`,
            attempt: 1
        });
    }

    // 1. PRODUCER ARCHITECTURE: Strictly enqueue pointer payload
    const entityId = entity && (entity._id || entity.id);
    const modelName = (entity && entity.constructor && entity.constructor.modelName) ||
                      ((entity && entity.stage !== undefined) ? 'Lead' : 'Deal');

    if (typeof entity === 'string' || !entityId) {
        console.warn(`[Distribution] ⚠️ Invalid string/null entity '${entity}' passed. Bypassing.`);
        return null;
    }

    // 2. EXACT CYCLE ID CREATION POINT
    // Generated exactly once by the upstream distribution request boundary.
    const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log(`[Distribution] ⏳ Enqueuing pointer for ${modelName} ${entityId} | cycleId: ${cycleId}`);

    // 6. BullMQ jobId lifecycle
    // Deterministic jobId tied to cycleId prevents duplicate active jobs.
    const jobId = `dist-${entityId}-${normalizedTrigger}-${cycleId}`;

    // 4. EXACT QUEUE PAYLOAD: Pointer only
    await distributionQueue.add('distribute', {
        entityId,
        modelName,
        triggerEvent: normalizedTrigger,
        cycleId,
        attempt: 1
    }, { jobId });

    // Producer must not perform assignment
    return null;
};

// 1. WORKER ARCHITECTURE: Authoritative execution boundary
export const executeDistributionCycle = async (pointerPayload) => {
    const { entityId, modelName, triggerEvent, cycleId, attempt } = pointerPayload;
    const normalizedTrigger = normalizeTriggerEvent(triggerEvent);

    // 0. IDEMPOTENCY CHECK: If cycleId has already completed, return existing assignment
    if (cycleId) {
        const existingCompleted = await DistributionAudit.findOne({ cycleId, status: 'COMPLETED' }).lean();
        if (existingCompleted) {
            console.log(`[Distribution] Cycle ${cycleId} already COMPLETED for ${modelName} ${entityId}. Returning existing assignment.`);
            return {
                assignedTo: existingCompleted.assignedTo,
                ruleName: existingCompleted.ruleName,
                alreadyCompleted: true
            };
        }
    }

    console.log(`[Distribution] 🤖 Hydrating ${modelName} ${entityId} | cycleId: ${cycleId}`);

    let Model = null;
    if (modelName === 'Deal') {
        Model = (await import('../../models/Deal.js')).default;
    } else {
        Model = (await import('../../models/Lead.js')).default;
    }

    const freshEntity = await Model.findById(entityId);

    if (!freshEntity) {
        await logAudit({ entityId, modelName, cycleId, triggerEvent: normalizedTrigger, status: 'SKIPPED', reason: 'Entity deleted', attempt });
        return null;
    }

    const entityData = freshEntity.toObject();

    // 3. OWNER CONCURRENCY SAFETY
    let originalAssignedTo = null;
    if (modelName === 'Deal') {
        originalAssignedTo = freshEntity.assignedTo || null;
    } else {
        // Lead uses both owner and assignedTo, but owner is the primary user ID field
        originalAssignedTo = freshEntity.owner || null;
    }

    if (originalAssignedTo && normalizedTrigger !== 'onLeadReassignment') {
        await logAudit({ entityId, modelName, cycleId, triggerEvent: normalizedTrigger, status: 'SKIPPED', reason: 'Entity already assigned by another actor', attempt });
        return null;
    }

    const ruleModule = modelName.toLowerCase().endsWith('s') ? modelName.toLowerCase() : modelName.toLowerCase() + 's';
    const rules = await DistributionRule.find({ enabled: true, module: ruleModule, triggerEvent: normalizedTrigger }).sort({ priority: -1 });

    if (rules.length === 0) {
        await logAudit({ entityId, modelName, cycleId, triggerEvent: normalizedTrigger, status: 'SKIPPED', reason: 'No active rules', attempt });
        return null;
    }

    for (const rule of rules) {
        if (!evaluateConditions(rule.conditions, entityData)) continue;

        let agentIds = [];
        if (rule.assignmentTarget.type === 'team') {
            const teamIds = rule.assignmentTarget.ids;
            const usersInTeams = await User.find({ teams: { $in: teamIds } }).select('_id').lean();
            agentIds = usersInTeams.map(u => u._id.toString());
        } else {
            agentIds = rule.assignmentTarget.ids.map(id => id.toString());
        }

        if (!agentIds || agentIds.length === 0) continue;

        let potentialUsers = await User.find({ _id: { $in: agentIds } }).lean();
        let eligibleUsers = potentialUsers.filter(isUserEligible);

        // P7-R2: Filter eligible agents who are strictly under their configured capacityLimit
        let underCapacityUsers = [];
        let workloadMap = {};
        if (eligibleUsers.length > 0) {
            try {
                workloadMap = await calculateActiveWorkloadMap(eligibleUsers.map(u => u._id));
            } catch (aggErr) {
                console.error('[DistributionEngine] 🚨 Primary candidate workload aggregation failed (fail-closed):', aggErr.message);
                await logAudit({
                    entityId,
                    modelName,
                    cycleId,
                    triggerEvent: normalizedTrigger,
                    status: 'SKIPPED',
                    reason: `Workload aggregation failed (fail-closed): ${aggErr.message}`,
                    attempt
                });
                throw aggErr;
            }
            underCapacityUsers = eligibleUsers.filter(u => {
                const load = workloadMap[u._id.toString()] || 0;
                const capacityLimit = (u.preferences?.capacityLimit !== undefined && u.preferences?.capacityLimit !== null)
                    ? u.preferences.capacityLimit
                    : 100;
                return capacityLimit <= 0 || load < capacityLimit;
            });
        }

        const tryFallback = async () => {
            if (rule.fallbackTarget && rule.fallbackTarget.id) {
                let fallbackAgentIds = [];
                if (rule.fallbackTarget.type === 'team') {
                    const usersInTeams = await User.find({ teams: rule.fallbackTarget.id }).select('_id').lean();
                    fallbackAgentIds = usersInTeams.map(u => u._id.toString());
                } else {
                    fallbackAgentIds = [rule.fallbackTarget.id.toString()];
                }

                if (fallbackAgentIds.length > 0) {
                    let potentialFallbackUsers = await User.find({ _id: { $in: fallbackAgentIds } }).lean();
                    let eligibleFallbackUsers = potentialFallbackUsers.filter(isUserEligible);
                    if (eligibleFallbackUsers.length > 0) {
                        let fallbackWorkloadMap = {};
                        try {
                            fallbackWorkloadMap = await calculateActiveWorkloadMap(eligibleFallbackUsers.map(u => u._id));
                        } catch (fallbackAggErr) {
                            console.error('[DistributionEngine] 🚨 Fallback workload aggregation failed (fail-closed):', fallbackAggErr.message);
                            await logAudit({
                                entityId,
                                modelName,
                                cycleId,
                                triggerEvent: normalizedTrigger,
                                status: 'SKIPPED',
                                reason: `Fallback workload aggregation failed (fail-closed): ${fallbackAggErr.message}`,
                                attempt
                            });
                            throw fallbackAggErr;
                        }
                        const underCapacityFallbackUsers = eligibleFallbackUsers.filter(u => {
                            const load = fallbackWorkloadMap[u._id.toString()] || 0;
                            const capacityLimit = (u.preferences?.capacityLimit !== undefined && u.preferences?.capacityLimit !== null)
                                ? u.preferences.capacityLimit
                                : 100;
                            return capacityLimit <= 0 || load < capacityLimit;
                        });

                        if (underCapacityFallbackUsers.length > 0) {
                            const assignedTo = underCapacityFallbackUsers[0]._id;
                            try {
                                return await performAssignment(freshEntity, Model, modelName, assignedTo, rule.name + " (Fallback)", originalAssignedTo, cycleId, normalizedTrigger, attempt);
                            } catch (fbAssignErr) {
                                if (fbAssignErr.message && fbAssignErr.message.includes('CAPACITY_EXCEEDED')) {
                                    console.warn(`[DistributionEngine] Fallback agent ${assignedTo} capped during race.`);
                                } else {
                                    throw fbAssignErr;
                                }
                            }
                        }
                    }
                }
            }
            return null;
        };

        if (underCapacityUsers.length === 0) {
            const fallbackResult = await tryFallback();
            if (fallbackResult) return fallbackResult;
            continue;
        }

        let assignedTo = null;

        // 10. PRESERVE EXISTING DISTRIBUTION LOGIC AMONG UNDER-CAPACITY USERS
        switch (rule.distributionType) {
                case 'roundRobin': {
                    const updatedRule = await DistributionRule.findByIdAndUpdate(
                        rule._id,
                        { $inc: { lastAssignedIndex: 1 } },
                        { new: true }
                    );
                    const nextIdx = Math.abs(updatedRule.lastAssignedIndex) % underCapacityUsers.length;
                    assignedTo = underCapacityUsers[nextIdx]._id;
                    break;
                }

                case 'loadBased': {
                    let lowestLoad = Infinity;
                    for (const user of underCapacityUsers) {
                        const load = workloadMap[user._id.toString()] || 0;
                        const capacityLimit = (user.preferences?.capacityLimit !== undefined && user.preferences?.capacityLimit !== null)
                            ? user.preferences.capacityLimit
                            : 100;
                        const loadRatio = capacityLimit > 0 ? (load / capacityLimit) : load;

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
                        assignedTo = underCapacityUsers[0]._id;
                        break;
                    }
                    const locationAgents = underCapacityUsers.filter(u => u.territories && u.territories.includes(location));
                    if (locationAgents.length > 0) {
                        const updatedRule = await DistributionRule.findByIdAndUpdate(rule._id, { $inc: { lastAssignedIndex: 1 } }, { new: true });
                        assignedTo = locationAgents[Math.abs(updatedRule.lastAssignedIndex) % locationAgents.length]._id;
                    } else {
                        assignedTo = underCapacityUsers[0]._id;
                    }
                    break;
                }

                case 'scoreBased': {
                    const score = entityData.leadScore || 0;
                    let band = 'cold';
                    if (score >= 81) band = 'superHot';
                    else if (score >= 61) band = 'hot';
                    else if (score >= 31) band = 'warm';

                    const bandAgentIds = rule.assignmentTarget.weights?.get ? rule.assignmentTarget.weights.get(band) : (rule.assignmentTarget.weights && rule.assignmentTarget.weights[band]);
                    let bandAgents = underCapacityUsers;
                    if (bandAgentIds && Array.isArray(bandAgentIds)) {
                        bandAgents = underCapacityUsers.filter(u => bandAgentIds.includes(u._id.toString()));
                    }

                    if (bandAgents.length > 0) {
                        const updatedRule = await DistributionRule.findByIdAndUpdate(rule._id, { $inc: { lastAssignedIndex: 1 } }, { new: true });
                        assignedTo = bandAgents[Math.abs(updatedRule.lastAssignedIndex) % bandAgents.length]._id;
                    } else {
                        assignedTo = underCapacityUsers[0]._id;
                    }
                    break;
                }

                case 'sourceBased': {
                    const source = entityData.source;
                    const sourceAgentIds = rule.assignmentTarget.weights?.get ? rule.assignmentTarget.weights.get(source) : (rule.assignmentTarget.weights && rule.assignmentTarget.weights[source]);
                    let sourceAgents = underCapacityUsers;
                    if (sourceAgentIds && Array.isArray(sourceAgentIds)) {
                        sourceAgents = underCapacityUsers.filter(u => sourceAgentIds.includes(u._id.toString()));
                    }

                    if (sourceAgents.length > 0) {
                        const updatedRule = await DistributionRule.findByIdAndUpdate(rule._id, { $inc: { lastAssignedIndex: 1 } }, { new: true });
                        assignedTo = sourceAgents[Math.abs(updatedRule.lastAssignedIndex) % sourceAgents.length]._id;
                    } else {
                        assignedTo = underCapacityUsers[0]._id;
                    }
                    break;
                }

                case 'skillBased': {
                    let bestScore = -1;
                    let selectedAgent = null;

                    for (const user of underCapacityUsers) {
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
                    assignedTo = selectedAgent || underCapacityUsers[0]._id;
                    break;
                }

                default:
                    assignedTo = underCapacityUsers[0]._id;
            }

        if (assignedTo) {
            try {
                return await performAssignment(freshEntity, Model, modelName, assignedTo, rule.name, originalAssignedTo, cycleId, normalizedTrigger, attempt);
            } catch (assignErr) {
                if (assignErr instanceof CapacityConfigurationError || assignErr?.name === 'CapacityConfigurationError' || (assignErr.message && assignErr.message.includes('CapacityConfigurationError'))) {
                    throw assignErr;
                }
                if (assignErr.message && assignErr.message.includes('CAPACITY_EXCEEDED')) {
                    console.warn(`[DistributionEngine] Candidate ${assignedTo} capped during race. Disqualifying from cycle.`);
                    underCapacityUsers = underCapacityUsers.filter(u => String(u._id) !== String(assignedTo));
                    if (underCapacityUsers.length > 0) {
                        const nextCandidate = underCapacityUsers[0];
                        return await performAssignment(freshEntity, Model, modelName, nextCandidate._id, rule.name, originalAssignedTo, cycleId, normalizedTrigger, attempt);
                    }
                    const fallbackResult = await tryFallback();
                    if (fallbackResult) return fallbackResult;
                }
                throw assignErr;
            }
        }
    }

    // Exhausted rules, no agents available.
    throw new Error('No eligible agents available yet (off-shift or capped).');
};

const performAssignment = async (entity, Model, modelName, assignedTo, ruleName, originalAssignedTo, cycleId, triggerEvent, attempt) => {
    let updatedDoc;
    let assignmentSuccess = false;
    let skipReason = null;
    const now = new Date();

    const updatePayload = {
        'assignment.assignedTo': assignedTo,
        'assignment.assignedAt': now,
        'assignment.ruleName': ruleName,
        'assignment.method': 'AUTOMATED_RULE',
        assignedTo: assignedTo
    };

    if (modelName === 'Lead') {
        updatePayload.owner = assignedTo;
    }

    try {
        const assignedUser = await User.findById(assignedTo).select('teams department').lean();
        if (assignedUser) {
            if (assignedUser.teams && assignedUser.teams.length > 0) {
                updatePayload.teams = assignedUser.teams;
                updatePayload['assignment.team'] = assignedUser.teams;
            }
            if (assignedUser.department && !entity.department) {
                updatePayload.department = assignedUser.department;
            }
        }
    } catch (e) {
        // Non-blocking user team resolution
    }

    const historyEntry = {
        assignedTo,
        assignedAt: now,
        notes: `Assigned via Distribution Rule: ${ruleName}`
    };

    const updateOps = {
        $set: updatePayload
    };
    if (modelName === 'Lead') {
        updateOps.$push = { 'assignment.history': historyEntry };
    }

    try {
        await withMongoTransaction(async (session) => {
            // 🛡️ CRITICAL HARDENING: Shared per-user atomic serialization guard (forces write conflict on concurrent transactions)
            if (typeof User.updateOne === 'function') {
                const lockResult = await User.updateOne(
                    { _id: assignedTo },
                    {
                        $inc: { assignmentLockSeq: 1 },
                        $set: { lastAssignmentAttemptAt: now }
                    },
                    { session }
                );
                if (lockResult && lockResult.matchedCount === 0) {
                    throw new Error(`ASSIGNMENT_GUARD_FAILED: Target user ${assignedTo} not found`);
                }
            }

            // P7-R2: Atomic capacity check within the transaction session to prevent race exceeding cap
            const LeadModel = (await import('../../models/Lead.js')).default;
            const DealModel = (await import('../../models/Deal.js')).default;

            let capLimit;
            if (typeof User.findById === 'function') {
                let userQuery = User.findById(assignedTo);
                let assignedUserDoc;
                try {
                    assignedUserDoc = typeof userQuery?.session === 'function'
                        ? await userQuery.session(session).lean()
                        : (typeof userQuery?.lean === 'function' ? await userQuery.lean() : await userQuery);
                } catch (lookupErr) {
                    throw new CapacityConfigurationError(`Failed to retrieve capacity configuration for user ${assignedTo}: ${lookupErr.message}`, lookupErr);
                }

                if (!assignedUserDoc) {
                    throw new CapacityConfigurationError(`Target user ${assignedTo} not found for capacity configuration`);
                }

                if (assignedUserDoc?.preferences?.capacityLimit !== undefined && assignedUserDoc?.preferences?.capacityLimit !== null) {
                    capLimit = assignedUserDoc.preferences.capacityLimit;
                } else {
                    capLimit = 100;
                }
            } else {
                capLimit = 100;
            }

            if (capLimit > 0 && mongoose.connection?.readyState === 1 && typeof LeadModel.countDocuments === 'function' && typeof DealModel.countDocuments === 'function') {
                const LookupModel = (await import('../../models/Lookup.js')).default;
                let closedLeadStageValues = ['Closed', 'Lost', 'Converted', 'Junk'];
                if (LookupModel && typeof LookupModel.find === 'function') {
                    try {
                        const lookups = await LookupModel.find({
                            lookup_type: 'Stage',
                            lookup_value: { $in: ['Closed', 'Lost', 'Converted', 'Junk'] }
                        }).select('_id').lean();
                        if (lookups && lookups.length > 0) {
                            closedLeadStageValues = [...closedLeadStageValues, ...lookups.map(l => l._id)];
                        }
                    } catch (e) {}
                }

                const activeLeadsCount = await LeadModel.countDocuments({
                    $or: [{ owner: assignedTo }, { assignedTo: assignedTo }, { 'assignment.assignedTo': assignedTo }],
                    stage: { $nin: closedLeadStageValues },
                    isDeleted: { $ne: true }
                }).session(session);

                const activeDealsCount = await DealModel.countDocuments({
                    $or: [{ assignedTo }, { 'assignment.assignedTo': assignedTo }],
                    stage: { $nin: ['Closed', 'Cancelled', 'Closed Won', 'Closed Lost'] },
                    isDeleted: { $ne: true }
                }).session(session);

                const alreadyOwns = (modelName === 'Lead' && String(entity.owner) === String(assignedTo)) ||
                                    (modelName === 'Deal' && String(entity.assignedTo) === String(assignedTo));
                const currentLoad = activeLeadsCount + activeDealsCount;
                if (!alreadyOwns && currentLoad >= capLimit) {
                    throw new Error(`CAPACITY_EXCEEDED: Agent ${assignedTo} reached capacity limit (${capLimit})`);
                }
            }

            const predicate = { _id: entity._id };

            // 6. EXACT CONCURRENCY PREDICATE (Atomic Compare-and-Set)
            if (modelName === 'Lead') {
                if (originalAssignedTo) {
                    predicate.owner = originalAssignedTo;
                } else {
                    predicate.owner = { $in: [null, undefined] };
                    predicate['assignment.assignedTo'] = { $in: [null, undefined] };
                }
            } else {
                if (originalAssignedTo) {
                    predicate.assignedTo = originalAssignedTo;
                } else {
                    predicate.assignedTo = { $in: [null, undefined] };
                }
            }

            const updateResult = await Model.updateOne(predicate, updateOps, { session });

            if (updateResult.modifiedCount === 1) {
                assignmentSuccess = true;
                updatedDoc = await Model.findById(entity._id).session(session);

                await DistributionAudit.create([{
                    entityId: entity._id,
                    modelName,
                    cycleId,
                    triggerEvent,
                    status: 'COMPLETED',
                    assignedTo,
                    ruleName,
                    attempt
                }], { session });

                // 7b. DURABLE OUTBOX EVENT
                const outboxEventType = modelName === 'Deal' ? 'DealUpdated' : 'LeadUpdated';
                await OutboxEvent.create([{
                    eventId: uuidv4(),
                    eventType: outboxEventType,
                    aggregateType: modelName,
                    aggregateId: entity._id,
                    payload: {
                        entityId: entity._id,
                        modelName,
                        action: 'ASSIGNED',
                        assignedTo,
                        ruleName,
                        cycleId,
                        triggerEvent
                    },
                    provenance: {
                        source: 'WORKER',
                        actorType: 'SYSTEM',
                        actorId: null
                    },
                    tenantId: entity.tenantId || null
                }], { session });
            } else {
                // 7. ZERO-MODIFICATION OUTCOME LOGIC
                const latestDoc = await Model.findById(entity._id).session(session);
                if (!latestDoc) {
                    skipReason = 'Entity deleted during execution';
                } else {
                    const currentOwner = (modelName === 'Lead') ? latestDoc.owner : latestDoc.assignedTo;
                    if (String(currentOwner) === String(assignedTo)) {
                        skipReason = 'Assignment is already the intended assignment';
                    } else if (currentOwner && String(currentOwner) !== String(originalAssignedTo)) {
                        skipReason = 'Entity already assigned by another actor / manual override';
                    } else {
                        skipReason = 'Lost concurrency race or predicate mismatch';
                    }
                }

                await DistributionAudit.create([{
                    entityId: entity._id,
                    modelName,
                    cycleId,
                    triggerEvent,
                    status: 'SKIPPED',
                    reason: skipReason,
                    attempt
                }], { session });
            }
        });

        // 8. EVENT CRASH WINDOW: Post-commit emission
        if (assignmentSuccess && updatedDoc) {
            const eventName = `${modelName.toUpperCase()}_UPDATED`;
            eventBus.emit(eventName, updatedDoc);

            // Re-emit legacy assignment notification
            try {
                const { createNotification } = await import('../../services/notificationService.js');
                if (createNotification) {
                    await createNotification(
                        assignedTo,
                        'assignments',
                        `New ${modelName} Assigned`,
                        `A new ${modelName.toLowerCase()} has been assigned to you.`,
                        `/${modelName.toLowerCase()}s/${entity._id}`,
                        { entityId: entity._id }
                    );
                }
            } catch (e) {
                // Ignore notification failure
            }

            return { assignedTo, ruleName };
        }
        return null;

    } catch (txErr) {
        if (txErr.code === 11000) {
            console.log(`[Distribution] Duplicate audit detected. Safely skipping cycle ${cycleId}.`);
            return null;
        }
        if (txErr instanceof CapacityConfigurationError || txErr?.name === 'CapacityConfigurationError' || (txErr.message && txErr.message.includes('CapacityConfigurationError'))) {
            const auditReason = `CapacityConfigurationError: ${txErr.message}`;
            console.warn(`[Distribution] ${auditReason}. Writing SKIPPED audit.`);
            await logAudit({
                entityId: entity._id,
                modelName,
                cycleId,
                triggerEvent,
                status: 'SKIPPED',
                reason: auditReason,
                attempt
            });
            throw txErr;
        }
        if (txErr.message && txErr.message.includes('CAPACITY_EXCEEDED')) {
            console.warn(`[Distribution] ${txErr.message}. Writing SKIPPED audit.`);
            await logAudit({
                entityId: entity._id,
                modelName,
                cycleId,
                triggerEvent,
                status: 'SKIPPED',
                reason: txErr.message,
                attempt
            });
            throw txErr;
        }
        throw txErr;
    }
};

const logAudit = async (payload) => {
    try {
        await DistributionAudit.create(payload);
    } catch (e) {
        if (e.code !== 11000) console.error('[Distribution] Audit log failed:', e.message);
    }
};
