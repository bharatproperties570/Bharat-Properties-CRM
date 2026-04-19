/**
 * WhatsAppService.js
 * Phase D: Multi-provider WhatsApp dispatch.
 */
import axios from 'axios';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

const META_GRAPH_BASE = 'https://graph.facebook.com/v19.0';

class WhatsAppService {
    // ── Config Loaders ────────────────────────────────────────────────────────

    /** Gupshup config from DB (legacy — set via Settings > Integrations) */
    async _getGupshupConfig() {
        const setting = await SystemSetting.findOne({ key: 'whatsapp_config' }).lean();
        return setting?.value || null;
    }

    /** Meta Cloud API config: env vars take priority, then DB */
    async _getMetaConfig() {
        // 1. Check DB first (usually more up-to-date in production)
        const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
        const dbValue = setting?.value || {};
        
        // 2. Check Env Vars as fallback
        const envToken   = process.env.META_WA_TOKEN;
        const envPhoneId = process.env.META_WA_PHONE_ID;
        const envWabaId  = process.env.META_WABA_ID;

        const config = {
            token:      dbValue.token || dbValue.apiKey || (envToken && !envToken.includes('YOUR_') ? envToken : null),
            phoneId:    dbValue.phoneId || (envPhoneId && !envPhoneId.includes('YOUR_') ? envPhoneId : null),
            businessId: dbValue.businessId || dbValue.wabaId || (envWabaId && !envWabaId.includes('YOUR_') ? envWabaId : null)
        };

        if (config.token && config.phoneId) {
            return config;
        }

        return null;
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Send a WhatsApp message to a single recipient.
     */
    async sendMessage(mobile, message) {
        if (process.env.WA_MOCK === 'true') {
            console.log(`[WhatsApp] MOCK → ${mobile}: ${message.substring(0, 80)}`);
            return { success: true, messageId: `mock_${Date.now()}`, provider: 'mock', mock: true };
        }

        const metaConfig = await this._getMetaConfig();
        if (metaConfig) {
            return this._sendViaMeta(mobile, message, metaConfig);
        }

        const gupshupConfig = await this._getGupshupConfig();
        if (gupshupConfig?.apiKey) {
            return this._sendViaGupshup(mobile, message, gupshupConfig);
        }

        console.log(`[WhatsApp] MOCK (no credentials) → ${mobile}: ${message.substring(0, 80)}`);
        return { success: true, messageId: `mock_${Date.now()}`, provider: 'mock', mock: true };
    }

    /**
     * Broadcast a message to multiple recipients.
     */
    async broadcast(mobiles, message) {
        const results = [];
        let sent = 0, failed = 0;

        for (const mobile of mobiles) {
            await new Promise(r => setTimeout(r, 300));
            const result = await this.sendMessage(mobile, message);
            results.push({ mobile, ...result });
            result.success ? sent++ : failed++;
        }

        console.log(`[WhatsApp] Broadcast complete — Sent: ${sent}, Failed: ${failed}`);
        return { sent, failed, results };
    }

    // ── Internal Providers ─────────────────────────────────────────────────────

    async _sendViaMeta(mobile, message, config, options = {}) {
        const toNumber = mobile.length === 10 ? `91${mobile}` : mobile.replace(/^\+/, '');
        const { type = 'text', mediaUrl, filename, caption } = options;

        try {
            const url = `${META_GRAPH_BASE}/${config.phoneId}/messages`;
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type:    'individual',
                to:                toNumber,
            };

            if (type === 'text') {
                payload.type = 'text';
                payload.text = { body: message, preview_url: false };
            } else if (type === 'image') {
                payload.type = 'image';
                payload.image = { link: mediaUrl, caption: caption || message };
            } else if (type === 'document') {
                payload.type = 'document';
                payload.document = { link: mediaUrl, filename: filename || 'document.pdf', caption: caption || message };
            }

            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type':  'application/json',
                },
                timeout: 15000,
            });

            const msgId = response.data?.messages?.[0]?.id;
            console.log(`[WhatsApp/Meta] Sent ${type} to ${toNumber}: ${msgId}`);
            return { success: true, messageId: msgId, provider: 'meta', type };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            console.error(`[WhatsApp/Meta] Error sending ${type} to ${toNumber}:`, detail);
            return { success: false, error: detail, provider: 'meta' };
        }
    }

    async _sendViaGupshup(mobile, message, config) {
        try {
            const response = await axios.post(
                'https://api.gupshup.io/sm/api/v1/msg',
                new URLSearchParams({
                    channel:     'whatsapp',
                    source:      config.sourcePhone,
                    destination: `91${mobile}`,
                    message:     JSON.stringify({ type: 'text', text: message }),
                    'src.name':  config.appName,
                }),
                {
                    headers: {
                        apikey:          config.apiKey,
                        'Content-Type':  'application/x-www-form-urlencoded',
                    },
                    timeout: 10000,
                }
            );

            const data = response.data;
            console.log(`[WhatsApp/Gupshup] Sent to ${mobile}: ${data?.messageId}`);
            return { success: true, messageId: data?.messageId, provider: 'gupshup' };
        } catch (err) {
            console.error(`[WhatsApp/Gupshup] Error sending to ${mobile}:`, err.message);
            return { success: false, error: err.message, provider: 'gupshup' };
        }
    }

    async sendTemplate(mobile, templateName, languageCode = 'en', components = []) {
        const metaConfig = await this._getMetaConfig();
        if (!metaConfig) {
            console.log(`[WhatsApp/Meta] MOCK template to ${mobile}: ${templateName}`);
            return { success: true, mock: true, provider: 'mock' };
        }

        const toNumber = mobile.length === 10 ? `91${mobile}` : mobile.replace(/^\+/, '');

        try {
            const url = `${META_GRAPH_BASE}/${metaConfig.phoneId}/messages`;
            const templatePayload = {
                name:     templateName,
                language: { code: languageCode }
            };

            // STRICT ALIGNMENT: Only include components if they have parameters
            // Meta Cloud API can reject empty components array for certain categories
            if (components && components.length > 0) {
                templatePayload.components = components;
            }

            const response = await axios.post(url, {
                messaging_product: 'whatsapp',
                to:                toNumber,
                type:              'template',
                template:          templatePayload,
            }, {
                headers: {
                    'Authorization': `Bearer ${metaConfig.token}`,
                    'Content-Type':  'application/json',
                },
                timeout: 15000,
            });

            const msgId = response.data?.messages?.[0]?.id;
            console.log(`[WhatsApp/Meta] Template sent to ${toNumber}: ${msgId}`);
            return { success: true, messageId: msgId, provider: 'meta', template: templateName };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            console.error(`[WhatsApp/Meta] Template error for ${toNumber}:`, detail);
            return { success: false, error: detail, provider: 'meta' };
        }
    }

    async sendMedia(mobile, type, mediaUrl, caption = '', filename = '') {
        const metaConfig = await this._getMetaConfig();
        if (metaConfig) {
            return this._sendViaMeta(mobile, caption, metaConfig, { type, mediaUrl, caption, filename });
        }
        
        console.log(`[WhatsApp] MOCK ${type} to ${mobile}: ${mediaUrl}`);
        return { success: true, mock: true, provider: 'mock' };
    }

    /**
     * Fetch WhatsApp Templates from Meta Business Account
     * Senior Professional Diagnostics Added
     */
    async getTemplates() {
        const config = await this._getMetaConfig();
        
        if (!config || !config.token || !config.businessId) {
            console.warn('[WhatsAppService] Missing credentials for Meta Sync. Returning Sandbox Templates.');
            return [
                {
                    name: 'sample_property_launch',
                    status: 'APPROVED',
                    language: 'en_US',
                    category: 'MARKETING',
                    components: [
                        { type: 'HEADER', format: 'TEXT', text: 'New Launch in Kurukshetra' },
                        { type: 'BODY', text: 'Hello {{1}}, check out our new project {{2}} starting at {{3}} Lakhs! Are you interested?' },
                        { type: 'FOOTER', text: 'Bharat Properties' }
                    ]
                },
                {
                    name: 'sample_site_visit_invite',
                    status: 'APPROVED',
                    language: 'en_US',
                    category: 'UTILITY',
                    components: [
                        { type: 'BODY', text: 'Namaskar {{1}} ji, your site visit for {{2}} is confirmed for tomorrow. See you soon!' }
                    ]
                }
            ];
        }

        try {
            const url = `${META_GRAPH_BASE}/${config.businessId}/message_templates`;
            console.log(`[WhatsAppService] Syncing templates for WABA: ${config.businessId}`);
            
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${config.token}` },
                params: { 
                    limit: 300,
                    fields: 'name,status,language,components,category'
                },
                timeout: 20000
            });

            const templates = response.data?.data || [];
            
            // Filter to APPROVED/IN_REVIEW to allow users to see what's coming
            const validTemplates = templates.filter(t => ['APPROVED', 'IN_REVIEW', 'AUTHENTICATION'].includes(t.status));
            
            console.log(`[WhatsAppService] Fetched ${templates.length} total. Valid: ${validTemplates.length}`);
            return validTemplates;
        } catch (err) {
            const errorData = err.response?.data?.error || {};
            const message = errorData.message || err.message;
            
            console.error('[WhatsApp/Meta] Template fetch error:', message);
            
            // Return empty instead of crashing if possible
            return [];
        }
    }

    verifyWebhook(query, verifyToken) {
        const mode = query['hub.mode'];
        const token = query['hub.verify_token'];
        const challenge = query['hub.challenge'];

        if (mode && token) {
            if (mode === 'subscribe' && token === verifyToken) {
                console.log('[WhatsApp] Webhook Verified Successfully');
                return challenge;
            }
        }
        console.warn('[WhatsApp] Webhook Verification Failed: Invalid Token');
        return null;
    }
}

export default new WhatsAppService();
