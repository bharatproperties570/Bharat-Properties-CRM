import { Worker } from '../config/redis.js';
import redisConnection from '../config/redis.js';
import Lead from '../../models/Lead.js';
import Lookup from '../../models/Lookup.js';
import Activity from '../../models/Activity.js';
import AuditLog from '../../models/AuditLog.js';
import { notificationQueue } from '../queues/queueManager.js';
import { computeAndSave as computeScore } from '../services/LeadScoringService.js';
import SystemSetting from '../modules/systemSettings/system.model.js';

// Setup connection options
const workerOptions = { connection: redisConnection };

export const cronWorker = new Worker('cronQueue', async (job) => {
    console.log(`[Cron Worker] Executing scheduled job: ${job.name}`);

    if (job.name === 'dailyInactivityCheck') {
        // Fetch Ageing SLA config
        let agingRules = {
            activityGapDays: { value: 7 },
            prospectMaxDays: { value: 30 },
            opportunityMaxDays: { value: 21 },
            negotiationMaxDays: { value: 15 },
            bookedNoAgreementDays: { value: 10 }
        };
        try {
            const config = await SystemSetting.findOne({ key: 'agingRules' }).lean();
            if (config?.value) agingRules = { ...agingRules, ...config.value };
        } catch (err) {
            console.error(`[Cron Worker] Failed to fetch agingRules, using defaults:`, err.message);
        }

        // Fetch non-terminal stages to filter out closed/lost leads
        const lookups = await Lookup.find({ lookup_type: { $regex: /^stage$/i } }).lean();
        const closedStageIds = lookups
            .filter(l => {
                const val = (l.lookup_value || '').toLowerCase();
                return val.includes('closed') || val.includes('lost') || val.includes('won') || val.includes('dormant') || val.includes('unqualified') || val.includes('junk');
            })
            .map(l => l._id);

        // Fetch leads that are still open using an Enterprise-grade Cursor to prevent memory leaks
        const activeLeadsCursor = Lead.find({ stage: { $nin: closedStageIds } })
            .populate('stage', 'lookup_value')
            .cursor();

        const now = new Date();
        let updatedCount = 0;

        for await (const lead of activeLeadsCursor) {
            let penaltyToAdd = 0;
            const auditNotes = [];

            const lastActivityAt = new Date(lead.lastActivityAt || lead.createdAt);
            const stageChangedAt = new Date(lead.stageChangedAt || lead.createdAt);

            const daysSinceActivity = Math.floor((now - lastActivityAt) / (1000 * 60 * 60 * 24));
            const daysInStage = Math.floor((now - stageChangedAt) / (1000 * 60 * 60 * 24));

            const stageName = lead.stage ? (lead.stage.lookup_value || '').toLowerCase() : '';

            // A. Global Activity Gap Penalty
            if (daysSinceActivity > (agingRules.activityGapDays?.value || 7)) {
                penaltyToAdd += 5;
                auditNotes.push(`Inactive for ${daysSinceActivity} days`);
            }

            // B. Stage-wise SLA Enforcements (Risk Flags)
            if (stageName.includes('prospect') && daysInStage > (agingRules.prospectMaxDays?.value || 30)) {
                penaltyToAdd += 15;
                auditNotes.push(`Prospect SLA violated (> ${agingRules.prospectMaxDays?.value} days)`);
            }
            if (stageName.includes('opportunity') && daysInStage > (agingRules.opportunityMaxDays?.value || 21)) {
                penaltyToAdd += 20;
                auditNotes.push(`Opportunity SLA violated (> ${agingRules.opportunityMaxDays?.value} days)`);
            }
            if ((stageName.includes('negotiation') || stageName.includes('book')) && daysInStage > (agingRules.negotiationMaxDays?.value || 15)) {
                penaltyToAdd += 25;
                auditNotes.push(`Negotiation SLA violated (> ${agingRules.negotiationMaxDays?.value} days)`);
            }

            // C. Compliance Alert for Booked without Agreement
            if (stageName.includes('book') && daysInStage > (agingRules.bookedNoAgreementDays?.value || 10)) {
                if (lead.assignedTo) {
                    await notificationQueue.add('sendNotification', {
                        type: 'SYSTEM_NOTIFICATION',
                        userId: lead.assignedTo,
                        message: `Compliance Alert: Lead ${lead.firstName} stuck in Booked without Agreement for ${daysInStage} days.`,
                        metadata: { leadId: lead._id }
                    });
                }
            }

            if (penaltyToAdd > 0) {
                const prevDecay = lead.decay_score || 0;
                const newDecay = Math.min(prevDecay + penaltyToAdd, 50); // Cap penalty at 50

                if (newDecay > prevDecay) {
                    await Lead.findByIdAndUpdate(lead._id, { decay_score: newDecay });

                    // Recompute leadScore & dealHealthScore
                    try {
                        await computeScore(lead._id, { triggeredBy: 'cron_sla' });
                    } catch (err) {
                        console.error(`[Cron Worker] Scoring failed for ${lead._id}:`, err.message);
                    }

                    // Audit log for decay
                    await AuditLog.logEntityUpdate(
                        'score_changed',
                        'lead',
                        lead._id,
                        `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
                        null,
                        { before: prevDecay, after: newDecay },
                        `System Cron Ageing SLA: decay_score +${penaltyToAdd} (${auditNotes.join('; ')}). leadScore recalculated.`
                    );

                    updatedCount++;
                }
            }
        }

        console.log(`[Cron Worker] Applied SLA Ageing Rules and recomputed score for ${updatedCount} leads.`);
        return { SLAEnforced: updatedCount };
    }

    if (job.name === 'followUpReminders') {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Find pending activities due within the next 24 hours
        const pendingActivities = await Activity.find({
            status: { $regex: /pending|open|scheduled/i },
            dueDate: { $gte: now, $lte: tomorrow },
            assignedTo: { $ne: null }
        }).populate('assignedTo', 'email mobile');

        let remindersSent = 0;
        for (const activity of pendingActivities) {
            if (!activity.assignedTo) continue;

            const payload = {
                type: 'SYSTEM_NOTIFICATION',
                userId: activity.assignedTo._id,
                message: `Reminder: You have a ${activity.type} "${activity.subject}" due at ${activity.dueDate.toLocaleTimeString()}`,
                metadata: { activityId: activity._id }
            };

            await notificationQueue.add('sendNotification', payload);
            remindersSent++;
        }

        console.log(`[Cron Worker] Dispatched ${remindersSent} follow-up reminders.`);
        return { remindersDispatched: remindersSent };
    }
    if (job.name === 'enforceSLAReassignment') {
        console.log('[Cron Worker] Checking SLA violations for reassignment...');
        const DistributionRule = (await import('../../models/DistributionRule.js')).default;

        // Find rules that have reassignment enabled
        const reassignmentRules = await DistributionRule.find({
            enabled: true,
            'reassignmentPolicy.enabled': true
        }).lean();

        let escalatedCount = 0;
        const now = new Date();

        for (const rule of reassignmentRules) {
            const maxHours = rule.reassignmentPolicy.inactivityHours || 48;
            const cutoffDate = new Date(now.getTime() - maxHours * 60 * 60 * 1000);

            const SLA_Violators = await Lead.find({
                'assignment.ruleName': rule.name,
                'assignment.assignedAt': { $lt: cutoffDate },
                stage: { $nin: ['Closed', 'Lost', 'Converted', 'Junk'] }
            });

            for (const lead of SLA_Violators) {
                // [PHASE 5 FIX]: Skip SLA escalation if lead is currently active in a Marketing Sequence
                const SequenceEnrollment = (await import('../../models/SequenceEnrollment.js')).default;
                const activeSequence = await SequenceEnrollment.exists({ entityId: lead._id, status: 'active' });
                if (activeSequence) {
                    continue;
                }

                const lastActivity = lead.lastActivityAt || lead.createdAt;
                if (lastActivity < lead.assignment.assignedAt) {
                    let escalateTo = null;

                    // Fetch the current owner to determine their manager
                    if (lead.owner) {
                        const User = (await import('../../models/User.js')).default;
                        const currentOwner = await User.findById(lead.owner).select('reportingTo').lean();
                        if (currentOwner && currentOwner.reportingTo) {
                            escalateTo = currentOwner.reportingTo;
                        }
                    }

                    // Fallback to the rule's specified manager if the agent has no manager
                    if (!escalateTo) {
                        escalateTo = rule.reassignmentPolicy.escalateTo;
                    }

                    if (escalateTo) {
                        lead.owner = escalateTo;
                        lead.assignment = {
                            assignedTo: escalateTo,
                            assignedAt: new Date(),
                            ruleName: rule.name + " (Escalation)"
                        };
                        await lead.save();

                        await AuditLog.logEntityUpdate(
                            'reassigned', 'lead', lead._id, lead.firstName, null,
                            { assignedTo: escalateTo },
                            `SLA Breached (${maxHours}h inactivity). Escalated to manager.`
                        );


                        // [PHASE 5 FIX]: Removed manual eventBus.emit('LEAD_UPDATED', lead) here
                        // because lead.save() automatically triggers the Mongoose post-save hook which emits the event.


                        escalatedCount++;
                    }
                }
            }
        }
        console.log(`[Cron Worker] Enforced SLA Reassignments. Escalated ${escalatedCount} leads.`);
        return { escalatedCount };
    }

    if (job.name === 'evaluateTimeBasedTriggers') {
        console.log('[Cron Worker] Evaluating time-based triggers...');
        // [C5] Import required models for durable producer pattern
        const mongoose = (await import('mongoose')).default;
        const Trigger = (await import('../../models/Trigger.js')).default;
        const Deal = (await import('../../models/Deal.js')).default;
        const AutomationLog = (await import('../../models/AutomationLog.js')).default;
        const OutboxEvent = (await import('../../models/OutboxEvent.js')).default;

        // Fetch all active time-based triggers
        const activeTimeTriggers = await Trigger.find({
            isActive: true,
            event: { $in: ['lead_inactivity', 'deal_inactivity', 'activity_overdue'] }
        }).lean();

        // [C5] cronWorker is now a DURABLE PRODUCER. It does NOT execute actions directly.
        // Actions are executed by domainEventWorker via OutboxEvent.
        let enqueuedCount = 0;
        const now = new Date();

        // Identify terminal stages to exclude for leads
        const lookups = await Lookup.find({ lookup_type: { $regex: /^stage$/i } }).lean();
        const closedStageIds = lookups
            .filter(l => {
                const val = (l.lookup_value || '').toLowerCase();
                return val.includes('closed') || val.includes('lost') || val.includes('won') || val.includes('dormant') || val.includes('unqualified') || val.includes('junk');
            })
            .map(l => l._id);

        /**
         * [C5] Atomically acquire the execution lock and enqueue the durable OutboxEvent.
         *
         * Normal path (new entity):
         *   - AutomationLog.create({ status: 'pending' }) + OutboxEvent.create() in one Mongo transaction.
         *
         * R27-protected retry path (previously failed entity):
         *   - AutomationLog.findOneAndUpdate({ status: 'failed' → 'pending' }) + OutboxEvent.create() in one transaction.
         *
         * Skip path (status = 'success' or 'pending'):
         *   - Skip entirely. Do NOT replay. Do NOT create an OutboxEvent.
         *
         * @param {string} idempotencyKey
         * @param {ObjectId} triggerId
         * @param {ObjectId} entityId
         * @param {string} entityType    - 'leads' | 'deals' | 'activities'
         * @param {string} aggregateType - 'Lead' | 'Deal' | 'Activity'
         * @param {ObjectId} companyId
         * @returns {boolean} true if an OutboxEvent was successfully enqueued.
         */
        async function acquireAndEnqueue(idempotencyKey, triggerId, entityId, entityType, aggregateType, companyId) {
            const session = await mongoose.startSession();
            try {
                let enqueued = false;
                await session.withTransaction(async () => {
                    let isNewRecord = false;

                    const existingLog = await AutomationLog.findOne({ idempotencyKey }).session(session);

                    if (existingLog) {
                        if (existingLog.status === 'failed') {
                            await AutomationLog.updateOne(
                                { _id: existingLog._id },
                                { $set: { status: 'pending' } },
                                { session }
                            );
                            isNewRecord = false;
                        } else {
                            // 'success' or existing 'pending' — leave inert, abort transaction cleanly
                            const e = new Error('SKIP_INERT');
                            e.code = 'SKIP_INERT';
                            throw e;
                        }
                    } else {
                        await AutomationLog.create([{
                            ruleType: 'TimeBasedTrigger',
                            ruleId: triggerId,
                            targetEntityId: entityId,
                            targetModule: entityType,
                            status: 'pending',
                            idempotencyKey,
                            companyId
                        }], { session });
                        isNewRecord = true;
                    }

                    // AutomationLog is now 'pending' (new or reclaimed from 'failed').
                    // Create the OutboxEvent in the same session to guarantee atomicity.
                    await OutboxEvent.create([{
                        eventType: 'TimeTriggerExecutionRequested',
                        aggregateType,
                        aggregateId: entityId,
                        payload: {
                            triggerId,
                            entityType,
                            automationLogIdempotencyKey: idempotencyKey,
                            companyId
                        }
                    }], { session });

                    enqueued = true;
                    const logContext = isNewRecord ? 'new execution' : 'retry (reclaimed from failed)';
                    console.log(`[Cron Worker] [C5] Enqueued ${logContext} for trigger ${triggerId} entity ${entityId}`);
                });
                return enqueued;
            } catch (err) {
                if (err.code === 'SKIP_INERT') {
                    return false;
                }
                console.error(`[Cron Worker] [C5] Transaction failed for trigger ${triggerId} entity ${entityId}:`, err.message);
                return false;
            } finally {
                await session.endSession();
            }
        }

        for (const trigger of activeTimeTriggers) {
            const companyId = trigger.companyId;
            const daysThreshold = parseInt(trigger.conditions?.value) || 5;

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

            if (trigger.event === 'lead_inactivity') {
                const inactiveLeadsCursor = Lead.find({
                    stage: { $nin: closedStageIds },
                    lastActivityAt: { $lt: cutoffDate },
                    companyId: companyId
                }).cursor();

                for await (const lead of inactiveLeadsCursor) {
                    const idempotencyKey = `time-trigger-${trigger._id}-${lead._id}`;
                    const enqueued = await acquireAndEnqueue(idempotencyKey, trigger._id, lead._id, 'leads', 'Lead', companyId);
                    if (enqueued) enqueuedCount++;
                }
            } else if (trigger.event === 'deal_inactivity') {
                const inactiveDealsCursor = Deal.find({
                    stage: { $nin: ['Closed Won', 'Closed Lost', 'Lost', 'Won'] },
                    lastActivityAt: { $lt: cutoffDate },
                    companyId: companyId
                }).cursor();

                for await (const deal of inactiveDealsCursor) {
                    const idempotencyKey = `time-trigger-${trigger._id}-${deal._id}`;
                    const enqueued = await acquireAndEnqueue(idempotencyKey, trigger._id, deal._id, 'deals', 'Deal', companyId);
                    if (enqueued) enqueuedCount++;
                }
            } else if (trigger.event === 'activity_overdue') {
                const overdueActivitiesCursor = Activity.find({
                    status: { $regex: /pending|open|scheduled/i },
                    dueDate: { $lt: cutoffDate },
                    companyId: companyId
                }).cursor();

                for await (const activity of overdueActivitiesCursor) {
                    const idempotencyKey = `time-trigger-${trigger._id}-${activity._id}`;
                    const enqueued = await acquireAndEnqueue(idempotencyKey, trigger._id, activity._id, 'activities', 'Activity', companyId);
                    if (enqueued) enqueuedCount++;
                }
            }
        }

        console.log(`[Cron Worker] [C5] Evaluated Time-Based Triggers. Enqueued durable execution for ${enqueuedCount} entities.`);
        return { enqueuedCount };
    }

}, workerOptions);

cronWorker.on('failed', (job, err) => {
    console.error(`[Cron Worker] Job ${job?.name} failed: ${err.message}`);
});

// eslint-disable-next-line no-unused-vars
cronWorker.on('error', err => {
    // console.warn('⚠️ [Cron Worker] Redis Offline, suppressing crash...');
});

console.log('✅ Cron Worker Initialized');
