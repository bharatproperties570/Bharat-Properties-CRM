/**
 * SmsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Senior Professional Bridge — routes all legacy SMS requests to the 
 * robust, multi-provider src/modules/sms/sms.service.js implementation.
 * 
 * Supports: Twilio, SMSGatewayHub (Production), and Custom HTTP.
 */
import smsModuleService from '../src/modules/sms/sms.service.js';

class SmsService {
    /**
     * Send an SMS to a single recipient.
     * Proxies to the robust module service.
     */
    async sendSms(mobile, message, context = {}) {
        try {
            return await smsModuleService.sendSMS(mobile, message, context);
        } catch (error) {
            console.error(`[SmsBridge] Error to ${mobile}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Bulk SMS to an array of mobiles.
     * Proxies to the robust module service with BullMQ-safe execution.
     */
    async bulkSend(mobiles, message, context = {}) {
        try {
            return await smsModuleService.bulkSend(mobiles, message, context);
        } catch (error) {
            console.error('[SmsBridge] Bulk send error:', error.message);
            return { sent: 0, failed: mobiles.length, error: error.message };
        }
    }

    /**
     * Get gateway-specific stats (e.g. balance)
     */
    async getStatus() {
        return await smsModuleService.getBalance();
    }
}

export default new SmsService();
