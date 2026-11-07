/**
 * social.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes for the Marketing OS social media monitoring module.
 * Mounts at: /api/social
 */

import express from 'express';
import {
    listInstagramMedia,
    getInstagramComments,
    getFacebookComments,
    replyToComment,
    likeComment,
    verifyWebhook,
    receiveWebhook,
    getSocialStatus,
    getUnifiedStatus,
    saveSocialConfig,
    saveWhatsAppConfig,
    getWhatsAppTemplates,
    postSocialMedia,
    getSocialAnalytics,
    testSocialConnection,
    getFacebookAuthUrl,
    handleFacebookCallback,
    getFacebookOAuthStatus,
    disconnectFacebook,
    startBaileysConnection,
    getBaileysStatus,
    getBaileysGroups,
    disconnectBaileysConnection
} from '../controllers/social.controller.js';
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// ── Webhook (MUST BE PUBLIC for Meta to call it) ──────────────────────────────
router.get('/webhook',  verifyWebhook);
router.post('/webhook', receiveWebhook);

// Apply authentication to all following routes
router.use(authenticate);

// ── WhatsApp Config & Templates ───────────────────────────────────────────────
router.post('/whatsapp/config',    saveWhatsAppConfig);
router.get('/whatsapp/templates',  getWhatsAppTemplates);

// ── Baileys QR Integration ────────────────────────────────────────────────────
router.post('/whatsapp/baileys/start', startBaileysConnection);
router.post('/whatsapp/baileys/disconnect/:id', disconnectBaileysConnection);
router.get('/whatsapp/baileys/status/:id', getBaileysStatus);
router.get('/whatsapp/baileys/groups/:id', getBaileysGroups);

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/status',         getSocialStatus);
router.get('/status/unified', getUnifiedStatus);
router.post('/config/enterprise', saveSocialConfig);

// ── Instagram ─────────────────────────────────────────────────────────────────
router.get('/ig/media',    listInstagramMedia);
router.get('/ig/comments', getInstagramComments);

// ── Facebook ──────────────────────────────────────────────────────────────────
router.get('/fb/comments', getFacebookComments);

// ── Comment Actions ───────────────────────────────────────────────────────────
router.post('/comment/reply', replyToComment);
router.post('/comment/like',  likeComment);

// ── Social Publishing & Analytics ───────────────────────────────────────────
router.post('/post',          postSocialMedia);
router.get('/analytics',     getSocialAnalytics);
router.post('/test-connection', testSocialConnection);

// ── Meta (Facebook & Instagram) 1-Click OAuth ────────────────────────────────
router.get('/facebook/auth-url',   getFacebookAuthUrl);
router.post('/facebook/callback',  handleFacebookCallback);
router.get('/facebook/status',     getFacebookOAuthStatus);
router.post('/facebook/disconnect', disconnectFacebook);

export default router;
