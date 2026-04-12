/**
 * WhatsAppService.js
 * Phase D: Multi-provider WhatsApp dispatch.
 *
 * Provider priority:
 *   1. Meta WhatsApp Cloud API  (META_WA_TOKEN + META_WA_PHONE_ID in .env or DB)
 *   2. Gupshup REST API         (whatsapp_config DB key with apiKey + sourcePhone)
 *   3. Mock Mode                (WA_MOCK=true or no credentials configured)
 *
 * API Docs:
 *   Meta Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages
 *   Gupshup:        https://www.gupshup.io/developer/docs/bot-platform/guide/whatsapp-api-documentation
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
        // 1. Check Env Vars
        const envToken   = process.env.META_WA_TOKEN;
        const envPhoneId = process.env.META_WA_PHONE_ID;
        const envWabaId  = process.env.META_WABA_ID;

        if (envToken && envPhoneId && !envToken.includes('YOUR_')) {
            return { token: envToken, phoneId: envPhoneId, businessId: envWabaId };
        }

        // 2. Check DB (standardize on meta_wa_config key)
        const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
        if (setting?.value?.token || setting?.value?.apiKey) {
            return {
                token:      setting.value.token || setting.value.apiKey,
                phoneId:    setting.value.phoneId,
                businessId: setting.value.businessId || setting.value.wabaId
            };
        }

        return null;
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Send a WhatsApp message to a single recipient.
     * @param  {string} mobile   - 10-digit Indian mobile (e.g. "9876543210")
     * @param  {string} message  - Text message
     * @returns {{ success: boolean, messageId?: string, provider?: string, error?: string, mock?: boolean }}
     */
    async sendMessage(mobile, message) {
        // ── Explicit mock mode ─────────────────────────────────────────────
        if (process.env.WA_MOCK === 'true') {
            console.log(`[WhatsApp] MOCK → ${mobile}: ${message.substring(0, 80)}`);
            return { success: true, messageId: `mock_${Date.now()}`, provider: 'mock', mock: true };
        }

        // ── Provider 1: Meta WhatsApp Cloud API ────────────────────────────
        const metaConfig = await this._getMetaConfig();
        if (metaConfig) {
            return this._sendViaMeta(mobile, message, metaConfig);
        }

        // ── Provider 2: Gupshup ────────────────────────────────────────────
        const gupshupConfig = await this._getGupshupConfig();
        if (gupshupConfig?.apiKey) {
            return this._sendViaGupshup(mobile, message, gupshupConfig);
        }

        // ── Provider 3: Mock fallback ──────────────────────────────────────
        console.log(`[WhatsApp] MOCK (no credentials) → ${mobile}: ${message.substring(0, 80)}`);
        return { success: true, messageId: `mock_${Date.now()}`, provider: 'mock', mock: true };
    }

    /**
     * Broadcast a message to multiple recipients.
     * @param {string[]} mobiles - Array of 10-digit mobile numbers (or full E.164 without +)
     * @param {string}   message - Text message
     * @returns {{ sent: number, failed: number, results: Array }}
     */
    async broadcast(mobiles, message) {
        const results = [];
        let sent = 0, failed = 0;

        for (const mobile of mobiles) {
            // 300ms throttle to respect API rate limits
            await new Promise(r => setTimeout(r, 300));
            const result = await this.sendMessage(mobile, message);
            results.push({ mobile, ...result });
            result.success ? sent++ : failed++;
        }

        console.log(`[WhatsApp] Broadcast complete — Sent: ${sent}, Failed: ${failed}`);
        return { sent, failed, results };
    }

    // ── Internal Providers ─────────────────────────────────────────────────────

    /**
     * Send via Meta WhatsApp Cloud API.
     * Supports text, image, and document messages.
     */
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

    /**
     * Send via Gupshup REST API (legacy provider — kept as fallback).
     */
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

    /**
     * Send a Meta template message.
     */
    async sendTemplate(mobile, templateName, languageCode = 'en', components = []) {
        const metaConfig = await this._getMetaConfig();
        if (!metaConfig) {
            console.log(`[WhatsApp/Meta] MOCK template to ${mobile}: ${templateName}`);
            return { success: true, mock: true, provider: 'mock' };
        }

        const toNumber = mobile.length === 10 ? `91${mobile}` : mobile.replace(/^\+/, '');

        try {
            const url = `${META_GRAPH_BASE}/${metaConfig.phoneId}/messages`;
            const response = await axios.post(url, {
                messaging_product: 'whatsapp',
                to:                toNumber,
                type:              'template',
                template: {
                    name:     templateName,
                    language: { code: languageCode },
                    components,
                },
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

    /**
     * Send an image or document via WhatsApp.
     * @param {string} mobile   - Recipient mobile
     * @param {string} type     - 'image' or 'document'
     * @param {string} mediaUrl - URL of the file
     * @param {string} caption  - Optional text
     * @param {string} filename - Optional for documents
     */
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
     */
    async getTemplates() {
        const config = await this._getMetaConfig();
        if (!config || !config.businessId || !config.token) {
            return []; // Fallback if not configured
        }

        try {
            const url = `${META_GRAPH_BASE}/${config.businessId}/message_templates`;
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${config.token}` },
                params: { limit: 100 }
            });
            return response.data?.data || [];
        } catch (err) {
            console.error('[WhatsApp/Meta] Error fetching templates:', err.response?.data || err.message);
            return [];
        }
    }

    /**
     * Webhook verification (for Meta handshake).
     * Professional Enterprise validation
     */
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



