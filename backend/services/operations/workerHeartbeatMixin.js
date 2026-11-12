/**
 * workerHeartbeatMixin — Wraps existing BullMQ workers with heartbeat
 * reporting to the WorkerHealthService without modifying worker files.
 */
import WorkerHealthService from './WorkerHealthService.js';

const DEFAULT_HEARTBEAT_INTERVAL = 30_000; // 30 seconds

/**
 * Attaches heartbeat lifecycle hooks to an existing BullMQ Worker instance.
 * @param {import('bullmq').Worker} worker — The BullMQ Worker instance.
 * @param {object} opts
 * @param {string} opts.workerName — Unique name for this worker.
 * @param {string} opts.queue — Queue name the worker services.
 * @param {number} [opts.interval] — Heartbeat interval in ms.
 */
export function attachHeartbeat(worker, { workerName, queue, interval = DEFAULT_HEARTBEAT_INTERVAL }) {
  let heartbeatTimer = null;
  let registered = false;

  const start = async () => {
    if (registered) return;
    try {
      await WorkerHealthService.registerWorker(workerName, queue);
      registered = true;
    } catch (err) {
      console.error(`[HeartbeatMixin] Failed to register ${workerName}:`, err.message);
    }
    heartbeatTimer = setInterval(async () => {
      try {
        await WorkerHealthService.heartbeat(workerName);
      } catch (err) {
        // Non-fatal: log but do not crash the worker.
        console.warn(`[HeartbeatMixin] Heartbeat failed for ${workerName}:`, err.message);
      }
    }, interval);
  };

  const stop = async () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (registered) {
      try {
        await WorkerHealthService.deregisterWorker(workerName);
      } catch (err) {
        console.warn(`[HeartbeatMixin] Deregister failed for ${workerName}:`, err.message);
      }
      registered = false;
    }
  };

  // Hook into BullMQ worker events.
  worker.on('ready', () => start());

  worker.on('active', async (job) => {
    try {
      await WorkerHealthService.heartbeat(workerName, { currentJobId: job?.id });
    } catch (_) { /* non-fatal */ }
  });

  worker.on('completed', async (job) => {
    try {
      await WorkerHealthService.reportCompletion(workerName);
    } catch (_) { /* non-fatal */ }
  });

  worker.on('failed', async (job, err) => {
    try {
      await WorkerHealthService.reportFailure(workerName, err?.message);
    } catch (_) { /* non-fatal */ }
  });

  worker.on('closing', () => stop());
  worker.on('closed', () => stop());

  // If the worker is already running (no 'ready' event fired), start immediately.
  if (worker.isRunning && worker.isRunning()) {
    start();
  }

  return { start, stop };
}

export default { attachHeartbeat };
