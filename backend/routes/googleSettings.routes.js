import express from 'express';
import { 
    getGoogleAuthUrl, 
    handleGoogleCallback, 
    getGoogleStatus, 
    disconnectGoogle 
} from '../controllers/googleSettings.controller.js';

const router = express.Router();

// @route   GET /api/settings/google/auth-url
router.get('/auth-url', getGoogleAuthUrl);

// @route   POST /api/settings/google/callback
router.post('/callback', handleGoogleCallback);

// @route   GET /api/settings/google/status
router.get('/status', getGoogleStatus);

// @route   POST /api/settings/google/disconnect
router.post('/disconnect', disconnectGoogle);

export default router;
