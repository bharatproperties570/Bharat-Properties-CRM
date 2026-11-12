/**
 * OperationsJob Model
 * ─────────────────────────────────────────────────────────────────────────────
 * Central tracking model for every background operation in the CRM.
 * Part of the Enterprise Operations Center infrastructure.
 */
import mongoose from 'mongoose';

const OPERATION_TYPES = [
  'broadcast_campaign', 'social_post', 'portal_listing',
  'contact_import', 'lead_import', 'inventory_import', 'deal_import',
  'lead_export', 'contact_export', 'inventory_export', 'deal_export', 'marketing_report_export',
  'ai_calling', 'ai_qualification', 'automation_task', 'data_reconciliation',
  'notification_batch', 'email_campaign', 'sms_campaign', 'rcs_campaign',
  'whatsapp_broadcast', 'portal_sync', 'website_publish', 'scheduled_task', 'bulk_update'
];

const CATEGORIES = ['communication', 'marketing', 'property_distribution', 'ai_operations', 'import', 'export', 'system'];

const CHANNELS = [
  'whatsapp_cloud', 'whatsapp_web', 'sms', 'email', 'rcs',
  'facebook', 'instagram', 'linkedin', 'youtube',
  'portal', 'website', 'ai_voice', 'system', 'csv', 'xlsx'
];

const STATUSES = [
  'created', 'validating', 'queued', 'initializing', 'waiting_approval',
  'running', 'paused', 'blocked', 'retrying', 'partial', 'stalled',
  'completed', 'failed', 'cancelled', 'recovery_pending'
];

const ERROR_CATEGORIES = [
  'VALIDATION_ERROR', 'AUTHENTICATION_ERROR', 'AUTHORIZATION_ERROR',
  'PROVIDER_ERROR', 'RATE_LIMIT', 'NETWORK_ERROR', 'REDIS_ERROR',
  'DATABASE_ERROR', 'WORKER_ERROR', 'QUEUE_ERROR', 'FILE_ERROR',
  'TIMEOUT', 'DATA_CONFLICT', 'UNKNOWN'
];

/** Allowed state transitions — enforced on every update */
export const ALLOWED_TRANSITIONS = {
  created:           ['validating', 'queued', 'cancelled'],
  validating:        ['queued', 'failed', 'cancelled'],
  queued:            ['initializing', 'running', 'cancelled'],
  initializing:      ['running', 'failed', 'cancelled'],
  waiting_approval:  ['queued', 'running', 'cancelled'],
  running:           ['completed', 'partial', 'paused', 'blocked', 'stalled', 'failed', 'cancelled'],
  paused:            ['running', 'cancelled'],
  blocked:           ['running', 'failed', 'cancelled'],
  retrying:          ['running', 'failed', 'cancelled'],
  partial:           ['running', 'completed', 'failed'],
  stalled:           ['running', 'recovery_pending', 'failed', 'cancelled'],
  recovery_pending:  ['running', 'failed', 'cancelled'],
  completed:         [],
  failed:            ['retrying', 'cancelled'],
  cancelled:         []
};

const operationsJobSchema = new mongoose.Schema({
  jobId:              { type: String, required: true, unique: true, index: true },
  operationType:      { type: String, enum: OPERATION_TYPES, required: true },
  category:           { type: String, enum: CATEGORIES, required: true },
  channel:            { type: String, enum: CHANNELS },
  provider:           { type: String },
  queueName:          { type: String, index: true },
  bullJobId:          { type: String },
  sourceEntityType:   { type: String },
  sourceEntityId:     { type: mongoose.Schema.Types.ObjectId },
  parentJobId:        { type: String },
  initiatedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  priority:           { type: Number, default: 0 },

  // Status & lifecycle
  status:             { type: String, enum: STATUSES, default: 'created', index: true },
  operationVersion:   { type: Number, default: 0 },

  // Progress counters
  progress:           { type: Number, default: 0, min: 0, max: 100 },
  totalCount:         { type: Number, default: 0 },
  processedCount:     { type: Number, default: 0 },
  successCount:       { type: Number, default: 0 },
  failureCount:       { type: Number, default: 0 },
  skippedCount:       { type: Number, default: 0 },
  pendingCount:       { type: Number, default: 0 },

  // Execution
  currentStage:       { type: String },
  workerId:           { type: String },
  attemptCount:       { type: Number, default: 0 },
  maxAttempts:        { type: Number, default: 3 },

  // Timestamps
  queuedAt:           { type: Date },
  startedAt:          { type: Date },
  lastProgressAt:     { type: Date },
  heartbeatAt:        { type: Date },
  completedAt:        { type: Date },

  // Duration
  durationMs:         { type: Number },
  estimatedRemainingMs: { type: Number },

  // Error info
  errorCode:          { type: String },
  errorCategory:      { type: String, enum: ERROR_CATEGORIES },
  errorMessage:       { type: String },
  retryable:          { type: Boolean },

  // Metadata (no PII)
  metadata:           { type: mongoose.Schema.Types.Mixed },
  result:             { type: mongoose.Schema.Types.Mixed },

  // Organization scope
  company:            { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true }
}, {
  timestamps: true,
  collection: 'operationsjobs'
});

// Compound indexes for common queries
operationsJobSchema.index({ status: 1, category: 1 });
operationsJobSchema.index({ status: 1, createdAt: -1 });
operationsJobSchema.index({ initiatedBy: 1, createdAt: -1 });
operationsJobSchema.index({ company: 1, status: 1 });
operationsJobSchema.index({ queueName: 1, status: 1 });
operationsJobSchema.index({ parentJobId: 1 });

// Validate status transitions
operationsJobSchema.methods.canTransitionTo = function(newStatus) {
  const allowed = ALLOWED_TRANSITIONS[this.status] || [];
  return allowed.includes(newStatus);
};

// Export constants for external use
export { OPERATION_TYPES, CATEGORIES, CHANNELS, STATUSES, ERROR_CATEGORIES };

const OperationsJob = mongoose.model('OperationsJob', operationsJobSchema);
export default OperationsJob;
