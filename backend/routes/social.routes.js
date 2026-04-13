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
    testSocialConnection
} from '../controllers/social.controller.js';
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// ── Webhook (MUST BE PUBLIC for Meta to call it) ──────────────────────────────
router.get('/webhook',  verifyWebhook);
router.post('/webhook', receiveWebhook);

// ── WhatsApp (TEMPORARILY PUBLIC TO DEBUG 401) ──
router.post('/whatsapp/config',    saveWhatsAppConfig);
router.get('/whatsapp/templates',  getWhatsAppTemplates);

// Apply authentication to all following routes
router.use(authenticate);

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

export default router;
