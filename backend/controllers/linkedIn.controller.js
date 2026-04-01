import linkedInService from '../services/LinkedInService.js';
import SystemSetting from '../models/SystemSetting.js';

/**
 * Get LinkedIn Authorization URL
 */
export const getLinkedInAuthUrl = async (req, res) => {
    try {
        const url = await linkedInService.getAuthUrl();
        res.json({ success: true, url });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Handle LinkedIn OAuth Callback
 */
export const handleLinkedInCallback = async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, error: 'Code is required' });

        const tokens = await linkedInService.handleCallback(code);
        res.json({ success: true, data: tokens });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get LinkedIn Connection Status
 */
export const getLinkedInStatus = async (req, res) => {
    try {
        const config = await SystemSetting.findOne({ key: 'linkedin_integration' }).lean();
        if (!config || !config.value || config.value.status !== 'Connected') {
            return res.json({ success: true, connected: false });
        }

        res.json({ 
            success: true, 
            connected: true, 
            orgId: config.value.orgId,
            connectedAt: config.value.connectedAt
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Save LinkedIn Organization ID and Configuration
 */
export const saveLinkedInConfig = async (req, res) => {
    try {
        const { clientId, clientSecret, redirectUri, orgId } = req.body;
        
        const config = await SystemSetting.findOneAndUpdate(
            { key: 'linkedin_integration' },
            { 
                $set: { 
                    'value.clientId': clientId,
                    'value.clientSecret': clientSecret,
                    'value.redirectUri': redirectUri,
                    'value.orgId': orgId
                } 
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, data: config.value });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
