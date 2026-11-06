import express from 'express';
import { authenticate } from '../src/middlewares/auth.middleware.js';
import {
    getStageDensity,
    getSiteVisitFunnelAnalytics,
    getCampaignAttributionAnalytics
} from '../controllers/analytics.controller.js';

const router = express.Router();

// Get real-time stage density and pipeline analytics
router.get('/stage-density', authenticate, getStageDensity);
router.get('/site-visit-funnel', authenticate, getSiteVisitFunnelAnalytics);
router.get('/campaign-attribution', authenticate, getCampaignAttributionAnalytics);

export default router;
