import Sequence from '../../models/Sequence.js';
import SequenceEnrollment from '../../models/SequenceEnrollment.js';
import { evaluateCondition } from './ruleEngine.js';
import { WorkflowEngine } from './WorkflowEngine.js';
import { marketingQueue } from '../queues/marketingQueue.js';
import moment from 'moment-timezone';

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
            const enrollment = await SequenceEnrollment.create({
                sequenceId: sequence._id,
                entityId: entity._id,
                module: moduleName,
                companyId,
                status: 'active',
                currentStepNumber: 1,
                nextExecutionAt: executeAt
            });

            // Schedule the job via BullMQ
            await marketingQueue.add('drip', {
                enrollmentId: enrollment._id,
                stepNumber: 1
            }, { delay: Math.max(0, executeAt.getTime() - Date.now()), jobId: `drip_${enrollment._id}_step_1` });
        } catch (err) {
            if (err.code === 11000) {
                console.log(`[SequenceEngine] Entity ${entity._id} already enrolled in sequence ${sequence._id} (duplicate key ignored).`);
            } else {
                throw err;
            }
        }
    }

    static calculateNextExecutionTime(baseDate, amount, unit, businessHours) {
        let nextTime = moment(baseDate);
        nextTime.add(amount, unit);
        if (businessHours && businessHours.enabled) {
            return this.applyBusinessHours(nextTime.toDate(), businessHours);
        }
        return nextTime.toDate();
    }

    static applyBusinessHours(date, businessHours) {
        // If not enabled, return date
        let m = moment(date).tz(businessHours.timezone || 'Asia/Kolkata');
        
        const days = businessHours.days || [1,2,3,4,5,6]; // Mon-Sat
        const [startH, startM] = (businessHours.startTime || '09:00').split(':').map(Number);
        const [endH, endM] = (businessHours.endTime || '18:00').split(':').map(Number);

        // Advance to next valid day if current day is not in days array
        while (!days.includes(m.day())) {
            m.add(1, 'day');
            m.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
        }

        // Check time bounds
        const currentMins = m.hour() * 60 + m.minute();
        const startMins = startH * 60 + startM;
        const endMins = endH * 60 + endM;

        if (currentMins < startMins) {
            // Too early, set to start time today
            m.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
        } else if (currentMins > endMins) {
            // Too late, move to next valid day start time
            do {
                m.add(1, 'day');
            } while (!days.includes(m.day()));
            m.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
        }
        return m.toDate();
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
        const modelMap = { leads: 'Lead', deals: 'Deal', contacts: 'Contact' };
        const Model = mongoose.model(modelMap[enrollment.module] || 'Lead');
        const entityData = await Model.findById(enrollment.entityId).lean();

        if (!entityData) {
            enrollment.status = 'failed';
            enrollment.exitReason = 'Entity deleted';
            await enrollment.save();
            return;
        }

        // Evaluate exit criteria right before execution just in case
        if (sequence.exitCriteria?.conditions && this.evaluateRuleGroup(entityData, sequence.exitCriteria.conditions)) {
            enrollment.status = 'exited';
            enrollment.exitReason = 'Exit criteria met before step execution';
            await enrollment.save();
            return;
        }

        let actionStatus = 'success';
        let actionError = null;

        try {
            console.log(`[SequenceEngine] Executing step ${stepNumber} for ${entityData._id}`);
            // Adapt action for WorkflowEngine
            if (step.action.type === 'send_whatsapp' || step.action.type === 'send_email') {
                const autoActionFormat = {
                    actionType: 'send_communication',
                    config: {
                        channels: {
                            whatsapp: step.action.type === 'send_whatsapp',
                            email: step.action.type === 'send_email'
                        },
                        templates: {
                            whatsapp: step.action.type === 'send_whatsapp' ? step.action.templateId : null,
                            email: step.action.type === 'send_email' ? step.action.templateId : null
                        }
                    }
                };
                await WorkflowEngine.executeAction(autoActionFormat, entityData, { 
                    companyId: enrollment.companyId, 
                    idempotencyKey: `seq_${enrollment._id}_step_${stepNumber}` 
                });
            } else if (step.action.type === 'update_field') {
                await WorkflowEngine.executeAction({
                    actionType: 'update_field',
                    fieldMapping: step.action.data
                }, entityData, { companyId: enrollment.companyId, idempotencyKey: `seq_${enrollment._id}_step_${stepNumber}` });
            } else if (step.action.type === 'create_task') {
                // Manually create task via Activity model
                const Activity = mongoose.model('Activity');
                await Activity.create({
                    companyId: enrollment.companyId,
                    type: 'task',
                    title: step.action.data?.title || 'Sequence Task',
                    referenceModule: enrollment.module,
                    referenceId: enrollment.entityId,
                    status: 'pending',
                    dueDate: moment().add(1, 'day').toDate(),
                    assignedTo: entityData.assignment?.assignedTo
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
            await marketingQueue.add('drip', {
                enrollmentId: enrollment._id,
                stepNumber: nextStepNumber
            }, { delay: Math.max(0, executeAt.getTime() - Date.now()), jobId: `drip_${enrollment._id}_step_${nextStepNumber}` });

        } else {
            // Sequence Finished
            enrollment.status = 'completed';
            await enrollment.save();
        }
    }
}
