import express from 'express';
import { sendEmail, getInbox, testConnection, getEmailContent, getOAuthUrl, oauthCallback } from '../controllers/email.controller.js';

const router = express.Router();

router.post('/send', sendEmail);
router.get('/inbox', getInbox);
router.post('/test-connection', testConnection);
router.get('/content/:uid', getEmailContent);
router.get('/oauth/url', getOAuthUrl);
router.get('/oauth/callback', oauthCallback);

export default router;
