import express from 'express';
const router = express.Router();
import { getSettings, updateSettings, getAvailableAiIntegrations } from '../controllers/integrationSettings.controller.js';
import { protect } from '../middleware/auth.js';

// Optional: protect these routes if auth middleware works
router.get('/', protect, getSettings);
router.post('/', protect, updateSettings);
router.get('/available-ai', protect, getAvailableAiIntegrations);

export default router;
