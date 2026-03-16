import express from 'express';
import { getGoogleAuthUrl, handleGoogleCallback, getGoogleStatus, disconnectGoogle } from '../controllers/googleSettings.controller.js';

const router = express.Router();

router.get('/url', getGoogleAuthUrl);
router.post('/callback', handleGoogleCallback);
router.get('/status', getGoogleStatus);
router.post('/disconnect', disconnectGoogle);

export default router;
