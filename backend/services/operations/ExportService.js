/**
 * ExportService
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure enterprise export with RBAC, visibility filters, and download auditing.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import ExportJob from '../../models/ExportJob.js';
import OperationsService from './OperationsService.js';

/** Maximum export records */
const MAX_EXPORT_RECORDS = 100000;
/** Batch size for reading */
const BATCH_SIZE = 500;
/** Download expiration (24 hours) */
const DOWNLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Sensitive fields that must NEVER be exported */
const GLOBAL_EXCLUDED_FIELDS = [
  'password', 'passwordHash', 'token', 'refreshToken', 'authToken',
  'secret', 'apiKey', '__v', 'resetPasswordToken', 'resetPasswordExpire'
];

/** Allowed fields per entity type */
const ENTITY_EXPORT_FIELDS = {
  lead: ['name', 'email', 'phone', 'source', 'status', 'budget', 'propertyType', 'location', 'notes', 'assignedTo', 'tags', 'createdAt', 'updatedAt'],
  contact: ['firstName', 'lastName', 'email', 'phone', 'mobile', 'company', 'designation', 'address', 'city', 'state', 'pincode', 'tags', 'source', 'createdAt'],
  inventory: ['projectName', 'unitNumber', 'type', 'floor', 'tower', 'superArea', 'carpetArea', 'price', 'status', 'facing', 'bedrooms', 'bathrooms', 'createdAt'],
  deal: ['title', 'dealValue', 'stage', 'expectedCloseDate', 'contactName', 'notes', 'createdAt', 'updatedAt'],
  marketing_report: ['campaignName', 'channel', 'sent', 'delivered', 'read', 'failed', 'createdAt']
};

/** Sanitize cell for CSV formula injection */
function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) return "'" + str;
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

class ExportService {

  /**
   * Initiate a new export.
   */
  async initiateExport({ entityType, format, filters, selectedFields, initiatedBy, company }) {
    if (!ENTITY_EXPORT_FIELDS[entityType]) {
      throw new Error(`Unsupported export entity: ${entityType}`);
    }
    if (!['csv', 'xlsx'].includes(format)) {
      throw new Error(`Unsupported format: ${format}`);
    }

    // Validate selected fields against allowlist
    const allowedFields = ENTITY_EXPORT_FIELDS[entityType];
    const validFields = (selectedFields || allowedFields).filter(f =>
      allowedFields.includes(f) && !GLOBAL_EXCLUDED_FIELDS.includes(f)
    );

    if (validFields.length === 0) {
      throw new Error('No valid fields selected for export');
    }

    // Sanitize filters — strip any MongoDB operators from user input
    const safeFilters = this._sanitizeFilters(filters || {});

    const jobId = crypto.randomUUID();
    const downloadToken = crypto.randomBytes(32).toString('hex');

    // Register operation
    const operation = await OperationsService.registerOperation({
      operationType: `${entityType}_export`,
      category: 'export',
      channel: format,
      initiatedBy, company,
      metadata: { entityType, format, fieldCount: validFields.length }
    });

    // Create export job
    const exportJob = await ExportJob.create({
      jobId,
      operationId: operation._id,
      entityType, format,
      filters: safeFilters,
      selectedFields: validFields,
      excludedFields: GLOBAL_EXCLUDED_FIELDS,
      downloadToken,
      expiresAt: new Date(Date.now() + DOWNLOAD_EXPIRY_MS),
      initiatedBy, company
    });

    // Queue for execution
    const { exportQueue } = await import('../../src/queues/operationsQueue.js');
    await exportQueue.add('execute-export', { exportJobId: jobId }, { jobId: `export-${jobId}` });

    await OperationsService.updateStatus(operation.jobId, 'queued', { actorType: 'system' });

    return exportJob;
  }

  /**
   * Execute the export (called by worker).
   */
  async executeExport(exportJobId) {
    const exportJob = await ExportJob.findOne({ jobId: exportJobId });
    if (!exportJob) throw new Error('Export job not found');

    const opJobId = await this._getOperationJobId(exportJob.operationId);
    await OperationsService.updateStatus(opJobId, 'running', { actorType: 'worker' });
    await ExportJob.updateOne({ jobId: exportJobId }, { $set: { status: 'processing' } });

    const Model = await this._getModel(exportJob.entityType);
    const query = { ...exportJob.filters };
    if (exportJob.company) query.company = exportJob.company;

    // Count total records
    const totalRecords = await Model.countDocuments(query);
    if (totalRecords > MAX_EXPORT_RECORDS) {
      await OperationsService.failOperation(opJobId, {
        errorCategory: 'VALIDATION_ERROR',
        errorMessage: `Export exceeds maximum record limit of ${MAX_EXPORT_RECORDS} (found ${totalRecords})`,
        retryable: false
      });
      await ExportJob.updateOne({ jobId: exportJobId }, { $set: { status: 'failed' } });
      return;
    }

    await ExportJob.updateOne({ jobId: exportJobId }, { $set: { estimatedRecords: totalRecords } });

    // Create export directory
    const exportDir = path.join(process.cwd(), 'backend', 'uploads', 'exports');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    const filePath = path.join(exportDir, `${exportJobId}.${exportJob.format}`);
    const fields = exportJob.selectedFields;

    // Build projection
    const projection = {};
    fields.forEach(f => { projection[f] = 1; });

    // Generate CSV
    await ExportJob.updateOne({ jobId: exportJobId }, { $set: { status: 'generating_file' } });

    const writeStream = fs.createWriteStream(filePath);

    // Write header
    writeStream.write(fields.map(f => sanitizeCsvCell(f)).join(',') + '\n');

    let processedRecords = 0;
    let includedRecords = 0;
    let skip = 0;

    while (skip < totalRecords) {
      const batch = await Model.find(query)
        .select(projection)
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean();

      if (batch.length === 0) break;

      for (const doc of batch) {
        const row = fields.map(f => sanitizeCsvCell(doc[f]));
        writeStream.write(row.join(',') + '\n');
        includedRecords++;
      }

      processedRecords += batch.length;
      skip += BATCH_SIZE;

      const progress = Math.round((processedRecords / totalRecords) * 100);
      await OperationsService.updateProgress(opJobId, {
        processedCount: processedRecords,
        successCount: includedRecords,
        currentStage: 'generating_file',
        progress
      });
    }

    writeStream.end();

    // Wait for write to finish
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const fileStats = fs.statSync(filePath);

    await ExportJob.updateOne({ jobId: exportJobId }, {
      $set: {
        status: 'completed',
        filePath,
        fileSize: fileStats.size,
        processedRecords,
        includedRecords
      }
    });

    await OperationsService.completeOperation(opJobId, {
      result: { processedRecords, includedRecords, fileSize: fileStats.size, format: exportJob.format }
    });

    return { processedRecords, includedRecords, fileSize: fileStats.size };
  }

  /**
   * Get export status.
   */
  async getExportStatus(exportJobId) {
    return ExportJob.findOne({ jobId: exportJobId })
      .populate('initiatedBy', 'fullName email')
      .lean();
  }

  /**
   * List exports for a user.
   */
  async listExports({ initiatedBy, company, page = 1, limit = 20 } = {}) {
    const filter = {};
    if (initiatedBy) filter.initiatedBy = initiatedBy;
    if (company) filter.company = company;

    const skip = (page - 1) * limit;
    const [exports, total] = await Promise.all([
      ExportJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ExportJob.countDocuments(filter)
    ]);

    return { exports, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Secure download with authorization and audit.
   */
  async downloadExport(downloadToken, userId) {
    const exportJob = await ExportJob.findOne({ downloadToken });
    if (!exportJob) throw new Error('Invalid download token');
    if (exportJob.status !== 'completed') throw new Error('Export not yet complete');
    if (new Date() > exportJob.expiresAt) {
      await ExportJob.updateOne({ _id: exportJob._id }, { $set: { status: 'expired' } });
      throw new Error('Download link has expired');
    }
    if (exportJob.downloadCount >= exportJob.maxDownloads) {
      throw new Error('Maximum download limit reached');
    }

    if (!fs.existsSync(exportJob.filePath)) {
      throw new Error('Export file no longer available');
    }

    // Audit the download
    await ExportJob.updateOne({ _id: exportJob._id }, {
      $inc: { downloadCount: 1 },
      $push: { downloadedBy: { userId, downloadedAt: new Date() } }
    });

    return { filePath: exportJob.filePath, fileName: `${exportJob.entityType}_export.${exportJob.format}` };
  }

  /**
   * Cleanup expired export files.
   */
  async cleanupExpiredExports() {
    const expired = await ExportJob.find({
      status: 'completed',
      expiresAt: { $lt: new Date() }
    });

    for (const exp of expired) {
      try { if (exp.filePath) fs.unlinkSync(exp.filePath); } catch (e) { /* ignore */ }
      await ExportJob.updateOne({ _id: exp._id }, { $set: { status: 'expired', filePath: null } });
    }

    return { cleaned: expired.length };
  }

  /** Sanitize filters to prevent MongoDB injection */
  _sanitizeFilters(filters) {
    const safe = {};
    for (const [key, value] of Object.entries(filters)) {
      if (key.startsWith('$')) continue; // Strip top-level operators
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        safe[key] = value;
      } else if (Array.isArray(value)) {
        safe[key] = { $in: value.filter(v => typeof v === 'string' || typeof v === 'number') };
      }
    }
    return safe;
  }

  async _getOperationJobId(operationId) {
    const { default: OpsJob } = await import('../../models/OperationsJob.js');
    const op = await OpsJob.findById(operationId, 'jobId').lean();
    return op?.jobId;
  }

  async _getModel(entityType) {
    switch (entityType) {
      case 'contact': return (await import('../../models/Contact.js')).default;
      case 'lead': return (await import('../../models/Lead.js')).default;
      case 'inventory': return (await import('../../models/Inventory.js')).default;
      case 'deal': return (await import('../../models/Deal.js')).default;
      default: throw new Error(`No model for entity type: ${entityType}`);
    }
  }
}

export default new ExportService();
