import axios from 'axios';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

/**
 * LinkedInService.js
 * Handles OAuth2 (OIDC), Token Refresh, and Posting for LinkedIn.
 * Updated to Phase 1: Robust Authentication Standards.
 */
class LinkedInService {
    constructor() {
        this.authUrl = 'https://www.linkedin.com/oauth/v2/authorization';
        this.tokenUrl = 'https://www.linkedin.com/oauth/v2/accessToken';
        this.apiBase = 'https://api.linkedin.com/v2';
        this.restliBase = 'https://api.linkedin.com/rest/v2';
    }

    /**
     * Get LinkedIn Config from SystemSettings
     */
    async _getConfig() {
        const config = await SystemSetting.findOne({ key: 'linkedin_integration' });
        return config?.value || {};
    }

    /**
     * Generate Authorization URL with Modern Scopes
     */
    async getAuthUrl() {
        const config = await this._getConfig();
        const { clientId, redirectUri } = config;

        if (!clientId || !redirectUri) {
            throw new Error('LinkedIn Client ID and Redirect URI must be configured in Settings');
        }

        // BARE MINIMUM SCOPES: Focusing strictly on personal profile posting.
        // Organization-level scopes (w_organization_social, etc.) are being rejected by LinkedIn for this app.
        const scopes = [
            'openid',
            'profile',
            'email',
            'w_member_social'
        ].filter(Boolean).join(' ');
        
        console.log('[LinkedInService] Generating Auth URL with scopes:', scopes);
        
        // Added prompt=consent to ensure refresh_token is always returned on re-auth
        return `${this.authUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=linkedin_auth&prompt=consent`;
    }

    /**
     * Get Ad Accounts registered to the authenticated organization
     */
    async getAdAccounts(orgId) {
        const token = await this.getAccessToken();
        const config = await this._getConfig();
        const targetOrgId = orgId || config.orgId;

        const response = await axios.get(`${this.apiBase}/adAccountsV2`, {
            params: {
                q: 'search',
                search: `(organization:(values:List(urn:li:organization:${targetOrgId})))`
            },
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Restli-Protocol-Version': '2.0.0'
            }
        });

        return response.data.elements;
    }

    /**
     * Get Lead Submissions for a specific Ad Account
     * @param {string} adAccountId - e.g. "urn:li:adAccount:123"
     */
    async getLeads(adAccountUrn) {
        const token = await this.getAccessToken();
        
        // Fetch lead submissions (simplified version - real world uses pollers or webhooks)
        const response = await axios.get(`${this.apiBase}/adAccounts/${adAccountUrn.split(':').pop()}/leadGenForms`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Restli-Protocol-Version': '2.0.0'
            }
        });

        // This is a high-level representation. Actual lead retrieval involves 
        // fetching submissions per form.
        return response.data.elements;
    }

    /**
     * Exchange Code for Tokens (Access + Refresh)
     */
    async handleCallback(code) {
        const config = await this._getConfig();
        const { clientId, clientSecret, redirectUri } = config;

        console.log('[LinkedInService] Exchanging code for token...', { clientId, redirectUri });

        const response = await axios.post(this.tokenUrl, null, {
            params: {
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('[LinkedInService] Token exchange successful');

        const tokenData = response.data;
        
        // Calculate expiration dates
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (tokenData.expires_in * 1000));
        const refreshExpiresAt = tokenData.refresh_token_expires_in 
            ? new Date(now.getTime() + (tokenData.refresh_token_expires_in * 1000))
            : new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)); // Default 1 year if missing

        // Save tokens to config
        await SystemSetting.findOneAndUpdate(
            { key: 'linkedin_integration' },
            { 
                $set: { 
                    'value.accessToken': tokenData.access_token,
                    'value.expiresAt': expiresAt,
                    'value.refreshToken': tokenData.refresh_token,
                    'value.refreshTokenExpiresAt': refreshExpiresAt,
                    'value.connectedAt': now,
                    'value.status': 'Connected',
                    'value.health': 'HEALTHY',
                    'value.lastRefreshedAt': now,
                    'value.statusError': null, // Clear any previous errors
                    'category': 'integration',
                    'active': true
                } 
            },
            { upsert: true }
        );

        return tokenData;
    }

    /**
     * Exchange Refresh Token for a New Access Token
     */
    async refreshToken() {
        const config = await this._getConfig();
        const { clientId, clientSecret, refreshToken } = config;

        if (!refreshToken) throw new Error('No LinkedIn refresh token available');

        console.log('[LinkedInService] Refreshing access token...');
        
        try {
            const response = await axios.post(this.tokenUrl, null, {
                params: {
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: clientId,
                    client_secret: clientSecret
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const tokenData = response.data;
            const now = new Date();
            const expiresAt = new Date(now.getTime() + (tokenData.expires_in * 1000));

            // Update only the access token and its expiry
            await SystemSetting.findOneAndUpdate(
                { key: 'linkedin_integration' },
                { 
                    $set: { 
                        'value.accessToken': tokenData.access_token,
                        'value.expiresAt': expiresAt,
                        'value.lastRefreshedAt': now,
                        'value.health': 'HEALTHY'
                    } 
                }
            );

            return tokenData.access_token;
        } catch (err) {
            console.error('[LinkedInService] Refresh Fail:', err.response?.data || err.message);
            // If invalid grant, mark health as EXPIRED but keep the status and credentials
            if (err.response?.data?.error === 'invalid_grant' || err.response?.data?.error === 'access_denied') {
                await SystemSetting.findOneAndUpdate(
                    { key: 'linkedin_integration' },
                    { $set: { 'value.health': 'EXPIRED', 'value.statusError': err.response?.data?.error_description || 'Auth Failed' } }
                );
            }
            throw err;
        }
    }

    /**
     * Get a valid Access Token, refreshing it if necessary
     */
    async getAccessToken() {
        const config = await this._getConfig();
        const { accessToken, expiresAt, status } = config;

        if (status === 'Disconnected') throw new Error('LinkedIn disconnected');
        if (!accessToken) throw new Error('LinkedIn not connected');

        // Refresh if expired or expiring within 5 minutes
        const isExpiring = expiresAt && (new Date(expiresAt).getTime() - Date.now()) < 5 * 60 * 1000;
        
        if (isExpiring) {
            return await this.refreshToken();
        }

        return accessToken;
    }

    /**
     * Step 1: Register an Image Upload with LinkedIn
     * @param {string} orgId - Organization ID
     */
    async registerImageUpload(orgId) {
        const token = await this.getAccessToken();
        const config = await this._getConfig();
        const targetOrgId = orgId || config.orgId;

        const payload = {
            registerUploadRequest: {
                recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                owner: `urn:li:organization:${targetOrgId}`,
                serviceRelationships: [
                    {
                        relationshipType: 'OWNER',
                        identifier: 'urn:li:userGeneratedContent'
                    }
                ]
            }
        };

        const response = await axios.post(`${this.restliBase}/assets?action=registerUpload`, payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'LinkedIn-Version': '202401',
                'Content-Type': 'application/json'
            }
        });

        return {
            uploadUrl: response.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl,
            asset: response.data.value.asset
        };
    }

    /**
     * Step 2: Upload Binary Data to LinkedIn's Upload URL
     */
    async uploadImageBinary(uploadUrl, buffer, mimeType) {
        const token = await this.getAccessToken();
        await axios.put(uploadUrl, buffer, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': mimeType
            }
        });
        return true;
    }

    /**
     * Post to LinkedIn Organization (Supports optional Media)
     * @param {string} text - Post content
     * @param {string} orgId - Numeric Organization ID
     * @param {string} mediaAssetUrn - Optional URN from Step 1/2
     */
    async postToOrganization(text, orgId, mediaAssetUrn = null) {
        try {
            const token = await this.getAccessToken(); // Automated refresh
            const config = await this._getConfig();
            const targetOrgId = orgId || config.orgId;

            if (!targetOrgId) throw new Error('LinkedIn Organization ID missing');

            const postData = {
                author: `urn:li:organization:${targetOrgId}`,
                commentary: text,
                visibility: 'PUBLIC',
                distribution: {
                    feedDistribution: 'MAIN_FEED',
                    targetEntities: [],
                    thirdPartyDistributionChannels: []
                },
                lifecycleState: 'PUBLISHED',
                isReshareDisabledByAuthor: false
            };

            // If media is provided, add the content block
            if (mediaAssetUrn) {
                postData.content = {
                    media: {
                        title: 'Property Update',
                        id: mediaAssetUrn
                    }
                };
            }

            const response = await axios.post(`${this.restliBase}/posts`, postData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'LinkedIn-Version': '202401',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'Content-Type': 'application/json'
                }
            });

            return { success: true, postId: response.headers['x-restli-id'] };
        } catch (err) {
            console.error('[LinkedInService] Post Error:', err.response?.data || err.message);
            throw new Error(err.response?.data?.message || err.message);
        }
    }
}

export default new LinkedInService();
