/**
 * social.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes for the Marketing OS social media monitoring module.
 * Mounts at: /api/social
 *
 * Instagram endpoints use Graph API with graceful mock fallback.
 * Facebook webhook endpoints handle real-time comment events.
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
router.get('/status',         getSocialStatus);         // GET  /api/social/status
router.get('/status/unified', getUnifiedStatus);        // GET  /api/social/status/unified
router.post('/config/enterprise', saveSocialConfig);     // POST /api/social/config/enterprise

// ── Instagram ─────────────────────────────────────────────────────────────────
router.get('/ig/media',    listInstagramMedia);  // GET  /api/social/ig/media
router.get('/ig/comments', getInstagramComments); // GET  /api/social/ig/comments?mediaId=

// ── Facebook ──────────────────────────────────────────────────────────────────
router.get('/fb/comments', getFacebookComments); // GET  /api/social/fb/comments?postId=

// ── Comment Actions ───────────────────────────────────────────────────────────
router.post('/comment/reply', replyToComment);   // POST /api/social/comment/reply
router.post('/comment/like',  likeComment);

export default router;
