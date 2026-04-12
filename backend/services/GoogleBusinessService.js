import { google } from 'googleapis';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

/**
 * GoogleBusinessService.js
 * Handles business profile posts and metadata using Google My Business API.
 * Updated: Real API implementation for Professional Posting.
 */
class GoogleBusinessService {
    async _getOAuthClient() {
        const config = await SystemSetting.findOne({ key: 'google_integration' }).lean();
        if (!config || !config.value || !config.value.tokens) {
            throw new Error('Google Integration not connected');
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials(config.value.tokens);
        return oauth2Client;
    }

    /**
     * Fetch list of locations managed by the account
     */
    async getLocations() {
        try {
            const auth = await this._getOAuthClient();
            const businessInfo = google.mybusinessbusinessinformation({ version: 'v1', auth });
            
            // Step 1: List Accounts
            const accountsResponse = await businessInfo.accounts.list();
            const accounts = accountsResponse.data.accounts || [];
            
            let allLocations = [];
            for (const account of accounts) {
                const locationsResponse = await businessInfo.accounts.locations.list({
                    parent: account.name,
                    readMask: 'name,title,storeCode'
                });
                allLocations = allLocations.concat(locationsResponse.data.locations || []);
            }
            
            return allLocations;
        } catch (error) {
            console.error('[GoogleBusinessService] GetLocations error:', error.message);
            throw error;
        }
    }

    /**
     * Create a new post (Local Post) on Google Business Profile
     * @param {string} text - Post content
     * @param {string} locationId - The location name (e.g. accounts/123/locations/456)
     * @param {string} mediaUrl - Optional image URL
     */
    async createPost(text, locationId, mediaUrl = null) {
        try {
            const auth = await this._getOAuthClient();
            // Local Posts belong to the Performance/Business Profile API
            const myBusiness = google.mybusinessbusinessinformation({ version: 'v1', auth });
            
            const postBody = {
                languageCode: 'en-US',
                summary: text,
                callToAction: {
                    actionType: 'LEARN_MORE',
                    url: process.env.FRONTEND_URL || 'https://bharatproperties.com'
                }
            };

            if (mediaUrl) {
                postBody.media = [{
                    mediaFormat: 'PHOTO',
                    sourceUrl: mediaUrl
                }];
            }

            console.log(`[GoogleBusinessService] Creating real post for location: ${locationId}`);
            
            // Note: In real GMB, the endpoint is actually within the 'mybusiness' (Legacy) or specialized v4
            // but for v1 BusinessInfo, we typically use the performance/localPost structure.
            // Using googleapis internal mapping for localPosts:
            const response = await auth.request({
                url: `https://mybusiness.googleapis.com/v4/${locationId}/localPosts`,
                method: 'POST',
                data: postBody
            });

            return { success: true, data: response.data };
        } catch (error) {
            console.error('[GoogleBusinessService] Post error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error?.message || error.message);
        }
    }
}

export default new GoogleBusinessService();
