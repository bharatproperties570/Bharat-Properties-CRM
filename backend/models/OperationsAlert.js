/**
 * OperationsAlert Model
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized alert management with deduplication and cooldown.
 */
import mongoose from 'mongoose';

const SEVERITIES = ['info', 'warning', 'error', 'critical'];

const operationsAlertSchema = new mongoose.Schema({
  alertId:            { type: String, required: true, unique: true },
  operationId:        { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsJob' },
  severity:           { type: String, enum: SEVERITIES, required: true, index: true },
  category:           { type: String },
  title:              { type: String, required: true },
  message:            { type: String },
  errorCode:          { type: String },
  rootCause:          { type: String },
  recoveryAction:     { type: String },
  retryable:          { type: Boolean },
  acknowledged:       { type: Boolean, default: false, index: true },
  acknowledgedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acknowledgedAt:     { type: Date },
  resolved:           { type: Boolean, default: false, index: true },
  resolvedAt:         { type: Date },
  resolvedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deduplicationKey:   { type: String, index: true },
  cooldownUntil:      { type: Date },
  company:            { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
  createdAt:          { type: Date, default: Date.now, index: true }
}, {
  timestamps: false,
  collection: 'operationsalerts'
});

// TTL: 30-day retention for resolved alerts
operationsAlertSchema.index({ resolvedAt: 1 }, {
  expireAfterSeconds: 30 * 24 * 60 * 60,
  partialFilterExpression: { resolved: true }
});

export { SEVERITIES };
const OperationsAlert = mongoose.model('OperationsAlert', operationsAlertSchema);
export default OperationsAlert;
