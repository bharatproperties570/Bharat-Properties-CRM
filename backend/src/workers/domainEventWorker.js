import { Worker } from '../config/redis.js';
import redisConnection from '../config/redis.js';

export const processDomainEvent = async (job) => {
    const { eventId, eventType, aggregateType, aggregateId, payload, correlationId } = job.data;
    
    if (!eventId || !eventType || !aggregateType || !aggregateId || !payload) {
        throw new Error('Invalid event envelope payload');
    }

    console.log(`[DomainEventWorker] Processing ${eventType} for ${aggregateType} ${aggregateId} (eventId: ${eventId})`);

    switch (eventType) {
        case 'LeadCreated':
            // R55: Infrastructure only. Do not invoke LCE post-commit yet.
            console.log(`[DomainEventWorker] Valid LeadCreated event received. Implementation pending R56.`);
            break;

        case 'DealCreated':
            // R55: Infrastructure only. Do not invoke DCE post-commit yet.
            console.log(`[DomainEventWorker] Valid DealCreated event received. Implementation pending R56.`);
            break;

        default:
            throw new Error(`Unsupported eventType: ${eventType}`);
    }

    return { success: true };
};

export const domainEventWorker = new Worker('domainEventQueue', processDomainEvent, { connection: redisConnection });

domainEventWorker.on('failed', (job, err) => {
    console.error(`[DomainEventWorker] Job ${job?.id} failed with error ${err.message}`);
});

// eslint-disable-next-line no-unused-vars
domainEventWorker.on('error', err => {
    // console.warn('⚠️ [DomainEventWorker] Redis Offline, suppressing crash...');
});

console.log('✅ Domain Event Worker Initialized');
