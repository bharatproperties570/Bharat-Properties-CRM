/**
 * ================================================================
 *  WhatsApp Webhook Handler  v2.0
 *  Compatibility route: POST /api/social/webhook/v2
 *  Verify: GET /api/social/webhook/v2
 *  Bharat Properties CRM — Antigravity Compatible
 * ================================================================
 */

import express              from 'express';
import { whatsAppLiveBotVerify, whatsAppLiveBotWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

// This endpoint deliberately contains no business logic. It is a compatibility
// alias while Meta callback configuration is moved to the canonical endpoint.
router.get('/', whatsAppLiveBotVerify);
router.post('/', whatsAppLiveBotWebhook);

export default router;
