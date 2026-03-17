import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { google } from 'googleapis';
import SystemSetting from '../models/SystemSetting.js';
import LeadParsingService from './LeadParsingService.js';
import LeadIngestionService from './LeadIngestionService.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Contact from '../models/Contact.js';
import Activity from '../models/Activity.js';
import { getOAuth2Client, getGmailService } from '../utils/googleAuth.js';

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

        // 1. If using Google OAuth, use the Gmail API for a more professional experience
        if (config.provider === 'Google' && config.useOAuth) {
            return this.fetchGmailInbox(config);
        }

        // 2. Fallback to IMAP for other providers or if OAuth is not used
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

    async fetchGmailInbox(config) {
        try {
            const oauth2Client = await getOAuth2Client();
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: 20,
                q: 'label:INBOX'
            });

            const messages = response.data.messages || [];
            const emailPromises = messages.map(async (msg) => {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full'
                });

                const headers = detail.data.payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                const fromHeader = headers.find(h => h.name === 'From')?.value || '';
                const date = headers.find(h => h.name === 'Date')?.value;

                // Parse From header (e.g., "John Doe <john@example.com>")
                let fromName = fromHeader;
                let fromEmail = fromHeader;
                const fromMatch = fromHeader.match(/(.*)<(.*)>/);
                if (fromMatch) {
                    fromName = fromMatch[1].trim() || fromMatch[2].trim();
                    fromEmail = fromMatch[2].trim();
                }

                return {
                    id: msg.id,
                    uid: msg.id, // For compatibility
                    subject: subject,
                    from: fromEmail,
                    fromName: fromName,
                    date: date ? new Date(date) : new Date(),
                    snippet: detail.data.snippet,
                    provider: 'Gmail',
                    labels: detail.data.labelIds || []
                };
            });

            const rawEmails = await Promise.all(emailPromises);
            
            // Enrichment: Match emails with CRM data
            const enrichedEmails = await Promise.all(rawEmails.map(async (email) => {
                const crmData = await this.matchEmailToCRM(email.from);
                return { ...email, ...crmData };
            }));

            return enrichedEmails.sort((a, b) => new Date(b.date) - new Date(a.date));
        } catch (error) {
            console.error('[EmailService] Gmail API fetchInbox Error:', error);
            throw error;
        }
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

        if (config.provider === 'Google' && config.useOAuth) {
            return this.fetchGmailEmailContent(uid);
        }

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
                // If it's a raw source, we should ideally parse it with mailparser
                // but for now we'll just return it or attempt a simple extraction
                content = message.source.toString();
            }
        } finally {
            lock.release();
        }

        await client.logout();
        return content;
    }

    async fetchGmailEmailContent(messageId) {
        try {
            const oauth2Client = await getOAuth2Client();
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            const response = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full'
            });

            const decodeBase64 = (data) => {
                if (!data) return '';
                // Resolve URL-safe base64 used by Gmail API
                const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
                return Buffer.from(base64, 'base64').toString('utf-8');
            };

            const getBody = (payload) => {
                if (payload.body && payload.body.data) {
                    return decodeBase64(payload.body.data);
                }
                if (payload.parts) {
                    // 1. Prefer HTML part at this level
                    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
                    if (htmlPart && htmlPart.body?.data) return decodeBase64(htmlPart.body.data);
                    
                    // 2. Fallback to Plain Text at this level
                    const plainPart = payload.parts.find(p => p.mimeType === 'text/plain');
                    if (plainPart && plainPart.body?.data) return decodeBase64(plainPart.body.data);

                    // 3. Recurse into nested parts (multipart/alternative, multipart/related, etc.)
                    for (const part of payload.parts) {
                        const result = getBody(part);
                        if (result) return result;
                    }
                }
                return '';
            };

            body = getBody(response.data.payload);

            // If still empty and there is a direct body (simple messages)
            if (!body && response.data.payload.body?.data) {
                body = decodeBase64(response.data.payload.body.data);
            }

            return body;
        } catch (error) {
            console.error('[EmailService] Gmail API fetchEmailContent Error:', error);
            throw error;
        }
    }

    async matchEmailToCRM(emailAddress) {
        if (!emailAddress) return { associated: null };

        try {
            // 1. Try to find a Lead
            const lead = await Lead.findOne({ email: emailAddress }).select('firstName lastName status mobile').lean();
            if (lead) {
                const name = `${lead.firstName} ${lead.lastName || ''}`.trim();
                
                // Find active deals for this lead (linked via phone or name if email is sparse, but here we have lead)
                // Actually, let's look for Deals where this Lead might be the associated contact or matched by mobile
                const deal = await Deal.findOne({ 
                    $or: [
                        { 'associatedContact.email': emailAddress },
                        { 'associatedContact.mobile': lead.mobile },
                        { 'owner.email': emailAddress }
                    ] 
                }).select('projectName unitNo stage').sort({ createdAt: -1 }).lean();

                return {
                    associated: {
                        type: 'Lead',
                        id: lead._id,
                        name: name,
                        status: lead.status,
                        deal: deal ? {
                            project: deal.projectName,
                            unit: deal.unitNo,
                            stage: deal.stage
                        } : null
                    }
                };
            }

            // 2. Try to find a Contact
            const contact = await Contact.findOne({ 'emails.address': emailAddress }).select('name surname phones').lean();
            if (contact) {
                const name = `${contact.name} ${contact.surname || ''}`.trim();
                const phones = contact.phones?.map(p => p.number) || [];

                const deal = await Deal.findOne({
                    $or: [
                        { 'associatedContact.email': emailAddress },
                        { 'associatedContact.mobile': { $in: phones } },
                        { 'owner.email': emailAddress }
                    ]
                }).select('projectName unitNo stage').sort({ createdAt: -1 }).lean();

                return {
                    associated: {
                        type: 'Contact',
                        id: contact._id,
                        name: name,
                        deal: deal ? {
                            project: deal.projectName,
                            unit: deal.unitNo,
                            stage: deal.stage
                        } : null
                    }
                };
            }

            return { associated: null };
        } catch (error) {
            console.error('[EmailService] Error matching email to CRM:', error);
            return { associated: null };
        }
    }

    async syncAndProcessEmails() {
        console.log('[EmailService] Starting syncAndProcessEmails...');
        const config = await this.getEmailConfig();

        if (config.provider !== 'Google' || !config.useOAuth) {
            console.log('[EmailService] Automated ingestion currently only supported for Google OAuth.');
            return { processed: 0, skipped: 0 };
        }

        try {
            const oauth2Client = await getOAuth2Client();
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            // Fetch unread messages
            const response = await gmail.users.messages.list({
                userId: 'me',
                q: 'is:unread',
                maxResults: 50
            });

            const messages = response.data.messages || [];
            console.log(`[EmailService] Found ${messages.length} unread messages.`);

            let processedCount = 0;
            let skippedCount = 0;

            for (const msg of messages) {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full'
                });

                const headers = detail.data.payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || '';
                const body = await this.fetchGmailEmailContent(msg.id);

                // Attempt to parse as portal lead
                const parsedData = LeadParsingService.parsePortalEmail(subject, body);

                if (parsedData && parsedData.mobile) {
                    console.log(`[EmailService] Valid portal lead detected from ${parsedData.portal}. Ingesting...`);
                    await LeadIngestionService.ingestLead(parsedData);
                    processedCount++;

                    // Mark as read and Remove from Unread to avoid re-processing
                    await gmail.users.messages.batchModify({
                        userId: 'me',
                        ids: [msg.id],
                        removeLabelIds: ['UNREAD']
                    });
                } else {
                    skippedCount++;
                }
            }

            console.log(`[EmailService] Email processing complete. Processed: ${processedCount}, Skipped: ${skippedCount}`);
            return { processed: processedCount, skipped: skippedCount };
        } catch (error) {
            console.error('[EmailService] syncAndProcessEmails Error:', error);
        }
    }

    async convertToLead(uid) {
        try {
            const gmail = await getGmailService();
            if (!gmail) {
                throw new Error('Gmail service not initialized. Please check Google connection.');
            }

            const message = await gmail.users.messages.get({
                userId: 'me',
                id: uid,
                format: 'full'
            });

            const headers = message.data.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const bodyContent = await this.fetchGmailEmailContent(uid);

            console.log(`[EmailService] Manually converting email ${uid} to lead. Subject: ${subject}`);

            // 1. Try Portal Parsing
            const parsed = LeadParsingService.parsePortalEmail(subject, bodyContent);
            
            if (parsed && parsed.mobile) {
                console.log(`[EmailService] Detected portal lead: ${parsed.portal}`);
                
                // CRITICAL: Ensure we use the parsed inquirer name, NOT the sender name (portal name)
                if (!parsed.name || parsed.name.toLowerCase().includes(parsed.portal.toLowerCase())) {
                    parsed.name = `Inquirer ${parsed.portal}`;
                }

                const result = await LeadIngestionService.ingestLead(parsed);
                if (!result) {
                    return {
                        success: false,
                        message: 'Lead creation failed. The lead might already exist or there was a database error.'
                    };
                }
                return { success: true, lead: result };
            }

            // 2. Fallback: Manual sender interpretation for non-portal emails
            const fromHeader = headers.find(h => h.name === 'From')?.value || '';
            let fromName = '';
            let fromEmail = '';

            const match = fromHeader.match(/^(.*?)\s*<([^>]+)>$/) || fromHeader.match(/^()([^>]+)$/);
            if (match) {
                fromName = match[1].replace(/['"]/g, '').trim();
                fromEmail = match[2].trim();
            } else {
                fromEmail = fromHeader;
            }

            if (!fromName) fromName = fromEmail.split('@')[0];

            // Try to find mobile in body if not portal
            // Looking for 10-digit number
            const mobileMatch = bodyContent.match(/([0-9]{10})/);
            const mobile = mobileMatch ? mobileMatch[1] : '';

            const leadData = {
                portal: 'Direct Email',
                name: fromName,
                email: fromEmail,
                mobile: mobile,
                listingDetails: subject,
                raw: bodyContent
            };

            console.log(`[EmailService] Fallback lead data: ${JSON.stringify({ fromName, fromEmail, mobile })}`);

            if (!mobile) {
                // Return a non-throwing failure object so the controller can handle it gracefully
                return { 
                    success: false, 
                    message: 'Could not find a valid mobile number in the email. Automatic lead creation requires a phone number.' 
                };
            }

            const result = await LeadIngestionService.ingestLead(leadData);
            if (!result) {
                return { 
                    success: false, 
                    message: 'Lead creation failed during manual ingestion.' 
                };
            }
            return { success: true, lead: result };
        } catch (error) {
            console.error('[EmailService] convertToLead Error:', error);
            throw error;
        }
    }
}

export default new EmailService();
