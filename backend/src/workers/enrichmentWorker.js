import { Worker } from '../config/redis.js';
import redisConnection from '../config/redis.js';
import { runFullLeadEnrichment } from '../utils/enrichmentEngine.js';
import { AuthorityProofIssuer } from '../../utils/ServerAuthorityProof.js';

import { writeFailedJobLog } from '../utils/failedJobLogger.js';

const workerOptions = { connection: redisConnection };

export const enrichmentWorker = new Worker('enrichmentQueue', async (job) => {
    const { leadId, claimToken } = job.data;
    if (!leadId) throw new Error('leadId is required in enrichmentQueue job payload');
    if (!claimToken) throw new Error('claimToken is required in enrichmentQueue job payload');

    console.log(`[Enrichment Worker] Processing lead ${leadId}...`);

    let proof;
    try {
        proof = await AuthorityProofIssuer.resolveSystemProof(leadId, job.id, claimToken);
    } catch (e) {
        if (e.message.includes("SYSTEM_ENRICHMENT_NOT_ELIGIBLE") || e.message.includes("SYSTEM_ENRICHMENT_ALREADY_CLAIMED") || e.message.includes("SYSTEM_ENRICHMENT_TARGET_NOT_FOUND") || e.message.includes("SECURITY_VIOLATION")) {
            console.log(`[Enrichment Worker] Skipping lead ${leadId}: ${e.message}`);
            return { success: false, reason: e.message };
        }
        throw e;
    }

    const start = Date.now();
    try {
        const result = await runFullLeadEnrichment(leadId, { authorizationProof: proof });
        
        if (result && result.success === false) {
            await AuthorityProofIssuer.finalizeSystemProof(proof, false);
            return { success: false, reason: 'Enrichment engine returned failure' };
        }
        
        await AuthorityProofIssuer.finalizeSystemProof(proof, true);
        const duration = Date.now() - start;
        console.log(`[Enrichment Worker] Finished lead ${leadId} in ${duration}ms`);
        return { success: true, duration };
    } catch (err) {
        await AuthorityProofIssuer.finalizeSystemProof(proof, false);
        throw err;
    }
}, workerOptions);

enrichmentWorker.on('failed', async (job, err) => {
    console.error(`[Enrichment Worker] Job ${job?.id} failed with error ${err.message}`);
    await writeFailedJobLog(job, err);
});

enrichmentWorker.on('error', err => {});

console.log('✅ Enrichment Worker Initialized');
