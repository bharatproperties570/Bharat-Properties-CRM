/**
 * Import API Routes
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise bulk import endpoints with file upload and approval workflow.
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect } from '../middleware/auth.js';
import ImportService from '../services/operations/ImportService.js';

const router = Router();

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'backend', 'uploads', 'temp');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`));
    }
    cb(null, true);
  }
});

// ─── Upload File ────────────────────────────────────────────────────────────
router.post('/upload', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { entityType } = req.body;
    if (!entityType) return res.status(400).json({ success: false, message: 'entityType is required' });

    const importJob = await ImportService.initiateImport(req.file, {
      entityType,
      initiatedBy: req.user._id,
      company: req.user?.company
    });

    // Auto-parse after upload
    const parseResult = await ImportService.parseFile(importJob.jobId);

    res.status(201).json({
      success: true,
      data: {
        importJobId: importJob.jobId,
        ...parseResult
      }
    });
  } catch (err) {
    console.error('[ImportAPI] Upload error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Get Import Status ──────────────────────────────────────────────────────
router.get('/:importJobId', protect, async (req, res) => {
  try {
    const importJob = await ImportService.getImportStatus(req.params.importJobId);
    if (!importJob) return res.status(404).json({ success: false, message: 'Import not found' });
    res.json({ success: true, data: importJob });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Get Preview Data ───────────────────────────────────────────────────────
router.get('/:importJobId/preview', protect, async (req, res) => {
  try {
    const importJob = await ImportService.getImportStatus(req.params.importJobId);
    if (!importJob) return res.status(404).json({ success: false, message: 'Import not found' });

    res.json({
      success: true,
      data: {
        columns: importJob.detectedColumns,
        previewData: importJob.previewData,
        totalRows: importJob.totalRows,
        columnMapping: importJob.columnMapping
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Set Column Mapping ─────────────────────────────────────────────────────
router.post('/:importJobId/mapping', protect, async (req, res) => {
  try {
    const { columnMapping } = req.body;
    if (!columnMapping || typeof columnMapping !== 'object') {
      return res.status(400).json({ success: false, message: 'columnMapping is required' });
    }

    const result = await ImportService.setMapping(req.params.importJobId, columnMapping);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Validate Import ────────────────────────────────────────────────────────
router.post('/:importJobId/validate', protect, async (req, res) => {
  try {
    const result = await ImportService.validateImport(req.params.importJobId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Approve and Execute ────────────────────────────────────────────────────
router.post('/:importJobId/approve', protect, async (req, res) => {
  try {
    const result = await ImportService.approveImport(req.params.importJobId, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Cancel Import ──────────────────────────────────────────────────────────
router.post('/:importJobId/cancel', protect, async (req, res) => {
  try {
    const result = await ImportService.cancelImport(req.params.importJobId, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Download Error Report ──────────────────────────────────────────────────
router.get('/:importJobId/errors', protect, async (req, res) => {
  try {
    const importJob = await ImportService.getImportStatus(req.params.importJobId);
    if (!importJob) return res.status(404).json({ success: false, message: 'Import not found' });

    res.json({
      success: true,
      data: {
        errors: importJob.rowErrors || [],
        validationSummary: importJob.validationSummary
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
