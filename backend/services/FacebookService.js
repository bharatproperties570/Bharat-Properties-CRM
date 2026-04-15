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
            throw new Error(`[Meta Permission Fix] Your App is requesting deprecated "publish_actions". Please update your Meta App to use "pages_manage_posts" instead.`);
        }
        if (apiError.includes('permission') || apiError.includes('access')) {
            throw new Error(`[Permission Required] Please verify your Page Token has "pages_manage_posts" and "instagram_content_publish" enabled in the Meta Developer Portal.`);
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
}

export default new FacebookService();
