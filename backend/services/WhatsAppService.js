/**
 * WhatsAppService.js
 * Manages WhatsApp Business API communication via Gupshup (primary) with
 * a structured mock-mode fallback so the engine works without credentials.
 */
import axios from 'axios';
import SystemSetting from '../models/SystemSetting.js';

class WhatsAppService {
    /**
     * Fetch WhatsApp config from DB (set via Settings page).
     */
    async getConfig() {
        const setting = await SystemSetting.findOne({ key: 'whatsapp_config' }).lean();
        return setting?.value || null;
    }

    /**
     * Send a WhatsApp message to a single recipient.
     * @param  {string} mobile  - 10-digit mobile (e.g. "9876543210")
     * @param  {string} message - Text message
     * @returns {Object}        - { success, messageId?, error? }
     */
    async sendMessage(mobile, message) {
        const config = await this.getConfig();

        // ── MOCK MODE (no config) ─────────────────────────────────────────────
        if (!config || !config.apiKey || process.env.WA_MOCK === 'true') {
            console.log(`[WhatsApp] MOCK → ${mobile}: ${message.substring(0, 60)}...`);
            return { success: true, messageId: `mock_${Date.now()}`, mock: true };
        }

        // ── Gupshup REST API ──────────────────────────────────────────────────
        try {
            const response = await axios.post(
                'https://api.gupshup.io/sm/api/v1/msg',
                new URLSearchParams({
                    channel:    'whatsapp',
                    source:     config.sourcePhone,   // Registered WA Business number
                    destination: `91${mobile}`,
                    message:    JSON.stringify({ type: 'text', text: message }),
                    'src.name': config.appName,
                }),
                {
                    headers: {
                        apikey: config.apiKey,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    timeout: 10000,
                }
            );

            const data = response.data;
            console.log(`[WhatsApp] Sent to ${mobile}: ${data?.messageId}`);
            return { success: true, messageId: data?.messageId };
        } catch (error) {
            console.error(`[WhatsApp] Error sending to ${mobile}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Broadcast a message to multiple recipients.
     * @param {string[]} mobiles - Array of 10-digit mobile numbers
     * @param {string}   message - Text message to broadcast
     * @returns {Object}         - { sent, failed, results[] }
     */
    async broadcast(mobiles, message) {
        const results = [];
        let sent = 0, failed = 0;

        for (const mobile of mobiles) {
            // 300ms throttle to avoid rate limit
            await new Promise(r => setTimeout(r, 300));
            const result = await this.sendMessage(mobile, message);
            results.push({ mobile, ...result });
            result.success ? sent++ : failed++;
        }

        console.log(`[WhatsApp] Broadcast complete — Sent: ${sent}, Failed: ${failed}`);
        return { sent, failed, results };
    }
}

export default new WhatsAppService();
