import { google } from 'googleapis';
import fs from 'fs';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

/**
 * YouTubeService.js
 * Handles video operations via YouTube Data API v3.
 * Updated: Real Video Upload implementation for Professional usage.
 */
class YouTubeService {
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
                    console.log('[YouTubeService] Persisted refreshed OAuth tokens');
                }
            } catch (pErr) {
                console.warn('[YouTubeService] Token persist failed:', pErr.message);
            }
        });

        return oauth2Client;
    }

    /**
     * Upload a video to YouTube
     * @param {string} title - Video Title
     * @param {string} description - Video Description
     * @param {string} filePath - Absolute path to video file
     * @param {string} privacyStatus - 'public', 'private', or 'unlisted'
     */
    async uploadVideo(title, description, filePath, privacyStatus = 'public') {
        try {
            const auth = await this._getOAuthClient();
            const youtube = google.youtube({ version: 'v3', auth });

            console.log(`[YouTubeService] Starting real upload: ${title} | Path: ${filePath}`);
            
            if (!fs.existsSync(filePath)) {
                throw new Error(`Video file not found at path: ${filePath}`);
            }

            const response = await youtube.videos.insert({
                part: 'snippet,status',
                requestBody: {
                    snippet: {
                        title,
                        description,
                        tags: ['RealEstate', 'BharatProperties', 'PropertyUpdate'],
                        categoryId: '22' // People & Blogs
                    },
                    status: {
                        privacyStatus
                    }
                },
                media: {
                    body: fs.createReadStream(filePath)
                }
            });

            console.log(`[YouTubeService] Upload successful. Video ID: ${response.data.id}`);

            return { 
                success: true, 
                videoId: response.data.id,
                url: `https://www.youtube.com/watch?v=${response.data.id}`
            };
        } catch (error) {
            console.error('[YouTubeService] Upload error:', error.response?.data || error.message);
            const errDetail = error.response?.data?.error?.message || error.message;
            if (errDetail.includes('invalid_grant')) {
                throw new Error('Google account session expired. Please go to CRM Settings > Integrations and click "Reconnect Google" to refresh access.');
            }
            if (error.response?.data?.error?.status === 'PERMISSION_DENIED') {
                const activationUrl = error.response?.data?.error?.details?.find(d => d.metadata?.activationUrl)?.metadata?.activationUrl;
                if (activationUrl) {
                    throw new Error(`YouTube Data API is disabled in your Google Cloud Project. Please enable it by visiting: ${activationUrl}`);
                }
            }
            if (errDetail.includes('quotaExceeded')) {
                throw new Error('YouTube API daily upload quota reached. Please try again tomorrow or contact admin.');
            }
            throw new Error(errDetail);
        }
    }
}

export default new YouTubeService();
