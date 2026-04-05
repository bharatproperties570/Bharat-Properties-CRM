import { Queue } from 'bullmq';
import redisConnection from '../config/redis.js';

// Setup queues with standard options
const queueOptions = { connection: redisConnection };

export const enrichmentQueue  = new Queue('enrichmentQueue',  queueOptions);
export const notificationQueue = new Queue('notificationQueue', queueOptions);
export const cronQueue         = new Queue('cronQueue',         queueOptions);
export const googleSyncQueue   = new Queue('googleSyncQueue',   queueOptions);
export const marketingQueue    = new Queue('marketingQueue',    {
    ...queueOptions,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail:     { count: 200 },
    },
});

// Prevent unhandled error crashes if Redis goes down
enrichmentQueue.on('error',   () => { });
notificationQueue.on('error', () => { });
cronQueue.on('error',         () => { });
googleSyncQueue.on('error',   () => { });
marketingQueue.on('error',    (err) => {
    if (!err.message?.includes('ECONNREFUSED')) {
        console.warn('[MarketingQueue] Queue error:', err.message);
    }
});

console.log('✅ BullMQ Queues Initialized (enrichment, notification, cron, googleSync, marketing)');

