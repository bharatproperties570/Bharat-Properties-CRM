/**
 * Export Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ worker for processing export jobs in the background.
 */
import { Worker } from '../config/redis.js';
import redisConnection from '../config/redis.js';

const exportWorkerProcessor = async (job) => {
  const { exportJobId } = job.data;
  console.log(`[ExportWorker] Processing export job: ${exportJobId}`);

  try {
    const ExportService = (await import('../../services/operations/ExportService.js')).default;
    const result = await ExportService.executeExport(exportJobId);
    console.log(`[ExportWorker] Export ${exportJobId} completed:`, JSON.stringify(result));
    return result;
  } catch (err) {
    console.error(`[ExportWorker] Export ${exportJobId} failed:`, err.message);

    try {
      const OperationsService = (await import('../../services/operations/OperationsService.js')).default;
      const ExportJob = (await import('../../models/ExportJob.js')).default;
      const exportJob = await ExportJob.findOne({ jobId: exportJobId });
      if (exportJob) {
        const OpsJob = (await import('../../models/OperationsJob.js')).default;
        const op = await OpsJob.findById(exportJob.operationId, 'jobId').lean();
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

export const exportWorker = new Worker('exportQueue', exportWorkerProcessor, {
  connection: redisConnection,
  concurrency: 2,
  stalledInterval: 60000
});

exportWorker.on('completed', (job) => {
  console.log(`[ExportWorker] Job ${job.id} completed`);
});

exportWorker.on('failed', (job, err) => {
  console.error(`[ExportWorker] Job ${job?.id} failed:`, err.message);
});
