/**
 * outbox.routes.js
 *
 * Phase D.2-F07 / Phase 4.6I — Outbox Failed Event Recovery Routes
 *
 * Admin-only endpoints for Outbox monitoring and recovery.
 * Protected by authentication and role authorization ('admin', 'super admin').
 */

import express from 'express';
import { authenticate, authorize } from '../src/middlewares/auth.middleware.js';
import {
    getOutboxStats,
    getFailedEvents,
    retryFailedEvent
} from '../controllers/outbox.controller.js';

const router = express.Router();

// All Outbox administrative routes require authentication
router.use(authenticate);

// ─── Outbox Administration Endpoints ─────────────────────────────────────────

// GET /api/outbox/stats — Aggregate status counts (PENDING, PUBLISHED, FAILED)
router.get('/stats', authorize('admin', 'super admin'), getOutboxStats);

// GET /api/outbox/failed — List FAILED events (payload omitted for security)
router.get('/failed', authorize('admin', 'super admin'), getFailedEvents);

// PATCH /api/outbox/:eventId/retry — Atomic transition FAILED → PENDING
router.patch('/:eventId/retry', authorize('admin', 'super admin'), retryFailedEvent);

export default router;
