import { google } from 'googleapis';
import SystemSetting from '../src/modules/systemSettings/system.model.js';


/**
 * Unified Google Integration Controller
 * Handles OAuth2 flow for all Google services (Gmail, Contacts, Calendar, Drive)
 */

// @desc    Get Google OAuth2 Authorization URL
// @route   GET /api/settings/google/auth-url
export const getGoogleAuthUrl = async (req, res) => {
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/settings/google/callback'
        );

        const scopes = [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://mail.google.com/',
            'https://www.googleapis.com/auth/contacts',
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/business.manage'
        ];

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent'
        });

        res.json({ success: true, url });
    } catch (error) {
        console.error('getGoogleAuthUrl error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Handle Google OAuth2 Callback
// @route   POST /api/settings/google/callback
export const handleGoogleCallback = async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, error: 'Authorization code is required' });
    }

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/settings/google/callback'
        );

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Get user info to identify the account
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();

        const configValue = {
            email: userInfo.data.email,
            name: userInfo.data.name,
            picture: userInfo.data.picture,
            tokens: tokens,
            connectedAt: new Date(),
            scopes: tokens.scope
        };

        // Save to SystemSetting
        await SystemSetting.findOneAndUpdate(
            { key: 'google_integration' },
            { value: configValue },
            { upsert: true }
        );

        res.json({ 
            success: true, 
            message: 'Google account connected successfully',
            email: userInfo.data.email 
        });
    } catch (error) {
        console.error('handleGoogleCallback error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get Google Sync Status
// @route   GET /api/settings/google/status
export const getGoogleStatus = async (req, res) => {
    try {
        const config = await SystemSetting.findOne({ key: 'google_integration' }).lean();
        
        if (!config || !config.value) {
            return res.json({ success: true, connected: false });
        }

        const scopes = config.value.scopes || '';
        
        res.json({ 
            success: true, 
            connected: true, 
            email: config.value.email,
            name: config.value.name,
            picture: config.value.picture,
            connectedAt: config.value.connectedAt,
            services: {
                gmail: scopes.includes('mail.google.com'),
                calendar: scopes.includes('calendar'),
                drive: scopes.includes('drive'),
                contacts: scopes.includes('contacts'),
                youtube: scopes.includes('youtube.upload'),
                business: scopes.includes('business.manage')
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Disconnect Google Account
// @route   POST /api/settings/google/disconnect
export const disconnectGoogle = async (req, res) => {
    try {
        await SystemSetting.deleteOne({ key: 'google_integration' });
        res.json({ success: true, message: 'Google account disconnected' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
