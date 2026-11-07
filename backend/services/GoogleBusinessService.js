import { google } from 'googleapis';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

/**
 * GoogleBusinessService.js
 * Handles business profile posts and metadata using Google My Business API.
 * Enterprise Refactored: Uses mybusinessaccountmanagement for accounts & mybusinessbusinessinformation for locations.
 */
class GoogleBusinessService {
    async _getOAuthClient() {
        const config = await SystemSetting.findOne({ key: 'google_integration' }).lean();
        if (!config || !config.value || !config.value.tokens) {
            throw new Error('Google Integration is not connected. Please connect Google in CRM Settings > Integrations.');
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'https://crm.bharatproperties.co'}/google-callback`
        );

        oauth2Client.setCredentials(config.value.tokens);

        // Auto-persist refreshed tokens so access tokens stay valid
        oauth2Client.on('tokens', async (newTokens) => {
            try {
                const current = await SystemSetting.findOne({ key: 'google_integration' }).lean();
                if (current?.value?.tokens) {
                    await SystemSetting.findOneAndUpdate(
                        { key: 'google_integration' },
                        { 'value.tokens': { ...current.value.tokens, ...newTokens } }
                    );
                    console.log('[GoogleBusinessService] Persisted refreshed OAuth tokens');
                }
            } catch (pErr) {
                console.warn('[GoogleBusinessService] Token persist failed:', pErr.message);
            }
        });

        return oauth2Client;
    }

    /**
     * Fetch list of locations managed by the account
     */
    async getLocations() {
        try {
            const auth = await this._getOAuthClient();
            
            // 🛡️ Enterprise Fix: In googleapis, accounts.list is under mybusinessaccountmanagement
            const accountManagement = google.mybusinessaccountmanagement({ version: 'v1', auth });
            const accountsResponse = await accountManagement.accounts.list();
            const accounts = accountsResponse.data.accounts || [];

            if (accounts.length === 0) {
                console.warn('[GoogleBusinessService] No GBP accounts returned by Google API');
                return [];
            }
            
            // And locations.list is under mybusinessbusinessinformation
            const businessInfo = google.mybusinessbusinessinformation({ version: 'v1', auth });
            let allLocations = [];
            for (const account of accounts) {
                try {
                    const locationsResponse = await businessInfo.accounts.locations.list({
                        parent: account.name,
                        readMask: 'name,title,storeCode'
                    });
                    allLocations = allLocations.concat(locationsResponse.data.locations || []);
                } catch (locErr) {
                    console.warn(`[GoogleBusinessService] Error reading locations for ${account.name}:`, locErr.message);
                }
            }
            
            return allLocations;
        } catch (error) {
            console.error('[GoogleBusinessService] GetLocations error:', error.message);
            if (error.message?.includes('invalid_grant') || error.response?.data?.error === 'invalid_grant') {
                throw new Error('Google account session expired. Please go to CRM Settings > Integrations and click "Reconnect Google" to refresh access.');
            }
            if (error.response?.data?.error?.status === 'PERMISSION_DENIED') {
                const activationUrl = error.response?.data?.error?.details?.find(d => d.metadata?.activationUrl)?.metadata?.activationUrl;
                if (activationUrl) {
                    throw new Error(`My Business API is disabled in your Google Cloud Project. Please enable it by visiting: ${activationUrl}`);
                }
                throw new Error('Google Business Profile permission denied. Ensure My Business API is enabled in your Google Cloud Console project.');
            }
            if (error.response?.data?.error?.status === 'RESOURCE_EXHAUSTED' || error.response?.data?.error?.errors?.some(e => e.reason === 'rateLimitExceeded')) {
                throw new Error('Google Business Profile API access request pending: Google provides a default quota of 0 for new projects. Please request GBP API access for project 322921031715 at https://developers.google.com/my-business/content/prereqs#request-access to enable listing creation on Google Maps & Search.');
            }
            throw error;
        }
    }

    /**
     * Create a new post (Local Post) on Google Business Profile
     * @param {string} text - Post content
     * @param {string} locationId - The location name (e.g. accounts/123/locations/456)
     * @param {string} mediaUrl - Optional image URL
     */
    async createPost(text, locationId = null, mediaUrl = null) {
        try {
            const auth = await this._getOAuthClient();
            
            // Check for explicitly configured location in system settings
            let targetLocationId = locationId;
            if (!targetLocationId) {
                const gbpConfig = await SystemSetting.findOne({ key: 'google_business_config' }).lean();
                if (gbpConfig?.value?.locationId) {
                    targetLocationId = gbpConfig.value.locationId;
                }
            }

            // Resolve primary location ID if not explicitly provided
            if (!targetLocationId) {
                const locations = await this.getLocations();
                if (!locations || locations.length === 0) {
                    throw new Error('No verified Google Business Profile locations found under your connected Google account. Please verify your business profile in Google Business Profile Manager.');
                }
                targetLocationId = locations[0].name;
            }

            const postBody = {
                languageCode: 'en-US',
                summary: text,
                callToAction: {
                    actionType: 'LEARN_MORE',
                    url: process.env.FRONTEND_URL || 'https://www.bharatproperties.co'
                }
            };

            if (mediaUrl) {
                postBody.media = [{
                    mediaFormat: 'PHOTO',
                    sourceUrl: mediaUrl
                }];
            }

            console.log(`[GoogleBusinessService] Creating real post for location: ${targetLocationId}`);
            
            const response = await auth.request({
                url: `https://mybusiness.googleapis.com/v4/${targetLocationId}/localPosts`,
                method: 'POST',
                data: postBody
            });

            return { success: true, data: response.data, locationId: targetLocationId };
        } catch (error) {
            console.error('[GoogleBusinessService] Post error:', error.response?.data || error.message);
            const errDetail = error.response?.data?.error?.message || error.message;
            if (errDetail.includes('invalid_grant')) {
                throw new Error('Google account session expired. Please go to CRM Settings > Integrations and click "Reconnect Google" to refresh access.');
            }
            if (error.response?.data?.error?.status === 'RESOURCE_EXHAUSTED' || error.response?.data?.error?.errors?.some(e => e.reason === 'rateLimitExceeded')) {
                throw new Error('Google Business Profile API access request pending: Google provides a default quota of 0 for new projects. Please request GBP API access for project 322921031715 at https://developers.google.com/my-business/content/prereqs#request-access to enable listing creation on Google Maps & Search.');
            }
            throw new Error(errDetail);
        }
    }
}

export default new GoogleBusinessService();
