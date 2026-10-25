import { Queue } from '../config/redis.js';
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
export const distributionQueue = new Queue('distributionQueue', {
    ...queueOptions,
    defaultJobOptions: {
        attempts: 12,
        backoff: { type: 'exponential', delay: 1000 * 60 * 15 },
        removeOnComplete: true,
        removeOnFail: false
    }
});

/**
 * Phase D.1 — Domain Event Queue
 *
 * Receives OutboxEvent publication from OutboxPublisher.
 * Phase D: queue is defined and populated but has NO active consumer.
 * Phase E: TriggerEvaluationConsumer will be attached as the sole consumer.
 *
 * At-least-once delivery: attempts=5 with exponential backoff.
 * removeOnFail=false: retain failed jobs for inspection and debugging.
 * jobId deduplication: OutboxPublisher sets jobId=eventId (UUID v4).
 *
 * IMPORTANT: Do NOT add a WorkflowEngine or automation consumer in Phase D.
 * The existing WorkflowEngine.fireEvent('deals','deal_created',...) remains
 * the active execution path until the Phase E shadow-mode migration.
 */
export const domainEventQueue = new Queue('domain-event-queue', {
    ...queueOptions,
    defaultJobOptions: {
        attempts:         5,
        backoff:          { type: 'exponential', delay: 15000 },
        removeOnComplete: { count: 200 },
        removeOnFail:     false   // retain for debugging + Phase E consumer analysis
    }
});

// Prevent unhandled error crashes if Redis goes down
enrichmentQueue.on('error',    () => { });
notificationQueue.on('error',  () => { });
cronQueue.on('error',          () => { });
googleSyncQueue.on('error',    () => { });
marketingQueue.on('error',     (err) => {
    if (!err.message?.includes('ECONNREFUSED')) {
        console.warn('[MarketingQueue] Queue error:', err.message);
    }
});
distributionQueue.on('error',  () => { });
domainEventQueue.on('error',   (err) => {
    if (!err.message?.includes('ECONNREFUSED')) {
        console.warn('[DomainEventQueue] Queue error:', err.message);
    }
});

console.log('✅ BullMQ Queues Initialized (enrichment, notification, cron, googleSync, marketing, distribution, domain-event)');
