/**
 * Operations API Routes
 * ─────────────────────────────────────────────────────────────────────────────
 * REST + SSE endpoints for the Enterprise Operations Center.
 */
import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import OperationsService from '../services/operations/OperationsService.js';
import WorkerHealthService from '../services/operations/WorkerHealthService.js';
import AlertService from '../services/operations/AlertService.js';
import RealtimeHub from '../services/RealtimeHub.js';

const router = Router();

// ─── SSE Stream ──────────────────────────────────────────────────────────────
router.get('/stream', protect, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Send initial heartbeat
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

  // Register as SSE client
  RealtimeHub.addClient(res, req.user);

  // Keep alive every 30s
  const keepAlive = setInterval(() => {
    try { res.write(`event: ping\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`); }
    catch (e) { clearInterval(keepAlive); }
  }, 30000);

  req.on('close', () => { clearInterval(keepAlive); });
});

// ─── Operations Summary ─────────────────────────────────────────────────────
router.get('/summary', protect, async (req, res) => {
  try {
    const summary = await OperationsService.getOperationsSummary(req.user?.company);
    res.json({ success: true, data: summary });
  } catch (err) {
    console.error('[OperationsAPI] Summary error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch summary' });
  }
});

// ─── Active Operations ──────────────────────────────────────────────────────
router.get('/active', protect, async (req, res) => {
  try {
    const operations = await OperationsService.getActiveOperations(req.user?.company);
    res.json({ success: true, data: operations });
  } catch (err) {
    console.error('[OperationsAPI] Active ops error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch active operations' });
  }
});

// ─── Worker Health ──────────────────────────────────────────────────────────
router.get('/workers', protect, async (req, res) => {
  try {
    const workers = await WorkerHealthService.getWorkerHealth();
    res.json({ success: true, data: workers });
  } catch (err) {
    console.error('[OperationsAPI] Worker health error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch worker health' });
  }
});

// ─── Queue Health ───────────────────────────────────────────────────────────
router.get('/queues', protect, async (req, res) => {
  try {
    const queues = await WorkerHealthService.getQueueHealth();
    res.json({ success: true, data: queues });
  } catch (err) {
    console.error('[OperationsAPI] Queue health error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch queue health' });
  }
});

// ─── Alerts ─────────────────────────────────────────────────────────────────
router.get('/alerts/summary', protect, async (req, res) => {
  try {
    const summary = await AlertService.getAlertSummary(req.user?.company);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch alert summary' });
  }
});

router.get('/alerts', protect, async (req, res) => {
  try {
    const { severity, acknowledged, resolved, page, limit } = req.query;
    const result = await AlertService.getAlerts({
      severity,
      acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      company: req.user?.company
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
});

router.post('/alerts/:alertId/acknowledge', protect, async (req, res) => {
  try {
    const alert = await AlertService.acknowledgeAlert(req.params.alertId, req.user._id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found or already acknowledged' });
    res.json({ success: true, data: alert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/alerts/:alertId/resolve', protect, async (req, res) => {
  try {
    const alert = await AlertService.resolveAlert(req.params.alertId, req.user._id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found or already resolved' });
    res.json({ success: true, data: alert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── List Operations (paginated) ────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { status, category, channel, operationType, page, limit, sort } = req.query;
    const result = await OperationsService.listOperations({
      status: status ? status.split(',') : undefined,
      category, channel, operationType,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 20, 100),
      sort: sort || '-createdAt',
      company: req.user?.company
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[OperationsAPI] List error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to list operations' });
  }
});

// ─── Operation Detail ───────────────────────────────────────────────────────
router.get('/:jobId', protect, async (req, res) => {
  try {
    const operation = await OperationsService.getOperation(req.params.jobId);
    if (!operation) return res.status(404).json({ success: false, message: 'Operation not found' });
    res.json({ success: true, data: operation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Operation Events ───────────────────────────────────────────────────────
router.get('/:jobId/events', protect, async (req, res) => {
  try {
    const operation = await OperationsService.getOperation(req.params.jobId);
    if (!operation) return res.status(404).json({ success: false, message: 'Operation not found' });

    const { page, limit } = req.query;
    const result = await OperationsService.getEvents(operation._id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Operator Controls ──────────────────────────────────────────────────────
router.post('/:jobId/pause', protect, async (req, res) => {
  try {
    const op = await OperationsService.pauseOperation(req.params.jobId, req.user._id);
    res.json({ success: true, data: op });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:jobId/resume', protect, async (req, res) => {
  try {
    const op = await OperationsService.resumeOperation(req.params.jobId, req.user._id);
    res.json({ success: true, data: op });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:jobId/cancel', protect, async (req, res) => {
  try {
    const op = await OperationsService.cancelOperation(req.params.jobId, req.user._id);
    res.json({ success: true, data: op });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:jobId/retry', protect, async (req, res) => {
  try {
    const op = await OperationsService.retryOperation(req.params.jobId, req.user._id);
    res.json({ success: true, data: op });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
