import { Worker } from 'bullmq';
import { processDomainEventJob } from './domainEventWorkerLogic.js';
import { AuthorityProofIssuer } from '../../utils/ServerAuthorityProof.js';
import redisConnection from '../config/redis.js';

export const domainEventWorker = new Worker('domainEventQueue', async (job) => {
    const capability = AuthorityProofIssuer.createDomainEventCapability(job);
    return await processDomainEventJob(job, capability);
}, { connection: redisConnection });

domainEventWorker.on('failed', async (job, err) => {
    console.error(`[DomainEventWorker] Job ${job?.id} failed with error ${err.message}`);
});

domainEventWorker.on('error', err => {});

console.log('✅ Domain Event Worker Initialized');
