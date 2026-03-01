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
    async sendSMSWithTemplate(to, templateName, variables = {}, context = {}) {
        const template = await SmsTemplate.findOne({ name: templateName, isActive: true });
        if (!template) {
            throw new Error(`Template '${templateName}' not found or inactive`);
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
        const url = baseUrl || 'https://login.smsgatewayhub.com/api/mt/SendSMS';

        try {
            const params = {
                APIKey: apiKey,
                senderid: senderId,
                channel: context.category === 'Promotional' ? 1 : (context.category === 'Transactional' ? 2 : (Number(channel) || 2)),
                DCS: Number(dcs) || 0,
                FlashSms: Number(flash) ? 1 : 0, // Requested by server error message
                flashsms: Number(flash) ? 1 : 0, // Matching user provided URL
                number: to.replace('+', ''),
                text: message,
                route: config.route || 'clickhere'
            };

            // Add EntityID/TemplateID for DLT compliance
            if (config.entityId) params.EntityId = config.entityId;

            // Override senderid if template has specific header
            if (context.dltHeaderId) params.senderid = context.dltHeaderId;

            // DLT Template ID
            if (context.dltTemplateId) {
                params.dlttemplateid = context.dltTemplateId;
            }

            const response = await axios.get(url, { params });

            // SMSGatewayHub returns 200 even on functional failure.
            // Success code is "000". Anything else is an error.
            if (response.data && response.data.ErrorCode && response.data.ErrorCode !== "000") {
                throw new Error(response.data.ErrorMessage || `Error Code: ${response.data.ErrorCode}`);
            }

            return { success: true, provider: 'SMSGatewayHub', data: response.data };
        } catch (error) {
            const errorMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            console.error('[SMSGatewayHub Error]', errorMsg);
            throw new Error(`SMSGatewayHub failed: ${errorMsg}`);
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
