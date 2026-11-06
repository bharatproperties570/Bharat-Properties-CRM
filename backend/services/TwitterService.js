import axios from 'axios';
import crypto from 'crypto';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

/**
 * TwitterService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Professional Twitter / X API v2 Integration Service.
 * Handles OAuth 1.0a User Context & OAuth 2.0 Bearer Token Tweet Publishing.
 */
class TwitterService {
    constructor() {
        this.apiBase = 'https://api.twitter.com/2';
        this.uploadBase = 'https://upload.twitter.com/1.1';
    }

    /**
     * Fetch Twitter credentials from system settings.
     */
    async _getConfig() {
        const doc = await SystemSetting.findOne({ key: 'twitter_integration' }).lean();
        return doc?.value || {};
    }

    /**
     * Publish a tweet / thread to Twitter/X
     * @param {string} text - Tweet text (up to 280 chars or Premium length)
     * @param {string} mediaUrl - Optional public image URL
     */
    async postTweet(text, mediaUrl = null) {
        const config = await this._getConfig();

        const hasOAuth1 = Boolean(
            config.apiKey && 
            config.apiSecret && 
            config.accessToken && 
            config.accessTokenSecret
        );
        const hasBearer = Boolean(config.bearerToken);

        if (!hasOAuth1 && !hasBearer) {
            throw new Error(
                'Twitter / X integration is not configured. Please enter your API Key and Access Token in Settings > Integrations > Twitter/X.'
            );
        }

        const tweetPayload = {
            text: text
        };

        // If media URL is provided and not localhost, append it or upload
        let mediaId = null;
        if (mediaUrl && !mediaUrl.includes('localhost') && !mediaUrl.includes('127.0.0.1')) {
            try {
                if (hasOAuth1) {
                    mediaId = await this._uploadMediaOAuth1(mediaUrl, config);
                    if (mediaId) {
                        tweetPayload.media = { media_ids: [mediaId] };
                    }
                } else {
                    // Fallback: If only Bearer token available, append image URL to text
                    tweetPayload.text = `${text}\n\n${mediaUrl}`;
                }
            } catch (mediaErr) {
                console.warn('[TwitterService] Media upload failed, posting text only:', mediaErr.message);
                tweetPayload.text = `${text}\n\n${mediaUrl}`;
            }
        }

        const endpoint = `${this.apiBase}/tweets`;

        try {
            let res;
            if (hasOAuth1) {
                const authHeader = this._buildOAuth1Header('POST', endpoint, {}, config);
                res = await axios.post(endpoint, tweetPayload, {
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
            } else {
                res = await axios.post(endpoint, tweetPayload, {
                    headers: {
                        'Authorization': `Bearer ${config.bearerToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
            }

            const tweetData = res.data?.data || {};
            return {
                success: true,
                tweetId: tweetData.id || `tw_${Date.now()}`,
                url: tweetData.id ? `https://x.com/i/web/status/${tweetData.id}` : null,
                text: tweetData.text || text
            };
        } catch (err) {
            const apiMsg = err.response?.data?.errors?.[0]?.message || 
                           err.response?.data?.detail || 
                           err.message;
            console.error('[TwitterService] Tweet error:', apiMsg);
            throw new Error(`Twitter / X publish failed: ${apiMsg}`);
        }
    }

    /**
     * Upload an image to Twitter Media Upload v1.1 using OAuth 1.0a
     */
    async _uploadMediaOAuth1(imageUrl, config) {
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 8000 });
        const base64Data = Buffer.from(imgRes.data).toString('base64');

        const uploadUrl = `${this.uploadBase}/media/upload.json`;
        const bodyParams = { media_data: base64Data };

        const authHeader = this._buildOAuth1Header('POST', uploadUrl, {}, config);

        const formParams = new URLSearchParams();
        formParams.append('media_data', base64Data);

        const uploadRes = await axios.post(uploadUrl, formParams.toString(), {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 12000
        });

        return uploadRes.data?.media_id_string || null;
    }

    /**
     * Verify credentials without posting a tweet.
     * Hits GET https://api.twitter.com/2/users/me using OAuth 1.0a or Bearer.
     */
    async verifyCredentials(configOverride = null) {
        let config = configOverride;
        if (!config || Object.keys(config).length === 0) {
            if (SystemSetting.db?.readyState === 1) {
                config = await this._getConfig();
            } else {
                config = {};
            }
        }

        const hasOAuth1 = Boolean(
            config.apiKey && 
            config.apiSecret && 
            config.accessToken && 
            config.accessTokenSecret
        );
        const hasBearer = Boolean(config.bearerToken);

        if (!hasOAuth1 && !hasBearer) {
            return {
                success: false,
                error: 'Missing required credentials. Please provide API Key, API Secret, Access Token, and Access Token Secret.'
            };
        }

        const endpoint = `${this.apiBase}/users/me`;

        try {
            let res;
            if (hasOAuth1) {
                const authHeader = this._buildOAuth1Header('GET', endpoint, {}, config);
                res = await axios.get(endpoint, {
                    headers: { 'Authorization': authHeader },
                    timeout: 8000
                });
            } else {
                res = await axios.get(endpoint, {
                    headers: { 'Authorization': `Bearer ${config.bearerToken}` },
                    timeout: 8000
                });
            }

            const userData = res.data?.data || {};
            return {
                success: true,
                message: `✓ Connected to Twitter / X as @${userData.username || 'twitter_user'} (${userData.name || 'Verified User'})`,
                user: userData
            };
        } catch (err) {
            const apiMsg = err.response?.data?.detail || err.response?.data?.errors?.[0]?.message || err.message;
            return {
                success: false,
                error: `Twitter / X verification failed: ${apiMsg}`
            };
        }
    }

    /**
     * Builds standard RFC 5849 OAuth 1.0a Authorization Header using native Node crypto.
     */
    _buildOAuth1Header(method, url, extraParams = {}, config) {
        const oauthParams = {
            oauth_consumer_key: config.apiKey,
            oauth_nonce: crypto.randomBytes(16).toString('hex'),
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_token: config.accessToken,
            oauth_version: '1.0',
            ...extraParams
        };

        const sortedKeys = Object.keys(oauthParams).sort();
        const paramString = sortedKeys
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
            .join('&');

        const baseString = [
            method.toUpperCase(),
            encodeURIComponent(url),
            encodeURIComponent(paramString)
        ].join('&');

        const signingKey = `${encodeURIComponent(config.apiSecret)}&${encodeURIComponent(config.accessTokenSecret || '')}`;
        const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

        oauthParams.oauth_signature = signature;

        const headerKeys = Object.keys(oauthParams).sort();
        const headerString = 'OAuth ' + headerKeys
            .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
            .join(', ');

        return headerString;
    }
}

export default new TwitterService();
