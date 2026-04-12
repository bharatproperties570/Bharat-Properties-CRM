import axios from 'axios';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

/**
 * FacebookService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Professional Meta Graph API Service for FB Pages & Instagram Business.
 * Handles Long-lived Token Exchange and Enterprise-level Posting.
 */
class FacebookService {
    constructor() {
        this.graphVersion = 'v19.0';
        this.graphBase = 'https://graph.facebook.com';
    }

    // ── Config ────────────────────────────────────────────────────────────────

    async _getConfig() {
        const config = await SystemSetting.findOne({ key: 'social_graph_config' }).lean();
        return config?.value || {};
    }

    /**
     * Step 1: Exchange Short-lived User Token for Long-lived User Token (60 days)
     */
    async exchangeUserToken(shortLivedToken) {
        try {
            const url = `${this.graphBase}/${this.graphVersion}/oauth/access_token`;
            const { data } = await axios.get(url, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: process.env.FB_CLIENT_ID,
                    client_secret: process.env.FB_CLIENT_SECRET,
                    fb_exchange_token: shortLivedToken
                }
            });
            return data.access_token;
        } catch (err) {
            console.error('[FacebookService] Token exchange error:', err.response?.data || err.message);
            throw err;
        }
    }

    /**
     * Step 2: Get Long-lived Page Access Token
     */
    async getPageAccessToken(userAccessToken, pageId) {
        try {
            const url = `${this.graphBase}/${this.graphVersion}/${pageId}`;
            const { data } = await axios.get(url, {
                params: {
                    fields: 'access_token',
                    access_token: userAccessToken
                }
            });
            return data.access_token;
        } catch (err) {
            console.error('[FacebookService] Page token error:', err.response?.data || err.message);
            throw err;
        }
    }

    /**
     * Post Text + Image to Facebook Page
     */
    async postToPage(text, imageUrl) {
        const config = await this._getConfig();
        if (!config.pageAccessToken || !config.pageId) {
             throw new Error('Facebook Page credentials missing');
        }

        try {
            const url = `${this.graphBase}/${this.graphVersion}/${config.pageId}/photos`;
            const { data } = await axios.post(url, null, {
                params: {
                    url: imageUrl,
                    caption: text,
                    access_token: config.pageAccessToken
                }
            });
            return { success: true, postId: data.id };
        } catch (err) {
            console.error('[FacebookService] Page post fatal error:', err.response?.data || err.message);
            throw err;
        }
    }
}

export default new FacebookService();
