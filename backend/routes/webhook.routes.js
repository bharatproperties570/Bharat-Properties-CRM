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
    launchCampaignManual,
    exotelCallback,
} from '../controllers/webhook.controller.js';

const router = express.Router();

// ── Public endpoints (called by landing pages / external services) ─────────────
router.post('/lead',             captureLeadWebhook);        // Lead capture from campaigns
router.post('/whatsapp-reply',   whatsAppReplyWebhook);      // Gupshup reply callback
router.get('/whatsapp-live-bot',  whatsAppLiveBotVerify);    // Live AI WhatsApp Meta Webhook Verification
router.post('/whatsapp-live-bot', whatsAppLiveBotWebhook);   // Live AI WhatsApp Meta Incoming Messages
router.post('/exotel-callback',  exotelCallback);            // Exotel call status callback

// ── Internal endpoint (called from Marketing Suite UI, auth applied globally) ──
router.post('/campaign/launch',  launchCampaignManual);      // Manual campaign trigger

export default router;
