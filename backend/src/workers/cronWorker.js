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
            .filter(l => ['closed won', 'closed lost', 'won', 'lost', 'dormant'].includes((l.lookup_value || '').toLowerCase()))
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

}, workerOptions);

cronWorker.on('failed', (job, err) => {
    console.error(`[Cron Worker] Job ${job?.name} failed: ${err.message}`);
});

// eslint-disable-next-line no-unused-vars
cronWorker.on('error', err => {
    // console.warn('⚠️ [Cron Worker] Redis Offline, suppressing crash...');
});

console.log('✅ Cron Worker Initialized');
