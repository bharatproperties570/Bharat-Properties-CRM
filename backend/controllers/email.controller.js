import emailService from '../services/email.service.js';

export const sendEmail = async (req, res) => {
    try {
        const { to, subject, text, html } = req.body;
        if (!to || !subject || (!text && !html)) {
            return res.status(400).json({ success: false, message: 'Missing required fields: to, subject, and (text or html)' });
        }

        const result = await emailService.sendEmail(to, subject, text, html);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Controller Error sending email:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getInbox = async (req, res) => {
    try {
        const { pageToken, limit } = req.query;
        const result = await emailService.fetchInbox(pageToken, limit);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Controller Error fetching inbox:', error);
        const msg = (error.message || '').toLowerCase();
        const isOAuthError = msg.includes('invalid_grant') || msg.includes('token') || error.code === 400;
        res.status(isOAuthError ? 400 : 500).json({
            success: false,
            message: error.message,
            errorCode: isOAuthError ? 'OAUTH_EXPIRED' : 'FETCH_FAILED'
        });
    }
};

export const convertToLead = async (req, res) => {
    try {
        const { uid } = req.params;
        const result = await emailService.convertToLead(uid);
        
        if (result && result.success === false) {
            return res.status(400).json(result);
        }
        
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Controller Error converting email to lead:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const testConnection = async (req, res) => {
    try {
        const result = await emailService.testConnection();
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Controller Error testing connection:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getEmailContent = async (req, res) => {
    try {
        const { uid } = req.params;
        const content = await emailService.fetchEmailContent(uid);
        res.json({ success: true, data: content });
    } catch (error) {
        console.error('Controller Error fetching email content:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getOAuthUrl = async (req, res) => {
    try {
        const url = await emailService.getAuthUrl();
        res.json({ success: true, data: url });
    } catch (error) {
        console.error('Controller Error getting OAuth URL:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const oauthCallback = async (req, res) => {
    try {
        const { code, state, success } = req.query; // Capture code OR success flag from frontend redirect
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

        // Case 1: Backend received the code directly from Google
        if (code) {
             const email = await emailService.handleOAuthCallback(code);
             return res.send(`
                <html>
                    <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f4f7fa;">
                        <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
                            <h2 style="color: #10b981;">Google Connection Successful!</h2>
                            <p>Connected account: <strong>${email}</strong></p>
                            <p>Finalizing session...</p>
                            <script>
                                setTimeout(() => {
                                    window.location.href = '${frontendUrl}/settings?tab=integrations&connection=success';
                                }, 1500);
                            </script>
                        </div>
                    </body>
                </html>
            `);
        }

        // Case 2: Redirection handle for manual success flags
        if (success === 'true') {
            return res.redirect(`${frontendUrl}/settings?tab=integrations&connection=success`);
        }

        return res.status(400).send(`<h2>Authorization Failed</h2><p>No valid code found in redirect.</p>`);
    } catch (error) {
        console.error('Controller Error in OAuth callback:', error);
        res.status(500).send(`<h2>Connection Failed</h2><p>${error.message}</p>`);
    }
};
