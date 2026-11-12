/**
 * ImportJob Model
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks enterprise bulk import operations with checkpointing and validation.
 */
import mongoose from 'mongoose';

const IMPORT_STATUSES = [
  'uploading', 'parsing', 'mapping', 'validating', 'duplicate_check',
  'awaiting_approval', 'importing', 'generating_error_report',
  'completed', 'failed', 'cancelled'
];

const importJobSchema = new mongoose.Schema({
  jobId:              { type: String, required: true, unique: true, index: true },
  operationId:        { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsJob', index: true },
  entityType:         { type: String, enum: ['contact', 'lead', 'inventory', 'deal'], required: true },
  fileName:           { type: String, required: true },
  originalFileName:   { type: String, required: true },
  fileSize:           { type: Number },
  mimeType:           { type: String },
  fileChecksum:       { type: String },
  filePath:           { type: String },
  columnMapping:      { type: mongoose.Schema.Types.Mixed },
  validationRules:    { type: mongoose.Schema.Types.Mixed },
  importMode:         { type: String, enum: ['create_only', 'update_only', 'create_or_update'], default: 'create_only' },
  duplicateStrategy:  { type: String, enum: ['skip', 'update', 'create_new', 'reject'], default: 'skip' },
  duplicateFields:    [{ type: String }],
  detectedColumns:    [{ type: String }],
  previewData:        { type: mongoose.Schema.Types.Mixed },
  validationSummary:  { type: mongoose.Schema.Types.Mixed },
  approvedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:         { type: Date },
  status:             { type: String, enum: IMPORT_STATUSES, default: 'uploading', index: true },
  totalRows:          { type: Number, default: 0 },
  processedRows:      { type: Number, default: 0 },
  importedRows:       { type: Number, default: 0 },
  updatedRows:        { type: Number, default: 0 },
  skippedRows:        { type: Number, default: 0 },
  failedRows:         { type: Number, default: 0 },
  rowErrors:          [{ row: Number, field: String, message: String, value: mongoose.Schema.Types.Mixed }],
  errorReportPath:    { type: String },
  checkpointData:     { type: mongoose.Schema.Types.Mixed },
  initiatedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  company:            { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true }
}, {
  timestamps: true,
  collection: 'importjobs'
});

export { IMPORT_STATUSES };
const ImportJob = mongoose.model('ImportJob', importJobSchema);
export default ImportJob;
