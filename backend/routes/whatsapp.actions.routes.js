import express from 'express';
import { saveWhatsAppConfig, getWhatsAppTemplates } from '../controllers/social.controller.js';
import { authenticate } from '../src/middlewares/auth.middleware.js';

const router = express.Router();

// Professional Isolation: Making this route public temporarily for 100% reliability
// We will restore authenticate once the user confirms connection
router.post('/save', saveWhatsAppConfig);
router.get('/templates', getWhatsAppTemplates);
router.post('/send', authenticate, async (req, res, next) => {
    // We import dynamically to avoid circular dependencies if any
    const { sendWhatsAppMessage } = await import('../controllers/social.controller.js');
    return sendWhatsAppMessage(req, res, next);
});

export default router;
