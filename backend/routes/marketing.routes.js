import express from 'express';
console.log('--- MARKETING ROUTES INITIALIZING ---');
import { 
    getMarketingStats,
    getCampaignRuns, 
    generateSocialContent, 
    generateEmailCampaign, 
    getRecentDeals,
    runMarketingAgent,
    generateWithModel,
    getAudienceCount,
    sendCampaign,
    sendManualMatch,
    activateDrip,
    getJobStatus,
    getMarketingContent,
    saveMarketingContent,
    deleteMarketingContent,
    broadcastToHub,
    importAudience,
    getScheduledCampaigns,
    deleteScheduledCampaign,
    publishMarketingContent,
    getSmsTemplates,
    syncSmsTemplates
} from '../controllers/marketing.controller.js';
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit
import { getWhatsAppTemplates } from '../controllers/social.controller.js';
import { 
    getLinkedInAuthUrl,
    handleLinkedInCallback, 
    getLinkedInStatus, 
    saveLinkedInConfig,
    triggerLeadSync
} from '../controllers/linkedIn.controller.js';
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// ── Public OAuth Callbacks (No Auth Required) ────────────────────────────────
// These must be public because the browser redirect does not include the Auth header.
router.get('/linkedin/callback', handleLinkedInCallback);

// Apply authentication to all following protected routes
router.use(authenticate);

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
router.post('/audience-count',      getAudienceCount);
router.post('/send-campaign',       sendCampaign);        // BullMQ blast job
router.post('/send-manual',         sendManualMatch);     // Manual individual share
router.post('/activate-drip',       activateDrip);        // BullMQ drip job
router.get('/job-status/:jobId',    getJobStatus);        // Poll job progress

// ── Neural Persistence (Content CRUD) ────────────────────────────────────────
router.get('/content',      getMarketingContent);
router.post('/content',     saveMarketingContent);
router.get('/whatsapp/templates', getWhatsAppTemplates);
router.get('/sms/templates', getSmsTemplates);
router.post('/sms/sync',      syncSmsTemplates);
router.delete('/content/:id', deleteMarketingContent);
router.post('/publish',        publishMarketingContent);
console.log('[MarketingRoutes] Mapping /broadcast to:', typeof broadcastToHub);
router.post('/broadcast',      broadcastToHub);
router.post('/import-audience', upload.single('file'), importAudience);

// ── LinkedIn Integration ──────────────────────────────────────────────────────
router.get('/linkedin/auth-url',    getLinkedInAuthUrl);
router.get('/linkedin/status',      getLinkedInStatus);
router.post('/linkedin/config',     saveLinkedInConfig);
router.post('/linkedin/sync-leads',  triggerLeadSync);

// ── Orchestration & Scheduling Monitor ────────────────────────────────────────
router.get('/scheduled', getScheduledCampaigns);
router.delete('/scheduled/:id', deleteScheduledCampaign);

export default router;

