/**
 * social.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles Instagram & Facebook Graph API endpoints for the Marketing OS.
 * Powered by SocialCommentService — gracefully degrades to mock when
 * FB credentials are not yet configured.
 */

import socialCommentService from '../services/SocialCommentService.js';
import SystemSetting from '../models/SystemSetting.js';

/**
 * GET /api/social/ig/media
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
 * Facebook webhook verification (hub.challenge handshake).
 */
export const verifyWebhook = async (req, res) => {
    try {
        const mode      = req.query['hub.mode'];
        const token     = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        // Load stored verify token
        const setting = await SystemSetting.findOne({ key: 'social_graph_config' }).lean();
        const verifyToken = setting?.value?.webhookVerifyToken || process.env.FB_WEBHOOK_VERIFY_TOKEN || 'bharat-properties-webhook-2026';

        const result = socialCommentService.verifyWebhook(mode, token, challenge, verifyToken);

        if (result.valid) {
            console.log('[SocialController] Facebook webhook verified ✅');
            return res.status(200).send(result.challenge);
        }
        console.warn('[SocialController] Webhook verification failed — token mismatch');
        return res.status(403).json({ success: false, error: 'Verification failed' });
    } catch (err) {
        console.error('[SocialController] verifyWebhook error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
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
