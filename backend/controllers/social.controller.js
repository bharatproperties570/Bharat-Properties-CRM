import SystemSetting from '../src/modules/systemSettings/system.model.js';
import socialCommentService from '../services/SocialCommentService.js';
import facebookService from '../services/FacebookService.js';
import metaLeadService from '../services/MetaLeadService.js';
import Conversation from '../models/Conversation.js';
import { generateBotResponse } from '../services/aiBot.service.js';
import axios from 'axios';
import mongoose from 'mongoose';
import Lead, { resolveLeadLookup } from '../models/Lead.js';
import Activity from '../models/Activity.js';
import Contact from '../models/Contact.js';

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
 * POST /api/social/whatsapp/send
 * Enterprise message dispatch with Activity logging
 */
export const sendWhatsAppMessage = async (req, res) => {
    try {
        const { mobile, message, type = 'text', mediaUrl, filename, caption } = req.body;
        
        if (!mobile || (!message && !mediaUrl)) {
            return res.status(400).json({ success: false, error: 'Mobile and message/media are required' });
        }

        const WhatsAppService = (await import('../services/WhatsAppService.js')).default;
        const Activity = (await import('../models/Activity.js')).default;
        const Lead = (await import('../models/Lead.js')).default;

        // 1. Dispatch via Service
        let result;
        if (type === 'text') {
            result = await WhatsAppService.sendMessage(mobile, message);
        } else {
            result = await WhatsAppService.sendMedia(mobile, type, mediaUrl, caption || message, filename);
        }

        if (result.success) {
            // 2. Normalize mobile for Lead lookup
            const cleanPhone = mobile.replace(/\D/g, '').slice(-10);
            const lead = await Lead.findOne({ mobile: { $regex: new RegExp(cleanPhone + '$') } });

            // 3. Log as Activity for Timeline visibility
            await Activity.create({
                type: 'WhatsApp',
                subject: `Sent WhatsApp to ${mobile}`,
                entityType: lead ? 'Lead' : 'System',
                entityId: lead ? lead._id : null,
                description: message || `Sent ${type} media`,
                status: 'Completed',
                performedBy: req.user?.fullName || 'System',
                details: {
                    platform: 'whatsapp',
                    direction: 'outgoing',
                    recipient: mobile,
                    message: message,
                    mediaUrl: mediaUrl,
                    type: type,
                    messageId: result.messageId
                },
                dueDate: new Date()
            });

            if (lead) {
                lead.lastActivityAt = new Date();
                await lead.save();
            }
        }

        res.json(result);
    } catch (err) {
        console.error('[SocialController] sendWhatsAppMessage error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/social/ig/media
... (keep existing exports)
... (keep existing exports)
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

                    if (match) {
                        console.log(`[SocialController] ✅ Match Found: ${entityType} | ID: ${match._id} | Name: ${match.fullName || match.firstName}`);
                    } else {
                        console.log(`[SocialController] ❌ No match found for ${cleanPhone}`);
                    }

                    // 3. Resolve Participant Info
                    const participantName = match ? (match.fullName || match.name || `${match.firstName || ''} ${match.lastName || ''}`.trim()) : `WA: ${rawPhone}`;
                    const entityId = match?._id;
                    // entityType is already declared as 'let' above, just update it if needed for the 'Wait' case
                    if (!match) entityType = 'System'; 

                    // 4. Find or Create Conversation (Senior Professional Sync)
                    let conversation = await Conversation.findOne({ 
                        $or: [
                            { lead: match?._id },
                            { metadata: { entityId: match?._id } },
                            { phoneNumber: rawPhone }
                        ],
                        status: 'active' 
                    });

                    if (!conversation) {
                        conversation = await Conversation.create({
                            lead: match?._id || new mongoose.Types.ObjectId(),
                            channel: 'whatsapp',
                            phoneNumber: rawPhone,
                            status: 'active',
                            messages: [],
                            metadata: {
                                entityId: match?._id,
                                entityType: entityType,
                                isContact: entityType === 'Contact'
                            }
                        });
                    }

                    // 5. Append User Message to Thread
                    conversation.messages.push({ role: 'user', content: event.text });
                    await conversation.save();

                    // 6. Save as Activity for Timeline
                    const activity = await Activity.create({
                        type: 'WhatsApp',
                        subject: `WhatsApp from ${participantName}`,
                        entityType: match ? entityType : 'System',
                        entityId: match ? match._id : null,
                        description: event.text,
                        status: 'Completed',
                        performedBy: 'System',
                        details: {
                            platform: 'whatsapp',
                            direction: 'incoming',
                            sender: rawPhone,
                            message: event.text,
                            conversationId: conversation._id
                        },
                        timestamp: new Date()
                    });

                    // 7. Generate AI Bot Response (Professional Auto-Reply)
                    const chatHistoryContext = conversation.messages.map(m => `${m.role}: ${m.content}`).join('\n');
                    const aiResult = await generateBotResponse(event.text, chatHistoryContext);

                    if (aiResult.success && aiResult.reply) {
                        const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
                        const config = setting?.value;
                        const token = config?.token || config?.apiKey;
                        const phoneId = config?.phoneId;

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
        const templates = await WhatsAppService.getTemplates();
        res.json({ success: true, templates });
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
        const { platform, text, imageUrl } = req.body;
        if (!platform || !text || !imageUrl) {
            return res.status(400).json({ success: false, error: 'Platform, text, and imageUrl are required' });
        }

        let result;
        if (platform.toLowerCase() === 'facebook') {
            result = await facebookService.postToPage(text, imageUrl);
        } else if (platform.toLowerCase() === 'instagram') {
            result = await facebookService.postToInstagram(text, imageUrl);
        } else {
            return res.status(400).json({ success: false, error: 'Unsupported platform for posting' });
        }

        res.json(result);
    } catch (err) {
        console.error('[SocialController] postSocialMedia error:', err.message);
        res.status(500).json({ success: false, error: err.message });
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
