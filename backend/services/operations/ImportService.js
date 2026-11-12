/**
 * ImportService
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise bulk import with validation, preview, approval and checkpointing.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import ImportJob from '../../models/ImportJob.js';
import OperationsService from './OperationsService.js';

/** Maximum rows per import */
const MAX_IMPORT_ROWS = 50000;
/** Maximum file size (20MB) */
const MAX_FILE_SIZE = 20 * 1024 * 1024;
/** Batch size for processing */
const BATCH_SIZE = 100;
/** Preview rows count */
const PREVIEW_ROWS = 10;

/** Allowed MIME types */
const ALLOWED_MIMES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream' // Fallback for CSV
];

/** CSV magic bytes */
const CSV_SIGNATURES = [0x22, 0x27]; // Quote chars or alpha
const XLSX_SIGNATURE = [0x50, 0x4B, 0x03, 0x04]; // PK zip header

/** Field mappings per entity type */
const ENTITY_FIELD_MAPS = {
  contact: {
    required: ['firstName'],
    optional: ['lastName', 'email', 'phone', 'mobile', 'company', 'designation', 'address', 'city', 'state', 'pincode', 'tags', 'notes', 'source'],
    unique: ['phone', 'email']
  },
  lead: {
    required: ['name'],
    optional: ['phone', 'email', 'source', 'status', 'budget', 'propertyType', 'location', 'notes', 'assignedTo', 'tags'],
    unique: ['phone', 'email']
  },
  inventory: {
    required: ['projectName', 'unitNumber'],
    optional: ['type', 'floor', 'tower', 'superArea', 'carpetArea', 'price', 'status', 'facing', 'bedrooms', 'bathrooms'],
    unique: ['projectName', 'unitNumber']
  },
  deal: {
    required: ['title'],
    optional: ['dealValue', 'stage', 'expectedCloseDate', 'contactName', 'contactPhone', 'notes'],
    unique: []
  }
};

/** Sanitize cell value to prevent formula injection */
function sanitizeCell(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  // Strip formula injection characters at start
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return "'" + trimmed;
  }
  return trimmed;
}

/** Parse CSV content */
function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Simple CSV parser handling quoted fields
  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(sanitizeCell(current));
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(sanitizeCell(current));
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });

  return { headers, rows };
}

class ImportService {

  /**
   * Initiate an import: validate file, create jobs.
   */
  async initiateImport(file, { entityType, initiatedBy, company }) {
    // Validate entity type
    if (!ENTITY_FIELD_MAPS[entityType]) {
      throw new Error(`Unsupported entity type: ${entityType}`);
    }

    // Validate file
    if (!file) throw new Error('No file provided');
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    // Validate file signature (magic bytes)
    const fileBuffer = fs.readFileSync(file.path);
    const isXlsx = fileBuffer[0] === XLSX_SIGNATURE[0] && fileBuffer[1] === XLSX_SIGNATURE[1];
    const isCsv = !isXlsx; // If not XLSX, treat as CSV

    if (file.mimetype.includes('spreadsheet') && !isXlsx) {
      throw new Error('File extension indicates XLSX but file signature does not match');
    }

    // Calculate checksum
    const checksum = createHash('sha256').update(fileBuffer).digest('hex');

    // Create import directory
    const importDir = path.join(process.cwd(), 'backend', 'uploads', 'imports');
    if (!fs.existsSync(importDir)) fs.mkdirSync(importDir, { recursive: true });

    const jobId = crypto.randomUUID();
    const ext = isXlsx ? '.xlsx' : '.csv';
    const secureFileName = `${jobId}${ext}`;
    const securePath = path.join(importDir, secureFileName);

    // Move file to secure location
    fs.copyFileSync(file.path, securePath);
    try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }

    // Register operation
    const operation = await OperationsService.registerOperation({
      operationType: `${entityType}_import`,
      category: 'import',
      channel: isXlsx ? 'xlsx' : 'csv',
      initiatedBy, company,
      metadata: { entityType, fileName: file.originalname }
    });

    // Create import job
    const importJob = await ImportJob.create({
      jobId,
      operationId: operation._id,
      entityType,
      fileName: secureFileName,
      originalFileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      fileChecksum: checksum,
      filePath: securePath,
      status: 'uploading',
      initiatedBy, company
    });

    return importJob;
  }

  /**
   * Parse the uploaded file and detect columns.
   */
  async parseFile(importJobId) {
    const importJob = await ImportJob.findOne({ jobId: importJobId });
    if (!importJob) throw new Error('Import job not found');

    await ImportJob.updateOne({ jobId: importJobId }, { $set: { status: 'parsing' } });
    await OperationsService.updateStatus(
      (await this._getOperationJobId(importJob.operationId)), 'validating',
      { actorType: 'system' }
    );

    const content = fs.readFileSync(importJob.filePath, 'utf-8');
    const { headers, rows } = parseCSV(content);

    if (rows.length === 0) throw new Error('File contains no data rows');
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`File exceeds maximum row limit of ${MAX_IMPORT_ROWS}`);
    }

    const previewData = rows.slice(0, PREVIEW_ROWS);

    await ImportJob.updateOne({ jobId: importJobId }, {
      $set: {
        detectedColumns: headers,
        previewData,
        totalRows: rows.length,
        status: 'mapping'
      }
    });

    await OperationsService.updateProgress(
      (await this._getOperationJobId(importJob.operationId)),
      { totalCount: rows.length, currentStage: 'mapping', progress: 10 }
    );

    return { headers, totalRows: rows.length, previewData };
  }

  /**
   * Set column mapping.
   */
  async setMapping(importJobId, columnMapping) {
    const importJob = await ImportJob.findOne({ jobId: importJobId });
    if (!importJob) throw new Error('Import job not found');

    // Validate mapping against entity fields
    const entityMap = ENTITY_FIELD_MAPS[importJob.entityType];
    const allFields = [...entityMap.required, ...entityMap.optional];

    // Check required fields are mapped
    const mappedTargets = Object.values(columnMapping);
    const missingRequired = entityMap.required.filter(f => !mappedTargets.includes(f));

    await ImportJob.updateOne({ jobId: importJobId }, {
      $set: { columnMapping, status: 'mapping' }
    });

    return { columnMapping, missingRequired, allFields };
  }

  /**
   * Validate all rows against the entity schema.
   */
  async validateImport(importJobId) {
    const importJob = await ImportJob.findOne({ jobId: importJobId });
    if (!importJob) throw new Error('Import job not found');

    await ImportJob.updateOne({ jobId: importJobId }, { $set: { status: 'validating' } });

    const content = fs.readFileSync(importJob.filePath, 'utf-8');
    const { rows } = parseCSV(content);
    const entityMap = ENTITY_FIELD_MAPS[importJob.entityType];
    const mapping = importJob.columnMapping || {};
    const reverseMapping = {};
    for (const [src, tgt] of Object.entries(mapping)) { reverseMapping[tgt] = src; }

    let validRows = 0, invalidRows = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let rowValid = true;

      for (const reqField of entityMap.required) {
        const srcCol = reverseMapping[reqField];
        if (!srcCol || !row[srcCol] || !String(row[srcCol]).trim()) {
          errors.push({ row: i + 2, field: reqField, message: `Required field '${reqField}' is missing`, value: row[srcCol] });
          rowValid = false;
        }
      }

      // Validate email format
      const emailCol = reverseMapping['email'];
      if (emailCol && row[emailCol] && row[emailCol].trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row[emailCol].trim())) {
          errors.push({ row: i + 2, field: 'email', message: 'Invalid email format', value: row[emailCol] });
          rowValid = false;
        }
      }

      // Validate phone format
      const phoneCol = reverseMapping['phone'] || reverseMapping['mobile'];
      if (phoneCol && row[phoneCol] && row[phoneCol].trim()) {
        const phone = row[phoneCol].replace(/[\s\-()]/g, '');
        if (!/^\+?\d{7,15}$/.test(phone)) {
          errors.push({ row: i + 2, field: 'phone', message: 'Invalid phone format', value: row[phoneCol] });
          rowValid = false;
        }
      }

      if (rowValid) validRows++;
      else invalidRows++;
    }

    // Limit stored errors to first 500 to prevent unbounded growth
    const storedErrors = errors.slice(0, 500);

    const summary = {
      totalRows: rows.length,
      validRows,
      invalidRows,
      errorCount: errors.length,
      truncatedErrors: errors.length > 500
    };

    await ImportJob.updateOne({ jobId: importJobId }, {
      $set: {
        validationSummary: summary,
        rowErrors: storedErrors,
        status: invalidRows > 0 && validRows === 0 ? 'failed' : 'awaiting_approval'
      }
    });

    const opJobId = await this._getOperationJobId(importJob.operationId);
    await OperationsService.updateProgress(opJobId, {
      currentStage: 'awaiting_approval', progress: 30
    });

    return summary;
  }

  /**
   * Approve and queue the import for execution.
   */
  async approveImport(importJobId, userId) {
    const importJob = await ImportJob.findOne({ jobId: importJobId });
    if (!importJob) throw new Error('Import job not found');
    if (importJob.status !== 'awaiting_approval') {
      throw new Error(`Import is in '${importJob.status}' status, not awaiting approval`);
    }

    await ImportJob.updateOne({ jobId: importJobId }, {
      $set: { approvedBy: userId, approvedAt: new Date(), status: 'importing' }
    });

    const opJobId = await this._getOperationJobId(importJob.operationId);
    await OperationsService.updateStatus(opJobId, 'queued', { actor: userId, actorType: 'user' });

    // Queue for background execution
    const { importQueue } = await import('../../src/queues/operationsQueue.js');
    await importQueue.add('execute-import', { importJobId }, { jobId: `import-${importJobId}` });

    return { queued: true };
  }

  /**
   * Execute import in batches (called by worker).
   */
  async executeImport(importJobId) {
    const importJob = await ImportJob.findOne({ jobId: importJobId });
    if (!importJob) throw new Error('Import job not found');

    const opJobId = await this._getOperationJobId(importJob.operationId);
    await OperationsService.updateStatus(opJobId, 'running', { actorType: 'worker' });

    const content = fs.readFileSync(importJob.filePath, 'utf-8');
    const { rows } = parseCSV(content);
    const mapping = importJob.columnMapping || {};
    const reverseMapping = {};
    for (const [src, tgt] of Object.entries(mapping)) { reverseMapping[tgt] = src; }

    // Get the model for this entity type
    const Model = await this._getModel(importJob.entityType);
    const entityMap = ENTITY_FIELD_MAPS[importJob.entityType];

    let imported = importJob.checkpointData?.lastProcessedRow || 0;
    let importedRows = importJob.importedRows || 0;
    let skippedRows = importJob.skippedRows || 0;
    let failedRows = importJob.failedRows || 0;
    const errors = [];

    // Process in batches
    for (let batchStart = imported; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);
      const batch = rows.slice(batchStart, batchEnd);

      for (let i = 0; i < batch.length; i++) {
        const rowIndex = batchStart + i;
        const row = batch[i];

        try {
          // Map row to entity fields
          const doc = {};
          for (const [tgtField, srcCol] of Object.entries(reverseMapping)) {
            if (row[srcCol] !== undefined && row[srcCol] !== '') {
              doc[tgtField] = sanitizeCell(String(row[srcCol]).trim());
            }
          }

          // Add company scope
          if (importJob.company) doc.company = importJob.company;
          if (importJob.initiatedBy) doc.createdBy = importJob.initiatedBy;

          // Duplicate check
          if (importJob.duplicateStrategy !== 'create_new' && entityMap.unique.length > 0) {
            const dupeQuery = { $or: [] };
            for (const field of entityMap.unique) {
              if (doc[field]) dupeQuery.$or.push({ [field]: doc[field] });
            }
            if (importJob.company) dupeQuery.company = importJob.company;

            if (dupeQuery.$or.length > 0) {
              const existing = await Model.findOne(dupeQuery).lean();
              if (existing) {
                if (importJob.duplicateStrategy === 'skip') { skippedRows++; continue; }
                if (importJob.duplicateStrategy === 'update' && importJob.importMode !== 'create_only') {
                  await Model.updateOne({ _id: existing._id }, { $set: doc });
                  importedRows++;
                  continue;
                }
                if (importJob.duplicateStrategy === 'reject') {
                  errors.push({ row: rowIndex + 2, field: 'duplicate', message: 'Duplicate record found' });
                  failedRows++;
                  continue;
                }
              }
            }
          }

          // Create the record
          await Model.create(doc);
          importedRows++;
        } catch (err) {
          errors.push({ row: rowIndex + 2, field: 'system', message: err.message });
          failedRows++;
        }
      }

      // Checkpoint after each batch
      const processedRows = batchEnd;
      const progress = Math.round((processedRows / rows.length) * 100);

      await ImportJob.updateOne({ jobId: importJobId }, {
        $set: {
          processedRows, importedRows, skippedRows, failedRows,
          checkpointData: { lastProcessedRow: batchEnd, timestamp: new Date() }
        },
        $push: { rowErrors: { $each: errors.splice(0, errors.length) } }
      });

      await OperationsService.updateProgress(opJobId, {
        processedCount: processedRows, successCount: importedRows,
        failureCount: failedRows, skippedCount: skippedRows,
        pendingCount: rows.length - processedRows,
        currentStage: 'importing', progress
      });
    }

    // Complete
    const finalStatus = failedRows > 0 && importedRows > 0 ? 'partial' :
                         failedRows > 0 ? 'failed' : 'completed';

    await ImportJob.updateOne({ jobId: importJobId }, {
      $set: { status: 'completed', processedRows: rows.length }
    });

    if (finalStatus === 'partial') {
      await OperationsService.updateStatus(opJobId, 'partial', { actorType: 'worker' });
      await OperationsService.completeOperation(opJobId, {
        result: { importedRows, skippedRows, failedRows, totalRows: rows.length }
      });
    } else if (finalStatus === 'failed') {
      await OperationsService.failOperation(opJobId, {
        errorCategory: 'VALIDATION_ERROR',
        errorMessage: `All ${failedRows} rows failed to import`,
        retryable: false
      });
    } else {
      await OperationsService.completeOperation(opJobId, {
        result: { importedRows, skippedRows, failedRows, totalRows: rows.length }
      });
    }

    return { importedRows, skippedRows, failedRows, totalRows: rows.length };
  }

  /**
   * Get import status.
   */
  async getImportStatus(importJobId) {
    return ImportJob.findOne({ jobId: importJobId })
      .populate('initiatedBy', 'fullName email')
      .populate('approvedBy', 'fullName email')
      .lean();
  }

  /**
   * Cancel an import.
   */
  async cancelImport(importJobId, userId) {
    const importJob = await ImportJob.findOne({ jobId: importJobId });
    if (!importJob) throw new Error('Import job not found');

    await ImportJob.updateOne({ jobId: importJobId }, { $set: { status: 'cancelled' } });

    const opJobId = await this._getOperationJobId(importJob.operationId);
    await OperationsService.cancelOperation(opJobId, userId);

    // Cleanup file
    try { if (importJob.filePath) fs.unlinkSync(importJob.filePath); } catch (e) { /* ignore */ }

    return { cancelled: true };
  }

  /** Get the OperationsJob.jobId from an operationId ObjectId */
  async _getOperationJobId(operationId) {
    const { default: OperationsJob } = await import('../../models/OperationsJob.js');
    const op = await OperationsJob.findById(operationId, 'jobId').lean();
    return op?.jobId;
  }

  /** Get the Mongoose model for an entity type */
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

export default new ImportService();
