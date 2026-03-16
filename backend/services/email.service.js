import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { google } from 'googleapis';
import SystemSetting from '../models/SystemSetting.js';

import { getOAuth2Client } from '../utils/googleAuth.js';

class EmailService {
    async getEmailConfig() {
        // 1. Try unified Google integration first
        const unified = await SystemSetting.findOne({ key: 'google_integration' }).lean();
        if (unified && unified.value && unified.value.tokens) {
            return {
                email: unified.value.email,
                tokens: unified.value.tokens,
                useOAuth: true,
                provider: 'Google'
            };
        }

        // 2. Fallback to legacy email_config
        const config = await SystemSetting.findOne({ key: 'email_config' }).lean();
        if (!config || !config.value) {
            throw new Error('Email configuration not found. Please connect your Google account in Settings.');
        }
        return config.value;
    }

    async getAuthUrl() {
        const oauth2Client = await getOAuth2Client();
        if (!oauth2Client) {
             // If client not initialized, we can't get URL here. 
             // This is mostly for legacy UI compatibility if it calls this.
             return null;
        }
        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://mail.google.com/',
                'https://www.googleapis.com/auth/userinfo.email'
            ],
            prompt: 'consent'
        });
    }

    async handleOAuthCallback(code) {
        // This is now handled by googleSettings.controller.js for the unified flow.
        // Keeping it for legacy support if needed.
        const oauth2Client = await getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);

        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();

        const configValue = {
            email: userInfo.data.email,
            tokens: tokens,
            useOAuth: true,
            provider: 'Google'
        };

        // Save to legacy config
        await SystemSetting.findOneAndUpdate(
            { key: 'email_config' },
            { value: configValue },
            { upsert: true }
        );

        // Save to unified config as well to enable all services
        await SystemSetting.findOneAndUpdate(
            { key: 'google_integration' },
            { value: {
                connected: true,
                email: userInfo.data.email,
                tokens: tokens,
                lastSync: new Date()
            }},
            { upsert: true }
        );

        return userInfo.data.email;
    }

    async sendEmail(to, subject, text, html) {
        const config = await this.getEmailConfig();

        // Setup transporter based on config
        const smtpHost = config.smtpHost || (config.provider === 'Google' ? 'smtp.gmail.com' : '');
        const smtpPort = config.smtpPort || (config.securityType === 'SSL/TLS' ? 465 : 587);
        const secure = smtpPort == 465;

        const transporterOptions = {
            host: smtpHost,
            port: smtpPort,
            secure: secure,
            auth: config.useOAuth ? {
                type: 'OAuth2',
                user: config.email,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: config.tokens?.refresh_token,
                accessToken: config.tokens?.access_token
            } : {
                user: config.email,
                pass: config.password,
            },
        };

        console.log(`[EmailService] Attempting to send email to ${to} using ${config.useOAuth ? 'OAuth2' : 'Password'}`);
        const transporter = nodemailer.createTransport(transporterOptions);

        const mailOptions = {
            from: `"${config.email.split('@')[0]}" <${config.email}>`,
            to,
            subject,
            text,
            html,
        };

        try {
            const info = await transporter.sendMail(mailOptions);
            console.log('[EmailService] Email sent successfully:', info.messageId);
            console.log('[EmailService] Accepted:', info.accepted);
            console.log('[EmailService] Rejected:', info.rejected);
            console.log('[EmailService] Response:', info.response);
            return info;
        } catch (error) {
            console.error('[EmailService] Error in sendMail:', error);
            throw error;
        }
    }

    async fetchInbox() {
        const config = await this.getEmailConfig();

        const imapHost = config.imapHost || (config.provider === 'Google' ? 'imap.gmail.com' : '');
        const imapPort = config.imapPort || 993;

        const clientOptions = {
            host: imapHost,
            port: imapPort,
            secure: true,
            auth: config.useOAuth ? {
                user: config.email,
                accessToken: config.tokens?.access_token
            } : {
                user: config.email,
                pass: config.password,
            },
            logger: false
        };

        const client = new ImapFlow(clientOptions);

        client.on('error', err => {
            console.error('IMAP Client Error in fetchInbox:', err);
        });

        await client.connect();

        let lock = await client.getMailboxLock('INBOX');
        let emails = [];

        try {
            // Fetch the last 20 messages
            const sequence = `*:${Math.max(1, client.mailbox.exists - 19)}`;
            for await (let message of client.fetch(sequence, {
                envelope: true,
                source: false,
                bodyStructure: true
            })) {
                emails.push({
                    uid: message.uid,
                    subject: message.envelope.subject,
                    from: message.envelope.from[0].address,
                    fromName: message.envelope.from[0].name,
                    date: message.envelope.date,
                    id: message.id
                });
            }
        } finally {
            lock.release();
        }

        await client.logout();
        return emails.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    async testConnection() {
        const config = await this.getEmailConfig();

        // Test SMTP
        const smtpHost = config.smtpHost || (config.provider === 'Google' ? 'smtp.gmail.com' : '');
        const smtpPort = config.smtpPort || (config.securityType === 'SSL/TLS' ? 465 : 587);
        const secure = smtpPort == 465;

        const transporterOptions = {
            host: smtpHost,
            port: smtpPort,
            secure: secure,
            auth: config.useOAuth ? {
                type: 'OAuth2',
                user: config.email,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: config.tokens?.refresh_token,
                accessToken: config.tokens?.access_token
            } : {
                user: config.email,
                pass: config.password,
            },
        };

        const transporter = nodemailer.createTransport(transporterOptions);

        try {
            await transporter.verify();
        } catch (error) {
            console.error('SMTP Auth Error:', error);
            if (error.responseCode === 535 || error.code === 'EAUTH') {
                throw new Error('SMTP Authentication Failed: Please use a Gmail App Password or Connect via Google OAuth.');
            }
            throw error;
        }

        // Test IMAP
        const imapHost = config.imapHost || (config.provider === 'Google' ? 'imap.gmail.com' : '');
        const imapPort = config.imapPort || 993;

        const clientOptions = {
            host: imapHost,
            port: imapPort,
            secure: true,
            auth: config.useOAuth ? {
                user: config.email,
                accessToken: config.tokens?.access_token
            } : {
                user: config.email,
                pass: config.password,
            },
            logger: false
        };

        const client = new ImapFlow(clientOptions);

        client.on('error', err => {
            console.error('IMAP Client Error in testConnection:', err);
        });

        try {
            await client.connect();
        } catch (error) {
            console.error('IMAP Auth Error:', error);
            if (error.serverResponseCode === 'AUTHENTICATIONFAILED' || error.authenticationFailed) {
                throw new Error('IMAP Authentication Failed: Please use a Gmail App Password or Connect via Google OAuth.');
            }
            throw error;
        }
        await client.logout();

        return { smtp: true, imap: true };
    }

    async fetchEmailContent(uid) {
        const config = await this.getEmailConfig();

        const clientOptions = {
            host: config.imapHost || (config.provider === 'Google' ? 'imap.gmail.com' : ''),
            port: config.imapPort || 993,
            secure: true,
            auth: config.useOAuth ? {
                user: config.email,
                accessToken: config.tokens?.access_token
            } : {
                user: config.email,
                pass: config.password,
            },
            logger: false
        };

        const client = new ImapFlow(clientOptions);

        client.on('error', err => {
            console.error('IMAP Client Error in fetchEmailContent:', err);
        });

        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        let content = '';

        try {
            const message = await client.fetchOne(uid, { source: true, bodyStructure: true });
            if (message && message.source) {
                // Professional solution involves 'mailparser'.
                content = message.source.toString();
            }
        } finally {
            lock.release();
        }

        await client.logout();
        return content;
    }
}

export default new EmailService();
