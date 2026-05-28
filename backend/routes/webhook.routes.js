/**
 * webhook.routes.js
 * Public + internal routes for the marketing automation webhooks.
 */
import express from 'express';
import {
    captureLeadWebhook,
    whatsAppReplyWebhook,
    whatsAppLiveBotWebhook,
    whatsAppLiveBotVerify,
    websiteLiveBotWebhook,
    launchCampaignManual,
    exotelCallback,
    facebookLeadVerify,
    facebookLeadWebhook
} from '../controllers/webhook.controller.js';

const router = express.Router();
import fs from 'fs';
import path from 'path';

// 🔍 Webhook Audit Logger
router.use((req, res, next) => {
    const logPath = path.join(process.cwd(), 'whatsapp_webhook_hits.log');
    const logEntry = `[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}\n`;
    fs.appendFileSync(logPath, logEntry);
    next();
});

// ── Public endpoints (called by landing pages / external services) ─────────────
router.post('/lead',             captureLeadWebhook);        // Lead capture from campaigns
router.post('/whatsapp-reply',   whatsAppReplyWebhook);      // Gupshup reply callback
router.get('/whatsapp-live-bot',  whatsAppLiveBotVerify);    // Live AI WhatsApp Meta Webhook Verification
router.post('/whatsapp-live-bot', whatsAppLiveBotWebhook);   // Live AI WhatsApp Meta Incoming Messages
router.post('/website-chat',     websiteLiveBotWebhook);     // Public Website Live Chat API
router.post('/exotel-callback',  exotelCallback);            // Exotel call status callback
router.get('/facebook-lead',     facebookLeadVerify);        // Facebook Lead ads webhook verification
router.post('/facebook-lead',    facebookLeadWebhook);       // Facebook Lead ads inbound webhook

// ── Internal endpoint (called from Marketing Suite UI, auth applied globally) ──
router.post('/campaign/launch',  launchCampaignManual);      // Manual campaign trigger

export default router;
