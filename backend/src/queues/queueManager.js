import { Queue } from '../config/redis.js';
import redisConnection from '../config/redis.js';
import { marketingQueue } from './marketingQueue.js'; // Ensure authoritative declaration is used

// Setup queues with standard options
const queueOptions = { connection: redisConnection };

export const enrichmentQueue  = new Queue('enrichmentQueue', {
    ...queueOptions,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 }
    }
});

export const notificationQueue = new Queue('notificationQueue', {
    ...queueOptions,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 }
    }
});

export const cronQueue         = new Queue('cronQueue', {
    ...queueOptions,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 }
    }
});

export const googleSyncQueue   = new Queue('googleSyncQueue', {
    ...queueOptions,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 }
    }
});

export const distributionQueue = new Queue('distributionQueue', {
    ...queueOptions,
    defaultJobOptions: {
        attempts: 12,
        backoff: { type: 'exponential', delay: 1000 * 60 * 15 },
        removeOnComplete: true,
        removeOnFail: false
    }
});

export const domainEventQueue = new Queue('domainEventQueue', {
    ...queueOptions,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false
    }
});

// Re-export marketingQueue so other modules can import it from here if needed
export { marketingQueue };

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
distributionQueue.on('error', () => { });
domainEventQueue.on('error',  () => { });

console.log('✅ BullMQ Queues Initialized (enrichment, notification, cron, googleSync, marketing, distribution, domainEvent)');
