/**
 * Stage Engine Routes
 * Mounted at: /api/stage-engine
 */

import express from 'express';
import {
    updateLeadStage,
    syncDealStage,
    getLeadStageHistory,
    getDealStageHistory,
    getStageDensity,
    getStalledDeals,
    getDealHealth,
    bulkRecalcStages,
    getLeadScores,
    getDealScores
} from '../controllers/stage.controller.js';

const router = express.Router();

// ── Lead Stage ──────────────────────────────────────────────────────────────
// GET /api/stage-engine/leads/scores  ← MUST be before /:id routes
// Bulk lightweight scores for all leads (list-view optimised)
router.get('/leads/scores', getLeadScores);

// PUT /api/stage-engine/leads/:id/stage
// Update lead stage + persist stageHistory entry
router.put('/leads/:id/stage', updateLeadStage);

// GET /api/stage-engine/leads/:id/history
// Full stage timeline for a lead
router.get('/leads/:id/history', getLeadStageHistory);

// ── Deal Stage ──────────────────────────────────────────────────────────────
// GET /api/stage-engine/deals/scores  ← MUST be before /:id routes
// Bulk lightweight scores for all deals (list-view optimised)
router.get('/deals/scores', getDealScores);

// PUT /api/stage-engine/deals/:id/sync
// Sync deal stage from linked lead stages (cascade)
router.put('/deals/:id/sync', syncDealStage);

// GET /api/stage-engine/deals/:id/history
// Full stage timeline for a deal
router.get('/deals/:id/history', getDealStageHistory);

// ── Analytics ───────────────────────────────────────────────────────────────
// GET /api/stage-engine/density?page=1
// Stage density metrics: count, conversion%, avgDays, bottleneck flag
router.get('/density', getStageDensity);

// GET /api/stage-engine/stalled?daysSinceStageChange=21&daysNoActivity=14
// All stalled deals from MongoDB
router.get('/stalled', getStalledDeals);

// GET /api/stage-engine/health/:dealId
// Deal health score from real activities
router.get('/health/:dealId', getDealHealth);

// ── Admin ────────────────────────────────────────────────────────────────────
// POST /api/stage-engine/bulk-recalc
// Bulk recalculate lastActivityAt for all leads (admin/migration use)
router.post('/bulk-recalc', bulkRecalcStages);

export default router;
