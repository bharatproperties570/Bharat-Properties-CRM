import { google } from 'googleapis';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

/**
 * Shared Google OAuth2 Client Utility
 * Tries to get tokens from SystemSetting (google_integration) or fall back to .env
 */
export const getOAuth2Client = async () => {
    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        
        // 1. Check SystemSetting for unified config (User-configured)
        const unifiedConfig = await SystemSetting.findOne({ key: 'google_integration' }).lean();
        
        // Use tokens from DB if available, otherwise fallback to .env refresh token
        const refreshToken = unifiedConfig?.value?.tokens?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;

        if (clientId && clientSecret && refreshToken) {
            const oauth2Client = new google.auth.OAuth2(
                clientId,
                clientSecret,
                process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/google-callback`
            );

            oauth2Client.setCredentials({
                refresh_token: refreshToken
            });

            return oauth2Client;
        }

        console.warn('[googleAuth] Credentials missing (ClientId, Secret, or RefreshToken).');
        return null;
    } catch (error) {
        console.error('[googleAuth] Error initializing OAuth2 Client:', error.message);
        return null;
    }
};

export const getPeopleService = async () => {
    const auth = await getOAuth2Client();
    if (!auth) return null;
    return google.people({ version: 'v1', auth });
};

export const getCalendarService = async () => {
    const auth = await getOAuth2Client();
    if (!auth) return null;
    return google.calendar({ version: 'v3', auth });
};

export const getDriveService = async () => {
    // 🚀 Senior Optimization: Prioritize Service Account for Drive (Reliable System Storage)
    if (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON) {
        try {
            const credentials = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
            const auth = new google.auth.JWT(
                credentials.client_email,
                null,
                credentials.private_key,
                ['https://www.googleapis.com/auth/drive']
            );
            return google.drive({ version: 'v3', auth });
        } catch (err) {
            console.warn('[googleAuth] Service Account parsing failed, falling back to OAuth:', err.message);
        }
    }

    const auth = await getOAuth2Client();
    if (!auth) return null;
    return google.drive({ version: 'v3', auth });
};

/**
 * Get Gmail service using unified auth
 */
export const getGmailService = async () => {
    const auth = await getOAuth2Client();
    if (!auth) return null;
    return google.gmail({ version: 'v1', auth });
};
