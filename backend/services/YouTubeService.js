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
            throw new Error(error.response?.data?.error?.message || error.message);
        }
    }
}

export default new YouTubeService();
