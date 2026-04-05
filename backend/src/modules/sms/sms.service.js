import SmsProvider from './smsProvider.model.js';
import SmsLog from './smsLog.model.js';
import SmsTemplate from './smsTemplate.model.js';
import axios from 'axios';
import { encrypt, decrypt } from '../../utils/crypto.js';

class SmsService {
    /**
     * Send SMS via the active provider with automatic logging
     * @param {string} to - Recipient number
     * @param {string} message - Message content
     * @param {object} context - { entityType, entityId }
     */
    async sendSMS(to, message, context = {}, configOverride = null) {
        const activeProvider = await SmsProvider.findOne({ isActive: true });

        if (!activeProvider && !configOverride) {
            throw new Error('No active SMS provider configured');
        }

        const config = configOverride || this._decryptConfig(activeProvider.config);
        const providerName = configOverride ? 'Test' : activeProvider.provider;

        // Create initial log
        const log = configOverride ? null : await SmsLog.create({
            to,
            message,
            provider: activeProvider.provider,
            status: 'Pending',
            entityType: context.entityType || 'System',
            entityId: context.entityId
        });

        try {
            let result;
            switch (providerName) {
                case 'Twilio':
                    result = await this.sendViaTwilio(to, message, config);
                    break;
                case 'SMSGatewayHub':
                    result = await this.sendViaSMSGatewayHub(to, message, config, context);
                    break;
                case 'Custom HTTP':
                    result = await this.sendViaCustomHTTP(to, message, config);
                    break;
                case 'Test':
                    // If it's a test with override, we need to know WHICH provider to simulate
                    if (context.provider === 'Twilio') result = await this.sendViaTwilio(to, message, config);
                    else if (context.provider === 'SMSGatewayHub') result = await this.sendViaSMSGatewayHub(to, message, config, context);
                    else if (context.provider === 'Custom HTTP') result = await this.sendViaCustomHTTP(to, message, config);
                    else result = await this.sendViaSMSGatewayHub(to, message, config, context); // Default
                    break;
                default:
                    throw new Error(`Provider ${activeProvider?.provider || 'Unknown'} not supported`);
            }

            // Update log on success
            if (log) {
                log.status = 'Sent';
                log.providerId = result.data?.sid || result.data?.MessageId || result.data?.JobId || result.data?.id;
                await log.save();
            }

            return result;
        } catch (error) {
            // Update log on failure
            if (log) {
                log.status = 'Failed';
                log.error = error.message;
                await log.save();
            }
            throw error;
        }
    }

    /**
     * Send SMS using a template
     * @param {string} to - Recipient number
     * @param {string} templateName - Name of the template
     * @param {object} variables - Key-value pairs to replace in template
     * @param {object} context - { entityType, entityId }
     */
    async sendSMSWithTemplate(to, templateIdOrName, variables = {}, context = {}) {
        let query;
        if (templateIdOrName.match(/^[0-9a-fA-F]{24}$/)) {
            query = { _id: templateIdOrName, isActive: true };
        } else {
            query = { name: templateIdOrName, isActive: true };
        }

        const template = await SmsTemplate.findOne(query);
        if (!template) {
            throw new Error(`Template '${templateIdOrName}' not found or inactive`);
        }

        let message = template.body;
        // Basic variable injection: {{name}} -> variables.name
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            message = message.replace(regex, value || '');
        }

        // Add DLT context if available in template
        const fullContext = {
            ...context,
            dltTemplateId: template.dltTemplateId,
            dltHeaderId: template.dltHeaderId,
            category: template.category
        };

        return await this.sendSMS(to, message, fullContext);
    }

    /**
     * Send via Twilio REST API
     */
    async sendViaTwilio(to, message, config) {
        const { sid, token, from } = config;
        const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

        const auth = Buffer.from(`${sid}:${token}`).toString('base64');

        try {
            const response = await axios.post(url,
                new URLSearchParams({
                    To: to,
                    From: from,
                    Body: message
                }),
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            return { success: true, provider: 'Twilio', data: response.data };
        } catch (error) {
            console.error('[Twilio Error]', error.response?.data || error.message);
            throw new Error(`Twilio failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Send via SMSGatewayHub
     */
    async sendViaSMSGatewayHub(to, message, config, context = {}) {
        const { apiKey, senderId, channel = 2, dcs = 0, flash = 0, baseUrl } = config;

        // Clean up baseUrl: strip query string (may contain placeholder text from the UI form)
        let url = (baseUrl || 'https://www.smsgatewayhub.com/api/mt/SendSMS').split('?')[0];

        // Ensure we're hitting the correct SMSGatewayHub endpoint
        if (!url.includes('smsgatewayhub.com') && !url.includes('SendSMS')) {
            url = 'https://www.smsgatewayhub.com/api/mt/SendSMS';
        }

        let params = {};
        try {
            // Normalize phone: remove + and country code prefix if already formatted
            let normalizedNumber = String(to).replace(/\D/g, ''); // digits only
            // If 11 digits starting with 0, strip leading 0; if 10 digits, add country code is done by gateway with EntityId
            // SMSGatewayHub expects 10-digit number for India (or 12 with 91)
            if (normalizedNumber.startsWith('91') && normalizedNumber.length === 12) {
                // Already has country code, pass as-is
            } else if (normalizedNumber.length === 10) {
                // 10-digit number, pass as-is (gateway adds country code based on route)
            }

            // channel: 1=Promotional, 2=Transactional, 4=OTP
            let resolvedChannel = Number(channel) || 2;
            if (context.category === 'Promotional') resolvedChannel = 1;
            else if (context.category === 'Transactional') resolvedChannel = 2;
            else if (context.category === 'OTP') resolvedChannel = 4;

            params = {
                APIKey: apiKey,
                senderid: senderId,
                channel: resolvedChannel,
                DCS: Number(dcs) || 0,
                flashsms: flash ? 1 : 0,   // Must be integer 0 or 1, NOT boolean
                number: normalizedNumber,
                text: message,
                route: config.route || '47'  // 47 = SmartPing Transactional (DLT compliant)
            };

            // DLT EntityId (MANDATORY for India DLT compliance)
            if (config.entityId) params.EntityId = config.entityId;

            // Override senderid if template has a specific DLT Header Id
            if (context.dltHeaderId) params.senderid = context.dltHeaderId;

            // DLT Template ID (MANDATORY - without this, gateway returns "Invalid template text")
            if (context.dltTemplateId) {
                params.dlttemplateid = context.dltTemplateId;
            } else {
                // Auto-fallback: look up the first active template's dltTemplateId
                // This is required for DLT compliance in India
                try {
                    const SmsTemplate = (await import('./smsTemplate.model.js')).default;
                    const fallbackTemplate = await SmsTemplate.findOne({ isActive: true, dltTemplateId: { $exists: true, $ne: '' } })
                        .sort({ createdAt: 1 })
                        .lean();
                    if (fallbackTemplate?.dltTemplateId) {
                        params.dlttemplateid = fallbackTemplate.dltTemplateId;
                        console.log(`[SMSGatewayHub] Auto-resolved dlttemplateid: ${fallbackTemplate.dltTemplateId} from template "${fallbackTemplate.name}"`);
                    } else {
                        console.warn('[SMSGatewayHub] WARNING: No dlttemplateid found. Message may be rejected by DLT gateway.');
                    }
                } catch (templateErr) {
                    console.warn('[SMSGatewayHub] Could not auto-resolve dlttemplateid:', templateErr.message);
                }
            }

            console.log('[SMSGatewayHub] Sending to:', url, '| Params:', JSON.stringify({ ...params, APIKey: '[REDACTED]' }));
            const response = await axios.get(url, { params, timeout: 15000 });
            console.log('[SMSGatewayHub] Response:', response.data);

            // SMSGatewayHub returns 200 even on functional failure.
            // Check for error codes: "000" = success, "error:*" in ErrorMessage = failure
            const responseStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            if (responseStr.toLowerCase().includes('error:') || responseStr.toLowerCase().includes('invalid')) {
                throw new Error(responseStr);
            }
            if (response.data && response.data.ErrorCode && response.data.ErrorCode !== '000') {
                throw new Error(response.data.ErrorMessage || `Error Code: ${response.data.ErrorCode}`);
            }

            return { success: true, provider: 'SMSGatewayHub', data: response.data };
        } catch (error) {
            const errorMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            console.error('[SMSGatewayHub Error]', errorMsg);
            throw new Error(`SMSGatewayHub failed: ${errorMsg} | URL: ${url} | Params: ${JSON.stringify({ ...params, APIKey: '[REDACTED]' })}`);
        }
    }

    /**
     * Send via Custom HTTP Request
     */
    async sendViaCustomHTTP(to, message, config) {
        let { url, method = 'POST', headers = '{}', bodyTemplate = '' } = config;

        // Replace placeholders in URL and Body
        const replacePlaceholders = (str) => {
            return str.replace('{{number}}', to).replace('{{message}}', message);
        };

        url = replacePlaceholders(url);
        let parsedHeaders = {};
        try {
            parsedHeaders = JSON.parse(headers);
        } catch (e) {
            console.warn('Invalid headers JSON for Custom HTTP SMS');
        }

        try {
            let options = {
                method,
                url,
                headers: parsedHeaders
            };

            if (method.toUpperCase() === 'POST') {
                options.data = bodyTemplate ? JSON.parse(replacePlaceholders(bodyTemplate)) : { to, message };
            }

            const response = await axios(options);
            return { success: true, provider: 'Custom HTTP', data: response.data };
        } catch (error) {
            console.error('[Custom HTTP SMS Error]', error.message);
            throw new Error(`Custom HTTP failed: ${error.message}`);
        }
    }

    /**
     * Bulk SMS to an array of mobiles.
     */
    async bulkSend(mobiles, message, context = {}) {
        const results = [];
        let sent = 0, failed = 0;

        for (const mobile of mobiles) {
            try {
                // Rate limit buffer (200ms per message)
                await new Promise(r => setTimeout(r, 200)); 
                const result = await this.sendSMS(mobile, message, context);
                results.push({ mobile, ...result });
                sent++;
            } catch (error) {
                results.push({ mobile, success: false, error: error.message });
                failed++;
            }
        }

        console.log(`[SMS Service] Bulk Send — Sent: ${sent}, Failed: ${failed}`);
        return { sent, failed, results };
    }

    /**
     * Get remaining SMS balance (if supported by provider)
     */
    async getBalance() {
        const activeProvider = await SmsProvider.findOne({ isActive: true });
        if (!activeProvider) return null;

        const config = this._decryptConfig(activeProvider.config);
        
        if (activeProvider.provider === 'SMSGatewayHub') {
            try {
                const url = 'https://www.smsgatewayhub.com/api/mt/GetBalance';
                const response = await axios.get(url, {
                    params: { APIKey: config.apiKey },
                    timeout: 5000
                });
                // Expected response: "1234" (string) or JSON
                return { provider: 'SMSGatewayHub', balance: response.data };
            } catch (error) {
                console.error('[SMSGatewayHub Balance Error]', error.message);
                return null;
            }
        }

        return null;
    }

    /**
     * Helper to decrypt sensitive fields in config
     */
    _decryptConfig(config) {
        const decrypted = { ...config };
        for (const key in decrypted) {
            if (typeof decrypted[key] === 'object' && decrypted[key].iv) {
                decrypted[key] = decrypt(decrypted[key]);
            }
        }
        return decrypted;
    }

    /**
     * Helper to encrypt sensitive fields for storage
     */
    encryptConfig(config, sensitiveKeys = []) {
        const encrypted = { ...config };
        sensitiveKeys.forEach(key => {
            // Only encrypt if it's a string and not already an encrypted object
            if (encrypted[key] && typeof encrypted[key] === 'string') {
                encrypted[key] = encrypt(encrypted[key]);
            }
        });
        return encrypted;
    }
}

export default new SmsService();
