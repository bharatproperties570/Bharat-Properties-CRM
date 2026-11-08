process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';

import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import fs from 'node:fs';
import { processMarketingJob } from '../../src/workers/marketingWorker.js';
import whatsAppService from '../../services/WhatsAppService.js';

const mongoUri = process.env.CHILD_MONGO_URI;
const redisHost = process.env.CHILD_REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.CHILD_REDIS_PORT || '6379', 10);
const queueName = process.env.CHILD_QUEUE_NAME;
const dispatchLogPath = process.env.CHILD_DISPATCH_LOG;
const crashAtRecipient = parseInt(process.env.CHILD_CRASH_AT || '20', 10);

if (!mongoUri || !queueName || !dispatchLogPath) {
    console.error('[ChildWorker] Missing required environment variables');
    process.exit(2);
}

await mongoose.connect(mongoUri);

// Intercept whatsAppService.sendMessage
let dispatchedInChild = 0;
whatsAppService.sendMessage = async (mobile, message, options) => {
    dispatchedInChild++;
    fs.appendFileSync(dispatchLogPath, `${mobile}\n`);
    return { success: true, messageId: `child_msg_${mobile}_${Date.now()}` };
};

const worker = new Worker(queueName, async (job) => {
    const origUpdateProgress = job.updateProgress.bind(job);
    let progressCount = 0;
    job.updateProgress = async (percent) => {
        progressCount++;
        if (progressCount === crashAtRecipient) {
            console.log(`[ChildWorker] Reached recipient ${crashAtRecipient}. Abruptly terminating process via SIGKILL!`);
            // Abrupt termination via SIGKILL so no BullMQ lock renewal, cleanup, or exception catching can happen
            process.kill(process.pid, 'SIGKILL');
        }
        return await origUpdateProgress(percent);
    };

    return await processMarketingJob(job);
}, {
    connection: { host: redisHost, port: redisPort, maxRetriesPerRequest: null },
    lockDuration: 2500,    // 2.5 second lock
    stalledInterval: 1000, // check stalled every 1 second
    maxStalledCount: 3
});

worker.on('error', (err) => {
    console.error('[ChildWorker] Worker error:', err.message);
});

console.log(`[ChildWorker] Worker listening on queue: ${queueName}, will crash at recipient ${crashAtRecipient}`);
