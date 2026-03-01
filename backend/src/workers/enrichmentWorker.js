import { Worker } from 'bullmq';
import redisConnection from '../config/redis.js';
import { runFullLeadEnrichment } from '../utils/enrichmentEngine.js';

const workerOptions = { connection: redisConnection };

export const enrichmentWorker = new Worker('enrichmentQueue', async (job) => {
    const { leadId } = job.data;
    if (!leadId) throw new Error('leadId is required in enrichmentQueue job payload');

    console.log(`[Enrichment Worker] Processing lead ${leadId}...`);

    // Execute the intensive scoring/classification logic asynchronously
    const start = Date.now();
    await runFullLeadEnrichment(leadId);
    const duration = Date.now() - start;

    console.log(`[Enrichment Worker] Finished lead ${leadId} in ${duration}ms`);
    return { success: true, duration };
}, workerOptions);

enrichmentWorker.on('failed', (job, err) => {
    console.error(`[Enrichment Worker] Job ${job?.id} failed with error ${err.message}`);
});

enrichmentWorker.on('error', err => {
    // console.warn('⚠️ [Enrichment Worker] Redis Offline, suppressing crash...');
});

console.log('✅ Enrichment Worker Initialized');
