/**
 * marketing.routes.js
 * Routes for the Marketing Suite AI Agent and Analytics.
 */
import express from 'express';
import { 
    getMarketingStats,
    getCampaignRuns, 
    generateSocialContent, 
    generateEmailCampaign, 
    getRecentDeals,
    runMarketingAgent 
} from '../controllers/marketing.controller.js';
import { 
    getLinkedInAuthUrl, 
    handleLinkedInCallback, 
    getLinkedInStatus, 
    saveLinkedInConfig 
} from '../controllers/linkedIn.controller.js';
import { authenticate } from '../src/middlewares/auth.middleware.js';

const router = express.Router();

// Applied globally in app.js or here
router.get('/stats',         getMarketingStats);
router.get('/campaign-runs', getCampaignRuns);
router.get('/recent-deals',  getRecentDeals);

// AI Generation
router.post('/generate-social', generateSocialContent);
router.post('/generate-email',  generateEmailCampaign);
router.post('/run-agent',       runMarketingAgent);

// LinkedIn Integration
router.get('/linkedin/auth-url', getLinkedInAuthUrl);
router.post('/linkedin/callback', handleLinkedInCallback);
router.get('/linkedin/status',   getLinkedInStatus);
router.post('/linkedin/config',   saveLinkedInConfig);

export default router;
