import { Queue } from 'bullmq';
import redisConnection from '../config/redis.js';

// Setup queues with standard options
const queueOptions = { connection: redisConnection };

export const enrichmentQueue = new Queue('enrichmentQueue', queueOptions);
export const notificationQueue = new Queue('notificationQueue', queueOptions);
export const cronQueue = new Queue('cronQueue', queueOptions);

// Prevent unhandled error crashes if Redis goes down
enrichmentQueue.on('error', () => { });
notificationQueue.on('error', () => { });
cronQueue.on('error', () => { });

console.log('✅ BullMQ Queues Initialized');
