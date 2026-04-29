/**
 * 🚀 CommunicationDispatcher — Senior Professional Utility
 *
 * A unified, battle-hardened dispatcher for WhatsApp, SMS, and Email.
 * Handles correct backend payload formatting, error isolation per channel,
 * and diagnostic logging for the Bharat Properties CRM automation pipeline.
 *
 * Each method returns: { success: boolean, channel, error?: string }
 */

import { api, emailAPI } from './api';

// ─── WhatsApp ───────────────────────────────────────────────────────────────
// POST /api/whatsapp-config/send
// payload: { mobile, message }
export const dispatchWhatsApp = async ({ phone, message }) => {
    const cleanPhone = (phone || '').trim();
    if (!cleanPhone || !message) {
        console.warn('[Dispatcher] WhatsApp skipped: missing phone or message');
        return { success: false, channel: 'whatsapp', error: 'Missing phone or message' };
    }
    try {
        const response = await api.post('whatsapp-config/send', {
            mobile: cleanPhone,
            message: message,
            type: 'text'
        });
        console.log('[Dispatcher] ✅ WhatsApp sent to', cleanPhone);
        return { success: true, channel: 'whatsapp', data: response.data };
    } catch (err) {
        const error = err.response?.data?.message || err.response?.data?.error || err.message;
        console.error('[Dispatcher] ❌ WhatsApp failed:', error);
        return { success: false, channel: 'whatsapp', error };
    }
};

// ─── SMS ─────────────────────────────────────────────────────────────────────
// POST /api/sms-gateway/send
// payload: { recipients: [{ phone }], content: { body } }
export const dispatchSMS = async ({ phone, message, templateId }) => {
    const cleanPhone = (phone || '').trim();
    if (!cleanPhone || !message) {
        console.warn('[Dispatcher] SMS skipped: missing phone or message');
        return { success: false, channel: 'sms', error: 'Missing phone or message' };
    }
    try {
        const response = await api.post('sms-gateway/send', {
            recipients: [{ phone: cleanPhone }],
            content: { 
                body: message,
                templateId: templateId
            }
        });
        console.log('[Dispatcher] ✅ SMS sent to', cleanPhone);
        return { success: true, channel: 'sms', data: response.data };
    } catch (err) {
        const error = err.response?.data?.message || err.response?.data?.error || err.message;
        console.error('[Dispatcher] ❌ SMS failed:', error);
        return { success: false, channel: 'sms', error };
    }
};

// ─── Email ───────────────────────────────────────────────────────────────────
// POST /api/email/send
// payload: { to, subject, text }
export const dispatchEmail = async ({ email, message, subject: explicitSubject }) => {
    const cleanEmail = (email || '').trim();
    if (!cleanEmail || !message) {
        console.warn('[Dispatcher] Email skipped: missing email or message');
        return { success: false, channel: 'email', error: 'Missing email or message' };
    }
    // Extract subject from template if not provided explicitly (format: "Subject: ...\n\nBody")
    const subjectMatch = message.match(/Subject:\s*(.+?)(?:\n|$)/);
    const subject = explicitSubject || (subjectMatch ? subjectMatch[1].trim() : 'Update from Bharat Properties');
    const body = message.replace(/Subject:.*?\n/, '').trim();

    // Check if body is HTML
    const isHtml = /<[a-z][\s\S]*>/i.test(body);

    try {
        const payload = {
            to: cleanEmail,
            subject
        };
        if (isHtml) {
            payload.html = body;
        } else {
            payload.text = body;
        }

        const response = await emailAPI.send(payload);
        console.log('[Dispatcher] ✅ Email sent to', cleanEmail, '| Subject:', subject);
        return { success: true, channel: 'email', data: response };
    } catch (err) {
        const error = err.response?.data?.message || err.response?.data?.error || err.message;
        console.error('[Dispatcher] ❌ Email failed:', error);
        return { success: false, channel: 'email', error };
    }
};

// ─── Master Dispatcher ───────────────────────────────────────────────────────
/**
 * Dispatches all active communication channels.
 *
 * @param {Object} params
 * @param {Object} params.activeTriggers   - { whatsapp: bool, sms: bool, email: bool }
 * @param {Object} params.channelMessages  - { whatsapp: string, sms: string, email: string }
 * @param {Object} params.channelSubjects  - { email: string } (Optional)
 * @param {string} params.phone            - Recipient phone number
 * @param {string} params.email            - Recipient email address
 * @param {string} params.smsTemplateId    - Optional SMS template ID for DLT compliance
 * @returns {Promise<Array>}               - Array of dispatch results per channel
 */
export const dispatchAll = async ({ activeTriggers, channelMessages, channelSubjects = {}, phone, email, smsTemplateId }) => {
    const results = [];

    if (activeTriggers.whatsapp && channelMessages.whatsapp) {
        const result = await dispatchWhatsApp({ phone, message: channelMessages.whatsapp });
        results.push(result);
    }

    if (activeTriggers.sms && channelMessages.sms) {
        const result = await dispatchSMS({ 
            phone, 
            message: channelMessages.sms,
            templateId: smsTemplateId 
        });
        results.push(result);
    }

    if (activeTriggers.email && channelMessages.email) {
        const result = await dispatchEmail({ 
            email, 
            message: channelMessages.email,
            subject: channelSubjects.email
        });
        results.push(result);
    }

    const successChannels = results.filter(r => r.success).map(r => r.channel.toUpperCase());
    const failedChannels = results.filter(r => !r.success).map(r => `${r.channel.toUpperCase()} (${r.error})`);

    if (successChannels.length > 0) {
        console.log('[Dispatcher] 📤 Sent via:', successChannels.join(', '));
    }
    if (failedChannels.length > 0) {
        console.warn('[Dispatcher] ⚠️ Failed:', failedChannels.join(', '));
    }

    return results;
};
