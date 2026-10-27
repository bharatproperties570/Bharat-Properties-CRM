import IntegrationGuard from "../src/utils/IntegrationGuard.js";

import axios from 'axios';
import axiosRetry from 'axios-retry';
import mongoose from 'mongoose';

// 🧠 SENIOR PROFESSIONAL: Resilience Layer
// Configure automated retries for transient failures (Network, 5xx, 429)
axiosRetry(axios, { 
    retries: 3, 
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429;
    }
});

const META_GRAPH_BASE = 'https://graph.facebook.com/v19.0';

class WhatsAppService {
    constructor() {
        this._idempotencyCache = new Map();
        this._idempotencyTTL = 10 * 60 * 1000; // 10 minutes
    }

    _getIdempotentResult(key) {
        if (!key) return null;
        const entry = this._idempotencyCache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this._idempotencyTTL) {
            this._idempotencyCache.delete(key);
            return null;
        }
        return entry.result;
    }

    _setIdempotentResult(key, result) {
        if (!key || !result) return;
        if (this._idempotencyCache.size > 2000) {
            const now = Date.now();
            for (const [k, v] of this._idempotencyCache.entries()) {
                if (now - v.timestamp > this._idempotencyTTL) {
                    this._idempotencyCache.delete(k);
                }
            }
        }
        this._idempotencyCache.set(key, { result, timestamp: Date.now() });
    }

    async isRecipientOptedOut(mobile) {
        if (!mobile) return false;
        const digits = String(mobile).replace(/\D/g, '');
        if (digits.length < 10) return false;
        const clean10 = digits.slice(-10);
        const phoneFormats = [digits, `+${digits}`, clean10, `91${clean10}`, `+91${clean10}`];
        try {
            const Lead = mongoose.models.Lead || (await import('../models/Lead.js')).default;
            const Contact = mongoose.models.Contact || (await import('../models/Contact.js')).default;
            const Conversation = mongoose.models.Conversation || (await import('../models/Conversation.js')).default;

            const lead = await Lead.findOne({
                $or: [
                    { mobile: { $in: phoneFormats } },
                    { mobile: { $regex: new RegExp(clean10 + '$') } }
                ],
                whatsappOptOut: true
            }).select('_id whatsappOptOut').lean();
            if (lead) return true;

            const contact = await Contact.findOne({
                'phones.number': { $in: phoneFormats },
                whatsappOptOut: true
            }).select('_id whatsappOptOut').lean();
            if (contact) return true;

            const conv = await Conversation.findOne({
                phoneNumber: { $in: phoneFormats },
                isOptedOut: true
            }).select('_id isOptedOut').lean();
            if (conv) return true;

            return false;
        } catch (err) {
            console.error('[WhatsAppService] Error checking opt-out status:', err.message);
            return false;
        }
    }

    async _markIntegrationRevoked(integrationId, reason) {
        try {
            const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
            await WhatsAppIntegration.findByIdAndUpdate(integrationId, {
                $set: {
                    status: 'REVOKED',
                    onboardingStatus: 'REVOKED',
                    failureReason: reason,
                    revokedAt: new Date()
                }
            });
            console.warn(`[WhatsAppService] Marked integration ${integrationId} as REVOKED: ${reason}`);
        } catch (e) {
            console.error('[WhatsAppService] Failed to mark integration as revoked:', e.message);
        }
    }

    sanitizeSecrets(str) {
        if (!str) return str;
        const text = typeof str === 'string' ? str : JSON.stringify(str);
        return text
            .replace(/(Bearer\s+)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
            .replace(/((?:access_)?token=)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
            .replace(/(systemUserToken":\s*")[^"]+/gi, '$1[REDACTED]')
            .replace(/(appSecret":\s*")[^"]+/gi, '$1[REDACTED]');
    }
    /**
     * Resolve configuration from DB or Env
     * Supports multi-account resolution via integrationId or phoneNumberId,
     * while preserving 100% backward compatibility by falling back to meta_wa_config.
     */
    async _getMetaConfig(integrationIdOrPhoneId = null) {
        const isPlaceholder = (val) => !val || val.includes('YOUR_') || val.includes('SYSTEM_USER');

        // 1. If explicit account ID or Phone ID is requested, look in WhatsAppIntegration
        if (integrationIdOrPhoneId && integrationIdOrPhoneId !== 'legacy_default') {
            const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
            const query = mongoose.Types.ObjectId.isValid(integrationIdOrPhoneId)
                ? { _id: integrationIdOrPhoneId, provider: { $ne: 'BAILEYS' }, status: 'ACTIVE' }
                : { phoneNumberId: String(integrationIdOrPhoneId), provider: { $ne: 'BAILEYS' }, status: 'ACTIVE' };

            let integration = await WhatsAppIntegration.findOne(query).lean();
            if (!integration) {
                // If explicit ID was not an active Meta account (e.g. was Baileys ID passed during cross-channel toggle), fall back to default Meta account
                console.warn(`[WhatsAppService] Explicit account '${integrationIdOrPhoneId}' is not an active Meta account. Falling back to default Meta integration.`);
                integration = await WhatsAppIntegration.findOne({ isDefault: true, provider: { $ne: 'BAILEYS' }, status: 'ACTIVE' }).lean();
            }

            if (integration) {
                if (!integration.credentials?.systemUserToken || isPlaceholder(integration.credentials.systemUserToken)) {
                    throw new Error(`Target WhatsApp account '${integration.accountLabel || integration._id}' has no valid credentials`);
                }
                return {
                    integrationId: integration._id,
                    token: integration.credentials?.systemUserToken,
                    phoneId: integration.phoneNumberId,
                    businessId: integration.wabaId,
                    appId: process.env.FB_GRAPH_APP_ID || process.env.META_WA_APP_ID,
                    displayPhoneNumber: integration.displayPhoneNumber,
                    accountLabel: integration.accountLabel || 'WhatsApp Account',
                    connectionType: integration.connectionType,
                    provider: integration.provider || 'META'
                };
            }
        }

        // 2. Try default active WhatsAppIntegration (e.g. if configured as default)
        try {
            const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
            const defaultIntegration = await WhatsAppIntegration.findOne({ isDefault: true, status: 'ACTIVE' }).lean();
            if (defaultIntegration && (defaultIntegration.provider === 'BAILEYS' || (defaultIntegration.credentials?.systemUserToken && !isPlaceholder(defaultIntegration.credentials.systemUserToken)))) {
                return {
                    integrationId: defaultIntegration._id,
                    token: defaultIntegration.credentials?.systemUserToken,
                    phoneId: defaultIntegration.phoneNumberId,
                    businessId: defaultIntegration.wabaId,
                    appId: process.env.FB_GRAPH_APP_ID || process.env.META_WA_APP_ID,
                    displayPhoneNumber: defaultIntegration.displayPhoneNumber,
                    accountLabel: defaultIntegration.accountLabel || 'Main WhatsApp API',
                    connectionType: defaultIntegration.connectionType,
                    provider: defaultIntegration.provider || 'META'
                };
            }
        } catch (e) {
            // ignore if model not compiled yet
        }

        // 3. Fallback: Legacy meta_wa_config in SystemSetting (100% Backward Compatible)
        try {
            const SystemSetting = mongoose.model ? mongoose.model('SystemSetting') : (mongoose.models.SystemSetting || (await import('../models/SystemSetting.js')).default);
            const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();

            if (setting && setting.value?.token && !isPlaceholder(setting.value.token)) {
                return {
                    token: setting.value.token,
                    phoneId: setting.value.phoneId,
                    businessId: setting.value.businessId,
                    appId: setting.value.appId || process.env.META_WA_APP_ID,
                    displayPhoneNumber: setting.value.displayPhoneNumber || '+91 99960 00570',
                    accountLabel: 'Main Official WhatsApp API'
                };
            }
        } catch (e) {
            if (e instanceof TypeError) throw e;
            console.warn('[WhatsAppService] Error reading SystemSetting meta_wa_config:', e.message);
        }

        // 4. Fallback to Env if DB is empty
        if (process.env.META_WA_TOKEN && process.env.META_WA_PHONE_ID && !isPlaceholder(process.env.META_WA_TOKEN)) {
            return {
                token: process.env.META_WA_TOKEN,
                phoneId: process.env.META_WA_PHONE_ID,
                businessId: process.env.YOUR_WABA_ID,
                appId: process.env.META_WA_APP_ID,
                displayPhoneNumber: process.env.META_WA_DISPLAY_NUMBER || '+91 99960 00570',
                accountLabel: 'Env WhatsApp API'
            };
        }

        return null;
    }

    async _getBaileysConfig(integrationIdOrPhoneId = null) {
        const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../models/WhatsAppIntegration.js')).default;
        let integration = null;
        if (integrationIdOrPhoneId) {
            const query = mongoose.Types.ObjectId.isValid(integrationIdOrPhoneId)
                ? { _id: integrationIdOrPhoneId, provider: 'BAILEYS', status: 'ACTIVE' }
                : { phoneNumberId: String(integrationIdOrPhoneId), provider: 'BAILEYS', status: 'ACTIVE' };
            integration = await WhatsAppIntegration.findOne(query).lean();
            if (!integration) {
                throw new Error(`Requested WhatsApp Web line (${integrationIdOrPhoneId}) is not active or not found.`);
            }
        } else {
            integration = await WhatsAppIntegration.findOne({ provider: 'BAILEYS', status: 'ACTIVE' }).lean();
        }
        if (!integration) {
            throw new Error("Active WhatsApp Web account not found. Please connect your WhatsApp Web in Profile settings.");
        }
        return {
            integrationId: integration._id,
            displayPhoneNumber: integration.displayPhoneNumber,
            accountLabel: integration.accountLabel || 'Bharat Properties WhatsApp Web',
            connectionType: integration.connectionType,
            provider: 'BAILEYS'
        };
    }

    /**
     * Send a standard text message
     * @param {string} mobile - Recipient phone number or group JID
     * @param {string} message - Text body
     * @param {Object} [options] - Optional settings { integrationId, phoneId }
     */
    async sendMessage(mobile, message, options = {}) {
        if (!IntegrationGuard.canSendWhatsapp()) {
            IntegrationGuard.logBlock("WhatsApp sendMessage", mobile);
            return { messages: [{ id: "staging-blocked" }] };
        }

        // 1. Opt-out policy enforcement
        const isOptedOut = await this.isRecipientOptedOut(mobile);
        if (isOptedOut && !options?.overrideOptOut) {
            console.warn(`[WhatsAppService] Outbound WhatsApp to ${mobile} blocked: Recipient has opted out.`);
            return {
                success: false,
                error: 'Recipient has opted out of WhatsApp communications',
                code: 'RECIPIENT_OPTED_OUT',
                optedOut: true,
                provider: 'policy'
            };
        }

        // 2. Idempotency Check
        const idempotencyKey = options?.idempotencyKey;
        if (idempotencyKey) {
            const cached = this._getIdempotentResult(idempotencyKey);
            if (cached) {
                console.log(`[WhatsAppService] Idempotent replay for key '${idempotencyKey}'. Returning cached result.`);
                return { ...cached, alreadySent: true, duplicate: true };
            }
        }

        const targetAccount = typeof options === 'string' ? options : (options?.integrationId || options?.phoneId || null);
        const isGroupTarget = String(mobile || '').includes('@g.us');
        const opt = typeof options === 'object' ? (options || {}) : {};
        const isBaileysRequested = opt.provider === 'BAILEYS' || 
            opt.channel === 'whatsapp_web' || 
            opt.useBaileys === true ||
            opt.platform === 'WhatsApp Web';
        const isMetaRequested = opt.provider === 'META' || 
            opt.channel === 'whatsapp_api' || 
            opt.useMeta === true ||
            opt.platform === 'Direct' ||
            opt.platform === 'WhatsApp Cloud API';

        let config;
        try {
            if (isGroupTarget) {
                // WhatsApp Groups are strictly routed to WhatsApp Web (Baileys)
                config = await this._getBaileysConfig(targetAccount);
            } else if (isBaileysRequested && !isMetaRequested) {
                // Explicitly routed to WhatsApp Web (Baileys scanner)
                config = await this._getBaileysConfig(targetAccount);
            } else if (isMetaRequested && !isBaileysRequested) {
                // Explicitly routed to Meta Cloud API
                config = await this._getMetaConfig(targetAccount);
            } else {
                // Fallback: try Meta first, but if not configured/fails, fallback to Baileys
                try {
                    config = await this._getMetaConfig(targetAccount);
                } catch (metaErr) {
                    try {
                        config = await this._getBaileysConfig(targetAccount);
                    } catch (_) {
                        throw metaErr;
                    }
                }
            }
        } catch (err) {
            console.error(`[WhatsAppService] Account resolution error for target '${targetAccount}':`, err.message);
            return { success: false, error: err.message, provider: (isGroupTarget || isBaileysRequested) ? 'baileys' : 'meta' };
        }

        let sendResult;
        if (config) {
            if (config.provider === 'BAILEYS') {
                sendResult = await this._sendViaBaileys(mobile, message, config, { type: 'text', ...(typeof options === 'object' ? options : {}) });
            } else {
                sendResult = await this._sendViaMeta(mobile, message, config, { type: 'text', ...(typeof options === 'object' ? options : {}) });
            }
        } else if (process.env.GUPSHUP_API_KEY) {
            // Gupshup/Other Fallback logic simplified for Bharat Properties
            sendResult = await this._sendViaGupshup(mobile, message, {
                apiKey: process.env.GUPSHUP_API_KEY,
                sourcePhone: process.env.GUPSHUP_SOURCE,
                appName: process.env.GUPSHUP_APP_NAME
            });
        } else {
            console.log(`[WhatsApp] MOCK message to ${mobile}: ${message}`);
            sendResult = { success: true, mock: true, provider: 'mock' };
        }

        if (idempotencyKey && sendResult && sendResult.success) {
            this._setIdempotentResult(idempotencyKey, sendResult);
        }

        return sendResult;
    }

    /**
     * Bulk message dispatch (Broadcast)
     */
    async broadcast(mobiles, message) {
        const results = [];
        let sent = 0, failed = 0;

        for (const mobile of mobiles) {
            await new Promise(r => setTimeout(r, 300));
            const result = await this.sendMessage(mobile, message);
            results.push({ mobile, ...result });
            if (result.success) sent++; else failed++;
        }

        console.log(`[WhatsApp] Broadcast complete — Sent: ${sent}, Failed: ${failed}`);
        return { sent, failed, results };
    }

    // ── Internal Providers ─────────────────────────────────────────────────────

    _normalizeTarget(mobile) {
        if (!mobile) return null;
        const digitsOnly = String(mobile).replace(/\D/g, '');
        if (digitsOnly.length < 10) return null;
        return digitsOnly.length === 10 ? `91${digitsOnly}` : digitsOnly;
    }

    async _sendViaBaileys(mobile, message, config, options = {}) {
        const { type = 'text', mediaUrl } = options;
        try {
            const { BaileysConnectionManager } = await import('./baileysQueue/BaileysConnectionManager.js');
            let sock = BaileysConnectionManager.getSocket(config.integrationId.toString());
            
            if (!sock) {
                try {
                    sock = await BaileysConnectionManager.connect(config.integrationId.toString());
                } catch (connErr) {
                    console.error('[WhatsAppService/Baileys] Socket connect error:', connErr.message);
                }
            }

            if (!sock) {
                const isDev = process.env.NODE_ENV !== 'production';
                const errorDetail = isDev
                    ? 'Local Dev Environment: WhatsApp Web socket is hosted on Production (api.bharatproperties.co) to prevent session conflicts. Please send group messages from https://crm.bharatproperties.co'
                    : 'WhatsApp socket not connected or still pairing';
                return { success: false, error: errorDetail, provider: 'baileys' };
            }
            if (!sock.user || !sock.user.id) {
                return { success: false, error: 'WhatsApp Web is not fully connected. Please scan the QR code in Profile page.', provider: 'baileys' };
            }

            if (!sock.ws || !sock.ws.isOpen) {
                if (sock.ws && sock.ws.isConnecting) {
                    try {
                        await Promise.race([
                            sock.waitForSocketOpen(),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Wait timeout')), 4000))
                        ]);
                    } catch (waitErr) {}
                }
                if (!sock.ws || !sock.ws.isOpen) {
                    return { 
                        success: false, 
                        error: 'WhatsApp Web socket is currently reconnecting or offline. Please check connection in Profile.', 
                        provider: 'baileys' 
                    };
                }
            }

            // Enterprise LID resolution before formatting outbound JID
            let resolvedTarget = mobile;
            try {
                const res = await BaileysConnectionManager.resolveJidToPhone(mobile, config.integrationId);
                if (res && res.cleanPhone && !res.cleanPhone.includes('@')) {
                    resolvedTarget = res.cleanPhone;
                }
            } catch (e) {}

            let jid = String(resolvedTarget || '').trim();
            if (!jid.includes('@s.whatsapp.net') && !jid.includes('@g.us') && !jid.includes('@lid')) {
                const normalized = this._normalizeTarget(jid);
                if (!normalized) {
                    return { success: false, error: 'Invalid phone number format for WhatsApp', provider: 'baileys' };
                }
                jid = `${normalized}@s.whatsapp.net`;
            }
            
            let content = { text: message || '' };
            if (type !== 'text' && mediaUrl) {
                let mimetype = 'image/jpeg';
                if (type === 'video') mimetype = 'video/mp4';
                else if (type === 'document') mimetype = 'application/pdf';
                
                let mediaSource = { url: mediaUrl };
                if (mediaUrl.startsWith('/uploads/') || mediaUrl.startsWith('uploads/')) {
                    const path = await import('path');
                    const fs = await import('fs');
                    const localPath = path.resolve(process.cwd(), mediaUrl.replace(/^\//, ''));
                    if (fs.existsSync(localPath)) {
                        mediaSource = fs.readFileSync(localPath);
                    }
                }

                content = {
                    [type === 'image' ? 'image' : type === 'document' ? 'document' : 'video']: mediaSource,
                    caption: message || ''
                };
                if (type === 'document') {
                    content.mimetype = mimetype;
                    if (options.filename) content.fileName = options.filename;
                }
            }

            // 🛡️ Enterprise Anti-Ban: Human Typing Presence Emulation for 1-on-1 chats
            if (!jid.includes('@g.us')) {
                try {
                    await sock.sendPresenceUpdate('composing', jid);
                    await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 800)));
                    await sock.sendPresenceUpdate('paused', jid);
                } catch (presenceErr) {
                    // Non-fatal
                }
            }

            let sentMsg;
            try {
                const sendPromise = sock.sendMessage(jid, content);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('WhatsApp Web send timed out after 25 seconds. Please check device connectivity or QR pairing.')), 25000)
                );
                sentMsg = await Promise.race([sendPromise, timeoutPromise]);
            } catch (firstAttemptErr) {
                const errMsg = String(firstAttemptErr?.message || firstAttemptErr);
                const isSocketDead = !sock.ws || !sock.ws.isOpen || errMsg.includes('1006') || errMsg.includes('Connection Terminated') || errMsg.includes('closed');
                console.warn('[WhatsAppService/Baileys] First send attempt failed:', errMsg, '| Socket dead:', isSocketDead);

                if (isSocketDead) {
                    try {
                        console.log('[WhatsAppService/Baileys] Socket disconnected, attempting instant re-acquisition...');
                        sock = await BaileysConnectionManager.connect(config.integrationId.toString());
                        if (sock && sock.waitForSocketOpen) {
                            await Promise.race([
                                sock.waitForSocketOpen(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Reconnect wait timeout')), 6000))
                            ]);
                        }
                    } catch (recErr) {
                        console.warn('[WhatsAppService/Baileys] Reconnect during retry failed:', recErr.message);
                    }
                }

                if (sock && sock.ws && sock.ws.isOpen) {
                    console.log('[WhatsAppService/Baileys] Retrying send after socket re-acquisition...');
                    const retryPromise = sock.sendMessage(jid, content);
                    const retryTimeout = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('WhatsApp Web send timed out on retry after 15 seconds.')), 15000)
                    );
                    sentMsg = await Promise.race([retryPromise, retryTimeout]);
                } else {
                    throw firstAttemptErr;
                }
            }

            return { 
                success: true, 
                provider: 'baileys', 
                messageId: sentMsg?.key?.id || 'baileys-unknown-id',
                messages: [{ id: sentMsg?.key?.id || 'baileys-unknown-id' }] 
            };
        } catch (error) {
            let errText = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            if (errText === '1006' || errText.includes('1006')) {
                errText = 'WhatsApp Web socket temporarily disconnected (1006). Connection was auto-reestablished; please click Send again.';
            }
            console.error(`[WhatsAppService/Baileys] Send error:`, errText);
            return { success: false, error: errText, provider: 'baileys' };
        }
    }

    async _sendViaMeta(mobile, message, config, options = {}) {
        const toNumber = this._normalizeTarget(mobile);
        if (!toNumber) return { success: false, error: 'Invalid phone number format' };

        const { type = 'text', mediaUrl, filename, caption } = options;

        if (process.env.NODE_ENV === 'test' && (!config.token || config.token.includes('secret') || config.token.includes('test') || process.env.MOCK_MODE === 'true')) {
            const msgId = `wamid.mock.test.${Date.now()}`;
            return {
                success: true,
                messageId: msgId,
                messages: [{ id: msgId }],
                provider: 'meta',
                type,
                mock: true
            };
        }

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
                if (options.mediaId) payload.image = { id: options.mediaId, caption: caption || message };
                else payload.image = { link: mediaUrl, caption: caption || message };
            } else if (type === 'document') {
                payload.type = 'document';
                if (options.mediaId) payload.document = { id: options.mediaId, filename: filename || 'document.pdf', caption: caption || message };
                else payload.document = { link: mediaUrl, filename: filename || 'document.pdf', caption: caption || message };
            } else if (type === 'video') {
                payload.type = 'video';
                if (options.mediaId) payload.video = { id: options.mediaId, caption: caption || message };
                else payload.video = { link: mediaUrl, caption: caption || message };
            } else if (type === 'audio') {
                payload.type = 'audio';
                if (options.mediaId) payload.audio = { id: options.mediaId };
                else payload.audio = { link: mediaUrl };
            } else if (type === 'location') {
                payload.type = 'location';
                payload.location = options.location; // { latitude, longitude, name, address }
            } else if (type === 'contacts') {
                payload.type = 'contacts';
                payload.contacts = options.contacts; // Array of contact objects
            }

            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type':  'application/json',
                },
                timeout: 20000,
            });

            const msgId = response.data?.messages?.[0]?.id;
            console.log(`[WhatsApp/Meta] ✅ SUCCESS: ${type} to ${toNumber}. ID: ${msgId}`);
            return {
                success: true,
                messageId: msgId,
                messages: [{ id: msgId }],
                provider: 'meta',
                type
            };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            const metaError = err.response?.data?.error;
            const code = metaError?.code;
            const httpStatus = err.response?.status;

            let isRetryable = false;
            let category = 'PERMANENT';
            let professionalError = `Meta API Error: ${detail}`;

            if (code === 131030) {
                category = 'WINDOW_CLOSED';
                professionalError = "Customer Service Window Closed: User has not interacted in 24h. You MUST use a template.";
            } else if (code === 131008) {
                category = 'TEMPLATE_PARAM_MISMATCH';
                professionalError = "Template Parameter Mismatch: Please check your variable mapping indices.";
            } else if (code === 100) {
                category = 'INVALID_PARAMETER';
                professionalError = "Invalid Token, Phone ID, or recipient parameter.";
            } else if (code === 190) {
                category = 'AUTH_FAILURE';
                professionalError = "Meta OAuth token expired or revoked.";
                if (config.integrationId) {
                    this._markIntegrationRevoked(config.integrationId, 'Token expired or revoked (Meta code 190)').catch(() => {});
                }
            } else if (code === 429 || code === 130429 || httpStatus === 429) {
                category = 'RATE_LIMIT';
                isRetryable = true;
                professionalError = "Meta rate limit exceeded. Retry with backoff.";
            } else if (code === 1 || code === 2 || (httpStatus && httpStatus >= 500)) {
                category = 'TRANSIENT_SERVER_ERROR';
                isRetryable = true;
                professionalError = "Meta server error or temporary outage. Retryable.";
            } else if (['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(err.code)) {
                category = 'NETWORK_ERROR';
                isRetryable = true;
                professionalError = "Network connection timeout to Meta Graph API.";
            }

            const sanitizedDetail = this.sanitizeSecrets(detail);
            console.error(`[WhatsApp/Meta] ❌ ERROR [${code || httpStatus || '??'} - ${category}]: Failed to send ${type} to ${toNumber}:`, sanitizedDetail);

            return {
                success: false,
                error: professionalError,
                category,
                isRetryable,
                code,
                httpStatus,
                provider: 'meta',
                raw: metaError
            };
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

    async sendTemplate(mobile, templateName, languageCode = 'en_US', components = [], options = {}) {
        if (!IntegrationGuard.canSendWhatsapp()) {
            IntegrationGuard.logBlock("WhatsApp sendTemplate", mobile);
            return { messages: [{ id: "staging-blocked" }] };
        }

        // 1. Opt-out policy enforcement
        const isOptedOut = await this.isRecipientOptedOut(mobile);
        if (isOptedOut && !options?.overrideOptOut) {
            console.warn(`[WhatsAppService] Outbound WhatsApp template to ${mobile} blocked: Recipient has opted out.`);
            return {
                success: false,
                error: 'Recipient has opted out of WhatsApp communications',
                code: 'RECIPIENT_OPTED_OUT',
                optedOut: true,
                provider: 'policy'
            };
        }

        // 2. Idempotency Check
        const idempotencyKey = options?.idempotencyKey;
        if (idempotencyKey) {
            const cached = this._getIdempotentResult(idempotencyKey);
            if (cached) {
                console.log(`[WhatsAppService] Idempotent template replay for key '${idempotencyKey}'. Returning cached result.`);
                return { ...cached, alreadySent: true, duplicate: true };
            }
        }

        const targetAccount = options?.integrationId || options?.phoneId || null;
        let metaConfig;
        try {
            metaConfig = await this._getMetaConfig(targetAccount);
        } catch (err) {
            console.error(`[WhatsAppService] Account resolution error for target '${targetAccount}':`, err.message);
            return { success: false, error: err.message, provider: 'meta' };
        }
        if (!metaConfig) {
            console.log(`[WhatsApp/Meta] MOCK template to ${mobile}: ${templateName}`);
            const mockResult = { success: true, mock: true, provider: 'mock', template: templateName };
            if (idempotencyKey) this._setIdempotentResult(idempotencyKey, mockResult);
            return mockResult;
        }

        if (metaConfig.provider === 'BAILEYS') {
            console.log(`[WhatsApp/Baileys] Templates are not natively supported by Baileys. Triggering plain-text fallback.`);
            return { success: false, error: 'Templates not supported by Baileys provider' };
        }

        const toNumber = this._normalizeTarget(mobile);
        if (!toNumber) return { success: false, error: 'Invalid phone number' };

        if (process.env.NODE_ENV === 'test' && (!metaConfig.token || metaConfig.token.includes('secret') || metaConfig.token.includes('test') || process.env.MOCK_MODE === 'true')) {
            const msgId = `wamid.mock.template.${Date.now()}`;
            const result = {
                success: true,
                messageId: msgId,
                messages: [{ id: msgId }],
                provider: 'meta',
                template: templateName,
                mock: true
            };
            if (idempotencyKey) {
                this._setIdempotentResult(idempotencyKey, result);
            }
            return result;
        }

        try {
            const url = `${META_GRAPH_BASE}/${metaConfig.phoneId}/messages`;
            const templatePayload = {
                name:     templateName,
                language: { code: languageCode }
            };

            if (components && components.length > 0) {
                templatePayload.components = components;
            }

            console.log(`[WhatsApp/Meta] SENDING PAYLOAD TO META (From: ${metaConfig.phoneId}):`, JSON.stringify({
                messaging_product: 'whatsapp',
                to:                toNumber,
                type:              'template',
                template:          templatePayload,
            }, null, 2));

            const reqHeaders = {
                'Authorization': `Bearer ${metaConfig.token}`,
                'Content-Type':  'application/json',
            };
            if (options && options.idempotencyKey) {
                reqHeaders['Idempotency-Key'] = options.idempotencyKey;
            }

            const response = await axios.post(url, {
                messaging_product: 'whatsapp',
                to:                toNumber,
                type:              'template',
                template:          templatePayload,
            }, {
                headers: reqHeaders,
                timeout: 20000,
            });

            const msgId = response.data?.messages?.[0]?.id;
            console.log(`[WhatsApp/Meta] ✅ TEMPLATE SUCCESS: ${templateName} sent to ${toNumber}. ID: ${msgId}`);
            const result = {
                success: true,
                messageId: msgId,
                messages: [{ id: msgId }],
                provider: 'meta',
                template: templateName
            };

            if (idempotencyKey) {
                this._setIdempotentResult(idempotencyKey, result);
            }

            return result;
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.response?.data || err.message;
            const metaError = err.response?.data?.error;
            const code = metaError?.code;
            const httpStatus = err.response?.status;

            let isRetryable = false;
            let category = 'PERMANENT';

            if (code === 131008) {
                category = 'TEMPLATE_PARAM_MISMATCH';
            } else if (code === 100) {
                category = 'INVALID_PARAMETER';
            } else if (code === 190) {
                category = 'AUTH_FAILURE';
                if (metaConfig.integrationId) {
                    this._markIntegrationRevoked(metaConfig.integrationId, 'Token expired or revoked (Meta code 190)').catch(() => {});
                }
            } else if (code === 429 || code === 130429 || httpStatus === 429) {
                category = 'RATE_LIMIT';
                isRetryable = true;
            } else if (code === 1 || code === 2 || (httpStatus && httpStatus >= 500)) {
                category = 'TRANSIENT_SERVER_ERROR';
                isRetryable = true;
            } else if (['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(err.code)) {
                category = 'NETWORK_ERROR';
                isRetryable = true;
            }

            const sanitized = this.sanitizeSecrets(detail);
            console.error(`[WhatsApp/Meta] ❌ TEMPLATE ERROR for ${toNumber} [${category}]:`, sanitized);
            return {
                success: false,
                error: sanitized,
                category,
                isRetryable,
                code,
                httpStatus,
                provider: 'meta'
            };
        }
    }

    async sendMedia(mobile, type, mediaUrl, caption = '', filename = '', extraOptions = {}) {
        if (!IntegrationGuard.canSendWhatsapp()) {
            IntegrationGuard.logBlock("WhatsApp sendMedia", mobile);
            return { messages: [{ id: "staging-blocked" }] };
        }

        // 1. Opt-out policy enforcement
        const isOptedOut = await this.isRecipientOptedOut(mobile);
        if (isOptedOut && !extraOptions?.overrideOptOut) {
            console.warn(`[WhatsAppService] Outbound WhatsApp media to ${mobile} blocked: Recipient has opted out.`);
            return {
                success: false,
                error: 'Recipient has opted out of WhatsApp communications',
                code: 'RECIPIENT_OPTED_OUT',
                optedOut: true,
                provider: 'policy'
            };
        }

        // 2. Idempotency Check
        const idempotencyKey = extraOptions?.idempotencyKey;
        if (idempotencyKey) {
            const cached = this._getIdempotentResult(idempotencyKey);
            if (cached) {
                console.log(`[WhatsAppService] Idempotent media replay for key '${idempotencyKey}'. Returning cached result.`);
                return { ...cached, alreadySent: true, duplicate: true };
            }
        }

        const targetAccount = extraOptions?.integrationId || extraOptions?.phoneId || null;
        const isGroupTarget = String(mobile || '').includes('@g.us');
        const opt = typeof extraOptions === 'object' ? (extraOptions || {}) : {};
        const isBaileysRequested = opt.provider === 'BAILEYS' || 
            opt.channel === 'whatsapp_web' || 
            opt.useBaileys === true ||
            opt.platform === 'WhatsApp Web';
        const isMetaRequested = opt.provider === 'META' || 
            opt.channel === 'whatsapp_api' || 
            opt.useMeta === true ||
            opt.platform === 'Direct' ||
            opt.platform === 'WhatsApp Cloud API';

        let metaConfig;
        try {
            if (isGroupTarget) {
                metaConfig = await this._getBaileysConfig(targetAccount);
            } else if (isBaileysRequested && !isMetaRequested) {
                metaConfig = await this._getBaileysConfig(targetAccount);
            } else if (isMetaRequested && !isBaileysRequested) {
                metaConfig = await this._getMetaConfig(targetAccount);
            } else {
                try {
                    metaConfig = await this._getMetaConfig(targetAccount);
                } catch (metaErr) {
                    try {
                        metaConfig = await this._getBaileysConfig(targetAccount);
                    } catch (_) {
                        throw metaErr;
                    }
                }
            }
        } catch (err) {
            console.error(`[WhatsAppService] Account resolution error for target '${targetAccount}':`, err.message);
            return { success: false, error: err.message, provider: (isGroupTarget || isBaileysRequested) ? 'baileys' : 'meta' };
        }
        if (metaConfig) {
            if (metaConfig.provider === 'BAILEYS') {
                return this._sendViaBaileys(mobile, caption, metaConfig, { type, mediaUrl, caption, filename, ...extraOptions });
            }
            let mediaId = null;

            // 🚀 SENIOR LOGIC: If mediaUrl is local or from our server, upload to Meta first for reliability
            if (mediaUrl && (mediaUrl.startsWith('/') || mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1'))) {
                try {
                    const path = await import('path');
                    const fs = await import('fs');
                    
                    // Resolve absolute path
                    let localPath = '';
                    if (mediaUrl.startsWith('/uploads/')) {
                        localPath = path.resolve(mediaUrl.substring(1)); // remove leading slash
                    } else if (mediaUrl.includes('/uploads/')) {
                        const parts = mediaUrl.split('/uploads/');
                        localPath = path.resolve('uploads', parts[1]);
                    }

                    if (localPath && fs.existsSync(localPath)) {
                        console.log(`[WhatsApp/Meta] Local file detected. Uploading to Meta storage...`);
                        const uploadRes = await this.uploadToMeta(localPath, type, targetAccount);
                        if (uploadRes.success) {
                            mediaId = uploadRes.mediaId;
                        } else {
                            // If upload failed and it's a local file, we CANNOT send it via link
                            console.error(`[WhatsApp/Meta] Failed to upload local media to Meta:`, uploadRes.error);
                            return { 
                                success: false, 
                                error: `Meta Media Upload Failed: ${uploadRes.error}. (Make sure your WhatsApp API Token and Phone ID are correct in settings or .env)`, 
                                provider: 'meta' 
                            };
                        }
                    }
                } catch (e) {
                    console.error(`[WhatsApp/Meta] Local upload bypass failed:`, e.message);
                }
            }

            return this._sendViaMeta(mobile, caption, metaConfig, { 
                type, 
                mediaUrl, 
                mediaId,
                caption, 
                filename,
                ...extraOptions 
            });
        }
        
        console.log(`[WhatsApp] MOCK ${type} to ${mobile}: ${mediaUrl}`);
        return { success: true, mock: true, provider: 'mock' };
    }

    /**
     * 🚀 Upload binary media to Meta's servers
     * Required for reliable delivery when the source is not a public URL
     */
    async uploadToMeta(filePath, type, integrationId = null) {
        let config;
        try {
            config = await this._getMetaConfig(integrationId);
        } catch (err) {
            console.error('[WhatsAppService] Error resolving config for uploadToMeta:', err.message);
            return { success: false, error: err.message };
        }
        if (!config || !config.token) return { success: false, error: 'Meta config missing' };

        try {
            const fs = await import('fs');
            const FormData = (await import('form-data')).default;
            
            const fileBuffer = fs.readFileSync(filePath);
            const form = new FormData();
            form.append('file', fileBuffer, { filename: filePath.split('/').pop() });
            form.append('messaging_product', 'whatsapp');
            form.append('type', type);

            const url = `${META_GRAPH_BASE}/${config.phoneId}/media`;
            const response = await axios.post(url, form, {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${config.token}`,
                },
            });

            return { success: true, mediaId: response.data.id };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            const metaError = err.response?.data?.error;
            console.error(`[WhatsApp/Meta] Media upload FAILED:`, detail);
            if (metaError) console.error(`[WhatsApp/Meta] Meta Upload Detail:`, JSON.stringify(metaError, null, 2));
            return { success: false, error: detail };
        }
    }

    async getTemplates(integrationId = null) {
        let config;
        try {
            config = await this._getMetaConfig(integrationId);
        } catch (err) {
            console.error('[WhatsAppService] Error resolving config for getTemplates:', err.message);
            return [];
        }
        
        if (!config || !config.token || !config.businessId) {
            return [
                {
                    name: 'property_owner_feedback',
                    status: 'APPROVED',
                    language: 'en',
                    components: [
                        {
                            type: 'HEADER',
                            format: 'IMAGE'
                        },
                        { 
                            type: 'BODY', 
                            text: 'Hello {{OwnerName}},\n\nThis is {{EmployeeName}} from Bharat Properties.\n\nRegarding your {{PropertyType}}:\n\n📋 Discussion Summary: {{DiscussionSummary}}\n\nFor any queries, contact us at {{EmployeeMobile}}.\n\nThank you for your time!' 
                        },
                        {
                            type: 'BUTTONS',
                            buttons: [
                                { type: 'QUICK_REPLY', text: 'Update Feedback' },
                                { type: 'QUICK_REPLY', text: 'Status is Correct' }
                            ]
                        }
                    ]
                },
                {
                    name: 'sample_property_launch',
                    status: 'APPROVED',
                    language: 'en_US',
                    components: [
                        { type: 'HEADER', format: 'TEXT', text: 'New Launch in Kurukshetra' },
                        { type: 'BODY', text: 'Hello {{1}}, check out our new project {{2}} starting at {{3}} Lakhs!' }
                    ]
                },
                {
                    name: 'property_match_alert',
                    status: 'APPROVED',
                    language: 'en_US',
                    components: [
                        { 
                            type: 'BODY', 
                            text: 'Hi {{1}}! 🏠\n\nWe found an exclusive property match that aligns perfectly with your requirements:\n\n{{2}}\n\nWould you like to schedule a priority site visit or receive more details?\n\nBest regards,\n{{3}}\nBharat Properties' 
                        }
                    ]
                }
            ];
        }

        try {
            const url = `${META_GRAPH_BASE}/${config.businessId}/message_templates`;
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${config.token}` }
            });
            return response.data.data;
        } catch (err) {
            console.error('[WhatsAppService] Error fetching templates:', err.message);
            return [];
        }
    }

    async downloadMedia(mediaId) {
        const config = await this._getMetaConfig();
        if (!config || !config.token) throw new Error('Meta configuration missing');

        try {
            // 1. Get Media URL from Meta
            const mediaRes = await axios.get(`${META_GRAPH_BASE}/${mediaId}`, {
                headers: { 'Authorization': `Bearer ${config.token}` }
            });

            const mediaUrl = mediaRes.data?.url;
            if (!mediaUrl) throw new Error('Failed to retrieve media URL from Meta');

            // 2. Download Binary Content
            const downloadRes = await axios.get(mediaUrl, {
                headers: { 'Authorization': `Bearer ${config.token}` },
                responseType: 'arraybuffer'
            });

            // 3. Save locally to uploads/
            const fs = await import('fs');
            const path = await import('path');
            const crypto = await import('crypto');
            
            const mimeType = downloadRes.headers['content-type'] || 'application/octet-stream';
            const extension = mimeType.split('/')[1]?.split(';')[0] || 'bin';
            const fileName = `wa_${crypto.randomBytes(8).toString('hex')}.${extension}`;
            const uploadDir = path.resolve('uploads');
            
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, Buffer.from(downloadRes.data));

            console.log(`[WhatsApp/Media] Downloaded ${mediaId} to ${fileName}`);
            return {
                success: true,
                localPath: filePath,
                fileName: fileName,
                url: `/uploads/${fileName}`,
                mimeType: mimeType
            };
        } catch (err) {
            console.error(`[WhatsApp/Media] Download failed for ${mediaId}:`, err.message);
            throw err;
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

    // ── ENTERPRISE UPGRADE: Meta Cloud API Two-Way Sync ──

    /**
     * Fetch approved templates directly from Meta WhatsApp Manager
     */
    async syncTemplatesFromMeta() {
        const metaConfig = await this._getMetaConfig();
        if (!metaConfig || !metaConfig.businessId) {
            throw new Error('Meta API credentials (WABA ID) incomplete. Please configure in Integrations.');
        }

        try {
            // URL format: https://graph.facebook.com/v19.0/{waba_id}/message_templates
            const url = `${META_GRAPH_BASE}/${metaConfig.businessId}/message_templates`;
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${metaConfig.token}`
                }
            });

            // Map Meta's structure to our CRM's structure
            const metaTemplates = response.data.data.map(tpl => {
                const headerComp = tpl.components?.find(c => c.type === 'HEADER');
                const footerComp = tpl.components?.find(c => c.type === 'FOOTER');
                const buttonsComp = tpl.components?.find(c => c.type === 'BUTTONS');

                let headerType = 'NONE';
                let headerText = '';
                if (headerComp) {
                    headerType = headerComp.format; // TEXT, IMAGE, VIDEO, DOCUMENT
                    if (headerType === 'TEXT') {
                        headerText = headerComp.text || '';
                    }
                }

                let crmButtons = [];
                if (buttonsComp && buttonsComp.buttons) {
                    crmButtons = buttonsComp.buttons.map(b => {
                        if (b.type === 'URL') {
                            return { type: 'URL', text: b.text, url: b.url, url_type: b.example ? 'DYNAMIC' : 'STATIC' };
                        }
                        if (b.type === 'PHONE_NUMBER') {
                            return { type: 'PHONE', text: b.text, phone_number: b.phone_number, country_code: '' }; 
                        }
                        if (b.type === 'COPY_CODE') {
                            return { type: 'COPY_CODE', text: b.text, example: b.example };
                        }
                        if (b.type === 'FLOW') {
                            return { type: 'FLOW', text: b.text, flow_id: b.flow_id };
                        }
                        if (b.type === 'voice_call' || b.type === 'VOICE_CALL') {
                            return { type: 'VOICE_CALL', text: b.text, ttl_minutes: b.ttl_minutes || '10080' };
                        }
                        return { type: 'QUICK_REPLY', text: b.text };
                    });
                }

                return {
                    id: tpl.id,
                    name: tpl.name,
                    language: tpl.language,
                    category: tpl.category,
                    status: tpl.status, // e.g. APPROVED, REJECTED, PENDING
                    body: tpl.components?.find(c => c.type === 'BODY')?.text || '',
                    headerType,
                    headerText,
                    footer: footerComp?.text || '',
                    buttons: crmButtons,
                    rawComponents: tpl.components, // Store raw for variable inference
                    variableMapping: {}, // Empty by default
                    systemContext: [] // Empty by default
                };
            });

            return { success: true, data: metaTemplates };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            console.error('[WhatsApp/Meta] ❌ SYNC TEMPLATES ERROR:', detail);
            return { success: false, error: detail };
        }
    }

    async _uploadMediaToMeta(fileObj, metaConfig) {
        if (!metaConfig.appId) throw new Error("Meta App ID is missing. Cannot upload media.");
        
        // Extract base64 and decode
        const base64Data = fileObj.data.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const fileLength = buffer.length;

        // Step 1: Create session
        const sessionUrl = `${META_GRAPH_BASE}/${metaConfig.appId}/uploads?file_length=${fileLength}&file_type=${fileObj.type}`;
        const sessionResponse = await axios.post(sessionUrl, {}, {
            headers: {
                'Authorization': `Bearer ${metaConfig.token}`
            }
        });
        
        const uploadSessionId = sessionResponse.data.id;
        
        // Step 2: Upload data
        const uploadUrl = `${META_GRAPH_BASE}/${uploadSessionId}`;
        const uploadResponse = await axios.post(uploadUrl, buffer, {
            headers: {
                'Authorization': `OAuth ${metaConfig.token}`,
                'file_offset': '0',
                'Content-Type': 'application/octet-stream'
            }
        });

        return uploadResponse.data.h; // The file handle
    }

    /**
     * Submit a template for review/approval to Meta
     */
    async submitTemplateToMeta(templateData) {
        const metaConfig = await this._getMetaConfig();
        if (!metaConfig || !metaConfig.businessId) {
            throw new Error('Meta API credentials (WABA ID) incomplete. Please configure in Integrations.');
        }

        try {
            let url = `${META_GRAPH_BASE}/${metaConfig.businessId}/message_templates`;
            
            const isEdit = !!templateData.id && String(templateData.id).length > 8 && /^\d+$/.test(String(templateData.id)); // Meta IDs are long numbers

            // Build Cloud API payload. Note: We only construct the basic BODY for now.
            // Full enterprise payload requires HEADER, FOOTER, BUTTONS mappings.
            const payload = {
                category: templateData.category || 'MARKETING',
                components: []
            };

            if (isEdit) {
                url = `${META_GRAPH_BASE}/${templateData.id}`;
            } else {
                payload.name = templateData.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'); // Meta requires lower_case_snake
                payload.language = templateData.language || 'en_US';
            }
            
            if (templateData.subCategory) payload.allow_category_change = true;
            if (templateData.flowId) payload.flow_id = templateData.flowId;
            if (templateData.catalogueId) payload.catalogue_id = templateData.catalogueId;

            // Add Header
            if (templateData.headerType && templateData.headerType !== 'NONE') {
                const headerComp = {
                    type: 'HEADER',
                    format: templateData.headerType
                };
                if (templateData.headerType === 'TEXT' && templateData.headerText) {
                    let hText = templateData.headerText;
                    const hMatches = hText.match(/\{\{([^}]+)\}\}/g);
                    if (hMatches && hMatches.length > 0) {
                        hText = hText.replace(/\{\{([^}]+)\}\}/g, '{{1}}');
                        headerComp.example = { header_text: ["Example Header"] };
                    }
                    headerComp.text = hText;
                } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateData.headerType) && templateData.headerFile) {
                    const fileHandle = await this._uploadMediaToMeta(templateData.headerFile, metaConfig);
                    headerComp.example = { header_handle: [fileHandle] };
                }
                payload.components.push(headerComp);
            }

            // Add Body
            if (templateData.body) {
                let bodyText = templateData.body;
                const bMatches = bodyText.match(/\{\{([^}]+)\}\}/g);
                const bodyComp = { type: 'BODY' };
                
                if (bMatches && bMatches.length > 0) {
                    let varCount = 1;
                    const examples = [];
                    bodyText = bodyText.replace(/\{\{([^}]+)\}\}/g, () => {
                        examples.push("Dummy_Data_" + varCount);
                        return `{{${varCount++}}}`;
                    });
                    bodyComp.example = { body_text: [examples] };
                }
                bodyComp.text = bodyText;
                
                payload.components.push(bodyComp);
            }

            // Add Footer
            if (templateData.footer) {
                payload.components.push({
                    type: 'FOOTER',
                    text: templateData.footer
                });
            }

            // Add Buttons
            if (templateData.buttons && templateData.buttons.length > 0) {
                const buttons = templateData.buttons.map(btn => {
                    const mappedBtn = { text: btn.text || 'Button' };
                    if (btn.type === 'URL') {
                        mappedBtn.type = 'URL';
                        mappedBtn.url = btn.url || 'https://www.example.com';
                        if (btn.url_type === 'DYNAMIC') {
                            mappedBtn.example = ["custom_path"]; // Meta requires an example for the {{1}} variable
                        }
                    } else if (btn.type === 'VOICE_CALL') {
                        mappedBtn.type = 'voice_call';
                        if (btn.ttl_minutes) {
                            mappedBtn.ttl_minutes = parseInt(btn.ttl_minutes, 10);
                        }
                    } else if (btn.type === 'PHONE') {
                        mappedBtn.type = 'PHONE_NUMBER';
                        mappedBtn.phone_number = (btn.country_code || '+91') + (btn.phone_number || '9999999999');
                    } else if (btn.type === 'FLOW') {
                        mappedBtn.type = 'FLOW';
                        mappedBtn.flow_id = btn.flow_id || '123456789';
                        mappedBtn.flow_action = 'NAVIGATE';
                        mappedBtn.navigate_screen = 'Default_Screen';
                    } else if (btn.type === 'COPY_CODE') {
                        mappedBtn.type = 'COPY_CODE';
                        mappedBtn.example = btn.example || 'OFFER20'; 
                    } else {
                        mappedBtn.type = 'QUICK_REPLY';
                    }
                    return mappedBtn;
                });
                
                payload.components.push({
                    type: 'BUTTONS',
                    buttons: buttons
                });
            }

            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${metaConfig.token}`,
                    'Content-Type': 'application/json'
                }
            });

            return { success: true, data: response.data };
        } catch (err) {
            console.error('[WhatsApp/Meta] ❌ FULL METADATA ERROR:', JSON.stringify(err.response?.data, null, 2));
            const metaError = err.response?.data?.error;
            const detail = metaError?.error_user_msg || metaError?.message || err.message;
            console.error('[WhatsApp/Meta] ❌ SUBMIT TEMPLATE ERROR:', detail);
            return { success: false, error: detail };
        }
    }
}

export default new WhatsAppService();
