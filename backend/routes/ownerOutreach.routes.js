import express from 'express';
import { authenticate } from '../src/middlewares/auth.middleware.js';
import {
    previewOwnerOutreachAudience,
    createOwnerOutreachDraft,
    listOwnerOutreachCampaigns,
    getOwnerOutreachCampaign,
    approveOwnerOutreachCampaign,
    pauseOwnerOutreachCampaign,
    resumeOwnerOutreachCampaign,
    cancelOwnerOutreachCampaign
} from '../controllers/ownerOutreach.controller.js';

const router = express.Router();
router.use(authenticate);
router.post('/audience-preview', previewOwnerOutreachAudience);
router.post('/campaigns', createOwnerOutreachDraft);
router.get('/campaigns', listOwnerOutreachCampaigns);
router.get('/campaigns/:id', getOwnerOutreachCampaign);
router.post('/campaigns/:id/approve', approveOwnerOutreachCampaign);
router.post('/campaigns/:id/pause', pauseOwnerOutreachCampaign);
router.post('/campaigns/:id/resume', resumeOwnerOutreachCampaign);
router.post('/campaigns/:id/cancel', cancelOwnerOutreachCampaign);

export default router;
