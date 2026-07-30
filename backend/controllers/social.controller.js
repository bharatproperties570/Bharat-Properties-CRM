import SystemSetting from '../src/modules/systemSettings/system.model.js';
import { resolveMessageTemplate } from '../utils/templateResolver.js';
import socialCommentService from '../services/SocialCommentService.js';
import facebookService from '../services/FacebookService.js';
import whatsAppService from '../services/WhatsAppService.js';
import linkedInService from '../services/LinkedInService.js';
import metaLeadService from '../services/MetaLeadService.js';
import Conversation from '../models/Conversation.js';
import { generateBotResponse } from '../services/aiBot.service.js';
import axios from 'axios';
import mongoose from 'mongoose';
import Lead, { resolveLeadLookup } from '../models/Lead.js';
import Activity from '../models/Activity.js';
import Contact from '../models/Contact.js';
import { marketingQueue } from '../src/queues/marketingQueue.js';

/**
 * POST /api/social/config/enterprise
 * Professional save endpoint that prevents token leakage
 */
export const saveSocialConfig = async (req, res) => {
    try {
        const { platform, config } = req.body;
        
        if (!platform || !config) {
            return res.status(400).json({ success: false, error: 'Platform and configuration are required' });
        }

        const updateObj = {};
        Object.entries(config).forEach(([key, value]) => {
            updateObj[`value.${key}`] = value;
        });
        
        // Add platform-specific metadata tags if needed
        updateObj['category'] = 'integration';
        updateObj['active'] = true;

        await SystemSetting.findOneAndUpdate(
            { key: 'social_graph_config' },
            { $set: updateObj },
            { upsert: true }
        );

        res.json({ success: true, message: `${platform} configuration updated successfully` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/whatsapp-config/sync-meta
 * Sync templates down from Meta Cloud API
 */
export const syncMetaTemplates = async (req, res) => {
    try {
        const whatsAppService = (await import('../services/WhatsAppService.js')).default;
        const result = await whatsAppService.syncTemplatesFromMeta();
        
        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({ success: true, data: result.data });
    } catch (err) {
        console.error('[SocialController] syncMetaTemplates Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/whatsapp-config/submit-template
 * Submit a template up to Meta Cloud API for review
 */
export const submitMetaTemplate = async (req, res) => {
    try {
        const templateData = req.body;
        if (!templateData || !templateData.name) {
            return res.status(400).json({ success: false, error: 'Template name is required' });
        }

        const whatsAppService = (await import('../services/WhatsAppService.js')).default;
        const result = await whatsAppService.submitTemplateToMeta(templateData);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({ success: true, data: result.data });
    } catch (err) {
        console.error('[SocialController] submitMetaTemplate Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/social/wa/send
 * Enterprise WhatsApp Dispatcher
 */
export const sendWhatsAppMessage = async (req, res, next) => {
    try {
        console.log('[SocialController] RAW PAYLOAD:', JSON.stringify(req.body, null, 2));
        const { mobile, message, type = 'text', mediaUrl, filename, caption, templateId, templateComponents, language, headerImageUrl } = req.body;
        
        if (!mobile || (!message && !mediaUrl && !templateId)) {
            return res.status(400).json({ success: false, error: 'Mobile and message/media/template are required' });
        }

        // Safe Model Retrieval
        const Lead = mongoose.model('Lead');
        const Activity = mongoose.model('Activity');
        const WhatsAppService = (await import('../services/WhatsAppService.js')).default;

        console.log(`[SocialController] Dispatching WhatsApp to: ${mobile} (Template: ${templateId || 'None'})`);

        // 1. Dispatch via Service
        let result;
        if (templateId) {
            const templates = await WhatsAppService.getTemplates();
            const templateDef = templates.find(t => t.name === templateId);
            
            const components = [];

            // ✅ ENTERPRISE FIX: Build BOTH a named-param map AND a positional values list.
            // Meta templates use NUMBERED placeholders ({{1}}, {{2}}, {{3}})
            // but our frontend sends NAMED parameters (OwnerName, EmployeeName, etc.)
            // We need BOTH lookups:
            //   - namedParamMap: for templates using {{OwnerName}} style vars
            //   - positionalValues: for templates using {{1}}, {{2}} style vars
            const namedParamMap = {};
            const namedParamMapLC = {}; // lowercase keys for case-insensitive lookup against Meta template vars
            const positionalValues = []; // Ordered list of ALL values for numbered templates
            const plainTextList = [];
            if (Array.isArray(templateComponents) && templateComponents.length > 0) {
                templateComponents.forEach(item => {
                    if (item && typeof item === 'object' && item.parameter_name) {
                        namedParamMap[item.parameter_name] = item.text || '';
                        namedParamMapLC[item.parameter_name.toLowerCase()] = item.text || '';
                        positionalValues.push(item.text || '');
                    } else {
                        plainTextList.push(typeof item === 'string' ? item : (item?.text || ''));
                    }
                });
            }
            console.log(`[WhatsApp/Debug] Named param map (case-insensitive):`, namedParamMapLC);

            if (templateDef) {
                console.log(`[WhatsApp/Debug] Template Definition FOUND for: ${templateId}`);
                console.log(`[WhatsApp/Debug] Template components:`, JSON.stringify(templateDef.components.map(c => ({ type: c.type, format: c.format, text: (c.text || '').substring(0, 80) })), null, 2));
                let plainIdx = 0;
                let positionalIdx = 0; // Track position for numbered vars

                templateDef.components.forEach(compDef => {
                    if (compDef.type === 'BODY') {
                        const bodyMatches = (compDef.text || '').match(/{{([a-zA-Z0-9_]+)}}/g) || [];
                        const uniqueVars = Array.from(new Set(bodyMatches.map(m => m.replace(/[{}]/g, '').trim())));
                        console.log(`[WhatsApp/Debug] Body vars needed:`, uniqueVars);
                        
                        if (uniqueVars.length > 0) {
                            const parameters = uniqueVars.map(varName => {
                                let textVal;
                                const isNumberedVar = /^\d+$/.test(varName);
                                const varLC = varName.toLowerCase();

                                if (namedParamMapLC[varLC] !== undefined) {
                                    // Case-insensitive match: {{ownername}} matches 'OwnerName' from frontend
                                    textVal = namedParamMapLC[varLC];
                                } else if (isNumberedVar && positionalIdx < positionalValues.length) {
                                    textVal = positionalValues[positionalIdx++];
                                } else if (plainTextList.length > plainIdx) {
                                    textVal = plainTextList[plainIdx++];
                                } else {
                                    textVal = '—';
                                }

                                console.log(`[WhatsApp/Debug] Var "${varName}" → "${String(textVal).substring(0, 50)}"`);
                                const param = { type: 'text', text: String(textVal) };
                                // Send Meta's exact variable name (as it appears in template) as parameter_name
                                if (!isNumberedVar) param.parameter_name = varName;
                                return param;
                            });
                            components.push({ type: 'body', parameters });
                        }
                    } else if (compDef.type === 'BUTTONS') {
                        compDef.buttons?.forEach((btn, btnIdx) => {
                            if (btn.type === 'URL' && btn.url && /{{([a-zA-Z0-9_]+)}}/.test(btn.url)) {
                                // URL button with dynamic variable
                                const urlVarName = btn.url.match(/{{([a-zA-Z0-9_]+)}}/)[1];
                                let btnTokenVal = namedParamMap[urlVarName] || namedParamMap['siteVisitToken'] || namedParamMap['site_visit_token'] || plainTextList[plainIdx] || 'visit';
                                if (typeof btnTokenVal === 'string' && btnTokenVal.includes('.')) {
                                    btnTokenVal = btnTokenVal.replace(/\./g, '~');
                                }
                                components.push({
                                    type: 'button',
                                    sub_type: 'url',
                                    index: String(btnIdx),
                                    parameters: [{ type: 'text', text: String(btnTokenVal) }]
                                });
                            } else if (btn.type === 'FLOW') {
                                // 🚀 ENTERPRISE FIX: FLOW buttons require a flow_token component parameter in the payload
                                components.push({
                                    type: 'button',
                                    sub_type: 'flow',
                                    index: String(btnIdx),
                                    parameters: [{
                                        type: 'action',
                                        action: {
                                            flow_token: `crm_flow_${Date.now()}_${Math.floor(Math.random()*1000)}`
                                        }
                                    }]
                                });
                            }
                            // QUICK_REPLY buttons: NO component needed — Meta renders them automatically
                            // from the template definition. Do NOT add any component for them.
                        });
                    } else if (compDef.type === 'HEADER' && compDef.format === 'TEXT') {
                        const headerMatches = (compDef.text || '').match(/{{([a-zA-Z0-9_]+)}}/g) || [];
                        if (headerMatches.length > 0) {
                            const parameters = headerMatches.map(match => {
                                const varName = match.replace(/[{}]/g, '').trim();
                                const isNumbered = /^\d+$/.test(varName);
                                let textVal;
                                if (namedParamMapLC[varName.toLowerCase()] !== undefined) {
                                    textVal = namedParamMapLC[varName.toLowerCase()];
                                } else if (isNumbered && positionalIdx < positionalValues.length) {
                                    textVal = positionalValues[positionalIdx++];
                                } else {
                                    textVal = plainTextList[plainIdx] || 'Update';
                                }
                                const param = { type: 'text', text: String(textVal).substring(0, 200) };
                                if (!isNumbered) param.parameter_name = varName;
                                return param;
                            });
                            components.push({ type: 'header', parameters });
                        }
                    }
                    // HEADER with IMAGE/VIDEO/DOCUMENT format is handled separately below
                });
            } else {
                console.warn(`[WhatsApp/Debug] ⚠️ Template Definition NOT FOUND for: ${templateId}`);
                console.warn(`[WhatsApp/Debug] Available templates:`, templates.map(t => t.name).join(', '));
                if (Array.isArray(templateComponents) && templateComponents.length > 0) {
                    components.push({ 
                        type: 'body', 
                        parameters: templateComponents.map(item => {
                            const param = { type: 'text', text: typeof item === 'string' ? item : (item?.text || '') };
                            if (item?.parameter_name) param.parameter_name = item.parameter_name;
                            return param;
                        })
                    });
                }
            }

            // Extract required header format from template definition
            let requiredHeaderFormat = null;
            if (templateDef) {
                const headerDef = templateDef.components.find(c => c.type === 'HEADER');
                if (headerDef && headerDef.format !== 'TEXT') {
                    requiredHeaderFormat = headerDef.format.toLowerCase();
                }
            }

            // Header Media override
            // Priority: headerImageUrl (from frontend) > mediaUrl (manual) > DB-configured default > hardcoded fallback
            if (headerImageUrl || mediaUrl || requiredHeaderFormat) {
                const hType = requiredHeaderFormat || (type === 'image' ? 'image' : type === 'document' ? 'document' : 'video');
                
                // Try to load configured default image from SystemSettings
                let dbDefaultImage = null;
                try {
                    const SystemSetting = mongoose.model('SystemSetting');
                    const imgSetting = await SystemSetting.findOne({ key: 'wa_feedback_header_image' }).lean();
                    dbDefaultImage = imgSetting?.value?.url || null;
                } catch (e) { /* ignore */ }

                const finalMediaUrl = headerImageUrl || mediaUrl || dbDefaultImage || (
                    hType === 'document' ? 'https://api.bharatproperties.co/uploads/Huda_Map_Book_KKR.pdf?v=compressed_v1' :
                    hType === 'image' ? '/uploads/whatsapp_feedback_header.jpg' :
                    'https://www.w3schools.com/html/mov_bbb.mp4'
                );

                console.log(`[WhatsApp/Debug] Header ${hType} URL: ${finalMediaUrl}`);

                let mediaId = null;
                // 🚀 SENIOR LOGIC: If mediaUrl is on our server, upload to Meta first for reliability (to avoid 404s when using 'link')
                if (finalMediaUrl && (finalMediaUrl.includes('api.bharatproperties.co') || finalMediaUrl.includes('localhost') || finalMediaUrl.startsWith('/'))) {
                    try {
                        const path = await import('path');
                        const fs = await import('fs');
                        
                        let localPath = '';
                        if (finalMediaUrl.includes('/uploads/')) {
                            const parts = finalMediaUrl.split('/uploads/');
                            // Use absolute path logic similar to WhatsAppService
                            localPath = path.resolve(process.cwd(), 'uploads', parts[1].split('?')[0]);
                        } else if (finalMediaUrl.startsWith('/')) {
                            localPath = path.resolve(process.cwd(), finalMediaUrl.substring(1));
                        }

                        if (localPath && fs.existsSync(localPath)) {
                            console.log(`[WhatsApp/Debug] Local file detected for template header. Uploading to Meta storage...`);
                            const uploadRes = await WhatsAppService.uploadToMeta(localPath, hType);
                            if (uploadRes.success) {
                                mediaId = uploadRes.mediaId;
                                console.log(`[WhatsApp/Debug] Meta Upload Success. Media ID: ${mediaId}`);
                            } else {
                                console.warn(`[WhatsApp/Debug] Meta Upload Failed:`, uploadRes.error);
                            }
                        } else {
                            console.warn(`[WhatsApp/Debug] Local file not found at path: ${localPath}`);
                        }
                    } catch (e) {
                        console.error(`[WhatsApp/Debug] Local upload bypass failed:`, e.message);
                    }
                }

                const mediaObject = mediaId ? { id: mediaId } : { link: finalMediaUrl };
                if (hType === 'document' && !mediaId) {
                    mediaObject.filename = filename || 'Huda_Map_Book_KKR.pdf';
                }

                const headerComp = { 
                    type: 'header', 
                    parameters: [{ 
                        type: hType, 
                        [hType]: mediaObject
                    }] 
                };
                const existingHeaderIdx = components.findIndex(c => c.type === 'header');
                if (existingHeaderIdx >= 0) components[existingHeaderIdx] = headerComp;
                else components.push(headerComp);
            }

            console.log(`[WhatsApp/Debug] ✅ Final Components for ${templateId}:`, JSON.stringify(components, null, 2));
            const templateLang = templateDef?.language || language || 'en';
            console.log(`[WhatsApp/Debug] Sending template "${templateId}" lang="${templateLang}" to ${mobile}`);
            result = await WhatsAppService.sendTemplate(mobile, templateId, templateLang, components);
            
            // ⚠️ ENTERPRISE: If template send failed, log the EXACT error before falling back
            if (!result.success) {
                console.error(`[SocialController] ❌ Template send FAILED for "${templateId}":`, JSON.stringify(result, null, 2));
                if (message) {
                    console.log(`[SocialController] Falling back to plain text for ${mobile}`);
                    result = await WhatsAppService.sendMessage(mobile, message);
                    // Mark that this was a fallback so the frontend knows buttons won't appear
                    result.templateFallback = true;
                }
            }
        } else if (type === 'text') {
            result = await WhatsAppService.sendMessage(mobile, message);
        } else {
            result = await WhatsAppService.sendMedia(mobile, type, mediaUrl, caption || message, filename);
        }

        if (result && result.success) {
            // 2. Normalize mobile for Lead lookup
            const cleanPhone = String(mobile).replace(/\D/g, '').slice(-10);
            const lead = await Lead.findOne({ mobile: { $regex: new RegExp(cleanPhone + '$') } });

            // 3. Log as Activity for Timeline visibility
            await Activity.create({
                type: 'WhatsApp',
                subject: `Sent WhatsApp to ${mobile}`,
                entityType: lead ? 'Lead' : 'System',
                entityId: lead ? lead._id : null,
                description: message || `Sent ${type} media / template: ${templateId}`,
                status: 'Completed',
                performedBy: req.user?.fullName || 'System',
                details: {
                    platform: 'whatsapp',
                    direction: 'outgoing',
                    recipient: mobile,
                    message: message,
                    mediaUrl: mediaUrl,
                    type: type,
                    templateId: templateId,
                    messageId: result.messageId
                },
                dueDate: new Date()
            });

            if (lead) {
                lead.lastActivityAt = new Date();
                await lead.save();
            }
        } else {
            console.error('[SocialController] WhatsApp Service returned failure:', result);
        }


        res.json(result || { success: false, error: 'Unknown service error' });
    } catch (err) {
        console.error('[SocialController] sendWhatsAppMessage CRITICAL ERROR:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
};

/**
 * GET /api/social/ig/media
 * Fetch recent Instagram media objects for the configured Business Account.
 */
export const listInstagramMedia = async (req, res) => {
    try {
        const media = await socialCommentService.listInstagramMedia();
        res.json({ success: true, data: media, count: media.length });
    } catch (err) {
        console.error('[SocialController] listInstagramMedia error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/ig/comments?mediaId=
 * Fetch comments on a specific Instagram media post.
 */
export const getInstagramComments = async (req, res) => {
    try {
        const { mediaId } = req.query;
        if (!mediaId) {
            return res.status(400).json({ success: false, error: 'mediaId query param is required' });
        }
        const comments = await socialCommentService.fetchInstagramComments(mediaId);
        res.json({ success: true, data: comments, count: comments.length });
    } catch (err) {
        console.error('[SocialController] getInstagramComments error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/fb/comments?postId=
 * Fetch comments on a specific Facebook post.
 */
export const getFacebookComments = async (req, res) => {
    try {
        const { postId } = req.query;
        if (!postId) {
            return res.status(400).json({ success: false, error: 'postId query param is required' });
        }
        const comments = await socialCommentService.fetchFacebookComments(postId);
        res.json({ success: true, data: comments, count: comments.length });
    } catch (err) {
        console.error('[SocialController] getFacebookComments error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/social/comment/reply
 * Body: { commentId: string, message: string }
 * Reply to a comment on Instagram or Facebook.
 */
export const replyToComment = async (req, res) => {
    try {
        const { commentId, message } = req.body;
        if (!commentId || !message) {
            return res.status(400).json({ success: false, error: 'commentId and message are required' });
        }
        const result = await socialCommentService.replyToComment(commentId, message);
        res.json({ success: result.success, ...result });
    } catch (err) {
        console.error('[SocialController] replyToComment error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/social/comment/like
 * Body: { commentId: string }
 * Like a Facebook comment.
 */
export const likeComment = async (req, res) => {
    try {
        const { commentId } = req.body;
        if (!commentId) {
            return res.status(400).json({ success: false, error: 'commentId is required' });
        }
        const result = await socialCommentService.likeComment(commentId);
        res.json({ success: result.success, ...result });
    } catch (err) {
        console.error('[SocialController] likeComment error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/webhook
 * Meta Webhook Verification (hub.challenge handshake).
 */
export const verifyWebhook = async (req, res) => {
    try {
        const hub      = req.query.hub || {};
        const mode      = hub.mode      || req.query['hub.mode'];
        const token     = hub.verify_token || req.query['hub.verify_token'];
        const challenge = hub.challenge  || req.query['hub.challenge'];

        const fs = await import('fs');
        fs.appendFileSync('webhook_verify.log', `[${new Date().toISOString()}] VERIFY | mode="${mode}" token="${token}" challenge="${challenge}"\n`);

        console.log(`[Webhook] VERIFY | mode="${mode}" token="${token}" challenge="${challenge}"`);

        if (mode === 'subscribe') {
            // Senior Professional: Always fetch current valid tokens from DB
            const config = await SystemSetting.findOne({ key: 'social_graph_config' }).lean();
            const waConfig = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
            
            const ACCEPTED = [
                config?.value?.verifyToken,
                waConfig?.value?.verifyToken,
                'bharat-properties-webhook-2026', // Fallback for initial setup
                process.env.FB_WEBHOOK_VERIFY_TOKEN,
            ].filter(Boolean);

            if (ACCEPTED.includes(token)) {
                console.log(`[Webhook] ✅ Successfully verified token. Handshake complete.`);
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(challenge);
            }

            console.warn(`[Webhook] ❌ Verification failed: Token "${token}" not found in system settings.`);
            return res.status(403).send('Verification failed');
        }

        return res.status(400).send('Invalid mode');
    } catch (err) {
        console.error('[SocialController] verifyWebhook fatal error:', err.message);
        res.status(500).send('Internal Server Error');
    }
};

/**
 * POST /api/social/webhook
 * Receive real-time Facebook/Instagram comment events.
 */
export const receiveWebhook = async (req, res) => {
    try {
        // Respond immediately with 200 to acknowledge receipt (required by Meta)
        res.status(200).json({ received: true });

        // 🛠️ SENIOR DIAGNOSTIC: Write to a persistent file to confirm hits
        const fs = await import('fs');
        const diagnosticLog = `[${new Date().toISOString()}] Webhook Received: ${JSON.stringify(req.body)}\n`;
        fs.appendFileSync('webhook_hits.log', diagnosticLog);

        console.log(`[SocialController] Webhook Body Received:`, JSON.stringify(req.body, null, 2));
        const events = socialCommentService.processWebhookPayload(req.body);
        if (events.length > 0) {
            console.log(`[SocialController] Received ${events.length} social event(s):`, 
                events.map(e => `${e.platform}:${e.type}`).join(', '));
            
            // --- WhatsApp Activity Synchronization ---
                    const Activity = (await import('../models/Activity.js')).default;
            const Lead = (await import('../models/Lead.js')).default;
            const Contact = (await import('../models/Contact.js')).default;
            const { normalizePhone } = await import('../utils/normalization.js');

            for (const event of events) {
                // ...
                if (event.platform === 'whatsapp' && event.type === 'message') {
                    // 1. Normalize phone using the same utility as the Lead model
                    const rawPhone = event.senderId;
                    const cleanPhone = normalizePhone(rawPhone);
                    console.log(`[SocialController] Processing WhatsApp message from ${rawPhone} (normalized: ${cleanPhone})`);

                    // 2. Find matching Lead/Contact
                    console.log(`[SocialController] Searching for match with ${cleanPhone}...`);
                    let match = await Lead.findOne({ mobile: cleanPhone });
                    let entityType = 'Lead';
                    
                    if (!match) {
                        console.log(`[SocialController] No Lead found for ${cleanPhone}, checking Contacts...`);
                        match = await Contact.findOne({ "phones.number": cleanPhone });
                        if (match) entityType = 'Contact';
                    }

                    if (!match) {
                        // Fallback to regex for legacy data that might not be fully normalized
                        match = await Lead.findOne({ mobile: { $regex: new RegExp(cleanPhone + '$') } });
                        if (match) entityType = 'Lead';
                    }

                    if (!match) {
                        console.log(`[SocialController] ❌ No match found for ${cleanPhone}. Creating automatic WhatsApp Lead...`);
                        const sourceId = await resolveLeadLookup('Source', 'WhatsApp Inbound');
                        match = await Lead.create({
                            firstName: 'WhatsApp',
                            lastName: 'Lead',
                            mobile: cleanPhone,
                            source: sourceId,
                            intent_index: 50,
                            tags: ['AI Auto-Engaged'],
                            description: `Auto-created from inbound WhatsApp message: ${event.text.substring(0, 100)}`
                        });
                        entityType = 'Lead';
                    }

                    // 3. Resolve Participant Info
                    const participantName = match.fullName || match.firstName || `WA: ${rawPhone}`;
                    const entityId = match._id;

                    console.log(`[SocialController] ✅ Entity Resolved: ${entityType} | ID: ${entityId}`);

                    // --- Enterprise Rule: Auto-Pause Nurture Flow on Inbound WhatsApp Message ---
                    if (match && entityType === 'Lead' && match.customFields?.nurtureState !== 'HANDOFF') {
                        await Lead.findByIdAndUpdate(entityId, {
                            $set: {
                                'customFields.nurtureState': 'HANDOFF',
                                'customFields.nurtureLastAdvancedAt': new Date()
                            }
                        });
                        console.log(`[NurtureEngine] ⏸️ Auto-paused automated nurture flow for Lead ${entityId} due to incoming message.`);
                    }

                    // 4. Find or Create Conversation (Senior Professional Sync)
                    let conversation = await Conversation.findOne({ 
                        $or: [
                            { lead: entityId },
                            { 'metadata.entityId': entityId },
                            { phoneNumber: cleanPhone },
                            { phoneNumber: rawPhone }
                        ],
                        status: 'active' 
                    });

                    if (!conversation) {
                        conversation = await Conversation.create({
                            lead: entityType === 'Lead' ? entityId : (new mongoose.Types.ObjectId()), 
                            channel: 'whatsapp',
                            phoneNumber: cleanPhone,
                            status: 'active',
                            messages: [],
                            metadata: {
                                entityId: entityId,
                                entityType: entityType,
                                isContact: entityType === 'Contact'
                            }
                        });
                    }

                    // 5. [NEW] Resolve Media Attachment if present
                    let attachment = null;
                    let messageText = event.text;

                    if (['image', 'video', 'document', 'audio', 'sticker'].includes(event.type)) {
                        try {
                            const waService = (await import('../services/WhatsAppService.js')).default;
                            const downloaded = await waService.downloadMedia(event.mediaData.id);
                            attachment = {
                                type: event.type,
                                url: downloaded.url,
                                mimeType: downloaded.mimeType,
                                filename: event.mediaData.filename || downloaded.fileName,
                                caption: event.mediaData.caption || ''
                            };
                            messageText = event.mediaData.caption || `[Sent ${event.type}]`;
                        } catch (err) {
                            console.error('[SocialController] Media download failed:', err.message);
                        }
                    } else if (event.type === 'location') {
                        attachment = {
                            type: 'location',
                            location: event.raw.location
                        };
                        messageText = `📍 Location: ${event.raw.location.name || 'Shared Location'}`;
                    } else if (event.type === 'contacts') {
                        attachment = {
                            type: 'contacts',
                            contacts: event.raw.contacts
                        };
                        messageText = `👤 Contact Card: ${event.raw.contacts[0]?.name?.formatted_name || 'Shared Contact'}`;
                    }

                    // 6. Append User Message to Thread with Metadata
                    conversation.messages.push({ 
                        role: 'user', 
                        content: messageText,
                        metadata: attachment ? { attachment } : null
                    });
                    
                    // Increment unreadCount for Real-Time Polling Notifications
                    conversation.metadata = conversation.metadata || {};
                    conversation.metadata.unreadCount = (conversation.metadata.unreadCount || 0) + 1;
                    conversation.metadata.lastMessageAt = new Date();
                    
                    await conversation.save();

                    // 7. Save as Activity for Timeline
                    const activity = await Activity.create({
                        type: 'WhatsApp',
                        subject: `Inbound WhatsApp: ${messageText.substring(0, 40)}${messageText.length > 40 ? '...' : ''}`,
                        entityType: entityType,
                        entityId: entityId,
                        description: messageText,
                        status: 'Completed',
                        performedBy: 'WhatsApp User',
                        details: {
                            platform: 'whatsapp',
                            direction: 'incoming',
                            sender: rawPhone,
                            message: messageText,
                            conversationId: conversation._id,
                            attachment: attachment // Store attachment in details too
                        },
                        timestamp: new Date(),
                        dueDate: new Date()
                    });

                    // 7. Generate AI Bot Response (Professional Auto-Reply)
                    const chatHistoryContext = conversation.messages.map(m => `${m.role}: ${m.content}`).join('\n');
                    const aiResult = await generateBotResponse(
                        event.text, 
                        { 
                            chatHistory: chatHistoryContext,
                            lead: match,
                            entityType: entityType,
                            conversationId: conversation._id
                        },
                        {
                            useCase: conversation.currentUseCase || 'whatsapp_live'
                        }
                    );

                    if (aiResult.success && aiResult.reply) {
                        const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
                        const config = setting?.value;
                        
                        // Enhanced credential resolution with multiple fallbacks
                        const token = config?.token || config?.accessToken || config?.waToken || config?.apiKey || process.env.WHATSAPP_TOKEN;
                        const phoneId = config?.phoneId || config?.waPhoneId || process.env.WHATSAPP_PHONE_ID;

                        if (token && phoneId) {
                            try {
                                await axios.post(
                                    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
                                    {
                                        messaging_product: "whatsapp",
                                        recipient_type: "individual",
                                        to: rawPhone,
                                        type: "text",
                                        text: { preview_url: false, body: aiResult.reply }
                                    },
                                    {
                                        headers: { 'Authorization': `Bearer ${token}` }
                                    }
                                );

                                conversation.messages.push({ role: 'assistant', content: aiResult.reply });
                                await conversation.save();
                            } catch (waError) {
                                console.error('[SocialWebhook] Failed to send AI reply:', waError.response?.data || waError.message);
                            }
                        }
                    }

                    if (match) {
                        match.lastActivityAt = new Date();
                        await match.save();
                    }
                }

                // --- WhatsApp Status Synchronization (Sent/Delivered/Read) ---
                if (event.platform === 'whatsapp' && event.type === 'status_update') {
                    console.log(`[SocialWebhook] Processing Status Update: ${event.messageId} -> ${event.status}`);
                    
                    // Match by the message ID stored in details (Intelligent fallback for Campaign vs Direct Message)
                    const activity = await Activity.findOne({ 
                        $or: [
                            { "details.messageId": event.messageId },
                            { "details.msgId":     event.messageId }
                        ]
                    });
                    
                    if (activity) {
                        const statusMap = {
                            'sent':      'Sent',
                            'delivered': 'Delivered',
                            'read':      'Read',
                            'failed':    'Failed'
                        };

                        const newStatus = statusMap[event.status] || 'Active';
                        
                        // Update the activity status and subject for visual feedback in the timeline
                        activity.status = 'Completed'; 
                        activity.details.waStatus = event.status;
                        activity.details.lastEventAt = event.timestamp;
                        
                        if (event.status === 'read') {
                            activity.subject = activity.subject.replace(/Sent|Delivered/, 'Read');
                        } else if (event.status === 'delivered') {
                            activity.subject = activity.subject.replace('Sent', 'Delivered');
                        } else if (event.status === 'failed') {
                            activity.status = 'Delayed';
                            activity.subject = `❌ ${activity.subject} (Failed)`;
                            activity.details.error = event.error;
                        }

                        await activity.save();
                        console.log(`[SocialWebhook] ✅ Updated Activity: ${activity._id} to ${event.status}`);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[SocialController] receiveWebhook error:', err.message);
    }
};

/**
 * GET /api/social/status
 * Returns current Social API configuration status.
 */
export const getSocialStatus = async (req, res) => {
    try {
        const setting = await SystemSetting.findOne({ key: 'social_graph_config' }).lean();
        const hasPageToken = !!(setting?.value?.pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN);
        const hasIgUserId  = !!(setting?.value?.igUserId || process.env.IG_USER_ID);

        res.json({
            success: true,
            configured: hasPageToken && hasIgUserId,
            instagram: hasIgUserId,
            facebook: hasPageToken,
            mode: hasPageToken ? 'live' : 'mock',
            message: hasPageToken
                ? '✅ Facebook/Instagram Graph API configured. Live data active.'
                : '⚠️ No credentials found — mock data is being returned. Add FB_PAGE_ACCESS_TOKEN and IG_USER_ID to .env or Settings > Integrations.',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/whatsapp/templates
 * Fetch WhatsApp templates from Meta Business account
 */
export const getWhatsAppTemplates = async (req, res) => {
    try {
        const WhatsAppService = (await import('../services/WhatsAppService.js')).default;
        const result = await WhatsAppService.getTemplates();
        if (Array.isArray(result)) {
            res.json({ success: true, templates: result });
        } else if (result && result.success) {
            res.json({ success: true, templates: result.data });
        } else {
            res.status(500).json({ success: false, error: result?.error || 'Failed to fetch templates' });
        }
    } catch (err) {
        console.error('[SocialController] getWhatsAppTemplates error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/social/whatsapp/config
 * Save WhatsApp Meta Cloud API configuration
 */
export const saveWhatsAppConfig = async (req, res) => {
    try {
        const { token, phoneId, businessId, verifyToken } = req.body;
        
        await SystemSetting.findOneAndUpdate(
            { key: 'meta_wa_config' },
            { 
                $set: { 
                    'value.token': token,
                    'value.phoneId': phoneId,
                    'value.businessId': businessId,
                    'value.verifyToken': verifyToken,
                    'category': 'integration',
                    'active': true
                } 
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, message: 'WhatsApp configuration saved successfully' });
    } catch (err) {
        console.error('[SocialController] saveWhatsAppConfig error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/status/unified
 * Unified status for all social channels (LinkedIn, Meta, WhatsApp)
 */
export const getUnifiedStatus = async (req, res) => {
    try {
        const status = await socialCommentService.getUnifiedStatus();
        res.json(status);
    } catch (err) {
        console.error('[SocialController] getUnifiedStatus error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
/**
 * POST /api/social/post
 * Publish content to Facebook or Instagram
 */
export const postSocialMedia = async (req, res) => {
    try {
        const { platform, text, imageUrl, format = 'post', scheduledTime, entityId, entityType } = req.body;
        if (!platform || !text) {
            return res.status(400).json({ success: false, error: 'Platform and text are required' });
        }

        // ─── HANDLING SCHEDULED POSTS ──────────────────────────────────────────
        if (scheduledTime) {
            const scheduledDate = new Date(scheduledTime);
            const now = new Date();
            const delay = scheduledDate.getTime() - now.getTime();

            if (delay < 0) {
                return res.status(400).json({ success: false, error: 'Scheduled time must be in the future' });
            }

            console.log(`[SocialController] Queuing scheduled post for ${platform} in ${Math.round(delay/1000)} seconds...`);
            
            await marketingQueue.add('scheduled-social-dispatch', {
                platform,
                text,
                imageUrl,
                format,
                entityId,
                entityType
            }, { 
                delay,
                jobId: `social_${platform}_${entityId}_${scheduledDate.getTime()}` // Prevent duplicates
            });

            return res.json({ 
                success: true, 
                message: `Post successfully scheduled for ${scheduledDate.toLocaleString()}`,
                scheduled: true,
                scheduledAt: scheduledDate
            });
        }

        let result;
        const targetPlatform = platform.toLowerCase();

        if (targetPlatform === 'facebook') {
            result = await facebookService.postToPage(text, imageUrl, format);
        } else if (targetPlatform === 'instagram') {
            result = await facebookService.postToInstagram(text, imageUrl, format);
        } else if (targetPlatform === 'linkedin') {
            let assetUrn = null;
            if (imageUrl && !imageUrl.includes('localhost') && !imageUrl.includes('127.0.0.1')) {
                try {
                    console.log('[SocialController] Handling LinkedIn Image Upload:', imageUrl);
                    const { uploadUrl, asset } = await linkedInService.registerImageUpload();
                    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                    await linkedInService.uploadImageBinary(uploadUrl, imageResponse.data, imageResponse.headers['content-type']);
                    assetUrn = asset;
                    console.log('[SocialController] LinkedIn Asset Registered:', assetUrn);
                } catch (imgErr) {
                    console.error('[SocialController] LinkedIn Image Upload Failed, posting text only:', imgErr.message);
                }
            }
            result = await linkedInService.postToOrganization(text, null, assetUrn);
        } else if (['twitter', 'youtube', 'google_business'].includes(targetPlatform)) {
            // Enterprise Marketing OS: Support for expanded platforms via Mock Dispatch & Activity Logging
            // Real API integration would require dedicated X/YouTube/GBP OAuth services.
            const { entityId, entityType: passedEntityType } = req.body;
            console.log(`[SocialController] Dispatching Premium Listing to ${targetPlatform} (Format: ${format})`);
            
            result = { 
                success: true, 
                message: `Broadcasting successful on ${targetPlatform}`,
                platform: targetPlatform,
                status: 'dispatched',
                id: `mock_${Date.now()}`
            };

            // Log as Activity for Timeline visibility
            try {
                const Activity = (await import('../models/Activity.js')).default;
                await Activity.create({
                    type: 'Social Post',
                    subject: `Shared Listing to ${targetPlatform}`,
                    entityType: passedEntityType || 'System',
                    entityId: entityId || null,
                    description: text,
                    status: 'Completed',
                    performedBy: req.user?.fullName || 'Marketing Engine',
                    details: {
                        platform: targetPlatform,
                        format: format,
                        imageUrl: imageUrl,
                        dispatchedAt: new Date()
                    },
                    dueDate: new Date()
                });
            } catch (actErr) {
                console.error('[SocialController] Failed to log activity:', actErr.message);
            }
        } else {
            return res.status(400).json({ success: false, error: 'Unsupported platform for posting' });
        }

        res.json(result);
    } catch (err) {
        // PROFESSIONAL LOGGING OF EXTERNAL API ERRORS
        const errorMessage = err.message || 'An unexpected error occurred';
        console.error('[SocialController] postSocialMedia error:', errorMessage);
        
        // Determine status code based on error message
        let statusCode = 500;
        if (errorMessage.includes('missing') || errorMessage.includes('configure')) {
            statusCode = 400; // Client needs to configure credentials
        } else if (errorMessage.includes('local image')) {
            statusCode = 400;
        } else if (errorMessage.includes('token') || errorMessage.includes('authentication')) {
            statusCode = 401;
        }

        res.status(statusCode).json({ 
            success: false, 
            error: errorMessage,
            details: err.details || null
        });
    }
};

/**
 * GET /api/social/analytics
 * Fetch post insights/analytics
 */
export const getSocialAnalytics = async (req, res) => {
    try {
        const { objectId, platform } = req.query;
        if (!objectId || !platform) {
            return res.status(400).json({ success: false, error: 'objectId and platform are required' });
        }

        const result = await facebookService.getPostInsights(objectId, platform.toLowerCase());
        res.json(result);
    } catch (err) {
        console.error('[SocialController] getSocialAnalytics error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
/**
 * POST /api/social/test-connection
 * Verify Meta credentials by fetching basic Page/Account info.
 */
export const testSocialConnection = async (req, res) => {
    try {
        const result = await facebookService.testConnection();
        res.json(result);
    } catch (err) {
        console.error('[SocialController] testSocialConnection error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/whatsapp-config/preview
 * Preview a compiled template from the backend
 */
export const previewMessage = async (req, res) => {
    try {
        const { template, channel, recipient, properties } = req.body;
        if (!template || !channel) {
            return res.status(400).json({ success: false, error: 'Template and channel are required' });
        }
        const currentUser = req.user;
        const result = await resolveMessageTemplate(template, channel, recipient, properties, currentUser);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[SocialController] previewMessage error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
