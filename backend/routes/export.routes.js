/**
 * Export API Routes
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure export endpoints with download authorization and auditing.
 */
import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import ExportService from '../services/operations/ExportService.js';

const router = Router();

// ─── Initiate Export ────────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const { entityType, format, filters, selectedFields } = req.body;
    if (!entityType) return res.status(400).json({ success: false, message: 'entityType is required' });

    const exportJob = await ExportService.initiateExport({
      entityType,
      format: format || 'csv',
      filters: filters || {},
      selectedFields,
      initiatedBy: req.user._id,
      company: req.user?.company
    });

    res.status(201).json({ success: true, data: exportJob });
  } catch (err) {
    console.error('[ExportAPI] Initiate error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── List Exports ───────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await ExportService.listExports({
      initiatedBy: req.user._id,
      company: req.user?.company,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Export Status ──────────────────────────────────────────────────────────
router.get('/:exportJobId', protect, async (req, res) => {
  try {
    const exportJob = await ExportService.getExportStatus(req.params.exportJobId);
    if (!exportJob) return res.status(404).json({ success: false, message: 'Export not found' });
    res.json({ success: true, data: exportJob });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Secure Download ────────────────────────────────────────────────────────
router.get('/:exportJobId/download', protect, async (req, res) => {
  try {
    const exportJob = await ExportService.getExportStatus(req.params.exportJobId);
    if (!exportJob) return res.status(404).json({ success: false, message: 'Export not found' });

    const { filePath, fileName } = await ExportService.downloadExport(
      exportJob.downloadToken, req.user._id
    );

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const { createReadStream } = await import('fs');
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
