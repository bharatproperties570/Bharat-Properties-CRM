import express from 'express';
import { saveWhatsAppConfig, getWhatsAppTemplates, syncMetaTemplates, submitMetaTemplate, previewMessage, getWhatsAppAccounts } from '../controllers/social.controller.js';
import { authenticate } from '../src/middlewares/auth.middleware.js';

const router = express.Router();

router.get('/accounts', authenticate, getWhatsAppAccounts);
router.post('/save', saveWhatsAppConfig);
router.get('/templates', getWhatsAppTemplates);
router.get('/sync-meta', syncMetaTemplates);
router.post('/submit-template', submitMetaTemplate);
router.post('/preview', authenticate, previewMessage);
router.post('/send', authenticate, async (req, res, next) => {
    // We import dynamically to avoid circular dependencies if any
    const { sendWhatsAppMessage } = await import('../controllers/social.controller.js');
    return sendWhatsAppMessage(req, res, next);
});

export default router;
