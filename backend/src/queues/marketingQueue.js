/**
 * marketingQueue.js
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ queue for all Marketing OS async jobs.
 *
 * Job types:
 *   'blast'       → Broadcast campaign (WhatsApp / Email / SMS)
 *   'drip'        → Drip sequence step for a single lead
 *   'social-post' → Generate & publish a social media post
 *   'ai-generate' → Background AI content generation (long-running)
 */

import { Queue } from 'bullmq';
import redisConnection from '../config/redis.js';

const queueOptions = {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,  // 5s → 25s → 125s
        },
        removeOnComplete: { count: 100 },  // Keep last 100 completed jobs
        removeOnFail: { count: 200 },      // Keep last 200 failed jobs for audit
    },
};

export const marketingQueue = new Queue('marketingQueue', queueOptions);

// Silence Redis disconnection errors (gateway degrades gracefully)
marketingQueue.on('error', (err) => {
    console.warn('[MarketingQueue] Queue error (Redis may be offline):', err.message);
});

console.log('✅ Marketing Queue Initialized');
