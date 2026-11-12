/**
 * WorkerHealthService
 * ─────────────────────────────────────────────────────────────────────────────
 * Monitors BullMQ worker health and queue metrics.
 */
import os from 'os';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import OperationsJob from '../../models/OperationsJob.js';

/** Threshold for considering a worker slow (60s) or stalled (120s) */
const SLOW_THRESHOLD_MS = 60_000;
const STALLED_THRESHOLD_MS = 120_000;

class WorkerHealthService {

  /**
   * Register or update a worker entry.
   */
  async registerWorker(workerId, { workerType, queueName, hostname, processId } = {}) {
    return WorkerHeartbeat.findOneAndUpdate(
      { workerId },
      {
        $set: {
          workerType,
          queueName,
          hostname: hostname || os.hostname(),
          processId: processId || process.pid,
          startedAt: new Date(),
          lastHeartbeatAt: new Date(),
          healthStatus: 'healthy'
        },
        $setOnInsert: { completedJobs: 0, failedJobs: 0 }
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Send a heartbeat ping from a worker.
   */
  async heartbeat(workerId, { currentJobId, currentOperationId, activeConcurrency } = {}) {
    const updateFields = { lastHeartbeatAt: new Date(), healthStatus: 'healthy' };
    if (currentJobId !== undefined) updateFields.currentJobId = currentJobId;
    if (currentOperationId !== undefined) updateFields.currentOperationId = currentOperationId;
    if (activeConcurrency !== undefined) updateFields.activeConcurrency = activeConcurrency;

    return WorkerHeartbeat.findOneAndUpdate(
      { workerId },
      { $set: updateFields },
      { new: true }
    );
  }

  /**
   * Report a completed job.
   */
  async reportCompletion(workerId) {
    return WorkerHeartbeat.findOneAndUpdate(
      { workerId },
      { $inc: { completedJobs: 1 }, $set: { currentJobId: null, currentOperationId: null } },
      { new: true }
    );
  }

  /**
   * Report a failed job.
   */
  async reportFailure(workerId) {
    return WorkerHeartbeat.findOneAndUpdate(
      { workerId },
      { $inc: { failedJobs: 1 }, $set: { currentJobId: null, currentOperationId: null } },
      { new: true }
    );
  }

  /**
   * Deregister a worker (graceful shutdown).
   */
  async deregisterWorker(workerId) {
    return WorkerHeartbeat.findOneAndUpdate(
      { workerId },
      { $set: { healthStatus: 'offline', currentJobId: null, currentOperationId: null } },
      { new: true }
    );
  }

  /**
   * Get health status for all registered workers.
   */
  async getWorkerHealth() {
    const workers = await WorkerHeartbeat.find().lean();
    const now = Date.now();

    return workers.map(w => ({
      ...w,
      healthStatus: this.classifyWorkerHealth(w, now),
      heartbeatAgeMs: now - (w.lastHeartbeatAt ? new Date(w.lastHeartbeatAt).getTime() : 0)
    }));
  }

  /**
   * Classify worker health based on heartbeat age.
   */
  classifyWorkerHealth(worker, now = Date.now()) {
    if (worker.healthStatus === 'shutting_down') return 'shutting_down';
    if (worker.healthStatus === 'offline') return 'offline';

    const age = now - (worker.lastHeartbeatAt ? new Date(worker.lastHeartbeatAt).getTime() : 0);
    if (age > STALLED_THRESHOLD_MS) return 'stalled';
    if (age > SLOW_THRESHOLD_MS) return 'slow';
    return 'healthy';
  }

  /**
   * Get health metrics for all BullMQ queues.
   */
  async getQueueHealth() {
    const queueNames = [
      'enrichmentQueue', 'notificationQueue', 'cronQueue',
      'googleSyncQueue', 'marketingQueue', 'distributionQueue',
      'domainEventQueue', 'automationQueue', 'baileysQueue',
      'intakeQueue', 'importQueue', 'exportQueue'
    ];

    const results = [];

    for (const name of queueNames) {
      try {
        const queue = await this._getQueue(name);
        if (!queue || typeof queue.getJobCounts !== 'function') {
          results.push({ name, status: 'unavailable', counts: {} });
          continue;
        }

        const counts = await queue.getJobCounts(
          'waiting', 'active', 'delayed', 'failed', 'completed', 'paused'
        );

        results.push({
          name,
          status: 'online',
          counts,
          isPaused: (counts.paused || 0) > 0
        });
      } catch (e) {
        results.push({ name, status: 'error', error: e.message, counts: {} });
      }
    }

    return results;
  }

  /**
   * Detect operations that may be stalled (no progress update for threshold).
   */
  async detectStalledOperations(thresholdMs = STALLED_THRESHOLD_MS) {
    const cutoff = new Date(Date.now() - thresholdMs);

    return OperationsJob.find({
      status: 'running',
      $or: [
        { lastProgressAt: { $lt: cutoff } },
        { lastProgressAt: null, startedAt: { $lt: cutoff } }
      ]
    }).lean();
  }

  /**
   * Resolve a queue instance by name (lazy loading to avoid circular deps).
   * @private
   */
  async _getQueue(name) {
    try {
      const qm = await import('../../src/queues/queueManager.js');
      if (qm[name]) return qm[name];

      // Check other queue locations
      if (name === 'automationQueue') {
        const { automationQueue } = await import('../automationQueue/automationQueue.js');
        return automationQueue;
      }
      if (name === 'intakeQueue') {
        const { intakeQueue } = await import('../intakeQueue/IntakeQueue.js');
        return intakeQueue;
      }
      if (name === 'importQueue' || name === 'exportQueue') {
        const opQueues = await import('../../src/queues/operationsQueue.js');
        return opQueues[name];
      }
    } catch (e) {
      return null;
    }
    return null;
  }
}

export default new WorkerHealthService();
