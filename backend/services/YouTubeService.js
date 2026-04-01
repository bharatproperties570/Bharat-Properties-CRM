import { google } from 'googleapis';
import SystemSetting from '../models/SystemSetting.js';

/**
 * YouTubeService.js
 * Handles video operations via YouTube Data API v3.
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
     */
    async uploadVideo(title, description, filePath) {
        try {
            const auth = await this._getOAuthClient();
            const youtube = google.youtube({ version: 'v3', auth });

            // Note: This requires the 'fs' module for real file streams
            // For now, providing the structure for integration
            console.log(`[YouTubeService] Preparing upload: ${title}`);
            
            // Real implementation would use fs.createReadStream(filePath)
            // res = await youtube.videos.insert({ ... })
            
            return { success: true, message: 'YouTube upload logic ready (v3)' };
        } catch (error) {
            console.error('[YouTubeService] Upload error:', error.message);
            throw error;
        }
    }
}

export default new YouTubeService();
