/**
 * OperationsService
 * ─────────────────────────────────────────────────────────────────────────────
 * Central service for managing the lifecycle of all background operations.
 * Provides registration, state transitions, progress tracking, and event emission.
 */
import crypto from 'crypto';
import OperationsJob, { ALLOWED_TRANSITIONS } from '../../models/OperationsJob.js';
import OperationsEvent from '../../models/OperationsEvent.js';
import RealtimeHub from '../RealtimeHub.js';

/** Redis-backed debounce key prefix for progress updates */
const PROGRESS_DEBOUNCE_PREFIX = 'ops:progress:debounce:';
const PROGRESS_DEBOUNCE_MS = 2000;

let _redis = null;
async function getRedis() {
  if (!_redis) {
    const mod = await import('../../src/config/redis.js');
    _redis = mod.default;
  }
  return _redis;
}

class OperationsService {

  /**
   * Register a new operation in the system.
   * @returns {OperationsJob} The created operation
   */
  async registerOperation({
    operationType, category, channel, provider, queueName, bullJobId,
    sourceEntityType, sourceEntityId, parentJobId,
    initiatedBy, totalCount = 0, metadata, company, priority = 0
  }) {
    const jobId = crypto.randomUUID();

    const job = await OperationsJob.create({
      jobId, operationType, category, channel, provider, queueName, bullJobId,
      sourceEntityType, sourceEntityId, parentJobId,
      initiatedBy, priority, totalCount,
      pendingCount: totalCount,
      metadata, company
    });

    await this.emitEvent(job._id, 'OPERATION_CREATED', {
      actorType: initiatedBy ? 'user' : 'system',
      actor: initiatedBy,
      metadata: { operationType, category, channel, totalCount }
    });

    // Broadcast to connected clients
    RealtimeHub.broadcast('OPERATION_CREATED', {
      jobId, operationType, category, status: 'created', totalCount
    });

    return job;
  }

  /**
   * Atomically update operation status with transition validation.
   */
  async updateStatus(jobId, newStatus, { actor, actorType = 'system', metadata } = {}) {
    const job = await OperationsJob.findOne({ jobId });
    if (!job) throw new Error(`Operation ${jobId} not found`);

    if (!job.canTransitionTo(newStatus)) {
      throw new Error(
        `Invalid status transition: ${job.status} → ${newStatus} for operation ${jobId}`
      );
    }

    const updateFields = { status: newStatus };
    if (newStatus === 'queued') updateFields.queuedAt = new Date();
    if (newStatus === 'running' && !job.startedAt) updateFields.startedAt = new Date();
    if (['completed', 'failed', 'cancelled'].includes(newStatus)) {
      updateFields.completedAt = new Date();
      if (job.startedAt) {
        updateFields.durationMs = Date.now() - job.startedAt.getTime();
      }
    }

    // Atomic update with version check to prevent stale overwrites
    const updated = await OperationsJob.findOneAndUpdate(
      { jobId, operationVersion: job.operationVersion },
      { $set: updateFields, $inc: { operationVersion: 1 } },
      { new: true }
    );

    if (!updated) {
      throw new Error(`Concurrent modification detected for operation ${jobId}`);
    }

    await this.emitEvent(updated._id, `OPERATION_${newStatus.toUpperCase()}`, {
      actor, actorType,
      metadata: { previousStatus: job.status, newStatus, ...metadata }
    });

    RealtimeHub.broadcast('OPERATION_UPDATE', {
      jobId, status: newStatus, previousStatus: job.status
    });

    return updated;
  }

  /**
   * Update operation progress counters (debounced via Redis).
   */
  async updateProgress(jobId, {
    processedCount, successCount, failureCount, skippedCount, pendingCount,
    currentStage, progress, workerId
  } = {}) {
    // Debounce: skip if last update was < 2s ago
    try {
      const redis = await getRedis();
      if (redis && !redis.isMock) {
        const key = `${PROGRESS_DEBOUNCE_PREFIX}${jobId}`;
        const set = await redis.set(key, '1', 'NX', 'PX', PROGRESS_DEBOUNCE_MS);
        if (!set) return null; // Debounced
      }
    } catch (e) { /* Proceed without debounce */ }

    const updateFields = { lastProgressAt: new Date() };
    if (processedCount !== undefined) updateFields.processedCount = processedCount;
    if (successCount !== undefined)   updateFields.successCount = successCount;
    if (failureCount !== undefined)   updateFields.failureCount = failureCount;
    if (skippedCount !== undefined)   updateFields.skippedCount = skippedCount;
    if (pendingCount !== undefined)   updateFields.pendingCount = pendingCount;
    if (currentStage !== undefined)   updateFields.currentStage = currentStage;
    if (progress !== undefined)       updateFields.progress = Math.min(100, Math.max(0, progress));
    if (workerId !== undefined)       updateFields.workerId = workerId;

    const updated = await OperationsJob.findOneAndUpdate(
      { jobId },
      { $set: updateFields },
      { new: true }
    );

    if (updated) {
      RealtimeHub.broadcast('PROGRESS_UPDATE', {
        jobId,
        progress: updated.progress,
        processedCount: updated.processedCount,
        totalCount: updated.totalCount,
        successCount: updated.successCount,
        failureCount: updated.failureCount,
        currentStage: updated.currentStage,
        status: updated.status
      });
    }

    return updated;
  }

  /**
   * Mark an operation as completed.
   */
  async completeOperation(jobId, { result, actor } = {}) {
    const job = await this.updateStatus(jobId, 'completed', {
      actor, actorType: actor ? 'user' : 'system'
    });

    if (result) {
      await OperationsJob.updateOne({ jobId }, { $set: { result } });
    }

    return job;
  }

  /**
   * Mark an operation as failed with error details.
   */
  async failOperation(jobId, { errorCode, errorCategory, errorMessage, retryable, actor } = {}) {
    const updateFields = {};
    if (errorCode) updateFields.errorCode = errorCode;
    if (errorCategory) updateFields.errorCategory = errorCategory;
    if (errorMessage) updateFields.errorMessage = errorMessage;
    if (retryable !== undefined) updateFields.retryable = retryable;

    await OperationsJob.updateOne({ jobId }, { $set: updateFields });

    const job = await this.updateStatus(jobId, 'failed', {
      actor, actorType: actor ? 'user' : 'system',
      metadata: { errorCode, errorCategory, errorMessage, retryable }
    });

    // Auto-create alert for failures
    try {
      const { default: AlertService } = await import('./AlertService.js');
      await AlertService.createAlert({
        operationId: job._id,
        severity: errorCategory === 'AUTHENTICATION_ERROR' ? 'critical' : 'error',
        category: errorCategory || 'UNKNOWN',
        title: `Operation Failed: ${job.operationType}`,
        message: errorMessage || 'Unknown error',
        errorCode,
        rootCause: errorCategory,
        recoveryAction: retryable ? 'Retry the operation' : 'Review error details and take corrective action',
        retryable,
        company: job.company
      });
    } catch (e) {
      console.error('[OperationsService] Failed to create alert:', e.message);
    }

    return job;
  }

  /**
   * Pause a running operation.
   */
  async pauseOperation(jobId, actor) {
    return this.updateStatus(jobId, 'paused', { actor, actorType: 'user' });
  }

  /**
   * Resume a paused operation.
   */
  async resumeOperation(jobId, actor) {
    return this.updateStatus(jobId, 'running', { actor, actorType: 'user' });
  }

  /**
   * Cancel an operation.
   */
  async cancelOperation(jobId, actor) {
    return this.updateStatus(jobId, 'cancelled', { actor, actorType: 'user' });
  }

  /**
   * Retry a failed operation.
   */
  async retryOperation(jobId, actor) {
    const job = await OperationsJob.findOne({ jobId });
    if (!job) throw new Error(`Operation ${jobId} not found`);

    if (job.attemptCount >= job.maxAttempts) {
      throw new Error(`Operation ${jobId} has exceeded maximum retry attempts (${job.maxAttempts})`);
    }

    await OperationsJob.updateOne({ jobId }, {
      $inc: { attemptCount: 1 },
      $set: { errorCode: null, errorCategory: null, errorMessage: null }
    });

    return this.updateStatus(jobId, 'retrying', { actor, actorType: 'user' });
  }

  /**
   * Get a single operation with its latest events.
   */
  async getOperation(jobId) {
    const job = await OperationsJob.findOne({ jobId })
      .populate('initiatedBy', 'fullName email')
      .lean();
    if (!job) return null;

    const recentEvents = await OperationsEvent.find({ operationId: job._id })
      .sort({ sequenceNumber: -1 })
      .limit(20)
      .populate('actor', 'fullName email')
      .lean();

    return { ...job, recentEvents };
  }

  /**
   * List operations with pagination and filters.
   */
  async listOperations({ status, category, channel, operationType, page = 1, limit = 20, sort = '-createdAt', company } = {}) {
    const filter = {};
    if (status) filter.status = Array.isArray(status) ? { $in: status } : status;
    if (category) filter.category = category;
    if (channel) filter.channel = channel;
    if (operationType) filter.operationType = operationType;
    if (company) filter.company = company;

    const skip = (page - 1) * limit;
    const sortObj = {};
    const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
    sortObj[sortField] = sort.startsWith('-') ? -1 : 1;

    const [operations, total] = await Promise.all([
      OperationsJob.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .populate('initiatedBy', 'fullName email')
        .lean(),
      OperationsJob.countDocuments(filter)
    ]);

    return {
      operations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * Get aggregate summary of operations.
   */
  async getOperationsSummary(company) {
    const filter = company ? { company } : {};

    const [summary] = await OperationsJob.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          active:    { $sum: { $cond: [{ $eq: ['$status', 'running'] }, 1, 0] } },
          queued:    { $sum: { $cond: [{ $in: ['$status', ['created', 'queued', 'initializing', 'validating']] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          failed:    { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          paused:    { $sum: { $cond: [{ $eq: ['$status', 'paused'] }, 1, 0] } },
          stalled:   { $sum: { $cond: [{ $in: ['$status', ['stalled', 'recovery_pending']] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          attention: { $sum: { $cond: [{ $in: ['$status', ['failed', 'stalled', 'blocked', 'recovery_pending']] }, 1, 0] } },
          total:     { $sum: 1 }
        }
      }
    ]);

    return summary || { active: 0, queued: 0, completed: 0, failed: 0, paused: 0, stalled: 0, cancelled: 0, attention: 0, total: 0 };
  }

  /**
   * Get currently active operations (running + queued).
   */
  async getActiveOperations(company) {
    const filter = {
      status: { $in: ['running', 'queued', 'initializing', 'retrying', 'paused', 'blocked'] }
    };
    if (company) filter.company = company;

    return OperationsJob.find(filter)
      .sort({ priority: -1, createdAt: 1 })
      .populate('initiatedBy', 'fullName email')
      .lean();
  }

  /**
   * Get paginated events for an operation.
   */
  async getEvents(operationId, { page = 1, limit = 50 } = {}) {
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      OperationsEvent.find({ operationId })
        .sort({ sequenceNumber: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actor', 'fullName email')
        .lean(),
      OperationsEvent.countDocuments({ operationId })
    ]);

    return {
      events,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * Emit an append-only operational event.
   */
  async emitEvent(operationId, eventType, {
    actor, actorType = 'system', stage, progressSnapshot, metadata, correlationId
  } = {}) {
    // Auto-increment sequence number per operation using Redis counter
    let sequenceNumber = 1;
    try {
      const redis = await getRedis();
      if (redis) {
        sequenceNumber = await redis.incr(`ops:seq:${operationId}`);
      }
    } catch (e) {
      // Fallback: count existing events
      sequenceNumber = await OperationsEvent.countDocuments({ operationId }) + 1;
    }

    const event = await OperationsEvent.create({
      eventId: crypto.randomUUID(),
      operationId,
      eventType,
      sequenceNumber,
      actor,
      actorType,
      stage,
      progressSnapshot,
      sanitizedMetadata: metadata,
      correlationId
    });

    return event;
  }
}

export default new OperationsService();
