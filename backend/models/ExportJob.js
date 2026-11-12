/**
 * ExportJob Model
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks secure export operations with download auditing and expiration.
 */
import mongoose from 'mongoose';

const EXPORT_STATUSES = ['queued', 'processing', 'generating_file', 'completed', 'expired', 'failed', 'cancelled'];

const exportJobSchema = new mongoose.Schema({
  jobId:                { type: String, required: true, unique: true, index: true },
  operationId:          { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsJob', index: true },
  entityType:           { type: String, enum: ['lead', 'contact', 'inventory', 'deal', 'marketing_report'], required: true },
  format:               { type: String, enum: ['csv', 'xlsx'], required: true },
  filters:              { type: mongoose.Schema.Types.Mixed },
  selectedFields:       [{ type: String }],
  excludedFields:       [{ type: String }],
  visibilityFilter:     { type: mongoose.Schema.Types.Mixed },
  estimatedRecords:     { type: Number, default: 0 },
  processedRecords:     { type: Number, default: 0 },
  includedRecords:      { type: Number, default: 0 },
  excludedByVisibility: { type: Number, default: 0 },
  filePath:             { type: String },
  fileSize:             { type: Number },
  downloadToken:        { type: String, unique: true, sparse: true },
  downloadCount:        { type: Number, default: 0 },
  maxDownloads:         { type: Number, default: 5 },
  expiresAt:            { type: Date, index: true },
  status:               { type: String, enum: EXPORT_STATUSES, default: 'queued', index: true },
  downloadedBy:         [{
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    downloadedAt: { type: Date, default: Date.now }
  }],
  initiatedBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  company:              { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true }
}, {
  timestamps: true,
  collection: 'exportjobs'
});

// TTL: auto-cleanup completed exports after 7 days
exportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export { EXPORT_STATUSES };
const ExportJob = mongoose.model('ExportJob', exportJobSchema);
export default ExportJob;
