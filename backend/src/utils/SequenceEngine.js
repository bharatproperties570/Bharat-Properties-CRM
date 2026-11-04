import Sequence from '../../models/Sequence.js';
import SequenceEnrollment from '../../models/SequenceEnrollment.js';
import { evaluateCondition } from './ruleEngine.js';
import { WorkflowEngine } from './WorkflowEngine.js';
import { marketingQueue } from '../queues/marketingQueue.js';

export class SequenceEngine {
    static evaluateRuleGroup(entity, conditionGroup, defaultOnEmpty = false) {
        if (!conditionGroup || !conditionGroup.rules || conditionGroup.rules.length === 0) return defaultOnEmpty;
        const op = conditionGroup.operator || 'AND';
        if (op === 'AND') {
            return conditionGroup.rules.every(r => evaluateCondition(entity, r));
        } else {
            return conditionGroup.rules.some(r => evaluateCondition(entity, r));
        }
    }

    static async evaluateAutoEnrollment(entity, moduleName, companyId) {
        try {
            // Find all active sequences for this module
            const sequences = await Sequence.find({ isActive: true, 'targetAudience.module': moduleName, companyId });
            for (const seq of sequences) {
                // Check if enrolled already in active or paused state
                const existing = await SequenceEnrollment.findOne({
                    sequenceId: seq._id,
                    entityId: entity._id,
                    status: { $in: ['active', 'paused'] }
                });
                if (existing) continue; // Already enrolled

                // Evaluate target audience conditions (empty conditions matches all by default)
                const isMatch = this.evaluateRuleGroup(entity, seq.targetAudience?.conditions, true);
                if (isMatch) {
                    console.log(`[SequenceEngine] Auto-enrolling ${entity._id} into Sequence ${seq.name}`);
                    await this.enroll(seq, entity, moduleName, companyId);
                }
            }
        } catch (err) {
            console.error('[SequenceEngine] evaluateAutoEnrollment error:', err);
        }
    }

    static async enroll(sequence, entity, moduleName, companyId) {
        const entId = entity._id || entity.id;

        // Check if already actively or paused enrolled
        const existing = await SequenceEnrollment.findOne({
            sequenceId: sequence._id,
            entityId: entId,
            status: { $in: ['active', 'paused'] }
        });
        if (existing) {
            console.log(`[SequenceEngine] Entity ${entId} already actively enrolled in sequence ${sequence._id}.`);
            return { success: true, enrolled: false, alreadyEnrolled: true, enrollment: existing };
        }

        // Calculate delay for step 1
        const sortedSteps = [...(sequence.steps || [])].sort((a, b) => (a.stepNumber || 0) - (b.stepNumber || 0));
        const firstStep = sortedSteps[0];
        if (!firstStep) {
            return { success: false, reason: 'no_steps' };
        }

        let executeAt = new Date();
        if (firstStep.delay && firstStep.delay.amount > 0) {
            executeAt = this.calculateNextExecutionTime(new Date(), firstStep.delay.amount, firstStep.delay.unit, sequence.businessHours);
        } else if (sequence.businessHours?.enabled) {
            executeAt = this.applyBusinessHours(executeAt, sequence.businessHours);
        }

        try {
            const enrollment = await SequenceEnrollment.create({
                sequenceId: sequence._id,
                entityId: entId,
                module: moduleName,
                companyId: companyId || entity.companyId || null,
                status: 'active',
                currentStepNumber: firstStep.stepNumber || 1,
                nextExecutionAt: executeAt
            });

            // Create Outbox Event for TimeTriggerExecutionRequested (Intent Record)
            try {
                const OutboxEvent = (await import('../../models/OutboxEvent.js')).default;
                const moduleToAggregate = { leads: 'Lead', deals: 'Deal', contacts: 'Contact', activities: 'Activity' };
                await OutboxEvent.create({
                    eventType: 'TimeTriggerExecutionRequested',
                    aggregateType: moduleToAggregate[moduleName] || 'Lead',
                    aggregateId: entId,
                    payload: {
                        sequenceId: sequence._id,
                        sequenceName: sequence.name,
                        enrollmentId: enrollment._id,
                        stepNumber: firstStep.stepNumber || 1,
                        scheduledFor: executeAt,
                        canonicalKey: `canonical-seq-${enrollment._id}-${firstStep.stepNumber || 1}`
                    },
                    tenantId: entity.tenantId || null,
                    status: 'PENDING',
                    availableAt: executeAt
                });
            } catch (outboxErr) {
                console.error('[SequenceEngine] OutboxEvent intent creation error:', outboxErr.message);
            }

            // Schedule the job via BullMQ
            try {
                if (marketingQueue) {
                    await marketingQueue.add('drip', {
                        enrollmentId: enrollment._id,
                        stepNumber: firstStep.stepNumber || 1
                    }, { delay: Math.max(0, executeAt.getTime() - Date.now()), jobId: `drip_${enrollment._id}_step_${firstStep.stepNumber || 1}` });
                } else {
                    console.warn('[SequenceEngine] marketingQueue is not initialized.');
                }
            } catch (qErr) {
                console.error('[SequenceEngine] Failed to add drip job to marketingQueue:', qErr.message);
            }

            return { success: true, enrolled: true, alreadyEnrolled: false, enrollment };
        } catch (err) {
            if (err.code === 11000) {
                console.log(`[SequenceEngine] Entity ${entId} already enrolled in sequence ${sequence._id} (duplicate key caught).`);
                const activeExisting = await SequenceEnrollment.findOne({
                    sequenceId: sequence._id,
                    entityId: entId,
                    status: { $in: ['active', 'paused'] }
                });
                return { success: true, enrolled: false, alreadyEnrolled: true, enrollment: activeExisting };
            } else {
                throw err;
            }
        }
    }

    static calculateNextExecutionTime(baseDate, amount, unit, businessHours) {
        const validBase = (baseDate instanceof Date && !isNaN(baseDate.getTime())) ? new Date(baseDate) : new Date();
        const nextTime = new Date(validBase);
        let amt = Number(amount);
        if (!Number.isFinite(amt) || amt < 0) {
            amt = 0;
        }

        const normalizedUnit = String(unit || 'days').toLowerCase().trim();
        switch (normalizedUnit) {
            case 'minute':
            case 'minutes':
            case 'min':
            case 'mins': {
                // Cap at 365 days of minutes
                const cappedMinutes = Math.min(amt, 365 * 24 * 60);
                nextTime.setMinutes(nextTime.getMinutes() + cappedMinutes);
                break;
            }
            case 'hour':
            case 'hourly':
            case 'hours':
            case 'hr':
            case 'hrs': {
                // Cap at 365 days of hours
                const cappedHours = Math.min(amt, 365 * 24);
                nextTime.setHours(nextTime.getHours() + cappedHours);
                break;
            }
            case 'day':
            case 'daily':
            case 'days':
            case 'd': {
                // Cap at 365 days
                const cappedDays = Math.min(amt, 365);
                nextTime.setDate(nextTime.getDate() + cappedDays);
                break;
            }
            case 'week':
            case 'weekly':
            case 'weeks':
            case 'w': {
                // Cap at 52 weeks
                const cappedWeeks = Math.min(amt, 52);
                nextTime.setDate(nextTime.getDate() + (cappedWeeks * 7));
                break;
            }
            case 'month':
            case 'monthly':
            case 'months':
            case 'm': {
                // Cap at 12 months
                const cappedMonths = Math.min(amt, 12);
                nextTime.setMonth(nextTime.getMonth() + cappedMonths);
                break;
            }
            default: {
                const cappedDays = Math.min(amt, 365);
                nextTime.setDate(nextTime.getDate() + cappedDays);
                break;
            }
        }

        if (businessHours && businessHours.enabled) {
            return this.applyBusinessHours(nextTime, businessHours);
        }
        return nextTime;
    }

    static applyBusinessHours(date, businessHours) {
        if (!businessHours || !businessHours.enabled) return date;

        const tz = businessHours.timezone || 'Asia/Kolkata';
        const days = businessHours.days || [1, 2, 3, 4, 5, 6]; // 0=Sun, 1=Mon... 6=Sat
        const [startH, startM] = (businessHours.startTime || '09:00').split(':').map(Number);
        const [endH, endM] = (businessHours.endTime || '18:00').split(':').map(Number);

        let cur = new Date(date);

        const getParts = (d) => {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                hour12: false,
                weekday: 'short',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric'
            });
            const parts = {};
            formatter.formatToParts(d).forEach(p => { parts[p.type] = p.value; });
            const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
            return {
                weekday: weekdayMap[parts.weekday],
                hour: parseInt(parts.hour, 10) === 24 ? 0 : parseInt(parts.hour, 10),
                minute: parseInt(parts.minute, 10)
            };
        };

        for (let i = 0; i < 14; i++) {
            const p = getParts(cur);
            const dayValid = days.includes(p.weekday);
            const currentMins = p.hour * 60 + p.minute;
            const startMins = startH * 60 + startM;
            const endMins = endH * 60 + endM;

            if (!dayValid) {
                cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
                const pNext = getParts(cur);
                const diffMins = startMins - (pNext.hour * 60 + pNext.minute);
                cur = new Date(cur.getTime() + diffMins * 60 * 1000);
                continue;
            }

            if (currentMins < startMins) {
                cur = new Date(cur.getTime() + (startMins - currentMins) * 60 * 1000);
                return cur;
            } else if (currentMins > endMins) {
                cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
                const pNext = getParts(cur);
                const diffMins = startMins - (pNext.hour * 60 + pNext.minute);
                cur = new Date(cur.getTime() + diffMins * 60 * 1000);
                continue;
            } else {
                return cur;
            }
        }
        return cur;
    }

    static async evaluateExitCriteria(entity, moduleName) {
        try {
            // Find all active enrollments for this entity
            const enrollments = await SequenceEnrollment.find({ entityId: entity._id, status: 'active' }).populate('sequenceId');
            for (const enrollment of enrollments) {
                const seq = enrollment.sequenceId;
                if (!seq || !seq.isActive) {
                    enrollment.status = 'paused';
                    await enrollment.save();
                    continue;
                }

                // Module-specific exit conditions
                if (enrollment.module === 'deals') {
                    const exitCond = seq.exitCriteria?.exitConditions || {};
                    if (exitCond.onStageNotOpen && entity.stage && String(entity.stage).toLowerCase() !== 'open') {
                        console.log(`[SequenceEngine] Deal stage '${entity.stage}' is no longer Open. Exiting sequence ${seq.name}`);
                        enrollment.status = 'exited';
                        enrollment.exitReason = `Deal stage changed to ${entity.stage}`;
                        await enrollment.save();
                        continue;
                    }
                    if (exitCond.onInactive && (entity.status === 'Inactive' || entity.status === 'Archived')) {
                        console.log(`[SequenceEngine] Deal marked ${entity.status}. Exiting sequence ${seq.name}`);
                        enrollment.status = 'exited';
                        enrollment.exitReason = `Deal marked ${entity.status}`;
                        await enrollment.save();
                        continue;
                    }
                }

                if (seq.exitCriteria?.conditions?.rules?.length > 0) {
                    const shouldExit = this.evaluateRuleGroup(entity, seq.exitCriteria.conditions, false);
                    if (shouldExit) {
                        console.log(`[SequenceEngine] Exit criteria met. Exiting sequence ${seq.name} for ${entity._id}`);
                        enrollment.status = 'exited';
                        enrollment.exitReason = 'Exit criteria met';
                        await enrollment.save();
                    }
                }
            }
        } catch (err) {
            console.error('[SequenceEngine] evaluateExitCriteria error:', err);
        }
    }

    static async executeNextStep(enrollmentId, stepNumber, options = {}) {
        const crypto = (await import('crypto')).default;
        const workerClaimToken = options.claimToken || crypto.randomUUID();
        const leaseDuration = options.leaseDurationMs || 120000;
        const leaseUntil = new Date(Date.now() + leaseDuration);

        // Atomic step claim: only one worker can own this step of the enrollment
        const enrollment = await SequenceEnrollment.findOneAndUpdate(
            {
                _id: enrollmentId,
                status: 'active',
                currentStepNumber: stepNumber,
                $or: [
                    { leaseUntil: { $exists: false } },
                    { leaseUntil: null },
                    { leaseUntil: { $lte: new Date() } },
                    { claimToken: workerClaimToken }
                ]
            },
            {
                $set: {
                    claimToken: workerClaimToken,
                    leaseUntil: leaseUntil
                }
            },
            { new: true }
        ).populate('sequenceId');

        if (!enrollment) {
            console.log(`[SequenceEngine] Could not claim enrollment ${enrollmentId} for step ${stepNumber}. Held by another worker or already progressed.`);
            return { success: false, reason: 'claim_unavailable' };
        }

        const sequence = enrollment.sequenceId;
        if (!sequence || !sequence.isActive) {
            enrollment.status = 'paused';
            enrollment.claimToken = null;
            enrollment.leaseUntil = null;
            await enrollment.save();
            return { success: false, reason: 'sequence_inactive' };
        }

        const step = (sequence.steps || []).find(s => s.stepNumber === stepNumber);
        if (!step) {
            // Sequence completed
            enrollment.status = 'completed';
            enrollment.claimToken = null;
            enrollment.leaseUntil = null;
            await enrollment.save();
            return { success: true, completed: true };
        }

        // We need the entity data to execute
        const mongoose = (await import('mongoose')).default;
        const modelMap = { leads: 'Lead', deals: 'Deal', contacts: 'Contact', activities: 'Activity', inventory: 'Inventory' };
        const Model = mongoose.model(modelMap[enrollment.module] || 'Lead');
        const entityData = await Model.findById(enrollment.entityId).lean();

        if (!entityData) {
            enrollment.status = 'failed';
            enrollment.exitReason = 'Entity deleted';
            enrollment.claimToken = null;
            enrollment.leaseUntil = null;
            await enrollment.save();
            return { success: false, reason: 'entity_deleted' };
        }

        // Evaluate exit criteria right before execution
        if (enrollment.module === 'deals') {
            const exitCond = sequence.exitCriteria?.exitConditions || {};
            if (exitCond.onStageNotOpen && entityData.stage && String(entityData.stage).toLowerCase() !== 'open') {
                enrollment.status = 'exited';
                enrollment.exitReason = `Deal stage is ${entityData.stage} (not Open)`;
                enrollment.claimToken = null;
                enrollment.leaseUntil = null;
                await enrollment.save();
                return { success: true, exited: true, reason: enrollment.exitReason };
            }
        }

        if (sequence.exitCriteria?.conditions?.rules?.length > 0 && this.evaluateRuleGroup(entityData, sequence.exitCriteria.conditions, false)) {
            enrollment.status = 'exited';
            enrollment.exitReason = 'Exit criteria met before step execution';
            enrollment.claimToken = null;
            enrollment.leaseUntil = null;
            await enrollment.save();
            return { success: true, exited: true, reason: enrollment.exitReason };
        }

        // Canonical claim on AutomationLog to guarantee idempotency across restarts & retries
        const canonicalKey = `canonical-seq-${enrollment._id}-${stepNumber}-${step.action?.type || 'action'}`;
        const AutomationLog = (await import('../../models/AutomationLog.js')).default;
        let autoClaimAcquired = false;

        try {
            await AutomationLog.create({
                ruleType: 'Sequence',
                ruleId: sequence._id,
                targetEntityId: entityData._id,
                targetModule: enrollment.module || 'general',
                status: 'pending',
                idempotencyKey: canonicalKey,
                claimToken: workerClaimToken,
                leaseUntil: leaseUntil,
                companyId: enrollment.companyId || entityData.companyId || null,
                tenantId: entityData.tenantId || null
            });
            autoClaimAcquired = true;
        } catch (claimErr) {
            if (claimErr.code === 11000) {
                const existingLog = await AutomationLog.findOne({ idempotencyKey: canonicalKey });
                const logDoc = existingLog?.lean ? await existingLog.lean() : existingLog;
                if (logDoc?.status === 'success') {
                    console.log(`[SequenceEngine] Step ${stepNumber} already executed with key ${canonicalKey}. Skipping duplicate side effect.`);
                } else if (logDoc?.status === 'pending' && logDoc.leaseUntil && new Date(logDoc.leaseUntil) > new Date()) {
                    console.log(`[SequenceEngine] Active claim held for key ${canonicalKey}. Skipping.`);
                    return { success: false, reason: 'held_by_another_worker' };
                } else {
                    // Retryable failure or expired lease
                    const updated = await AutomationLog.findOneAndUpdate(
                        {
                            idempotencyKey: canonicalKey,
                            $or: [
                                { status: 'failed', 'details.retryable': true },
                                { status: 'pending', leaseUntil: { $lte: new Date() } }
                            ]
                        },
                        { $set: { status: 'pending', claimToken: workerClaimToken, leaseUntil } },
                        { new: true }
                    );
                    if (updated) {
                        autoClaimAcquired = true;
                    } else {
                        console.log(`[SequenceEngine] Lost claim race for key ${canonicalKey}. Skipping.`);
                        return { success: false, reason: 'claim_race_lost' };
                    }
                }
            } else {
                throw claimErr;
            }
        }

        // Pre-dispatch lease check: ensure current worker still owns the lease before making external side effects
        const currentEnrollmentDoc = await SequenceEnrollment.findById(enrollment._id).lean();
        if (!currentEnrollmentDoc || currentEnrollmentDoc.claimToken !== workerClaimToken || (currentEnrollmentDoc.leaseUntil && new Date(currentEnrollmentDoc.leaseUntil) <= new Date())) {
            console.warn(`[SequenceEngine] Lease expired or superseded before dispatch for ${enrollment._id}. Aborting dispatch.`);
            return { success: false, reason: 'lease_expired' };
        }

        let actionStatus = 'success';
        let actionError = null;

        const triggerContext = {
            _id: sequence._id,
            name: sequence.name,
            module: enrollment.module
        };

        const execOptions = {
            idempotencyKey: canonicalKey,
            callerManagedClaim: true,
            canonicalClaimAcquired: autoClaimAcquired,
            claimToken: workerClaimToken,
            leaseUntil: leaseUntil
        };

        try {
            console.log(`[SequenceEngine] Executing step ${stepNumber} for ${entityData._id} in Sequence ${sequence.name}`);

            // 1. Fire Automated Action
            if (step.action?.type === 'fire_automated_action' || step.action?.automatedActionId) {
                await WorkflowEngine.executeAction(
                    {
                        type: 'fire_automated_action',
                        automatedActionId: step.action.automatedActionId
                    },
                    entityData,
                    triggerContext,
                    enrollment.companyId,
                    true,
                    execOptions
                );

            // 2. Direct Communication
            } else if (step.action?.type === 'send_communication' || step.action?.type === 'send_whatsapp' || step.action?.type === 'send_email') {
                const ch = step.action.channel || (step.action.type === 'send_whatsapp' ? 'whatsapp' : (step.action.type === 'send_email' ? 'email' : 'whatsapp'));
                await WorkflowEngine.executeAction(
                    {
                        type: 'send_communication',
                        channel: ch,
                        templateId: step.action.templateId
                    },
                    entityData,
                    triggerContext,
                    enrollment.companyId,
                    true,
                    execOptions
                );

            // 3. Auto Match Dispatch
            } else if (step.action?.type === 'auto_match_dispatch' || step.action?.type === 'Auto-Match Dispatch') {
                const autoActionFormat = {
                    actionType: 'auto_match_dispatch',
                    configuration: {
                        toggles: { whatsapp: true },
                        matchContext: 'drip_sequence'
                    }
                };
                await WorkflowEngine.executeAction(autoActionFormat, entityData, triggerContext, enrollment.companyId, true, execOptions);

            // 4. Update Field
            } else if (step.action?.type === 'update_field') {
                let mapping = step.action.data || {};
                if (typeof step.action.instruction === 'string' && step.action.instruction.includes('=')) {
                    const [k, v] = step.action.instruction.split('=').map(s => s.trim());
                    mapping[k] = v;
                }
                await WorkflowEngine.executeAction({
                    actionType: 'update_field',
                    fieldMapping: mapping
                }, entityData, triggerContext, enrollment.companyId, true, execOptions);

            // 5. Create Task
            } else if (step.action?.type === 'create_task') {
                if (autoClaimAcquired) {
                    const Activity = mongoose.model('Activity');
                    const moduleToEntityType = { leads: 'Lead', deals: 'Deal', contacts: 'Contact', activities: 'Activity' };
                    const taskSubject = step.action.instruction || step.action.data?.title || 'Sequence Follow-up Task';
                    await Activity.create({
                        companyId: enrollment.companyId,
                        type: 'Task',
                        subject: taskSubject,
                        entityType: moduleToEntityType[enrollment.module] || 'Lead',
                        entityId: enrollment.entityId,
                        referenceId: enrollment.entityId,
                        status: 'Pending',
                        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
                        assignedTo: entityData.assignedTo || entityData.assignment?.assignedTo,
                        tenantId: entityData.tenantId || null
                    });
                }

            // 6. Broadcast Deal (Omnichannel BNA)
            } else if (step.action?.type === 'broadcast_deal' || step.action?.type === 'deal_broadcast') {
                const autoActionFormat = {
                    type: 'broadcast_deal',
                    actionType: 'broadcast_deal',
                    audienceConfig: step.action.audienceConfig || {},
                    notificationConfig: step.action.notificationConfig || {},
                    configuration: step.action.configuration || {}
                };
                await WorkflowEngine.executeAction(autoActionFormat, entityData, triggerContext, enrollment.companyId, true, execOptions);
            }

        } catch (err) {
            console.error(`[SequenceEngine] Step execution failed:`, err);
            actionStatus = 'failed';
            actionError = err.message;
        }

        // Finalize AutomationLog
        if (autoClaimAcquired) {
            await AutomationLog.findOneAndUpdate(
                { idempotencyKey: canonicalKey, claimToken: workerClaimToken },
                {
                    $set: {
                        status: actionStatus,
                        executedAt: new Date(),
                        ...(actionError ? { error: actionError, details: { retryable: true } } : {})
                    }
                }
            );
        }

        // Determine next step
        const sortedSteps = [...(sequence.steps || [])].sort((a, b) => (a.stepNumber || 0) - (b.stepNumber || 0));
        const nextStep = sortedSteps.find(s => (s.stepNumber || 0) > stepNumber);

        let nextExecutionAt = null;
        if (nextStep) {
            let executeAt = new Date();
            if (nextStep.delay && nextStep.delay.amount > 0) {
                executeAt = this.calculateNextExecutionTime(new Date(), nextStep.delay.amount, nextStep.delay.unit, sequence.businessHours);
            } else if (sequence.businessHours?.enabled) {
                executeAt = this.applyBusinessHours(executeAt, sequence.businessHours);
            }
            nextExecutionAt = executeAt;
        }

        // Fencing check: Atomically update SequenceEnrollment verifying claimToken matches
        const finalUpdate = await SequenceEnrollment.findOneAndUpdate(
            {
                _id: enrollment._id,
                status: 'active',
                currentStepNumber: stepNumber,
                claimToken: workerClaimToken
            },
            {
                $push: {
                    executionLogs: {
                        stepId: step.stepId || step._id?.toString() || `step-${stepNumber}`,
                        stepNumber,
                        status: actionStatus,
                        executedAt: new Date(),
                        error: actionError,
                        actionType: step.action?.type
                    }
                },
                $set: {
                    claimToken: null,
                    leaseUntil: null,
                    ...(nextStep ? {
                        currentStepNumber: nextStep.stepNumber,
                        nextExecutionAt: nextExecutionAt
                    } : {
                        status: 'completed'
                    })
                }
            },
            { new: true }
        );

        if (!finalUpdate) {
            console.warn(`[SequenceEngine] Stale worker ${workerClaimToken} completion rejected: superseded for enrollment ${enrollment._id}`);
            return { success: false, reason: 'superseded' };
        }

        if (nextStep && nextExecutionAt) {
            // Create Outbox Event for next step
            try {
                const OutboxEvent = (await import('../../models/OutboxEvent.js')).default;
                const moduleToAggregate = { leads: 'Lead', deals: 'Deal', contacts: 'Contact', activities: 'Activity' };
                await OutboxEvent.create({
                    eventType: 'TimeTriggerExecutionRequested',
                    aggregateType: moduleToAggregate[enrollment.module] || 'Lead',
                    aggregateId: enrollment.entityId,
                    payload: {
                        sequenceId: sequence._id,
                        sequenceName: sequence.name,
                        enrollmentId: enrollment._id,
                        stepNumber: nextStep.stepNumber,
                        scheduledFor: nextExecutionAt,
                        canonicalKey: `canonical-seq-${enrollment._id}-${nextStep.stepNumber}`
                    },
                    tenantId: entityData.tenantId || null,
                    status: 'PENDING',
                    availableAt: nextExecutionAt
                });
            } catch (outboxErr) {
                console.error('[SequenceEngine] OutboxEvent intent creation error for next step:', outboxErr.message);
            }

            // Schedule via BullMQ
            try {
                if (marketingQueue) {
                    await marketingQueue.add('drip', {
                        enrollmentId: enrollment._id,
                        stepNumber: nextStep.stepNumber
                    }, { delay: Math.max(0, nextExecutionAt.getTime() - Date.now()), jobId: `drip_${enrollment._id}_step_${nextStep.stepNumber}` });
                }
            } catch (qErr) {
                console.error('[SequenceEngine] Failed to add next step to marketingQueue:', qErr.message);
            }
        }

        return { success: true, actionStatus, completed: !nextStep, enrollment: finalUpdate };
    }
}
