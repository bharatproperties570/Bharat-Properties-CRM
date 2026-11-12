/**
 * Import Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ worker for processing import jobs in the background.
 */
import { Worker } from '../config/redis.js';
import redisConnection from '../config/redis.js';

const importWorkerProcessor = async (job) => {
  const { importJobId } = job.data;
  console.log(`[ImportWorker] Processing import job: ${importJobId}`);

  try {
    const ImportService = (await import('../../services/operations/ImportService.js')).default;
    const result = await ImportService.executeImport(importJobId);
    console.log(`[ImportWorker] Import ${importJobId} completed:`, JSON.stringify(result));
    return result;
  } catch (err) {
    console.error(`[ImportWorker] Import ${importJobId} failed:`, err.message);

    try {
      const OperationsService = (await import('../../services/operations/OperationsService.js')).default;
      const ImportJob = (await import('../../models/ImportJob.js')).default;
      const importJob = await ImportJob.findOne({ jobId: importJobId });
      if (importJob) {
        const OpsJob = (await import('../../models/OperationsJob.js')).default;
        const op = await OpsJob.findById(importJob.operationId, 'jobId').lean();
        if (op) {
          await OperationsService.failOperation(op.jobId, {
            errorCategory: 'WORKER_ERROR',
            errorMessage: err.message,
            retryable: true
          });
        }
      }
    } catch (e) { /* Best effort */ }

    throw err;
  }
};

export const importWorker = new Worker('importQueue', importWorkerProcessor, {
  connection: redisConnection,
  concurrency: 2,
  stalledInterval: 60000
});

importWorker.on('completed', (job) => {
  console.log(`[ImportWorker] Job ${job.id} completed`);
});

importWorker.on('failed', (job, err) => {
  console.error(`[ImportWorker] Job ${job?.id} failed:`, err.message);
});
