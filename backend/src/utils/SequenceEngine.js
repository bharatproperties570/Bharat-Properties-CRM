import Sequence from '../../models/Sequence.js';
import SequenceEnrollment from '../../models/SequenceEnrollment.js';
import { evaluateCondition } from './ruleEngine.js';
import { WorkflowEngine } from './WorkflowEngine.js';
import { marketingQueue } from '../queues/marketingQueue.js';

export class SequenceEngine {
    static evaluateRuleGroup(entity, conditionGroup) {
        if (!conditionGroup || !conditionGroup.rules || conditionGroup.rules.length === 0) return true;
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
                // Check if enrolled already
                const existing = await SequenceEnrollment.findOne({ sequenceId: seq._id, entityId: entity._id });
                if (existing) continue; // Already enrolled

                // Evaluate target audience conditions
                const isMatch = this.evaluateRuleGroup(entity, seq.targetAudience?.conditions);
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
        // Calculate delay for step 1
        const firstStep = sequence.steps.find(s => s.stepNumber === 1);
        if (!firstStep) return;

        let executeAt = new Date();
        if (firstStep.delay && firstStep.delay.amount > 0) {
            executeAt = this.calculateNextExecutionTime(new Date(), firstStep.delay.amount, firstStep.delay.unit, sequence.businessHours);
        } else if (sequence.businessHours?.enabled) {
            executeAt = this.applyBusinessHours(executeAt, sequence.businessHours);
        }

        try {
            const entId = entity._id || entity.id;
            const enrollment = await SequenceEnrollment.create({
                sequenceId: sequence._id,
                entityId: entId,
                module: moduleName,
                companyId,
                status: 'active',
                currentStepNumber: 1,
                nextExecutionAt: executeAt
            });

            // Schedule the job via BullMQ
            try {
                if (marketingQueue) {
                    await marketingQueue.add('drip', {
                        enrollmentId: enrollment._id,
                        stepNumber: 1
                    }, { delay: Math.max(0, executeAt.getTime() - Date.now()), jobId: `drip_${enrollment._id}_step_1` });
                } else {
                    console.warn('[SequenceEngine] marketingQueue is not initialized.');
                }
            } catch (qErr) {
                console.error('[SequenceEngine] Failed to add drip job to marketingQueue:', qErr.message);
            }
        } catch (err) {
            if (err.code === 11000) {
                console.log(`[SequenceEngine] Entity ${entity._id || entity.id} already enrolled in sequence ${sequence._id} (duplicate key ignored).`);
            } else {
                throw err;
            }
        }
    }

    static calculateNextExecutionTime(baseDate, amount, unit, businessHours) {
        const nextTime = new Date(baseDate);
        const amt = Number(amount) || 0;
        switch (unit) {
            case 'minutes':
                nextTime.setMinutes(nextTime.getMinutes() + amt);
                break;
            case 'hourly':
            case 'hours':
                nextTime.setHours(nextTime.getHours() + amt);
                break;
            case 'daily':
            case 'days':
                nextTime.setDate(nextTime.getDate() + amt);
                break;
            case 'weekly':
            case 'weeks':
                nextTime.setDate(nextTime.getDate() + (amt * 7));
                break;
            case 'monthly':
            case 'months':
                nextTime.setMonth(nextTime.getMonth() + amt);
                break;
            default:
                nextTime.setDate(nextTime.getDate() + amt);
                break;
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

                if (seq.exitCriteria && seq.exitCriteria.conditions) {
                    const shouldExit = this.evaluateRuleGroup(entity, seq.exitCriteria.conditions);
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

    static async executeNextStep(enrollmentId, stepNumber) {
        const enrollment = await SequenceEnrollment.findById(enrollmentId).populate('sequenceId');
        if (!enrollment || enrollment.status !== 'active') return;

        const sequence = enrollment.sequenceId;
        if (!sequence || !sequence.isActive) return;

        const step = sequence.steps.find(s => s.stepNumber === stepNumber);
        if (!step) {
            // Sequence completed
            enrollment.status = 'completed';
            await enrollment.save();
            return;
        }

        // We need the entity data to execute
        const mongoose = (await import('mongoose')).default;
        const modelMap = { leads: 'Lead', deals: 'Deal', contacts: 'Contact', activities: 'Activity', inventory: 'Inventory' };
        const Model = mongoose.model(modelMap[enrollment.module] || 'Lead');
        const entityData = await Model.findById(enrollment.entityId).lean();

        if (!entityData) {
            enrollment.status = 'failed';
            enrollment.exitReason = 'Entity deleted';
            await enrollment.save();
            return;
        }

        // Evaluate exit criteria right before execution
        if (enrollment.module === 'deals') {
            const exitCond = sequence.exitCriteria?.exitConditions || {};
            if (exitCond.onStageNotOpen && entityData.stage && String(entityData.stage).toLowerCase() !== 'open') {
                enrollment.status = 'exited';
                enrollment.exitReason = `Deal stage is ${entityData.stage} (not Open)`;
                await enrollment.save();
                return;
            }
        }

        if (sequence.exitCriteria?.conditions && this.evaluateRuleGroup(entityData, sequence.exitCriteria.conditions)) {
            enrollment.status = 'exited';
            enrollment.exitReason = 'Exit criteria met before step execution';
            await enrollment.save();
            return;
        }

        let actionStatus = 'success';
        let actionError = null;

        try {
            console.log(`[SequenceEngine] Executing step ${stepNumber} for ${entityData._id} in Sequence ${sequence.name}`);
            
            const triggerContext = {
                _id: sequence._id,
                name: sequence.name,
                module: enrollment.module
            };

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
                    { idempotencyKey: `seq_${enrollment._id}_step_${stepNumber}` }
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
                    true
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
                await WorkflowEngine.executeAction(autoActionFormat, entityData, triggerContext, enrollment.companyId, true);

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
                }, entityData, triggerContext, enrollment.companyId, true);

            // 5. Create Task
            } else if (step.action?.type === 'create_task') {
                const Activity = mongoose.model('Activity');
                await Activity.create({
                    companyId: enrollment.companyId,
                    type: 'task',
                    title: step.action.instruction || step.action.data?.title || 'Sequence Follow-up Task',
                    referenceModule: enrollment.module,
                    referenceId: enrollment.entityId,
                    status: 'pending',
                    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    assignedTo: entityData.assignedTo || entityData.assignment?.assignedTo
                });
            }

        } catch (err) {
            console.error(`[SequenceEngine] Step execution failed:`, err);
            actionStatus = 'failed';
            actionError = err.message;
        }

        // Log execution
        enrollment.executionLogs.push({
            stepId: step.stepId || step._id?.toString() || `step-${stepNumber}`,
            stepNumber,
            status: actionStatus,
            executedAt: new Date(),
            error: actionError,
            actionType: step.action.type
        });

        // Determine next step
        const nextStepNumber = stepNumber + 1;
        const nextStep = sequence.steps.find(s => s.stepNumber === nextStepNumber);

        if (nextStep) {
            enrollment.currentStepNumber = nextStepNumber;
            
            let executeAt = new Date();
            if (nextStep.delay && nextStep.delay.amount > 0) {
                executeAt = this.calculateNextExecutionTime(new Date(), nextStep.delay.amount, nextStep.delay.unit, sequence.businessHours);
            } else if (sequence.businessHours?.enabled) {
                executeAt = this.applyBusinessHours(executeAt, sequence.businessHours);
            }
            
            enrollment.nextExecutionAt = executeAt;
            await enrollment.save();

            // Enqueue next step
            try {
                if (marketingQueue) {
                    await marketingQueue.add('drip', {
                        enrollmentId: enrollment._id,
                        stepNumber: nextStepNumber
                    }, { delay: Math.max(0, executeAt.getTime() - Date.now()), jobId: `drip_${enrollment._id}_step_${nextStepNumber}` });
                } else {
                    console.warn('[SequenceEngine] marketingQueue not available for next step.');
                }
            } catch (qErr) {
                console.error('[SequenceEngine] Failed to add next step to marketingQueue:', qErr.message);
            }

        } else {
            // Sequence Finished
            enrollment.status = 'completed';
            await enrollment.save();
        }
    }
}
