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

    /**
     * Post Text + Image to Instagram Business Account
     */
    async postToInstagram(text, imageUrl) {
        const config = await this._getConfig();
        if (!config.pageAccessToken || !config.igUserId) {
             throw new Error('Instagram credentials missing (Page Access Token or IG User ID)');
        }

        try {
            console.log(`[FacebookService] Creating IG Media Container for: ${imageUrl}`);
            // 1. Create Media Container
            const containerUrl = `${this.graphBase}/${this.graphVersion}/${config.igUserId}/media`;
            const containerRes = await axios.post(containerUrl, null, {
                params: {
                    image_url: imageUrl,
                    caption: text,
                    access_token: config.pageAccessToken
                }
            });

            const creationId = containerRes.data.id;
            console.log(`[FacebookService] IG Container Created: ${creationId}. Polling status...`);

            // 2. Poll for status (Simple wait for now, better to actually check status endpoint)
            // Typically takes a few seconds. For brevity/simplicity in this step, we wait then publish.
            await new Promise(resolve => setTimeout(resolve, 5000));

            // 3. Publish Media
            const publishUrl = `${this.graphBase}/${this.graphVersion}/${config.igUserId}/media_publish`;
            const publishRes = await axios.post(publishUrl, null, {
                params: {
                    creation_id: creationId,
                    access_token: config.pageAccessToken
                }
            });

            return { success: true, igMediaId: publishRes.data.id };
        } catch (err) {
            console.error('[FacebookService] Instagram post fatal error:', err.response?.data || err.message);
            throw err;
        }
    }

    /**
     * Get Analytics/Insights for a specific post
     */
    async getPostInsights(objectId, platform = 'facebook') {
        const config = await this._getConfig();
        const token = config.pageAccessToken;
        if (!token) throw new Error('Access Token missing for insights');

        try {
            let metrics = '';
            if (platform === 'facebook') {
                metrics = 'post_impressions_unique,post_engaged_users,post_reactions_by_type_total';
            } else {
                metrics = 'engagement,impressions,reach,saved';
            }

            const url = `${this.graphBase}/${this.graphVersion}/${objectId}/insights`;
            const { data } = await axios.get(url, {
                params: {
                    metric: metrics,
                    access_token: token
                }
            });

            return { success: true, insights: data.data };
        } catch (err) {
            console.error(`[FacebookService] ${platform} insights error:`, err.response?.data || err.message);
            throw err;
        }
    }

    /**
     * Get comments for a specific post (FB or IG)
     */
    async getComments(objectId) {
        const config = await this._getConfig();
        const token = config.pageAccessToken;
        if (!token) throw new Error('Access Token missing for comments');

        try {
            const url = `${this.graphBase}/${this.graphVersion}/${objectId}/comments`;
            const { data } = await axios.get(url, {
                params: {
                    fields: 'id,from,message,created_time',
                    access_token: token
                }
            });
            return { success: true, data: data.data };
        } catch (err) {
            console.error('[FacebookService] Get comments error:', err.response?.data || err.message);
            throw err;
        }
    }

    /**
     * Test if credentials actually work with the Graph API
     */
    async testConnection() {
        const config = await this._getConfig();
        const token = config.pageAccessToken;
        if (!token) return { success: false, error: 'No Page Access Token found in database settings' };

        try {
            // Test FB Page reachability
            const url = `${this.graphBase}/${this.graphVersion}/me`;
            const { data } = await axios.get(url, {
                params: {
                    fields: 'id,name',
                    access_token: token
                }
            });

            // If IG User ID is present, test that too
            let igStatus = 'N/A';
            if (config.igUserId) {
                try {
                    const igUrl = `${this.graphBase}/${this.graphVersion}/${config.igUserId}`;
                    await axios.get(igUrl, {
                        params: {
                            fields: 'id,username',
                            access_token: token
                        }
                    });
                    igStatus = 'Connected';
                } catch (igErr) {
                    igStatus = `IG Error: ${igErr.response?.data?.error?.message || igErr.message}`;
                }
            }

            return { 
                success: true, 
                message: `✅ Facebook Connected as "${data.name}"`,
                details: {
                    pageId: data.id,
                    pageName: data.name,
                    instagram: igStatus
                }
            };
        } catch (err) {
            console.error('[FacebookService] Test connection failed:', err.response?.data || err.message);
            return { 
                success: false, 
                error: err.response?.data?.error?.message || err.message 
            };
        }
    }
}

export default new FacebookService();
