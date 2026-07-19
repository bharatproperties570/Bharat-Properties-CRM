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
    /**
     * Resolve configuration from DB or Env
     */
    async _getMetaConfig() {
        const SystemSetting = mongoose.model('SystemSetting');
        const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
        
        const isPlaceholder = (val) => !val || val.includes('YOUR_') || val.includes('SYSTEM_USER');

        if (setting && setting.value?.token && !isPlaceholder(setting.value.token)) {
            return {
                token: setting.value.token,
                phoneId: setting.value.phoneId,
                businessId: setting.value.businessId,
                appId: setting.value.appId || process.env.META_WA_APP_ID
            };
        }

        // Fallback to Env if DB is empty
        if (process.env.META_WA_TOKEN && process.env.META_WA_PHONE_ID && !isPlaceholder(process.env.META_WA_TOKEN)) {
            return {
                token: process.env.META_WA_TOKEN,
                phoneId: process.env.META_WA_PHONE_ID,
                businessId: process.env.YOUR_WABA_ID,
                appId: process.env.META_WA_APP_ID
            };
        }

        return null;
    }

    /**
     * Send a standard text message
     */
    async sendMessage(mobile, message) {
        const config = await this._getMetaConfig();
        if (config) {
            return this._sendViaMeta(mobile, message, config, { type: 'text' });
        }
        
        // Gupshup/Other Fallback logic simplified for Bharat Properties
        if (process.env.GUPSHUP_API_KEY) {
            return this._sendViaGupshup(mobile, message, {
                apiKey: process.env.GUPSHUP_API_KEY,
                sourcePhone: process.env.GUPSHUP_SOURCE,
                appName: process.env.GUPSHUP_APP_NAME
            });
        }

        console.log(`[WhatsApp] MOCK message to ${mobile}: ${message}`);
        return { success: true, mock: true, provider: 'mock' };
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

    async _sendViaMeta(mobile, message, config, options = {}) {
        const toNumber = this._normalizeTarget(mobile);
        if (!toNumber) return { success: false, error: 'Invalid phone number format' };

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
            return { success: true, messageId: msgId, provider: 'meta', type };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            const metaError = err.response?.data?.error;
            const code = metaError?.code;

            // 🧠 OBSERVABILITY: Professional error categorization
            let professionalError = `Meta API Error: ${detail}`;
            if (code === 131030) professionalError = "Customer Service Window Closed: User has not interacted in 24h. You MUST use a template.";
            if (code === 131008) professionalError = "Template Parameter Mismatch: Please check your variable mapping indices.";
            if (code === 100) professionalError = "Invalid Token or Phone ID: Check Meta Configuration in Settings.";

            console.error(`[WhatsApp/Meta] ❌ ERROR [${code || '??'}]: Failed to send ${type} to ${toNumber}:`, detail);
            if (metaError) console.error(`[WhatsApp/Meta] Meta API Detail:`, JSON.stringify(metaError, null, 2));
            return { success: false, error: professionalError, provider: 'meta', raw: metaError };
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

    async sendTemplate(mobile, templateName, languageCode = 'en_US', components = []) {
        const metaConfig = await this._getMetaConfig();
        if (!metaConfig) {
            console.log(`[WhatsApp/Meta] MOCK template to ${mobile}: ${templateName}`);
            return { success: true, mock: true, provider: 'mock' };
        }

        const toNumber = this._normalizeTarget(mobile);
        if (!toNumber) return { success: false, error: 'Invalid phone number' };

        try {
            const url = `${META_GRAPH_BASE}/${metaConfig.phoneId}/messages`;
            const templatePayload = {
                name:     templateName,
                language: { code: languageCode }
            };

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
                timeout: 20000,
            });

            const msgId = response.data?.messages?.[0]?.id;
            console.log(`[WhatsApp/Meta] ✅ TEMPLATE SUCCESS: ${templateName} sent to ${toNumber}. ID: ${msgId}`);
            return { success: true, messageId: msgId, provider: 'meta', template: templateName };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            console.error(`[WhatsApp/Meta] ❌ TEMPLATE ERROR for ${toNumber}:`, detail);
            return { success: false, error: detail, provider: 'meta' };
        }
    }

    async sendMedia(mobile, type, mediaUrl, caption = '', filename = '', extraOptions = {}) {
        const metaConfig = await this._getMetaConfig();
        if (metaConfig) {
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
                        const uploadRes = await this.uploadToMeta(localPath, type);
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
    async uploadToMeta(filePath, type) {
        const config = await this._getMetaConfig();
        if (!config || !config.token) return { success: false, error: 'Meta config missing' };

        try {
            const fs = await import('fs');
            const FormData = (await import('form-data')).default;
            
            const form = new FormData();
            form.append('file', fs.createReadStream(filePath));
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

    async getTemplates() {
        const config = await this._getMetaConfig();
        
        if (!config || !config.token || !config.businessId) {
            return [
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
            const detail = err.response?.data?.error?.message || err.message;
            console.error('[WhatsApp/Meta] ❌ SUBMIT TEMPLATE ERROR:', detail);
            return { success: false, error: detail };
        }
    }
}

export default new WhatsAppService();
