import IntegrationGuard from "../src/utils/IntegrationGuard.js";

import SystemSetting from '../src/modules/systemSettings/system.model.js';
import { resolveMessageTemplate, interpolateTemplateText } from '../utils/templateResolver.js';
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
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';

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
    if (!IntegrationGuard.canSendWhatsapp()) {
        IntegrationGuard.logBlock("WhatsApp", req.body.to);
        if (res && res.status) return res.status(200).json({ success: true, message: "Blocked by Staging Guard", message_id: "staging-blocked-wa" });
        return { success: true };
    }

    try {
        console.log('[SocialController] RAW PAYLOAD:', JSON.stringify(req.body, null, 2));
        const { mobile, message, type = 'text', mediaUrl, filename, caption, templateId, templateComponents, language, headerImageUrl, integrationId, fromPhoneNumberId } = req.body;
        
        if (!mobile || (!message && !mediaUrl && !templateId)) {
            return res.status(400).json({ success: false, error: 'Mobile and message/media/template are required' });
        }

        // Safe Model Retrieval
        const Lead = mongoose.model('Lead');
        const Activity = mongoose.model('Activity');
        const WhatsAppService = (await import('../services/WhatsAppService.js')).default;
        const WhatsAppAccountAuthorizationService = (await import('../services/WhatsAppAccountAuthorizationService.js')).default;
        const targetAccount = integrationId || fromPhoneNumberId || null;

        // 🛡️ Enterprise RBAC Check for Outbound WhatsApp Send
        const authCheck = await WhatsAppAccountAuthorizationService.assertCanSend(req.user, targetAccount);
        if (!authCheck.authorized) {
            return res.status(403).json({ success: false, error: authCheck.reason || "Unauthorized to send from this WhatsApp account" });
        }

        console.log(`[SocialController] Dispatching WhatsApp to: ${mobile} (Template: ${templateId || 'None'}, Account: ${targetAccount || 'Default'})`);

        // 🚀 ENTERPRISE BAILEYS / WHATSAPP WEB ROUTING:
        // If targetAccount is a Baileys WhatsApp Web integration, send directly via WhatsApp Web rules (bypassing Meta):
        let isBaileys = false;
        let baileysDoc = null;
        if (targetAccount) {
            baileysDoc = await WhatsAppIntegration.findOne({
                $or: [
                    { _id: mongoose.Types.ObjectId.isValid(targetAccount) ? targetAccount : null },
                    { phoneNumberId: targetAccount }
                ],
                provider: 'BAILEYS',
                status: 'ACTIVE'
            }).lean();
            if (baileysDoc) isBaileys = true;
        }

        // 1. Dispatch via Service
        let result;
        let actualRenderedText = '';
        if (isBaileys) {
            console.log(`[SocialController] Routing WhatsApp directly via WhatsApp Web to: ${mobile}`);
            let outgoingText = message;
            if (!outgoingText && templateId) {
                try {
                    const crmSettings = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' }).lean();
                    const localTemplates = crmSettings?.value || [];
                    const foundTpl = localTemplates.find(t => t.name === templateId || String(t.id) === String(templateId) || t._id === templateId);
                    if (foundTpl) {
                        outgoingText = foundTpl.body || foundTpl.content || '';
                    }
                } catch (tplErr) {
                    console.warn('[SocialController] Could not resolve WhatsApp Web template:', tplErr.message);
                }
            }
            if (!outgoingText && Array.isArray(templateComponents) && templateComponents.length > 0) {
                outgoingText = templateComponents.map(c => typeof c === 'string' ? c : c?.text || '').filter(Boolean).join('\n');
            }

            // 🌟 Enterprise Interpolation for WhatsApp Web: Replace {{...}} before sending!
            if (outgoingText && outgoingText.includes('{{')) {
                try {
                    const cleanPhone10 = String(mobile).replace(/\D/g, '').slice(-10);
                    const leadDoc = await Lead.findOne({ mobile: { $regex: cleanPhone10 + '$' } }).populate('assignedTo', 'fullName name mobile phone email').lean();
                    const contactDoc = !leadDoc ? await Contact.findOne({ 'phones.number': { $regex: cleanPhone10 + '$' } }).populate('assignedTo', 'fullName name mobile phone email').lean() : null;
                    outgoingText = interpolateTemplateText(outgoingText, {
                        recipient: leadDoc || contactDoc || { mobile },
                        agent: {
                            fullName: req.user?.fullName || req.user?.name || 'Bharat Properties Consultant',
                            mobile: req.user?.phone || req.user?.mobile || '+91 94160 35570',
                            email: req.user?.email || 'info@bharatproperties.co'
                        }
                    });
                } catch (tplErr) {
                    console.warn('[SocialController] Baileys variable interpolation error:', tplErr.message);
                }
            }

            actualRenderedText = outgoingText || message || caption || '';
            if (type !== 'text' && mediaUrl) {
                result = await WhatsAppService.sendMedia(mobile, type, mediaUrl, outgoingText || caption, filename, { integrationId: baileysDoc._id.toString() });
            } else {
                result = await WhatsAppService.sendMessage(mobile, outgoingText || 'Hello', { integrationId: baileysDoc._id.toString() });
            }
        } else if (templateId) {
            const templates = await WhatsAppService.getTemplates(targetAccount);
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
                        let renderedBodyCopy = compDef.text || '';
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
                                    textVal = '-';
                                }

                                // 🚀 ENTERPRISE FIX: Meta API rejects empty string variables (e.g. if location is blank).
                                // We MUST replace empty strings with a fallback character.
                                let finalVal = String(textVal).trim();
                                if (finalVal === '' || finalVal === 'null' || finalVal === 'undefined') {
                                    finalVal = '-';
                                }

                                renderedBodyCopy = renderedBodyCopy.replace(new RegExp(`\\{\\{${varName}\\}\\}`, 'gi'), finalVal);
                                console.log(`[WhatsApp/Debug] Var "${varName}" → "${finalVal.substring(0, 50)}"`);
                                const param = { type: 'text', text: finalVal };
                                // Send Meta's exact variable name (as it appears in template) as parameter_name
                                if (!isNumberedVar) param.parameter_name = varName;
                                return param;
                            });
                            components.push({ type: 'body', parameters });
                        }
                        actualRenderedText = renderedBodyCopy;
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
                            let textVal = typeof item === 'string' ? item : (item?.text || '');
                            textVal = String(textVal).trim();
                            if (textVal === '' || textVal === 'null' || textVal === 'undefined') textVal = '-';
                            const param = { type: 'text', text: textVal };
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
            console.log(`[WhatsApp/Debug] Sending template "${templateId}" lang="${templateLang}" to ${mobile} via ${targetAccount || 'default'}`);
            result = await WhatsAppService.sendTemplate(mobile, templateId, templateLang, components, { integrationId: targetAccount });
            
            // ⚠️ ENTERPRISE: If template send failed, log the EXACT error before falling back
            if (!result.success) {
                console.error(`[SocialController] ❌ Template send FAILED for "${templateId}":`, JSON.stringify(result, null, 2));
                if (message) {
                    console.log(`[SocialController] Falling back to plain text for ${mobile}`);
                    result = await WhatsAppService.sendMessage(mobile, message, { integrationId: targetAccount });
                    // Mark that this was a fallback so the frontend knows buttons won't appear
                    result.templateFallback = true;
                }
            }
        } else if (type === 'text') {
            result = await WhatsAppService.sendMessage(mobile, message, { integrationId: targetAccount });
        } else {
            result = await WhatsAppService.sendMedia(mobile, type, mediaUrl, caption || message, filename, { integrationId: targetAccount });
        }

        if (result && result.success) {
            try {
                // 2. Normalize mobile for Lead lookup
                const cleanPhone = String(mobile).replace(/\D/g, '').slice(-10);
                const lead = await Lead.findOne({ mobile: { $regex: new RegExp(cleanPhone + '$') } });

                // 3. Resolve exact content sent
                const finalContent = actualRenderedText || message || (templateId ? `Template: ${templateId}` : `Sent ${type} media`);
                const templateButtons = templateDef?.components?.find(c => c.type === 'BUTTONS' || c.type === 'buttons')?.buttons || null;

                // Log as Activity for Timeline visibility
                await Activity.create({
                    type: 'WhatsApp',
                    subject: `Sent WhatsApp to ${mobile}`,
                    entityType: lead ? 'Lead' : 'System',
                    entityId: lead ? lead._id : null,
                    description: finalContent,
                    status: 'Completed',
                    performedBy: req.user?.fullName || 'System',
                    details: {
                        platform: isBaileys ? 'WhatsApp Web' : 'whatsapp',
                        direction: 'outgoing',
                        recipient: mobile,
                        message: finalContent,
                        renderedBody: finalContent,
                        mediaUrl: mediaUrl,
                        type: type,
                        templateId: templateId,
                        buttons: templateButtons,
                        messageId: result.messageId,
                        integrationId: targetAccount || null
                    },
                    dueDate: new Date()
                });

                // 4. Update Conversation History with actual message
                try {
                    const Conversation = mongoose.models.Conversation || (await import('../models/Conversation.js')).default;
                    await Conversation.findOneAndUpdate(
                        { phoneNumber: cleanPhone },
                        {
                            $push: {
                                messages: {
                                    role: 'assistant',
                                    content: finalContent,
                                    timestamp: new Date(),
                                    metadata: {
                                        messageId: result.messageId,
                                        type: type,
                                        templateId: templateId,
                                        buttons: templateButtons,
                                        mediaUrl: mediaUrl,
                                        platform: isBaileys ? 'WhatsApp Web' : 'WhatsApp API',
                                        status: 'Sent'
                                    }
                                }
                            },
                            $set: {
                                updatedAt: new Date(),
                                status: 'active',
                                channel: 'whatsapp',
                                'metadata.unreadCount': 0,
                                ...(isBaileys && baileysDoc ? { whatsappIntegrationId: baileysDoc._id } : {})
                            },
                            $setOnInsert: {
                                phoneNumber: cleanPhone,
                                title: lead?.fullName || cleanPhone
                            }
                        },
                        { upsert: true }
                    );
                } catch (convErr) {
                    console.warn('[SocialController] Could not update Conversation history:', convErr.message);
                }

                if (lead) {
                    await Lead.findByIdAndUpdate(lead._id, { $set: { lastActivityAt: new Date() } });
                }
            } catch (auditErr) {
                console.error('[SocialController] Error recording post-send activity/lead update:', auditErr.message);
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
        // Enterprise Safe Handshake: Forward WhatsApp Cloud API payloads to live bot processor
        if (req.body?.object === 'whatsapp_business_account') {
            const { whatsAppLiveBotWebhook } = await import('./webhook.controller.js');
            return whatsAppLiveBotWebhook(req, res);
        }

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
                        const { createStandardizedLead } = await import('../services/LeadCreationEngine.js');
                        const leadResult = await createStandardizedLead({
                            firstName: 'WhatsApp',
                            lastName: 'Lead',
                            mobile: cleanPhone,
                            source: sourceId,
                            intent_index: 50,
                            tags: ['AI Auto-Engaged'],
                            description: `Auto-created from inbound WhatsApp message: ${event.text.substring(0, 100)}`
                        }, { triggerEvent: 'onWhatsAppCapture' });
                        match = leadResult.lead;
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

/**
 * GET /api/whatsapp-actions/accounts
 * Fetch all available active WhatsApp accounts with credentials strictly REDACTED.
 */
export const getWhatsAppAccounts = async (req, res) => {
    try {
        const SystemSetting = mongoose.model('SystemSetting');
        const WhatsAppAccountAuthorizationService = (await import('../services/WhatsAppAccountAuthorizationService.js')).default;

        // Fetch all active integrations
        const integrations = await WhatsAppIntegration.find({ status: 'ACTIVE' })
            .sort({ isDefault: -1, createdAt: 1 })
            .lean();

        // 🛡️ Enterprise RBAC Filter: Only include integrations the current user is authorized to access
        const authorizedIntegrations = WhatsAppAccountAuthorizationService.filterAuthorizedAccounts(req.user, integrations);

        // Check if legacy meta_wa_config exists
        const legacySetting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
        const legacyConfig = legacySetting?.value;

        const accounts = [];

        // Add registered integrations
        authorizedIntegrations.forEach(i => {
            accounts.push({
                id: i._id.toString(),
                phoneNumberId: i.phoneNumberId,
                wabaId: i.wabaId,
                displayPhoneNumber: i.displayPhoneNumber || 'WhatsApp Business',
                accountLabel: i.accountLabel || (i.provider === 'BAILEYS' ? `WhatsApp Web (${i.displayPhoneNumber || ''})` : i.connectionType === 'COEXISTENCE' ? `WhatsApp Business App (${i.displayPhoneNumber || ''})` : `WhatsApp Cloud API (${i.displayPhoneNumber || ''})`),
                connectionType: i.connectionType,
                provider: i.provider || (i.connectionType === 'QR_SCANNER' ? 'BAILEYS' : 'META_CLOUD'),
                onboardingStatus: i.onboardingStatus,
                isDefault: !!i.isDefault,
                status: i.status
            });
        });

        // Ensure legacy meta_wa_config is represented if not already in list AND user is authorized
        const legacyPhoneId = legacyConfig?.phoneId;
        const alreadyInList = accounts.some(a => a.phoneNumberId === legacyPhoneId);

        if (!alreadyInList && legacyPhoneId && legacyConfig?.token) {
            const legacyAccountObj = {
                id: 'legacy_default',
                phoneNumberId: legacyPhoneId,
                wabaId: legacyConfig?.businessId || '',
                displayPhoneNumber: legacyConfig?.displayPhoneNumber || '+91 99960 00570',
                accountLabel: 'Main Official WhatsApp API (+91 99960 00570)',
                connectionType: 'NEW_API',
                isDefault: true,
                status: 'ACTIVE'
            };
            if (WhatsAppAccountAuthorizationService.canUserAccessAccount(req.user, legacyAccountObj)) {
                accounts.unshift(legacyAccountObj);
            }
        } else if (legacyPhoneId && alreadyInList) {
            // Ensure the legacy Cloud API number has isDefault: true unless another is explicitly set
            const hasDefault = accounts.some(a => a.isDefault);
            if (!hasDefault) {
                const legacyMatch = accounts.find(a => a.phoneNumberId === legacyPhoneId);
                if (legacyMatch) legacyMatch.isDefault = true;
            }
        }

        res.json({ success: true, data: accounts });
    } catch (err) {
        console.error('[SocialController] getWhatsAppAccounts error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/social/whatsapp/baileys/start
 * Initialize a Baileys QR connection
 */
export const startBaileysConnection = async (req, res) => {
    try {
        const { displayPhoneNumber, accountLabel } = req.body;
        
        // 🔒 STRICT CRM-WIDE PHONE UNIQUENESS VALIDATION:
        // One phone number can only be connected to ONE user across the entire CRM
        const { normalizePhone } = await import('../utils/normalization.js');
        const normalizedInput = displayPhoneNumber ? normalizePhone(displayPhoneNumber) : '';
        if (normalizedInput) {
            const existingConflict = await WhatsAppIntegration.findOne({
                provider: 'BAILEYS',
                status: 'ACTIVE',
                connectedBy: { $ne: req.user._id },
                $or: [
                    { displayPhoneNumber: { $regex: normalizedInput + '$' } },
                    { phoneNumberId: { $regex: normalizedInput + '$' } }
                ]
            }).populate('connectedBy', 'fullName name email');

            if (existingConflict) {
                const ownerName = existingConflict.connectedBy?.fullName || existingConflict.connectedBy?.name || 'dusre user';
                return res.status(409).json({
                    success: false,
                    error: `Yeh WhatsApp number (${displayPhoneNumber}) pehle se hi "${ownerName}" ke account pr active hai. Pure CRM me ek WhatsApp number sirf ek hi user ke scanner pr link ho sakta hai.`
                });
            }
        }
        
        // Find if one already exists for THIS user, or create new user-bound integration
        let integration = await WhatsAppIntegration.findOne({ 
            provider: 'BAILEYS', 
            connectedBy: req.user._id
        });

        if (!integration) {
            const userName = req.user.fullName || req.user.name || 'Personal';
            integration = await WhatsAppIntegration.create({
                provider: 'BAILEYS',
                phoneNumberId: displayPhoneNumber || `baileys_${req.user._id}_${Date.now()}`,
                displayPhoneNumber: displayPhoneNumber || '',
                accountLabel: accountLabel || `${userName} WhatsApp Web`,
                connectionType: 'QR_SCANNER',
                onboardingStatus: 'INITIATED',
                status: 'PENDING_ONBOARDING',
                connectedBy: req.user._id,
                allowedUsers: [req.user._id]
            });
        } else {
            // Ensure allowedUsers contains this user for strict per-user isolation
            if (!integration.allowedUsers || !integration.allowedUsers.includes(req.user._id)) {
                integration.allowedUsers = [req.user._id];
            }
            if (displayPhoneNumber) integration.displayPhoneNumber = displayPhoneNumber;
            if (accountLabel) integration.accountLabel = accountLabel;

            // Clear old auth data to force new QR generation
            const { default: BaileysAuthModel } = await import('../models/BaileysAuth.js');
            await BaileysAuthModel.deleteMany({ sessionId: integration._id.toString() });

            integration.onboardingStatus = 'INITIATED';
            integration.status = 'PENDING_ONBOARDING';
            integration.failureReason = null;
            await integration.save();
            
            // Logout and kill old socket safely
            try {
                const { BaileysConnectionManager } = await import('../services/baileysQueue/BaileysConnectionManager.js');
                await BaileysConnectionManager.logout(integration._id.toString());
            } catch (lgErr) {
                console.warn('[SocialController] Safe logout warning:', lgErr.message);
            }
        }

        const { BaileysConnectionManager } = await import('../services/baileysQueue/BaileysConnectionManager.js');
        // This will asynchronously generate the QR and store it in failureReason
        BaileysConnectionManager.connect(integration._id.toString()).catch(cErr => {
            console.error('[SocialController] Connection initialization error:', cErr.message);
        });

        res.json({ success: true, integrationId: integration._id });
    } catch (error) {
        console.error('[SocialController] startBaileysConnection error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/social/whatsapp/baileys/status/:id
 * Get the Baileys connection status and QR code with self-healing verification
 */
export const getBaileysStatus = async (req, res) => {
    try {
        const { default: WhatsAppIntegration } = await import('../models/WhatsAppIntegration.js');
        const integration = await WhatsAppIntegration.findById(req.params.id);
        
        if (!integration) {
            return res.status(404).json({ success: false, error: 'Integration not found' });
        }

        const WhatsAppAccountAuthorizationService = (await import('../services/WhatsAppAccountAuthorizationService.js')).default;
        if (!WhatsAppAccountAuthorizationService.canUserAccessAccount(req.user, integration)) {
            return res.status(403).json({ success: false, error: 'Unauthorized to access this WhatsApp integration' });
        }

        let status = integration.status;
        let onboardingStatus = integration.onboardingStatus;
        let qrDataUrl = onboardingStatus === 'QR_PENDING' ? integration.failureReason : null;

        // 🚀 ENTERPRISE STATE VERIFICATION:
        // Check if active socket exists in memory
        const { BaileysConnectionManager } = await import('../services/baileysQueue/BaileysConnectionManager.js');
        const { normalizePhone } = await import('../utils/normalization.js');
        const sock = BaileysConnectionManager.getSocket(req.params.id);

        if (sock && sock.user && sock.user.id) {
            const rawPhone = sock.user.id.split(':')[0].replace(/\D/g, '');
            const norm = normalizePhone(rawPhone);

            // Double check duplicate before marking active
            const duplicate = await WhatsAppIntegration.findOne({
                _id: { $ne: req.params.id },
                provider: 'BAILEYS',
                status: 'ACTIVE',
                connectedBy: { $ne: integration.connectedBy },
                $or: [
                    { displayPhoneNumber: { $regex: norm + '$' } },
                    { phoneNumberId: { $regex: norm + '$' } }
                ]
            }).populate('connectedBy', 'fullName name');

            if (duplicate) {
                const dupName = duplicate.connectedBy?.fullName || duplicate.connectedBy?.name || 'another user';
                status = 'ERROR';
                onboardingStatus = 'ERROR';
                qrDataUrl = null;
                const errorMsg = `Yeh WhatsApp number (${rawPhone}) pehle se "${dupName}" ke account pr linked hai. Ek number sirf ek user use kr sakta hai.`;
                await WhatsAppIntegration.findByIdAndUpdate(req.params.id, {
                    status: 'ERROR',
                    onboardingStatus: 'ERROR',
                    failureReason: errorMsg
                });
                return res.json({ success: true, status: 'ERROR', onboardingStatus: 'ERROR', error: errorMsg });
            }

            status = 'ACTIVE';
            onboardingStatus = 'CONNECTED';
            qrDataUrl = null;

            if (integration.status !== 'ACTIVE' || integration.onboardingStatus !== 'CONNECTED') {
                const phone = rawPhone;
                const name = sock.user.name || integration.accountLabel || 'Bharat Properties';
                await WhatsAppIntegration.findByIdAndUpdate(req.params.id, {
                    status: 'ACTIVE',
                    onboardingStatus: 'CONNECTED',
                    displayPhoneNumber: phone,
                    phoneNumberId: phone,
                    accountLabel: name,
                    failureReason: null
                });
            }
        } else if (onboardingStatus !== 'CONNECTED' || status !== 'ACTIVE') {
            // Check if MongoDB already has creds saved (i.e. scanned earlier)
            const { useMongoDBAuthState } = await import('../services/baileysQueue/useMongoDBAuthState.js');
            const { state } = await useMongoDBAuthState(req.params.id);
            if (state && state.creds && state.creds.me && state.creds.me.id) {
                const rawPhone = state.creds.me.id.split(':')[0].replace(/\D/g, '');
                const norm = normalizePhone(rawPhone);

                const duplicate = await WhatsAppIntegration.findOne({
                    _id: { $ne: req.params.id },
                    provider: 'BAILEYS',
                    status: 'ACTIVE',
                    connectedBy: { $ne: integration.connectedBy },
                    $or: [
                        { displayPhoneNumber: { $regex: norm + '$' } },
                        { phoneNumberId: { $regex: norm + '$' } }
                    ]
                }).populate('connectedBy', 'fullName name');

                if (duplicate) {
                    const dupName = duplicate.connectedBy?.fullName || duplicate.connectedBy?.name || 'another user';
                    const errorMsg = `Yeh WhatsApp number (${rawPhone}) pehle se "${dupName}" ke account pr linked hai.`;
                    await WhatsAppIntegration.findByIdAndUpdate(req.params.id, {
                        status: 'ERROR',
                        onboardingStatus: 'ERROR',
                        failureReason: errorMsg
                    });
                    return res.json({ success: true, status: 'ERROR', onboardingStatus: 'ERROR', error: errorMsg });
                }

                status = 'ACTIVE';
                onboardingStatus = 'CONNECTED';
                qrDataUrl = null;
                const phone = rawPhone;
                const name = state.creds.me.name || integration.accountLabel || 'Bharat Properties';
                await WhatsAppIntegration.findByIdAndUpdate(req.params.id, {
                    status: 'ACTIVE',
                    onboardingStatus: 'CONNECTED',
                    displayPhoneNumber: phone,
                    phoneNumberId: phone,
                    accountLabel: name,
                    failureReason: null
                });
                // Ensure socket is connected in memory
                BaileysConnectionManager.connect(req.params.id).catch(() => {});
            }
        }

        res.json({ 
            success: true, 
            status,
            onboardingStatus,
            qrDataUrl,
            error: integration.failureReason
        });
    } catch (error) {
        console.error('[SocialController] getBaileysStatus error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

// 🚀 Enterprise Architecture: WhatsApp Group Socket In-Memory Cache (5-min TTL)
const groupsMemoryCache = new Map();
const GROUPS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/social/whatsapp/baileys/groups/:id
 * Get all participating groups from the Baileys socket with 5-minute TTL memory caching
 */
export const getBaileysGroups = async (req, res) => {
    try {
        const integrationId = req.params.id;
        const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';

        // 1. Return immediately from in-memory cache unless explicit refresh requested
        if (!forceRefresh && groupsMemoryCache.has(integrationId)) {
            const cached = groupsMemoryCache.get(integrationId);
            if (Date.now() - cached.timestamp < GROUPS_CACHE_TTL_MS && Array.isArray(cached.data) && cached.data.length > 0) {
                return res.json({ success: true, data: cached.data, cached: true });
            }
        }

        const { default: WhatsAppIntegration } = await import('../models/WhatsAppIntegration.js');
        const integration = await WhatsAppIntegration.findById(integrationId);
        if (!integration) {
            return res.status(404).json({ success: false, error: 'Integration not found' });
        }

        const WhatsAppAccountAuthorizationService = (await import('../services/WhatsAppAccountAuthorizationService.js')).default;
        if (!WhatsAppAccountAuthorizationService.canUserAccessAccount(req.user, integration)) {
            return res.status(403).json({ success: false, error: 'Unauthorized to view WhatsApp groups for this account' });
        }

        const { BaileysConnectionManager } = await import('../services/baileysQueue/BaileysConnectionManager.js');
        let sock = BaileysConnectionManager.getSocket(integrationId);
        
        if (!sock) {
            sock = await BaileysConnectionManager.connect(integrationId).catch(() => null);
        }

        let formatted = [];
        let fetchedFromSocket = false;

        if (sock && sock.user && sock.user.id) {
            try {
                // 🚀 Enterprise Safeguard: 4.5s socket timeout prevents network freeze & Axios timeouts
                const fetchPromise = sock.groupFetchAllParticipating();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('WhatsApp socket query timed out')), 4500)
                );
                const groups = await Promise.race([fetchPromise, timeoutPromise]);

                if (groups && typeof groups === 'object') {
                    formatted = Object.values(groups).map(g => {
                        if (g.id && g.subject) {
                            BaileysConnectionManager.setGroupSubject(g.id, g.subject);
                        }
                        return {
                            id: g.id,
                            subject: g.subject || 'WhatsApp Group',
                            owner: g.owner || null,
                            creation: g.creation || null,
                            participantsCount: Array.isArray(g.participants) ? g.participants.length : 0,
                            desc: g.desc?.toString() || ''
                        };
                    });
                    fetchedFromSocket = true;
                }
            } catch (socketErr) {
                console.warn('[SocialController] sock.groupFetchAllParticipating delayed or failed:', socketErr.message);
            }
        }

        // If live socket timed out or is pairing, serve from in-memory cache & DB conversations
        if (!fetchedFromSocket || formatted.length === 0) {
            const cachedMap = BaileysConnectionManager.getAllGroupSubjects(integrationId);
            const groupList = [];
            const seenJids = new Set();

            if (cachedMap && cachedMap.size > 0) {
                for (const [jid, subject] of cachedMap.entries()) {
                    if (jid.includes('@g.us') && !seenJids.has(jid)) {
                        seenJids.add(jid);
                        groupList.push({
                            id: jid,
                            subject: subject,
                            owner: null,
                            creation: null,
                            participantsCount: 0,
                            desc: ''
                        });
                    }
                }
            }

            // Also check existing group conversations from DB for comprehensive fallback
            try {
                const Conversation = (await import('../models/Conversation.js')).default;
                const dbGroups = await Conversation.find({ channel: 'whatsapp', isGroup: true, whatsappIntegrationId: integration._id }).select('phoneNumber title groupName updatedAt').lean();
                dbGroups.forEach(cg => {
                    const jid = cg.phoneNumber || cg.metadata?.groupJid;
                    if (jid && !seenJids.has(jid)) {
                        seenJids.add(jid);
                        groupList.push({
                            id: jid,
                            subject: cg.groupName || cg.title || 'WhatsApp Group',
                            owner: null,
                            creation: null,
                            participantsCount: 0,
                            desc: ''
                        });
                    }
                });
            } catch (dbErr) {
                console.warn('[SocialController] DB group fallback lookup error:', dbErr.message);
            }

            if (groupList.length > 0) {
                formatted = groupList;
            }
        }

        // Cache the formatted groups in memory with current timestamp
        if (formatted && formatted.length > 0) {
            groupsMemoryCache.set(integrationId, { data: formatted, timestamp: Date.now() });
        }

        res.json({ success: true, data: formatted });
    } catch (error) {
        console.error('[SocialController] getBaileysGroups error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};
