/**
 * marketing.routes.js
 * Routes for the Marketing Suite AI Agent, Analytics, and Campaign Engine.
 * Phase D: Added /job-status/:jobId for BullMQ job polling.
 */
import express from 'express';
import { 
    getMarketingStats,
    getCampaignRuns, 
    generateSocialContent, 
    generateEmailCampaign, 
    getRecentDeals,
    runMarketingAgent,
    generateWithModel,
    sendCampaign,
    activateDrip,
    getJobStatus,
} from '../controllers/marketing.controller.js';
import { 
    getLinkedInAuthUrl, 
    handleLinkedInCallback, 
    getLinkedInStatus, 
    saveLinkedInConfig 
} from '../controllers/linkedIn.controller.js';

const router = express.Router();

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/stats',         getMarketingStats);
router.get('/campaign-runs', getCampaignRuns);
router.get('/recent-deals',  getRecentDeals);

// ── AI Generation ─────────────────────────────────────────────────────────────
router.post('/generate-social', generateSocialContent);
router.post('/generate-email',  generateEmailCampaign);
router.post('/run-agent',       runMarketingAgent);

// ── Phase C + D: Full Campaign Engine ────────────────────────────────────────
router.post('/generate-with-model', generateWithModel);   // Real Gemini/GPT-4o
router.post('/send-campaign',       sendCampaign);        // BullMQ blast job
router.post('/activate-drip',       activateDrip);        // BullMQ drip job
router.get('/job-status/:jobId',    getJobStatus);        // Poll job progress

// ── LinkedIn Integration ──────────────────────────────────────────────────────
router.get('/linkedin/auth-url',    getLinkedInAuthUrl);
router.post('/linkedin/callback',   handleLinkedInCallback);
router.get('/linkedin/status',      getLinkedInStatus);
router.post('/linkedin/config',     saveLinkedInConfig);

export default router;

