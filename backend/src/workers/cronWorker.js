import { Worker } from 'bullmq';
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
        // Fetch Dormant Threshold from System Settings (fallback to 7 days)
        let dormantThresholdDays = 7;
        try {
            const config = await SystemSetting.findOne({ key: 'scoringConfig' }).lean();
            if (config?.value?.decay?.dormantThresholdDays) {
                dormantThresholdDays = parseInt(config.value.decay.dormantThresholdDays);
            }
        } catch (err) {
            console.error(`[Cron Worker] Failed to fetch scoringConfig, using default 7 days:`, err.message);
        }

        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - dormantThresholdDays);

        // Resolve Dormant Stage ID
        let dormantStageId = null;
        const dormantLookup = await Lookup.findOne({ lookup_type: { $regex: /^stage$/i }, lookup_value: { $regex: /^Dormant$/i } });
        if (dormantLookup) dormantStageId = dormantLookup._id;

        // Find leads with no activity for the threshold period, currently not Dormant
        const query = { lastActivityAt: { $lt: thresholdDate } };
        if (dormantStageId) query.stage = { $ne: dormantStageId };

        const leadsToDecay = await Lead.find(query);

        let updatedCount = 0;
        for (const lead of leadsToDecay) {
            // ✅ FIX: Write penalty to decay_score (NOT intent_index)
            // LeadScoringService reads decay_score and factors it into leadScore.
            // intent_index belongs to enrichmentEngine only — do not touch it here.
            const prevDecay = lead.decay_score || 0;
            const newDecay = Math.min(prevDecay + 10, 50); // Cap at 50

            const updatePayload = { decay_score: newDecay };

            // Shift Stage to Dormant
            if (dormantStageId) {
                updatePayload.stage = dormantStageId;
                updatePayload.stageChangedAt = new Date();
            }

            await Lead.findByIdAndUpdate(lead._id, updatePayload);

            // ✅ FIX: Recompute leadScore via LeadScoringService (picks up decay_score correctly)
            try {
                await computeScore(lead._id, { triggeredBy: 'cron' });
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
                `System Cron: decay_score +10 (inactivity >${dormantThresholdDays} days). leadScore recalculated.`
            );

            updatedCount++;
        }

        console.log(`[Cron Worker] Updated decay_score and recomputed leadScore for ${updatedCount} leads.`);
        return { decayed: updatedCount };
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
