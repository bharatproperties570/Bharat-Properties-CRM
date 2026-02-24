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
        const emails = await emailService.fetchInbox();
        res.json({ success: true, data: emails });
    } catch (error) {
        console.error('Controller Error fetching inbox:', error);
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
        const { code } = req.query;
        if (!code) {
            return res.status(400).json({ success: false, message: 'Code is required' });
        }
        const email = await emailService.handleOAuthCallback(code);
        res.send(`
            <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f4f7fa;">
                    <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
                        <h2 style="color: #10b981;">Connection Successful!</h2>
                        <p>Connected account: <strong>${email}</strong></p>
                        <p>Redirecting back to CRM...</p>
                        <script>
                            setTimeout(() => {
                                window.location.href = 'http://localhost:3000/settings/email?success=true';
                            }, 2000);
                        </script>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Controller Error in OAuth callback:', error);
        res.status(500).send(`<h2>Connection Failed</h2><p>${error.message}</p>`);
    }
};
