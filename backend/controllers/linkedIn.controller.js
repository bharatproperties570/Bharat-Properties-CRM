import linkedInService from '../services/LinkedInService.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import fs from 'fs';
import path from 'path';

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
        const { code } = req.query;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

        if (!code) {
            const errorParam = req.query.error;
            const errorDesc = req.query.error_description;
            console.error(`[LinkedInCallback] No code found. Data: error=${errorParam}, description=${errorDesc}`);
            
            // Log to file for deep investigation (Enterprise Level Debugging)
            const logPath = path.join(process.cwd(), 'logs/linkedin_oauth_debug.log');
            if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath), { recursive: true });
            
            const logEntry = `[${new Date().toISOString()}] CALLBACK_FAIL | Query: ${JSON.stringify(req.query)} | IP: ${req.ip}\n`;
            fs.appendFileSync(logPath, logEntry);

            // Pass through specific error types to the frontend
            const errorType = errorParam || 'missing_code';
            return res.redirect(`${frontendUrl}/settings?tab=integrations&connection=error&error=${errorType}&desc=${encodeURIComponent(errorDesc || '')}`);
        }

        try {
            await linkedInService.handleCallback(code);
            return res.redirect(`${frontendUrl}/settings?tab=integrations&connection=success`);
        } catch (error) {
            console.error('[LinkedInCallback] Service Error:', error.message);
            return res.redirect(`${frontendUrl}/settings?tab=integrations&connection=error&error=${encodeURIComponent(error.message)}`);
        }
    } catch (error) {
        // DIAGNOSTIC LOGGING
        const logPath = path.join(process.cwd(), 'logs/linkedin_oauth.log');
        if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath), { recursive: true });
        
        const timestamp = new Date().toISOString();
        const errorMessage = `[${timestamp}] Callback Error: ${error.message} | Data: ${JSON.stringify(error.response?.data || {})}\n`;
        fs.appendFileSync(logPath, errorMessage);

        console.error('[LinkedInCallback] Error:', error.message);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
        res.redirect(`${frontendUrl}/settings?tab=integrations&error=${encodeURIComponent(error.message)}`);
    }
};

export const getLinkedInStatus = async (req, res) => {
    try {
        const config = await SystemSetting.findOne({ key: 'linkedin_integration' }).lean();
        
        if (!config || !config.value) {
            return res.json({ success: true, connected: false, health: 'MISSING_CREDENTIALS' });
        }

        const { status, health, accessToken, clientId, clientSecret, expiresAt } = config.value;
        
        // Basic connectivity check: do we have saved credentials?
        const hasConfig = !!(clientId && clientSecret);
        const isAuthenticated = status === 'Connected' && !!accessToken;

        res.json({ 
            success: true, 
             // Senior state: are we authenticated or just configured?
            connected: isAuthenticated,
            hasConfig: hasConfig,
            health: health || (isAuthenticated ? 'HEALTHY' : 'PENDING'),
            orgId: config.value.orgId,
            connectedAt: config.value.connectedAt,
            expiresAt: expiresAt,
            refreshTokenExpiresAt: config.value.refreshTokenExpiresAt,
            lastRefreshedAt: config.value.lastRefreshedAt,
            statusError: config.value.statusError
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
                    'value.orgId': orgId,
                    'category': 'integration',
                    'active': true
                } 
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, data: config.value });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Manually trigger a Lead Sync from LinkedIn
 */
export const triggerLeadSync = async (req, res) => {
    try {
        const LinkedInLeadSyncService = (await import('../services/LinkedInLeadSyncService.js')).default;
        const count = await LinkedInLeadSyncService.syncAllLeads();
        
        res.status(200).json({
            success: true,
            syncedCount: count,
            message: `Successfully synced ${count} leads from LinkedIn`
        });
    } catch (err) {
        console.error('[LinkedInController] Lead Sync Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
