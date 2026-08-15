import { Worker } from 'bullmq';
import redisConnection from '../config/redis.js';
import { distributeEntity } from '../utils/distributionEngine.js';

export const distributionWorker = new Worker('distributionQueue', async (job) => {
    const { entity, triggerEvent } = job.data;
    console.log(`[Distribution Worker] Processing queued distribution for entity ${entity._id}`);
    
    // Pass true for isRetry flag to prevent infinite loops of re-queuing
    const result = await distributeEntity(entity, triggerEvent, true);
    
    if (!result) {
        throw new Error('No eligible agents available yet (off-shift or capped). Retrying...');
    }
    
    return result;
}, { connection: redisConnection });

distributionWorker.on('failed', (job, err) => {
    console.error(`[Distribution Worker] Job ${job.id} failed:`, err.message);
});
