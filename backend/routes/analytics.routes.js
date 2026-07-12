import express from 'express';
import { authenticate } from '../src/middlewares/auth.middleware.js';
import { getStageDensity } from '../controllers/analytics.controller.js';

const router = express.Router();

// Get real-time stage density and pipeline analytics
router.get('/stage-density', authenticate, getStageDensity);

export default router;
