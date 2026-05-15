import express from 'express';
import { handleWhatsAppReply, verifyWebhook } from './whatsapp.controller.js';

const router = express.Router();

// GET request for Meta App webhook verification
router.get('/whatsapp', verifyWebhook);

// POST request for incoming WhatsApp messages
router.post('/whatsapp', handleWhatsAppReply);

export default router;
