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
import Swal from 'sweetalert2';

// ─── WhatsApp ───────────────────────────────────────────────────────────────
// POST /api/whatsapp-config/send
// payload: { mobile, message }
export const dispatchWhatsApp = async ({ phone, message, templateId, templateComponents, headerImageUrl }) => {
    const cleanPhone = (phone || '').trim();
    // When templateId is provided, message body is optional — Meta uses the approved template body
    if (!cleanPhone || (!message && !templateId)) {
        console.warn('[Dispatcher] WhatsApp skipped: missing phone or message/template');
        return { success: false, channel: 'whatsapp', error: 'Missing phone or message' };
    }
    try {
        const payload = {
            mobile: cleanPhone,
            message: message,
            type: templateId ? 'template' : 'text'
        };
        
        // If template is used, we must pass the ID and components so Meta adds buttons
        if (templateId) {
            payload.templateId = templateId;
            payload.templateComponents = templateComponents || [];
            if (headerImageUrl) payload.headerImageUrl = headerImageUrl;
        }

        const response = await api.post('whatsapp-config/send', payload);
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
export const dispatchAll = async ({ activeTriggers, channelMessages, channelSubjects = {}, phone, email, smsTemplateId, waTemplateId, waTemplateComponents, waHeaderImageUrl, showUI = true }) => {
    const results = [];
    
    // Inline style for futuristic progress bar
    const progressStyle = `
        <style>
            @keyframes slideProgress { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        </style>
        <div style="width: 100%; background: #e5e7eb; border-radius: 9999px; overflow: hidden; height: 6px; position: relative;">
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #10b981; animation: slideProgress 1.5s infinite linear;"></div>
        </div>
    `;

    // Suppress Swal if WhatsApp is active because the global Liquid Morph animation handles it
    const useSwal = showUI && !activeTriggers.whatsapp && (activeTriggers.sms || activeTriggers.email);

    if (useSwal) {
        Swal.fire({
            title: 'Initializing Dispatch...',
            html: '<div style="margin-top: 10px; font-size: 14px; color: #6b7280;">Establishing secure connection to communication servers...</div>' + progressStyle,
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
    }

    if (activeTriggers.whatsapp && (channelMessages.whatsapp || waTemplateId)) {
        if (showUI) {
            // Trigger global Liquid Morph Animation
            window.dispatchEvent(new CustomEvent('wa_dispatch_start', { detail: { total: 1 } }));
        }
        
        const result = await dispatchWhatsApp({ 
            phone, 
            message: channelMessages.whatsapp || '', // body preview text (can be empty for Meta templates)
            templateId: waTemplateId,
            templateComponents: waTemplateComponents,
            headerImageUrl: waHeaderImageUrl
        });
        results.push(result);

        if (showUI) {
            // Trigger completion phase
            window.dispatchEvent(new CustomEvent('wa_dispatch_end'));
        }
    }

    if (activeTriggers.sms && channelMessages.sms) {
        if (showUI) Swal.update({ title: 'SMS Gateway', html: '<div style="margin-top: 10px; font-size: 14px; color: #3b82f6; font-weight: 600;">Dispatching SMS...</div>' + progressStyle });
        const result = await dispatchSMS({ 
            phone, 
            message: channelMessages.sms,
            templateId: smsTemplateId 
        });
        results.push(result);
    }

    if (activeTriggers.email && channelMessages.email) {
        if (showUI) Swal.update({ title: 'Email Gateway', html: '<div style="margin-top: 10px; font-size: 14px; color: #f59e0b; font-weight: 600;">Dispatching Email...</div>' + progressStyle });
        const result = await dispatchEmail({ 
            email, 
            message: channelMessages.email,
            subject: channelSubjects.email
        });
        results.push(result);
    }

    const successChannels = results.filter(r => r.success).map(r => r.channel.toUpperCase());
    const failedResults = results.filter(r => !r.success);
    const failedChannels = failedResults.map(r => `${r.channel.toUpperCase()} (${r.error})`);

    if (successChannels.length > 0) {
        console.log('[Dispatcher] 📤 Sent via:', successChannels.join(', '));
    }
    if (failedChannels.length > 0) {
        console.warn('[Dispatcher] ⚠️ Failed:', failedChannels.join(', '));
    }

    if (showUI && results.length > 0) {
        if (failedResults.length > 0) {
            let errorHtml = '<div style="text-align: left; background: #fee2e2; padding: 12px; border-radius: 8px; margin-top: 10px; max-height: 200px; overflow-y: auto;">';
            failedResults.forEach(f => {
                errorHtml += `<div style="margin-bottom: 8px;"><span style="color: #b91c1c; font-weight: 700; text-transform: uppercase; font-size: 12px;">${f.channel} Error</span><br/><span style="color: #7f1d1d; font-size: 14px;">${f.error}</span></div>`;
            });
            errorHtml += '</div>';
            
            // If some succeeded but some failed, show partial success
            const title = successChannels.length > 0 ? 'Partial Dispatch Success' : 'Dispatch Failed';
            const icon = successChannels.length > 0 ? 'warning' : 'error';

            Swal.fire({
                icon: icon,
                title: title,
                html: (successChannels.length > 0 ? `<div style="color: #10b981; font-weight: 600; margin-bottom: 10px;">Successfully sent via: ${successChannels.join(', ')}</div>` : '') + errorHtml,
                confirmButtonColor: '#3b82f6',
                confirmButtonText: 'Acknowledge'
            });
        } else if (useSwal) {
            Swal.fire({
                icon: 'success',
                title: 'Dispatch Complete',
                text: 'Communications have been successfully queued.',
                timer: 2000,
                showConfirmButton: false
            });
        }
    }

    return results;
};
