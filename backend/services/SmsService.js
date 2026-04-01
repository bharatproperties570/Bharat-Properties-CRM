/**
 * SmsService.js
 * Manages SMS delivery via Textlocal (primary) with mock fallback.
 * DLT-registered templates required for India compliance.
 */
import axios from 'axios';
import SystemSetting from '../models/SystemSetting.js';

class SmsService {
    async getConfig() {
        const setting = await SystemSetting.findOne({ key: 'sms_config' }).lean();
        return setting?.value || null;
    }

    /**
     * Send an SMS to a single recipient.
     * @param  {string} mobile  - 10-digit mobile number
     * @param  {string} message - SMS text (max 160 chars, must match DLT template)
     */
    async sendSms(mobile, message) {
        const config = await this.getConfig();

        // ── MOCK MODE ─────────────────────────────────────────────────────────
        if (!config || !config.apiKey || process.env.SMS_MOCK === 'true') {
            console.log(`[SMS] MOCK → ${mobile}: ${message.substring(0, 80)}...`);
            return { success: true, messageId: `sms_mock_${Date.now()}`, mock: true };
        }

        // ── Textlocal API ─────────────────────────────────────────────────────
        try {
            const response = await axios.post(
                'https://api.textlocal.in/send/',
                new URLSearchParams({
                    apikey:  config.apiKey,
                    sender:  config.senderId || 'BHARAP',
                    numbers: `91${mobile}`,
                    message: message,
                }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 10000,
                }
            );

            const data = response.data;
            if (data.status === 'success') {
                console.log(`[SMS] Sent to ${mobile}: ${data.batch_id}`);
                return { success: true, messageId: data.batch_id };
            } else {
                console.error(`[SMS] API Error to ${mobile}:`, data.errors);
                return { success: false, error: JSON.stringify(data.errors) };
            }
        } catch (error) {
            console.error(`[SMS] Network Error to ${mobile}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Bulk SMS to an array of mobiles.
     */
    async bulkSend(mobiles, message) {
        const results = [];
        let sent = 0, failed = 0;

        for (const mobile of mobiles) {
            await new Promise(r => setTimeout(r, 200)); // Rate limit buffer
            const result = await this.sendSms(mobile, message);
            results.push({ mobile, ...result });
            result.success ? sent++ : failed++;
        }

        console.log(`[SMS] Bulk Send — Sent: ${sent}, Failed: ${failed}`);
        return { sent, failed, results };
    }
}

export default new SmsService();
