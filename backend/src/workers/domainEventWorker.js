import { Worker } from 'bullmq';
import { processDomainEventJob } from './domainEventWorkerLogic.js';
import { acquireDomainEventIssuer } from '../../utils/ServerAuthorityProof.js';
import redisConnection from '../config/redis.js';

const issueDomainEventCapability = acquireDomainEventIssuer();

export const domainEventWorker = new Worker('domainEventQueue', async (job) => {
    if (!job || !job.data) throw new Error("SECURITY_VIOLATION: Invalid job provenance");
    const capability = issueDomainEventCapability(job.data);
    return await processDomainEventJob(job, capability);
}, { connection: redisConnection });

domainEventWorker.on('failed', async (job, err) => {
    console.error(`[DomainEventWorker] Job ${job?.id} failed with error ${err.message}`);
});

domainEventWorker.on('error', err => {});

console.log('✅ Domain Event Worker Initialized');
