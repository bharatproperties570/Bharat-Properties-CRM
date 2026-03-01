import { Worker } from 'bullmq';
import redisConnection from '../config/redis.js';
import Lead from '../../models/Lead.js';
import Lookup from '../../models/Lookup.js';
import Activity from '../../models/Activity.js';
import AuditLog from '../../models/AuditLog.js';
import { notificationQueue } from '../queues/queueManager.js';

// Setup connection options
const workerOptions = { connection: redisConnection };

export const cronWorker = new Worker('cronQueue', async (job) => {
    console.log(`[Cron Worker] Executing scheduled job: ${job.name}`);

    if (job.name === 'dailyInactivityCheck') {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - 7); // 7 Days ago

        // Resolve Dormant Stage ID
        let dormantStageId = null;
        const dormantLookup = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: { $regex: /^Dormant$/i } });
        if (dormantLookup) dormantStageId = dormantLookup._id;

        // Find leads with no activity for 7 days, currently not Dormant
        const query = { lastActivityAt: { $lt: thresholdDate } };
        if (dormantStageId) query.stage = { $ne: dormantStageId };

        const leadsToDecay = await Lead.find(query);

        let updatedCount = 0;
        for (const lead of leadsToDecay) {
            // Apply Penalty (-10)
            const newScore = Math.max(0, (lead.intent_index || 0) - 10);

            lead.intent_index = newScore;

            // Shift classification if score plummeted
            if (newScore < 40) lead.lead_classification = 'Low Intent';

            // Shift Stage to Dormant
            if (dormantStageId) {
                lead.stage = dormantStageId;
            }

            await lead.save();

            // Track System Log for Decay
            await AuditLog.logEntityUpdate(
                'score_changed',
                'lead',
                lead._id,
                `${lead.firstName || ''} ${lead.lastName || ''}`,
                null,
                { before: lead.intent_index + 10, after: newScore },
                `System Cron penalization: Follow-up decayed due to 7 days inactivity.`
            );

            updatedCount++;
        }

        console.log(`[Cron Worker] Decayed intent score and shifted to Dormant for ${updatedCount} leads.`);
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

            // Dispatch to Notification Queue
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

cronWorker.on('error', err => {
    // console.warn('⚠️ [Cron Worker] Redis Offline, suppressing crash...');
});

console.log('✅ Cron Worker Initialized');
