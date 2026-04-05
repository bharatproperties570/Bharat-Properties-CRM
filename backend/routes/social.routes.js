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
} from '../controllers/social.controller.js';

const router = express.Router();

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/status', getSocialStatus);         // GET  /api/social/status

// ── Instagram ─────────────────────────────────────────────────────────────────
router.get('/ig/media',    listInstagramMedia);  // GET  /api/social/ig/media
router.get('/ig/comments', getInstagramComments); // GET  /api/social/ig/comments?mediaId=

// ── Facebook ──────────────────────────────────────────────────────────────────
router.get('/fb/comments', getFacebookComments); // GET  /api/social/fb/comments?postId=

// ── Comment Actions ───────────────────────────────────────────────────────────
router.post('/comment/reply', replyToComment);   // POST /api/social/comment/reply
router.post('/comment/like',  likeComment);      // POST /api/social/comment/like

// ── Webhook (Meta requires both GET for verification and POST for events) ─────
router.get('/webhook',  verifyWebhook);          // GET  /api/social/webhook  (hub.challenge)
router.post('/webhook', receiveWebhook);         // POST /api/social/webhook  (live events)

export default router;
