/**
 * AlertService
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized alert management with deduplication and cooldown.
 */
import crypto from 'crypto';
import OperationsAlert from '../../models/OperationsAlert.js';

/** Default cooldown period (5 minutes) to prevent alert storms */
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

class AlertService {

  /**
   * Create an alert with deduplication.
   */
  async createAlert({
    operationId, severity, category, title, message,
    errorCode, rootCause, recoveryAction, retryable, company
  }) {
    // Build deduplication key
    const deduplicationKey = `${operationId || 'global'}:${category}:${errorCode || 'none'}`;

    // Check for existing non-resolved alert with cooldown
    const existing = await OperationsAlert.findOne({
      deduplicationKey,
      resolved: false,
      cooldownUntil: { $gt: new Date() }
    });

    if (existing) return existing; // Deduplicated

    const alert = await OperationsAlert.create({
      alertId: crypto.randomUUID(),
      operationId, severity, category, title, message,
      errorCode, rootCause, recoveryAction, retryable,
      deduplicationKey,
      cooldownUntil: new Date(Date.now() + DEFAULT_COOLDOWN_MS),
      company
    });

    return alert;
  }

  /**
   * Acknowledge an alert.
   */
  async acknowledgeAlert(alertId, userId) {
    return OperationsAlert.findOneAndUpdate(
      { alertId, acknowledged: false },
      { $set: { acknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date() } },
      { new: true }
    );
  }

  /**
   * Resolve an alert.
   */
  async resolveAlert(alertId, userId) {
    return OperationsAlert.findOneAndUpdate(
      { alertId, resolved: false },
      { $set: { resolved: true, resolvedBy: userId, resolvedAt: new Date(), acknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date() } },
      { new: true }
    );
  }

  /**
   * List alerts with filters.
   */
  async getAlerts({ severity, acknowledged, resolved, page = 1, limit = 20, company } = {}) {
    const filter = {};
    if (severity) filter.severity = severity;
    if (acknowledged !== undefined) filter.acknowledged = acknowledged;
    if (resolved !== undefined) filter.resolved = resolved;
    if (company) filter.company = company;

    const skip = (page - 1) * limit;

    const [alerts, total] = await Promise.all([
      OperationsAlert.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('operationId', 'jobId operationType status')
        .populate('acknowledgedBy', 'fullName')
        .populate('resolvedBy', 'fullName')
        .lean(),
      OperationsAlert.countDocuments(filter)
    ]);

    return { alerts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Get alert summary counts by severity.
   */
  async getAlertSummary(company) {
    const filter = { resolved: false };
    if (company) filter.company = company;

    const [summary] = await OperationsAlert.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          info: { $sum: { $cond: [{ $eq: ['$severity', 'info'] }, 1, 0] } },
          warning: { $sum: { $cond: [{ $eq: ['$severity', 'warning'] }, 1, 0] } },
          error: { $sum: { $cond: [{ $eq: ['$severity', 'error'] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
          total: { $sum: 1 }
        }
      }
    ]);

    return summary || { info: 0, warning: 0, error: 0, critical: 0, total: 0 };
  }
}

export default new AlertService();
