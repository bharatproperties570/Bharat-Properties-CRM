/**
 * Operations Queue Definitions
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ queues for import and export background processing.
 */
import { Queue } from '../config/redis.js';
import redisConnection from '../config/redis.js';

const queueOptions = { connection: redisConnection };

export const importQueue = new Queue('importQueue', {
  ...queueOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 }
  }
});

export const exportQueue = new Queue('exportQueue', {
  ...queueOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 }
  }
});

// Prevent unhandled error crashes
importQueue.on('error', () => { });
exportQueue.on('error', () => { });

console.log('✅ Operations Queues Initialized (import, export)');
