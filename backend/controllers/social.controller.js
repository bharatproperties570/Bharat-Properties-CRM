import SystemSetting from '../src/modules/systemSettings/system.model.js';
import socialCommentService from '../services/SocialCommentService.js';

/**
 * POST /api/social/config/enterprise
 * Professional save endpoint that prevents token leakage
 */
export const saveSocialConfig = async (req, res) => {
    try {
        const { platform, config } = req.body;
        
        if (!platform || !config) {
            return res.status(400).json({ success: false, error: 'Platform and configuration are required' });
        }

        const updateObj = {};
        Object.entries(config).forEach(([key, value]) => {
            updateObj[`value.${key}`] = value;
        });
        
        // Add platform-specific metadata tags if needed
        updateObj['category'] = 'integration';
        updateObj['active'] = true;

        await SystemSetting.findOneAndUpdate(
            { key: 'social_graph_config' },
            { $set: updateObj },
            { upsert: true }
        );

        res.json({ success: true, message: `${platform} configuration updated successfully` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/ig/media
... (keep existing exports)
... (keep existing exports)
 * Fetch recent Instagram media objects for the configured Business Account.
 */
export const listInstagramMedia = async (req, res) => {
    try {
        const media = await socialCommentService.listInstagramMedia();
        res.json({ success: true, data: media, count: media.length });
    } catch (err) {
        console.error('[SocialController] listInstagramMedia error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/ig/comments?mediaId=
 * Fetch comments on a specific Instagram media post.
 */
export const getInstagramComments = async (req, res) => {
    try {
        const { mediaId } = req.query;
        if (!mediaId) {
            return res.status(400).json({ success: false, error: 'mediaId query param is required' });
        }
        const comments = await socialCommentService.fetchInstagramComments(mediaId);
        res.json({ success: true, data: comments, count: comments.length });
    } catch (err) {
        console.error('[SocialController] getInstagramComments error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/fb/comments?postId=
 * Fetch comments on a specific Facebook post.
 */
export const getFacebookComments = async (req, res) => {
    try {
        const { postId } = req.query;
        if (!postId) {
            return res.status(400).json({ success: false, error: 'postId query param is required' });
        }
        const comments = await socialCommentService.fetchFacebookComments(postId);
        res.json({ success: true, data: comments, count: comments.length });
    } catch (err) {
        console.error('[SocialController] getFacebookComments error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/social/comment/reply
 * Body: { commentId: string, message: string }
 * Reply to a comment on Instagram or Facebook.
 */
export const replyToComment = async (req, res) => {
    try {
        const { commentId, message } = req.body;
        if (!commentId || !message) {
            return res.status(400).json({ success: false, error: 'commentId and message are required' });
        }
        const result = await socialCommentService.replyToComment(commentId, message);
        res.json({ success: result.success, ...result });
    } catch (err) {
        console.error('[SocialController] replyToComment error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/social/comment/like
 * Body: { commentId: string }
 * Like a Facebook comment.
 */
export const likeComment = async (req, res) => {
    try {
        const { commentId } = req.body;
        if (!commentId) {
            return res.status(400).json({ success: false, error: 'commentId is required' });
        }
        const result = await socialCommentService.likeComment(commentId);
        res.json({ success: result.success, ...result });
    } catch (err) {
        console.error('[SocialController] likeComment error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/webhook
 * Meta Webhook Verification (hub.challenge handshake).
 * 
 * HOW IT WORKS:
 * 1. Meta sends: hub.mode=subscribe, hub.verify_token=YOUR_TOKEN, hub.challenge=RANDOM_STRING
 * 2. We verify hub.verify_token matches what we expect
 * 3. We respond with ONLY the hub.challenge string (plain text, no JSON)
 * 
 * VERIFY TOKEN TO USE IN META PORTAL: bharat-properties-webhook-2026
 */
export const verifyWebhook = async (req, res) => {
    // Professional Fix: Support BOTH nested objects and flat dot-notation keys
    // Some Express configurations parse 'hub.mode' as hub: { mode: ... }
    // Others parse it as a flat string key 'hub.mode'
    const mode      = req.query['hub.mode']      || req.query.hub?.mode;
    const token     = req.query['hub.verify_token'] || req.query.hub?.verify_token;
    const challenge = req.query['hub.challenge']  || req.query.hub?.challenge;

    console.log(`[Webhook] hub object:`, JSON.stringify(hub));
    console.log(`[Webhook] mode="${mode}" token="${token}" challenge="${challenge}"`);

    if (!mode || !token) {
        return res.status(400).send('Bad Request: Missing hub.mode or hub.verify_token');
    }

    if (mode !== 'subscribe') {
        return res.status(403).send('Forbidden: mode must be subscribe');
    }

    const ACCEPTED_TOKENS = [
        process.env.FB_WEBHOOK_VERIFY_TOKEN,
        'bharat-properties-webhook-2026',
        'BharatCRM2024',
    ].filter(Boolean);

    if (ACCEPTED_TOKENS.includes(token)) {
        console.log(`[Webhook] ✅ Verified! Returning challenge: "${challenge}"`);
        return res.status(200).send(challenge);
    }

    console.warn(`[Webhook] ❌ Token mismatch — got: "${token}", accepted: ${JSON.stringify(ACCEPTED_TOKENS)}`);
    return res.status(403).send('Verification token mismatch');
};

/**
 * POST /api/social/webhook
 * Receive real-time Facebook/Instagram comment events.
 */
export const receiveWebhook = async (req, res) => {
    try {
        // Respond immediately with 200 to acknowledge receipt (required by Meta)
        res.status(200).json({ received: true });

        const events = socialCommentService.processWebhookPayload(req.body);
        if (events.length > 0) {
            console.log(`[SocialController] Received ${events.length} social event(s):`, 
                events.map(e => `${e.platform}:${e.type}`).join(', '));
            // TODO: Pipe events to real-time notification system or save to DB
            // e.g. notificationQueue.add('socialComment', event)
        }
    } catch (err) {
        console.error('[SocialController] receiveWebhook error:', err.message);
    }
};

/**
 * GET /api/social/status
 * Returns current Social API configuration status.
 */
export const getSocialStatus = async (req, res) => {
    try {
        const setting = await SystemSetting.findOne({ key: 'social_graph_config' }).lean();
        const hasPageToken = !!(setting?.value?.pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN);
        const hasIgUserId  = !!(setting?.value?.igUserId || process.env.IG_USER_ID);

        res.json({
            success: true,
            configured: hasPageToken && hasIgUserId,
            instagram: hasIgUserId,
            facebook: hasPageToken,
            mode: hasPageToken ? 'live' : 'mock',
            message: hasPageToken
                ? '✅ Facebook/Instagram Graph API configured. Live data active.'
                : '⚠️ No credentials found — mock data is being returned. Add FB_PAGE_ACCESS_TOKEN and IG_USER_ID to .env or Settings > Integrations.',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/whatsapp/templates
 * Fetch WhatsApp templates from Meta Business account
 */
export const getWhatsAppTemplates = async (req, res) => {
    try {
        const WhatsAppService = (await import('../services/whatsapp/WhatsAppService.js')).default;
        const templates = await WhatsAppService.getTemplates();
        res.json({ success: true, templates });
    } catch (err) {
        console.error('[SocialController] getWhatsAppTemplates error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/social/whatsapp/config
 * Save WhatsApp Meta Cloud API configuration
 */
export const saveWhatsAppConfig = async (req, res) => {
    try {
        const { token, phoneId, businessId, verifyToken } = req.body;
        
        await SystemSetting.findOneAndUpdate(
            { key: 'meta_wa_config' },
            { 
                $set: { 
                    'value.token': token,
                    'value.phoneId': phoneId,
                    'value.businessId': businessId,
                    'value.verifyToken': verifyToken,
                    'category': 'integration',
                    'active': true
                } 
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, message: 'WhatsApp configuration saved successfully' });
    } catch (err) {
        console.error('[SocialController] saveWhatsAppConfig error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/status/unified
 * Unified status for all social channels (LinkedIn, Meta, WhatsApp)
 */
export const getUnifiedStatus = async (req, res) => {
    try {
        const status = await socialCommentService.getUnifiedStatus();
        res.json(status);
    } catch (err) {
        console.error('[SocialController] getUnifiedStatus error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
