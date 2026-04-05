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
import SystemSetting from '../models/SystemSetting.js';

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
        const envToken   = process.env.META_WA_TOKEN;
        const envPhoneId = process.env.META_WA_PHONE_ID;

        if (envToken && envPhoneId && !envToken.includes('YOUR_')) {
            return { token: envToken, phoneId: envPhoneId };
        }

        // Fall back to DB key
        const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
        if (setting?.value?.token && setting?.value?.phoneId) {
            return { token: setting.value.token, phoneId: setting.value.phoneId };
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
     * Supports text messages (freeform within 24-hour session window).
     * For first-contact marketing, use approved template messages.
     */
    async _sendViaMeta(mobile, message, config) {
        // Meta requires E.164 format without + prefix for the `to` field
        const toNumber = mobile.length === 10 ? `91${mobile}` : mobile.replace(/^\+/, '');

        try {
            const url = `${META_GRAPH_BASE}/${config.phoneId}/messages`;
            const response = await axios.post(url, {
                messaging_product: 'whatsapp',
                recipient_type:    'individual',
                to:                toNumber,
                type:              'text',
                text: {
                    preview_url: false,
                    body:        message,
                },
            }, {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type':  'application/json',
                },
                timeout: 12000,
            });

            const msgId = response.data?.messages?.[0]?.id;
            console.log(`[WhatsApp/Meta] Sent to ${toNumber}: ${msgId}`);
            return { success: true, messageId: msgId, provider: 'meta' };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            console.error(`[WhatsApp/Meta] Error sending to ${toNumber}:`, detail);
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
     * Send a Meta template message (for first-contact marketing outside 24hr window).
     * Template must be pre-approved in Meta Business Manager.
     *
     * @param {string} mobile        - 10-digit mobile number
     * @param {string} templateName  - Approved template name (e.g. 'property_launch_v1')
     * @param {string} languageCode  - Template language (default: 'en')
     * @param {Array}  components    - Template body components with parameters
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
                timeout: 12000,
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
}

export default new WhatsAppService();



