import express from 'express';
import { authenticate } from '../src/middlewares/auth.middleware.js';
import whatsAppOnboardingService from '../services/WhatsAppOnboardingService.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';

const router = express.Router();

/**
 * POST /api/whatsapp-onboarding/start
 * Initializes a secure onboarding session
 */
router.post('/start', authenticate, async (req, res) => {
    try {
        const { connectionType } = req.body;
        // Require connectionType (e.g., 'COEXISTENCE' or 'NEW_API')
        if (!connectionType) return res.status(400).json({ success: false, error: 'connectionType is required' });

        const organizationId = req.user?.organizationId || req.user?._id; // Adapt based on current auth structure
        
        const session = await whatsAppOnboardingService.initiateOnboarding(organizationId, connectionType, req.user._id);
        
        res.json({ success: true, sessionId: session._id });
    } catch (error) {
        console.error('[WhatsAppOnboarding Route] start error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to initiate onboarding' });
    }
});

/**
 * POST /api/whatsapp-onboarding/exchange
 * Receives the OAuth code and executes the Meta API flow securely on the backend
 */
router.post('/exchange', authenticate, async (req, res) => {
    try {
        const { sessionId, code, waba_id, phone_number_id, pin } = req.body;
        
        if (!sessionId || !code || !waba_id || !phone_number_id) {
            return res.status(400).json({ success: false, error: 'Missing required onboarding parameters' });
        }

        const integration = await whatsAppOnboardingService.completeOnboarding(sessionId, { code, waba_id, phone_number_id, pin });
        
        // Exclude credentials before sending to frontend
        const safeIntegration = integration.toObject();
        delete safeIntegration.credentials;

        res.json({ success: true, data: safeIntegration });
    } catch (error) {
        console.error('[WhatsAppOnboarding Route] exchange error:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Onboarding failed' });
    }
});

/**
 * GET /api/whatsapp-onboarding/status/:sessionId
 * Check onboarding status safely
 */
router.get('/status/:sessionId', authenticate, async (req, res) => {
    try {
        const integration = await WhatsAppIntegration.findById(req.params.sessionId).lean();
        if (!integration) return res.status(404).json({ success: false, error: 'Session not found' });
        
        // Redact credentials
        delete integration.credentials;

        res.json({ success: true, data: integration });
    } catch (error) {
        console.error('[WhatsAppOnboarding Route] status error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch status' });
    }
});

export default router;
