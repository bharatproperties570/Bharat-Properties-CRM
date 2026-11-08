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
     * Helper to resolve clean App ID & App Secret (preferring saved DB config, falling back to valid env)
     */
    _resolveAppCredentials(config) {
        const cleanEnvAppId = (process.env.FB_CLIENT_ID || process.env.FB_APP_ID || process.env.FB_GRAPH_APP_ID || '').trim();
        const validEnvAppId = (cleanEnvAppId && !cleanEnvAppId.startsWith('YOUR_')) ? cleanEnvAppId : null;
        const appId = (config?.appId || validEnvAppId || '1676785590510736').toString().trim();

        const cleanEnvSecret = (process.env.FB_CLIENT_SECRET || process.env.FB_APP_SECRET || '').trim();
        const validEnvSecret = (cleanEnvSecret && !cleanEnvSecret.startsWith('YOUR_')) ? cleanEnvSecret : null;
        const appSecret = (config?.appSecret || validEnvSecret || '').toString().trim();

        return { appId, appSecret };
    }

    /**
     * Step 1: Exchange Short-lived User Token for Long-lived User Token (60 days)
     */
    async exchangeUserToken(shortLivedToken) {
        try {
            const config = await this._getConfig();
            const { appId, appSecret } = this._resolveAppCredentials(config);

            const url = `${this.graphBase}/${this.graphVersion}/oauth/access_token`;
            const { data } = await axios.get(url, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: appId,
                    client_secret: appSecret,
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
     * Post to Facebook Page (Feed, Story, or Reel)
     * @param {string} text 
     * @param {string} imageUrl 
     * @param {string} format 'post' | 'story' | 'reel'
     */
    async postToPage(text, imageUrl, format = 'post') {
        const config = await this._getConfig();
        
        if (!config.pageAccessToken) {
            throw new Error('Facebook Page Access Token missing. Go to Settings > Integrations to configure.');
        }
        if (!config.pageId) {
            throw new Error('Facebook Page ID missing.');
        }

        try {
            // Defensive check for local URLs
            if (imageUrl && (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1'))) {
                throw new Error('Cannot upload local image to Facebook. Use a public image URL.');
            }

            let url = '';
            let params = { access_token: config.pageAccessToken };

            if (format === 'story') {
                // PHOTO STORIES (Official v19.0 path)
                // Step 1: Upload photo as unpublished
                const uploadUrl = `${this.graphBase}/${this.graphVersion}/${config.pageId}/photos`;
                const uploadRes = await axios.post(uploadUrl, null, {
                    params: {
                        url: imageUrl || 'https://via.placeholder.com/1080x1920?text=Bharat+Properties',
                        published: false,
                        access_token: config.pageAccessToken
                    }
                });
                
                // Step 2: Publish as Story
                url = `${this.graphBase}/${this.graphVersion}/${config.pageId}/photo_stories`;
                params.photo_id = uploadRes.data.id;
            } else if (format === 'reel') {
                // REELS (Requires Video, fallback to generic video reels endpoint)
                // Note: Direct Reel publishing from Image is restricted, returning helpful error
                throw new Error('Facebook Reels require a video file. Please use the Instagram platform for image-based Reels/Stories or upload a .mp4 asset.');
            } else {
                // STANDARD FEED POST
                url = `${this.graphBase}/${this.graphVersion}/${config.pageId}/photos`;
                params.url = imageUrl || 'https://via.placeholder.com/800x600?text=Bharat+Properties';
                params.caption = text;
            }

            const { data } = await axios.post(url, null, { params });
            return { success: true, postId: data.id };
        } catch (err) {
            this._handleApiError(err, 'Facebook');
        }
    }

    /**
     * Post to Instagram via Graph API (Post, Story, or Reel)
     * @param {string} text 
     * @param {string} imageUrl 
     * @param {string} format 'post' | 'story' | 'reel'
     */
    async postToInstagram(text, imageUrl, format = 'post') {
        const config = await this._getConfig();
        
        if (!config.pageAccessToken || !config.igUserId) {
            throw new Error('Instagram Business ID or Page Token missing.');
        }

        try {
            if (imageUrl && (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1'))) {
                throw new Error('Cannot upload local image to Instagram. Use a public image URL.');
            }

            const mediaUrl = imageUrl || 'https://via.placeholder.com/1080x1920?text=Bharat+Properties';

            // 1. Create Media Container
            const containerUrl = `${this.graphBase}/${this.graphVersion}/${config.igUserId}/media`;
            const containerParams = {
                access_token: config.pageAccessToken,
                caption: format === 'story' ? undefined : text // Stories don't have captions in the same way
            };

            if (format === 'story') {
                containerParams.image_url = mediaUrl;
                containerParams.media_type = 'STORIES';
            } else if (format === 'reel') {
                // If its an image, IG allows creating a Reel from it sometimes, but officially needs video_url
                containerParams.image_url = mediaUrl;
                containerParams.media_type = 'REELS'; 
            } else {
                containerParams.image_url = mediaUrl;
            }

            const containerRes = await axios.post(containerUrl, null, { params: containerParams });
            const creationId = containerRes.data.id;

            // 2. Publish Media
            const publishUrl = `${this.graphBase}/${this.graphVersion}/${config.igUserId}/media_publish`;
            const publishRes = await axios.post(publishUrl, null, {
                params: {
                    creation_id: creationId,
                    access_token: config.pageAccessToken
                }
            });

            return { success: true, postId: publishRes.data.id };
        } catch (err) {
            this._handleApiError(err, 'Instagram');
        }
    }

    /**
     * Professional error transformer to handle deprecated permissions (publish_actions)
     */
    _handleApiError(err, platform) {
        const apiError = err.response?.data?.error?.message || err.message;
        console.error(`[FacebookService] ${platform} error:`, apiError);

        if (apiError.includes('publish_actions')) {
            throw new Error(`[Meta Permission Configuration Error] The Meta API returned a permission warning. Meta has deprecated the legacy "publish_actions" scope in favor of "pages_manage_posts". 
            Your generated Page Access Token does not have "pages_manage_posts" permission, or your Meta App is not authorized with this permission.
            ACTION REQUIRED: 
            1. Go to your Meta Developer Console > App Review > Permissions and Features.
            2. Verify that "pages_manage_posts" (for Facebook Pages) and "instagram_content_publish" (for Instagram Business) are requested and approved.
            3. Regenerate your Long-lived Page Access Token with these correct permissions under Settings > Integrations.`);
        }
        if (apiError.includes('permission') || apiError.includes('access')) {
            throw new Error(`[Permission Required] The provided Page Access Token does not have permission to publish content to this platform. 
            Ensure you have scoped "pages_manage_posts" (for FB Pages) and "instagram_content_publish" (for Instagram) when generating the token.`);
        }
        
        throw new Error(apiError);
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

    /**
     * Generate Meta OAuth Authorization URL for 1-Click Connect
     */
    async getOAuthUrl(redirectUri) {
        const config = await this._getConfig();
        const { appId } = this._resolveAppCredentials(config);
        
        if (!appId) {
            throw new Error('Meta App ID is missing. Please configure your Meta App ID in CRM Settings > Integrations.');
        }

        const scopes = [
            'pages_show_list',
            'pages_read_engagement',
            'pages_manage_posts',
            'instagram_basic',
            'instagram_content_publish',
            'public_profile'
        ].join(',');

        const state = Math.random().toString(36).substring(7);
        const url = `https://www.facebook.com/${this.graphVersion}/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;

        return { url, appId, redirectUri };
    }

    /**
     * Handle OAuth Callback:
     * 1. Exchange code for user access token
     * 2. Exchange for 60-day long-lived user token
     * 3. Fetch user's managed Facebook Pages and linked Instagram accounts
     * 4. Persist never-expiring Page Access Token & Instagram User ID to social_graph_config
     */
    async handleOAuthCallback(code, redirectUri, userContext = null) {
        const config = await this._getConfig();
        const { appId, appSecret } = this._resolveAppCredentials(config);

        if (!appId || !appSecret) {
            throw new Error('Meta App ID or App Secret is missing. Please configure them in Settings > Integrations.');
        }

        try {
            console.log(`[FacebookService] Exchanging code for user token (App ID: ${appId})...`);
            
            // 1. Code -> Short-lived User Token
            const tokenRes = await axios.get(`${this.graphBase}/${this.graphVersion}/oauth/access_token`, {
                params: {
                    client_id: appId,
                    client_secret: appSecret,
                    redirect_uri: redirectUri,
                    code: code
                }
            });
            const shortLivedToken = tokenRes.data.access_token;

            // 2. Short-lived User Token -> Long-lived User Token (60 days)
            let longLivedToken = shortLivedToken;
            try {
                const exchangeRes = await axios.get(`${this.graphBase}/${this.graphVersion}/oauth/access_token`, {
                    params: {
                        grant_type: 'fb_exchange_token',
                        client_id: appId,
                        client_secret: appSecret,
                        fb_exchange_token: shortLivedToken
                    }
                });
                if (exchangeRes.data?.access_token) {
                    longLivedToken = exchangeRes.data.access_token;
                    console.log('[FacebookService] Successfully exchanged for long-lived Meta user token');
                }
            } catch (exErr) {
                console.warn('[FacebookService] Long-lived exchange warning, proceeding with primary token:', exErr.message);
            }

            // 3. Fetch all managed Facebook Pages with their linked Instagram Business accounts
            const pagesRes = await axios.get(`${this.graphBase}/${this.graphVersion}/me/accounts`, {
                params: {
                    fields: 'id,name,access_token,category,instagram_business_account{id,username,name,profile_picture_url}',
                    access_token: longLivedToken
                }
            });

            const pages = pagesRes.data.data || [];
            if (pages.length === 0) {
                throw new Error('No Facebook Pages found under this Facebook account. Please ensure you are an Admin of a Facebook Page.');
            }

            // Prefer a page named "Bharat Properties" or select the first available page
            let selectedPage = pages.find(p => p.name?.toLowerCase().includes('bharat')) || pages[0];

            const pageAccessToken = selectedPage.access_token;
            const pageId = selectedPage.id;
            const pageName = selectedPage.name;
            const igAccount = selectedPage.instagram_business_account;

            const updateData = {
                appId,
                appSecret,
                pageId,
                pageName,
                pageAccessToken,
                igUserId: igAccount?.id || null,
                igUsername: igAccount?.username || null,
                connectedAt: new Date().toISOString(),
                connectedBy: userContext?.name || userContext?.email || 'Admin',
                availablePages: pages.map(p => ({
                    id: p.id,
                    name: p.name,
                    hasInstagram: !!p.instagram_business_account,
                    igUsername: p.instagram_business_account?.username || null
                }))
            };

            await SystemSetting.findOneAndUpdate(
                { key: 'social_graph_config' },
                { $set: { value: updateData, active: true, category: 'integration' } },
                { upsert: true }
            );

            console.log(`[FacebookService] Successfully connected Page: "${pageName}" (${pageId}), Instagram: "${igAccount?.username || 'N/A'}"`);

            return {
                success: true,
                message: `Successfully connected Facebook Page "${pageName}"${igAccount ? ` and Instagram (@${igAccount.username})` : ''}!`,
                data: {
                    pageId,
                    pageName,
                    instagram: igAccount ? { id: igAccount.id, username: igAccount.username } : null,
                    totalPages: pages.length
                }
            };
        } catch (err) {
            console.error('[FacebookService] OAuth Callback Error:', err.response?.data || err.message);
            const msg = err.response?.data?.error?.message || err.message;
            throw new Error(msg);
        }
    }

    /**
     * Disconnect Facebook & Instagram
     */
    async disconnect() {
        await SystemSetting.findOneAndUpdate(
            { key: 'social_graph_config' },
            { 
                $set: { 
                    'value.pageAccessToken': null,
                    'value.pageId': null,
                    'value.pageName': null,
                    'value.igUserId': null,
                    'value.igUsername': null,
                    'value.connectedAt': null
                } 
            }
        );
        return { success: true, message: 'Disconnected Facebook and Instagram successfully' };
    }

    /**
     * Get OAuth Status
     */
    async getOAuthStatus() {
        const config = await this._getConfig();
        const hasAppId = !!(process.env.FB_CLIENT_ID || process.env.FB_APP_ID || config.appId);
        const hasAppSecret = !!(process.env.FB_CLIENT_SECRET || process.env.FB_APP_SECRET || config.appSecret);
        const isFacebookConnected = !!(config.pageAccessToken && config.pageId);
        const isInstagramConnected = !!(config.pageAccessToken && config.igUserId);

        return {
            hasAppCredentials: hasAppId && hasAppSecret,
            appId: config.appId || process.env.FB_CLIENT_ID || process.env.FB_APP_ID || null,
            facebook: {
                connected: isFacebookConnected,
                pageId: config.pageId || null,
                pageName: config.pageName || null,
            },
            instagram: {
                connected: isInstagramConnected,
                igUserId: config.igUserId || null,
                igUsername: config.igUsername || null,
            },
            connectedAt: config.connectedAt || null,
            connectedBy: config.connectedBy || null,
            availablePages: config.availablePages || []
        };
    }
}

export default new FacebookService();
