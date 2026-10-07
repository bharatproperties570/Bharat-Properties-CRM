import { Worker } from 'bullmq';
import { processDomainEvent } from '../../utils/ServerAuthorityProof.js';
import redisConnection from '../config/redis.js';

export const domainEventWorker = new Worker('domainEventQueue', processDomainEvent, { connection: redisConnection });

domainEventWorker.on('failed', async (job, err) => {
    console.error(`[DomainEventWorker] Job ${job?.id} failed with error ${err.message}`);
});

domainEventWorker.on('error', err => {});

console.log('✅ Domain Event Worker Initialized');
