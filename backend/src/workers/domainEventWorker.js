import { Worker } from 'bullmq';
import { processDomainEventJob } from './domainEventWorkerLogic.js';
import redisConnection from '../config/redis.js';

let issueDomainEventCapability = null;

export const setDomainEventIssuer = (issuer) => {
    if (issueDomainEventCapability) throw new Error("SECURITY_VIOLATION: DomainEvent capability issuer already bound");
    issueDomainEventCapability = issuer;
};

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
