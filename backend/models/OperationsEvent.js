/**
 * OperationsEvent Model
 * ─────────────────────────────────────────────────────────────────────────────
 * Append-only event log for operational lifecycle auditing.
 */
import mongoose from 'mongoose';

const EVENT_TYPES = [
  'OPERATION_CREATED', 'OPERATION_QUEUED', 'OPERATION_STARTED',
  'STAGE_STARTED', 'PROGRESS_UPDATED', 'RECIPIENT_PROCESSED',
  'RECORD_VALIDATED', 'RECORD_IMPORTED', 'RECORD_EXPORTED',
  'PROVIDER_ACCEPTED', 'DELIVERY_CONFIRMED',
  'OPERATION_PAUSED', 'OPERATION_RESUMED', 'RETRY_STARTED',
  'OPERATION_BLOCKED', 'OPERATION_FAILED', 'OPERATION_COMPLETED',
  'OPERATION_CANCELLED', 'WORKER_HEARTBEAT_MISSED', 'WORKER_RECOVERED',
  'ERROR_OCCURRED', 'OPERATOR_ACTION'
];

const operationsEventSchema = new mongoose.Schema({
  eventId:            { type: String, required: true, unique: true },
  operationId:        { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsJob', required: true, index: true },
  eventType:          { type: String, enum: EVENT_TYPES, required: true },
  timestamp:          { type: Date, default: Date.now, index: true },
  sequenceNumber:     { type: Number, required: true },
  actor:              { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorType:          { type: String, enum: ['user', 'system', 'worker'], default: 'system' },
  stage:              { type: String },
  progressSnapshot:   { type: mongoose.Schema.Types.Mixed },
  sanitizedMetadata:  { type: mongoose.Schema.Types.Mixed },
  correlationId:      { type: String },
  company:            { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, {
  timestamps: false,
  collection: 'operationsevents'
});

// Compound index for ordered event retrieval
operationsEventSchema.index({ operationId: 1, sequenceNumber: 1 });
// TTL: 90-day retention
operationsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export { EVENT_TYPES };
const OperationsEvent = mongoose.model('OperationsEvent', operationsEventSchema);
export default OperationsEvent;
