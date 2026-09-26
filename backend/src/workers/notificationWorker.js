import { Worker } from '../config/redis.js';
import redisConnection from '../config/redis.js';
import NotificationEngine from '../../services/NotificationEngine.js';
import { writeFailedJobLog } from '../utils/failedJobLogger.js';

const processNotificationJob = async (job) => {
    // Producer (cronWorker) payload: { type, userId, message, metadata }
    const { type, userId, message, metadata } = job.data;
    
    // Existing service signature: notify({ userId, type, title, message, link, metadata, priority })
    await NotificationEngine.notify({
        userId,
        type,
        title: 'System Alert', // Fallback title
        message,
        metadata
    });
};

export const notificationWorker = new Worker('notificationQueue', processNotificationJob, { connection: redisConnection });

notificationWorker.on('completed', (job) => {
    console.log(`[NotificationWorker] ✅ Job ${job.name} (${job.id}) completed successfully.`);
});

notificationWorker.on('failed', async (job, err) => {
    console.error(`[NotificationWorker] ❌ Job ${job?.name} (${job?.id}) failed (attempt ${job?.attemptsMade}):`, err.message);
    await writeFailedJobLog(job, err);
});

// Prevent unhandled error crashes if Redis goes down
notificationWorker.on('error', (err) => {
    // console.warn('⚠️ [NotificationWorker] Redis Offline, suppressing crash...');
});

console.log('✅ Notification Worker Initialized');
