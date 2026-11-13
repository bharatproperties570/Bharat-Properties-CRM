import express from 'express';
import { authenticate } from '../src/middlewares/auth.middleware.js';
import {
    previewOwnerOutreachAudience,
    createOwnerOutreachDraft,
    listOwnerOutreachCampaigns,
    getOwnerOutreachCampaign
} from '../controllers/ownerOutreach.controller.js';

const router = express.Router();
router.use(authenticate);
router.post('/audience-preview', previewOwnerOutreachAudience);
router.post('/campaigns', createOwnerOutreachDraft);
router.get('/campaigns', listOwnerOutreachCampaigns);
router.get('/campaigns/:id', getOwnerOutreachCampaign);

export default router;
