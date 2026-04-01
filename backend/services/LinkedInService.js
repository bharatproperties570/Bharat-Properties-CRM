import axios from 'axios';
import SystemSetting from '../models/SystemSetting.js';

/**
 * LinkedInService.js
 * Handles OAuth2 and Posting for LinkedIn Organizations.
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
     * Generate Authorization URL
     */
    async getAuthUrl() {
        const config = await this._getConfig();
        const { clientId, redirectUri } = config;

        if (!clientId || !redirectUri) {
            throw new Error('LinkedIn Client ID and Redirect URI must be configured in Settings');
        }

        const scopes = ['w_organization_social', 'rw_organization_admin', 'r_organization_social', 'r_liteprofile', 'w_member_social'].join(' ');
        
        return `${this.authUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=linkedin_auth`;
    }

    /**
     * Exchange Code for Token
     */
    async handleCallback(code) {
        const config = await this._getConfig();
        const { clientId, clientSecret, redirectUri } = config;

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

        const tokenData = response.data;
        
        // Save token to config
        await SystemSetting.findOneAndUpdate(
            { key: 'linkedin_integration' },
            { 
                $set: { 
                    'value.accessToken': tokenData.access_token,
                    'value.expiresIn': tokenData.expires_in,
                    'value.connectedAt': new Date(),
                    'value.status': 'Connected'
                } 
            },
            { upsert: true }
        );

        return tokenData;
    }

    /**
     * Post to LinkedIn Organization
     * @param {string} text - Post content
     * @param {string} orgId - Numeric Organization ID (e.g. 42752175)
     */
    async postToOrganization(text, orgId) {
        try {
            const config = await this._getConfig();
            const token = config.accessToken;
            const targetOrgId = orgId || config.orgId;

            if (!token) throw new Error('LinkedIn not connected');
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

            const response = await axios.post(`${this.restliBase}/posts`, postData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'LinkedIn-Version': '202401', // Use a recent version
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
