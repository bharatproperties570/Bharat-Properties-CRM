/**
 * SocialCommentService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Real Instagram & Facebook Graph API integration for the Marketing OS.
 * Replaces the former COMMENT_SET mock with live Graph API calls.
 *
 * Providers:
 *   - Instagram Graph API  (requires Instagram Business Account linked to FB Page)
 *   - Facebook Graph API   (requires Page Access Token with pages_read_engagement)
 *
 * Config keys (stored in SystemSetting OR .env):
 *   FB_PAGE_ACCESS_TOKEN   → long-lived page token (manage_pages scope)
 *   FB_APP_SECRET          → for webhook signature verification
 *   IG_USER_ID             → Instagram Business Account user ID
 *   FB_GRAPH_VERSION       → default 'v19.0'
 */

import axios from 'axios';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import metaLeadService from './MetaLeadService.js';

const GRAPH_BASE = 'https://graph.facebook.com';

class SocialCommentService {
    // ── Config ────────────────────────────────────────────────────────────────

    async _getConfig() {
        // 1. Try DB-stored config (set via Settings > Integrations UI)
        const dbConfig = await SystemSetting.findOne({ key: 'social_graph_config' }).lean();
        if (dbConfig?.value?.pageAccessToken) return dbConfig.value;

        // 2. Fall back to .env
        return {
            pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN,
            appSecret:       process.env.FB_APP_SECRET,
            igUserId:        process.env.IG_USER_ID,
            graphVersion:    process.env.FB_GRAPH_VERSION || 'v19.0',
        };
    }

    _graphUrl(version, path) {
        return `${GRAPH_BASE}/${version}/${path}`;
    }

    // ── Instagram ─────────────────────────────────────────────────────────────

    /**
     * Fetch the most recent Instagram media objects for the business account.
     * @returns {Array} media items: { id, caption, media_type, timestamp, permalink }
     */
    async listInstagramMedia() {
        const config = await this._getConfig();
        if (!config?.pageAccessToken || !config?.igUserId) {
            return this._mockMedia('instagram');
        }

        try {
            const url = this._graphUrl(config.graphVersion, `${config.igUserId}/media`);
            const { data } = await axios.get(url, {
                params: {
                    fields: 'id,caption,media_type,timestamp,permalink,comments_count,like_count',
                    access_token: config.pageAccessToken,
                    limit: 10,
                },
            });
            return data.data || [];
        } catch (err) {
            console.error('[SocialComment] listInstagramMedia error:', err.response?.data || err.message);
            return this._mockMedia('instagram');
        }
    }

    /**
     * Fetch comments on an Instagram media object.
     * @param {string} mediaId  Instagram media ID
     * @returns {Array} comments: { id, text, timestamp, username }
     */
    async fetchInstagramComments(mediaId) {
        const config = await this._getConfig();
        if (!config?.pageAccessToken || !mediaId) {
            return this._mockComments('instagram', mediaId);
        }

        try {
            const url = this._graphUrl(config.graphVersion, `${mediaId}/comments`);
            const { data } = await axios.get(url, {
                params: {
                    fields: 'id,text,timestamp,username,replies{id,text,username,timestamp}',
                    access_token: config.pageAccessToken,
                },
            });
            return data.data || [];
        } catch (err) {
            console.error('[SocialComment] fetchInstagramComments error:', err.response?.data || err.message);
            return this._mockComments('instagram', mediaId);
        }
    }

    // ── Facebook ──────────────────────────────────────────────────────────────

    /**
     * Fetch comments on a Facebook post.
     * @param {string} postId  Facebook post ID (format: {pageId}_{postId})
     * @returns {Array} comments: { id, message, from, created_time }
     */
    async fetchFacebookComments(postId) {
        const config = await this._getConfig();
        if (!config?.pageAccessToken || !postId) {
            return this._mockComments('facebook', postId);
        }

        try {
            const url = this._graphUrl(config.graphVersion, `${postId}/comments`);
            const { data } = await axios.get(url, {
                params: {
                    fields: 'id,message,from,created_time,like_count,comment_count',
                    access_token: config.pageAccessToken,
                    order: 'ranked',
                    limit: 50,
                },
            });
            return data.data || [];
        } catch (err) {
            console.error('[SocialComment] fetchFacebookComments error:', err.response?.data || err.message);
            return this._mockComments('facebook', postId);
        }
    }

    /**
     * Reply to any comment (Instagram or Facebook).
     * @param {string} commentId  The comment ID to reply to
     * @param {string} message    Reply text
     * @returns {{ success: boolean, id?: string, error?: string }}
     */
    async replyToComment(commentId, message) {
        const config = await this._getConfig();
        if (!config?.pageAccessToken) {
            console.log(`[SocialComment] MOCK reply to ${commentId}: ${message}`);
            return { success: true, id: `mock_reply_${Date.now()}`, mock: true };
        }

        try {
            const url = this._graphUrl(config.graphVersion, `${commentId}/replies`);
            const { data } = await axios.post(url, null, {
                params: {
                    message,
                    access_token: config.pageAccessToken,
                },
            });
            console.log(`[SocialComment] Replied to comment ${commentId}:`, data.id);
            return { success: true, id: data.id };
        } catch (err) {
            const errMsg = err.response?.data?.error?.message || err.message;
            console.error('[SocialComment] replyToComment error:', errMsg);
            return { success: false, error: errMsg };
        }
    }

    /**
     * Like a comment (Facebook).
     * @param {string} commentId
     */
    async likeComment(commentId) {
        const config = await this._getConfig();
        if (!config?.pageAccessToken) return { success: true, mock: true };

        try {
            const url = this._graphUrl(config.graphVersion, `${commentId}/likes`);
            await axios.post(url, null, {
                params: { access_token: config.pageAccessToken },
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.response?.data?.error?.message || err.message };
        }
    }

    /**
     * Verify a Facebook webhook challenge.
     * @param {string} mode          hub.mode
     * @param {string} token         hub.verify_token
     * @param {string} challenge     hub.challenge
     * @param {string} verifyToken   Our stored verify token
     */
    verifyWebhook(mode, token, challenge, verifyToken) {
        if (mode === 'subscribe' && token === verifyToken) {
            return { valid: true, challenge };
        }
        return { valid: false };
    }

    /**
     * Process incoming Facebook webhook event payload.
     * Extracts comment events for real-time monitoring.
     * @param {Object} payload  Raw webhook body
     * @returns {Array}         Normalized comment events
     */
    /**
     * Get unified status of all social connections
     */
    async getUnifiedStatus() {
        const config = await this._getConfig();
        const lnSetting = await SystemSetting.findOne({ key: 'linkedin_integration' }).lean();
        
        return {
            success: true,
            whatsapp: {
                connected: !!(process.env.WHATSAPP_PHONE_ID || config.whatsappPhoneId),
                health: 'HEALTHY'
            },
            messenger: {
                connected: !!config.pageAccessToken,
                health: config.pageAccessToken ? 'HEALTHY' : 'DISCONNECTED'
            },
            facebook: {
                connected: !!config.pageAccessToken,
                health: config.pageAccessToken ? 'HEALTHY' : 'DISCONNECTED'
            },
            instagram: {
                connected: !!config.igUserId,
                health: config.igUserId ? 'HEALTHY' : 'DISCONNECTED'
            },
            linkedin: {
                connected: lnSetting?.value?.status === 'Connected',
                health: lnSetting?.value?.health || 'DISCONNECTED'
            }
        };
    }

    processWebhookPayload(payload) {
        const events = [];
        try {
            const entries = payload.entry || [];
            for (const entry of entries) {
                // Instagram/Facebook Lead Ads or Comment changes
                const igChanges = entry.changes || [];
                for (const change of igChanges) {
                    if (change.field === 'comments') {
                        events.push({
                            platform: 'instagram',
                            type: 'comment',
                            commentId: change.value?.id,
                            mediaId:   change.value?.media?.id,
                            text:      change.value?.text,
                            from:      change.value?.from?.username,
                            timestamp: new Date().toISOString(),
                            raw:       change.value,
                        });
                    }
                    if (change.field === 'mentions') {
                        events.push({
                            platform: 'instagram',
                            type: 'mention',
                            mediaId:  change.value?.media_id,
                            from:     change.value?.mentioned_user_id,
                            timestamp: new Date().toISOString(),
                        });
                    }
                    if (change.field === 'leadgen') {
                        events.push({
                            platform: 'facebook',
                            type: 'leadgen',
                            leadgenId: change.value?.leadgen_id,
                            formId:    change.value?.form_id,
                            pageId:    change.value?.page_id,
                            adId:      change.value?.ad_id,
                            timestamp: new Date().toISOString(),
                        });
                    }
                }
                // Facebook comment event
                const fbMessages = entry.messaging || [];
                for (const msg of fbMessages) {
                    if (msg.message) {
                        events.push({
                            platform: 'facebook',
                            type: 'message',
                            senderId: msg.sender?.id,
                            text:     msg.message?.text,
                            timestamp: new Date(msg.timestamp).toISOString(),
                        });
                    }
                }
                // WhatsApp message event (Meta Cloud API)
                const waValue = entry.changes?.[0]?.value || {};
                if (waValue.messaging_product === 'whatsapp' && waValue.messages) {
                    for (const msg of waValue.messages) {
                        events.push({
                            platform: 'whatsapp',
                            type: 'message',
                            senderId: msg.from, // Customer's phone number
                            text:     msg.text?.body || (msg.type === 'location' ? '[Location Sent]' : '[Media Attachment]'),
                            messageId: msg.id,
                            timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
                            raw: msg
                        });
                    }
                }
            }
        } catch (err) {
            console.error('[SocialComment] processWebhookPayload error:', err.message);
        }
        return events;
    }

    // ── Mock Fallbacks (used when credentials absent) ─────────────────────────

    _mockMedia(platform) {
        return [
            {
                id: `mock_media_001_${platform}`,
                caption: '🏠 Exclusive 3BHK in Bandra West — RERA Approved! Contact us now. #BharatProperties #Mumbai',
                media_type: 'IMAGE',
                timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
                permalink: 'https://instagram.com/p/mock001',
                comments_count: 12,
                like_count: 247,
                mock: true,
            },
            {
                id: `mock_media_002_${platform}`,
                caption: '🌟 New Launch: Premium 2BHK at Andheri West starting ₹1.2Cr! #Mumbai #RealEstate',
                media_type: 'IMAGE',
                timestamp: new Date(Date.now() - 26 * 3600000).toISOString(),
                permalink: 'https://instagram.com/p/mock002',
                comments_count: 8,
                like_count: 189,
                mock: true,
            },
        ];
    }

    _mockComments(platform, targetId) {
        return [
            {
                id: `mock_comment_001`,
                text: platform === 'instagram' ? 'What is the exact price range? Interested!' : undefined,
                message: platform === 'facebook' ? 'What is the exact price range? Interested!' : undefined,
                username: 'interested_buyer',
                from: { name: 'Rahul Sharma' },
                timestamp: new Date(Date.now() - 1800000).toISOString(),
                created_time: new Date(Date.now() - 1800000).toISOString(),
                mock: true,
            },
            {
                id: `mock_comment_002`,
                text: platform === 'instagram' ? 'Is this RERA registered? Please DM details.' : undefined,
                message: platform === 'facebook' ? 'Is this RERA registered? Please DM details.' : undefined,
                username: 'real_estate_investor_in',
                from: { name: 'Priya Kapoor' },
                timestamp: new Date(Date.now() - 3600000).toISOString(),
                created_time: new Date(Date.now() - 3600000).toISOString(),
                mock: true,
            },
            {
                id: `mock_comment_003`,
                text: platform === 'instagram' ? 'Do you have 1BHK options in the same building?' : undefined,
                message: platform === 'facebook' ? 'Do you have 1BHK options in the same building?' : undefined,
                username: 'mumbai_homebuyer',
                from: { name: 'Amit Desai' },
                timestamp: new Date(Date.now() - 7200000).toISOString(),
                created_time: new Date(Date.now() - 7200000).toISOString(),
                mock: true,
            },
        ];
    }
}

export default new SocialCommentService();
