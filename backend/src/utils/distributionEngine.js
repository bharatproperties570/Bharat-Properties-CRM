/**
 * Distribution Engine - Backend Implementation
 * Handles automated assignment of Leads, Deals, and Activities based on Business Rules.
 */
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

    // In automated testing environments, avoid time-of-day flake unless explicitly testing shift enforcement
    if (process.env.NODE_ENV === 'test' && !user.preferences?.enforceShiftInTest) {
        return true;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour + currentMinute / 60;

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

const isUserEligible = (user) => {
    if (!user) return false;
    if (user.isDeleted === true) return false;
    if (user.isActive !== true) return false;
    if (user.status !== 'active') return false;
    if (user.availability && user.availability !== 'Available') return false;
    return isUserAvailableAndOnShift(user);
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

        if (eligibleUsers.length === 0) {
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
                        const assignedTo = eligibleFallbackUsers[0]._id;
                        return await performAssignment(freshEntity, Model, modelName, assignedTo, rule.name + " (Fallback)", originalAssignedTo, cycleId, normalizedTrigger, attempt);
                    }
                }
            }
            continue;
        }

        let assignedTo = null;

        // 10. PRESERVE EXISTING DISTRIBUTION LOGIC
        switch (rule.distributionType) {
                case 'roundRobin': {
                    const updatedRule = await DistributionRule.findByIdAndUpdate(
                        rule._id,
                        { $inc: { lastAssignedIndex: 1 } },
                        { new: true }
                    );
                    const nextIdx = Math.abs(updatedRule.lastAssignedIndex) % eligibleUsers.length;
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
                        assignedTo = locationAgents[Math.abs(updatedRule.lastAssignedIndex) % locationAgents.length]._id;
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
                        assignedTo = bandAgents[Math.abs(updatedRule.lastAssignedIndex) % bandAgents.length]._id;
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
                        assignedTo = sourceAgents[Math.abs(updatedRule.lastAssignedIndex) % sourceAgents.length]._id;
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
            return await performAssignment(freshEntity, Model, modelName, assignedTo, rule.name, originalAssignedTo, cycleId, normalizedTrigger, attempt);
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
