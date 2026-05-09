/**
 * webhook.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles inbound lead capture from marketing campaigns.
 *
 * POST /api/webhooks/lead
 *   → Creates a new Lead in CRM with UTM attribution
 *   → Auto-assigns based on intent_index
 *   → Initiates NurtureBot flow
 *
 * POST /api/webhooks/whatsapp-reply
 *   → Processes WhatsApp reply events from Gupshup
 *   → Updates lead nurture state if they replied YES
 */

import Lead, { resolveLeadLookup } from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Conversation from '../models/Conversation.js';
import NurtureBot from '../services/NurtureBot.js';
import { createNotification } from './notification.controller.js';
import mongoose from 'mongoose';
import { generateBotResponse } from '../services/aiBot.service.js';
import axios from 'axios';
import IntegrationSettings from '../models/IntegrationSettings.js';
import { normalizePhone } from '../utils/normalization.js';
import Contact from '../models/Contact.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import Activity from '../models/Activity.js';

// ── POST /api/webhooks/lead ───────────────────────────────────────────────────
export const captureLeadWebhook = async (req, res) => {
    try {
        const {
            name,
            mobile,
            email,
            source_meta = {},   // { utm_source, utm_medium, utm_campaign, deal_id }
            message,
        } = req.body;

        if (!mobile) {
            return res.status(400).json({ success: false, message: 'Mobile number is required.' });
        }

        const [firstName, ...rest] = (name || 'Unknown').split(' ');
        const lastName = rest.join(' ');

        // Determine intent_index from UTM source
        const intentBySource = {
            'whatsapp': 60,
            'instagram': 50,
            'facebook': 50,
            'google': 55,
            'sms': 40,
            'email': 45,
            'direct': 70,
        };
        const utmSource = (source_meta.utm_source || '').toLowerCase();
        const intentIndex = intentBySource[utmSource] || 35;

        // Resolve 'source' to Lookup ObjectId (Lead schema requires ObjectId ref)
        const sourceId = await resolveLeadLookup('Source', source_meta.utm_source || 'Marketing Automation');

        // Create the lead
        const lead = await Lead.create({
            firstName,
            lastName,
            mobile,
            email: email || undefined,
            source: sourceId,
            source_meta,
            intent_index: intentIndex,
            description: message || `Lead from ${source_meta.utm_medium || 'campaign'} campaign`,
            tags: ['Marketing Automation'],
        });

        console.log(`[WebhookController] New lead created: ${lead._id} (${mobile}) intent: ${intentIndex}`);

        // Find the associated deal for context
        let deal = null;
        if (source_meta.deal_id && mongoose.Types.ObjectId.isValid(source_meta.deal_id)) {
            deal = await Deal.findById(source_meta.deal_id).lean();
        }

        // Notify any available user (role is an ObjectId, not plain string in this CRM)
        const adminUser = await mongoose.model('User').findOne({}).lean();
        if (adminUser) {
            await createNotification(
                adminUser._id,
                'lead',
                '🎯 New Campaign Lead',
                `New lead ${firstName} (${mobile}) from ${source_meta.utm_source || 'marketing campaign'}`,
                `/leads/${lead._id}`,
                { leadId: lead._id, source: source_meta }
            ).catch(err => console.error('[WebhookController] Notification error:', err.message));
        }

        // Initiate NurtureBot (fire-and-forget)
        NurtureBot.initiate(lead, deal).catch(err =>
            console.error('[WebhookController] NurtureBot initiate error:', err.message)
        );

        return res.status(201).json({
            success: true,
            message: 'Lead captured and nurture flow initiated.',
            leadId: lead._id,
        });

    } catch (error) {
        // Handle duplicate mobile gracefully
        if (error.code === 11000) {
            return res.status(200).json({
                success: true,
                message: 'Lead already exists in CRM. Updated intent score.',
            });
        }
        console.error('[WebhookController] captureLeadWebhook error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

// ── POST /api/webhooks/whatsapp-reply ────────────────────────────────────────
export const whatsAppReplyWebhook = async (req, res) => {
    try {
        // Gupshup sends: { mobile, message, type }
        const { mobile, message = '' } = req.body;

        if (!mobile) return res.status(400).json({ success: false });

        const normalizedMobile = normalizePhone(mobile); // Professional normalization
        const isPositive = /yes|haan|ha|interested|visit|book/i.test(message);

        if (isPositive) {
            // Find the lead and boost intent
            const lead = await Lead.findOne({ mobile: normalizedMobile });
            if (lead) {
                lead.intent_index = Math.min(100, (lead.intent_index || 40) + 25);
                lead.customFields = {
                    ...(lead.customFields || {}),
                    nurtureState: 'VISIT_BOOKED',
                    waRepliedAt: new Date(),
                };
                await lead.save();

                console.log(`[WebhookController] Lead ${lead._id} replied YES on WhatsApp. Intent boosted.`);

                // Notify any available user
                const adminUser = await mongoose.model('User').findOne({}).lean();
                if (adminUser) {
                    await createNotification(
                        adminUser._id,
                        'assignment',
                        '🔥 Hot Lead — WhatsApp Reply',
                        `${lead.firstName} (${lead.mobile}) replied YES! Intent: ${lead.intent_index}`,
                        `/leads/${lead._id}`,
                        { leadId: lead._id }
                    ).catch(() => {});
                }
            }
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('[WebhookController] whatsAppReplyWebhook error:', error);
        return res.status(500).json({ success: false });
    }
};

// ── GET /api/webhooks/whatsapp-live-bot ─────────────────────────────────────
// Facebook Webhook Verification
export const whatsAppLiveBotVerify = (req, res) => {
    const VERIFY_TOKEN = process.env.FB_WEBHOOK_VERIFY_TOKEN || "bharat-properties-webhook-2026"; // A hardcoded secure string or from env
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('[WhatsApp Live Bot] Webhook Verified.');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
};

// ── POST /api/webhooks/whatsapp-live-bot ────────────────────────────────────
// Incoming Live AI Message Processing
export const whatsAppLiveBotWebhook = async (req, res) => {
    try {
        const body = req.body;

        // 🛠️ SENIOR DIAGNOSTIC: Write to a persistent file to confirm hits
        const fs = await import('fs');
        const diagnosticLog = `[${new Date().toISOString()}] WhatsApp Live Webhook Received: ${JSON.stringify(body)}\n`;
        fs.appendFileSync('whatsapp_webhook_hits.log', diagnosticLog);

        if (body.object) {
            const entryValue = body.entry?.[0]?.changes?.[0]?.value;
            if (!entryValue) return res.sendStatus(200);

            // ── HANDLE MESSAGE STATUS UPDATES (Sent, Delivered, Read, Failed) ──
            if (entryValue.statuses && entryValue.statuses[0]) {
                const statusUpdate = entryValue.statuses[0];
                const wamid = statusUpdate.id;
                const status = statusUpdate.status; // 'delivered', 'read', 'failed', 'sent'
                
                let activityStatus = 'Sent';
                if (status === 'delivered') activityStatus = 'Delivered';
                if (status === 'read') activityStatus = 'Read';
                if (status === 'failed') activityStatus = 'Failed';

                // Update the Activity that matches this msgId (Intelligent fallback for Campaign vs Direct Message)
                const updatedActivity = await Activity.findOneAndUpdate(
                    { 
                        $or: [
                            { 'details.msgId':     wamid },
                            { 'details.messageId': wamid }
                        ]
                    },
                    { 
                        $set: { 
                            status: activityStatus,
                            'details.lastStatusUpdate': new Date(),
                            'details.actualStatus': status // Store raw Meta status for precision
                        } 
                    },
                    { new: true }
                );

                if (updatedActivity) {
                    console.log(`[WhatsApp Webhook] ✅ Updated Activity ${updatedActivity._id} to ${activityStatus}`);
                }
                return res.sendStatus(200);
            }

            // ── HANDLE INCOMING MESSAGES ──
            if (entryValue.messages && entryValue.messages[0]) {
                const messageObj = entryValue.messages[0];
                const fromNumber = messageObj.from;
                const msgType = messageObj.type; // 'text', 'image', 'document', 'location', 'contacts', etc.
                
                let messageText = messageObj.text?.body || '';
                let attachment = null;

                // 🚀 Professional Debug: Log raw payload if it contains the technical placeholder
                if (messageText.includes('[Media Attachment]')) {
                    console.log('[WhatsApp Webhook] Technical Placeholder Detected. Raw Message Object:', JSON.stringify(messageObj, null, 2));
                }

                // 🚀 Handle Interactive Messages (Buttons / Lists)
                if (msgType === 'button') {
                    messageText = messageObj.button?.text || messageObj.button?.payload || '';
                } else if (msgType === 'interactive') {
                    const interactive = messageObj.interactive;
                    if (interactive.type === 'button_reply') {
                        messageText = interactive.button_reply?.title || '';
                    } else if (interactive.type === 'list_reply') {
                        messageText = interactive.list_reply?.title || interactive.list_reply?.description || '';
                    }
                }

                // 🚀 Resolve Media Content
                const waService = (await import('../services/WhatsAppService.js')).default;
                
                if (msgType === 'image' || msgType === 'document' || msgType === 'video' || msgType === 'audio' || msgType === 'sticker') {
                    const mediaData = messageObj[msgType];
                    try {
                        const downloaded = await waService.downloadMedia(mediaData.id);
                        attachment = {
                            type: msgType,
                            url: downloaded.url,
                            mimeType: downloaded.mimeType,
                            filename: mediaData.filename || downloaded.fileName,
                            caption: mediaData.caption || ''
                        };
                        messageText = mediaData.caption || `[Sent ${msgType}]`;
                    } catch (err) {
                        console.error(`[WhatsApp Webhook] Media download failed:`, err.message);
                        messageText = `[Sent ${msgType} - Download Failed]`;
                    }
                } else if (msgType === 'location') {
                    const loc = messageObj.location;
                    attachment = {
                        type: 'location',
                        location: {
                            latitude: loc.latitude,
                            longitude: loc.longitude,
                            name: loc.name,
                            address: loc.address
                        }
                    };
                    messageText = `📍 Location: ${loc.name || loc.address || 'Shared Location'}`;
                } else if (msgType === 'contacts') {
                    attachment = {
                        type: 'contacts',
                        contacts: messageObj.contacts
                    };
                    messageText = `👤 Contact Card: ${messageObj.contacts[0]?.name?.formatted_name || 'Shared Contact'}`;
                }

                if (!messageText && !attachment) return res.sendStatus(200);

                const normalizedMobile = normalizePhone(fromNumber);
                
                // 🚀 Resolve Identity (Lead/Contact)
                let lead = await Lead.findOne({ mobile: normalizedMobile });
                let contact = await Contact.findOne({ 'phones.number': normalizedMobile });

                // 🚀 Enterprise Intake Engine Integration
                const intakeEngine = (await import('../src/utils/intakeEngine.js')).default;
                const intakeResult = await intakeEngine.processIntake({
                    mobile: fromNumber,
                    name: entryValue.contacts?.[0]?.profile?.name || 'WhatsApp User',
                    message: messageText,
                    source: 'WhatsApp'
                });

                if (intakeResult.type === 'LEAD') {
                    lead = intakeResult.data;
                } else if (intakeResult.type === 'DEAL' || intakeResult.type === 'INVENTORY') {
                    // Logic already handled in intakeEngine, but we capture the ref
                    contact = await Contact.findOne({ 'phones.number': normalizedMobile });
                }

                const entityId = lead?._id || contact?._id || intakeResult.data?._id || null;
                const entityType = lead ? 'Lead' : (contact ? 'Contact' : (intakeResult.type === 'DEAL' ? 'Deal' : (intakeResult.type === 'INVENTORY' ? 'Inventory' : 'Unknown')));

                // 2. Find or Create Conversation
                let conversation = await Conversation.findOne({ 
                    phoneNumber: normalizedMobile,
                    status: 'active' 
                });

                if (!conversation) {
                    conversation = await Conversation.create({
                        lead: lead?._id || null,
                        contact: contact?._id || null,
                        channel: 'whatsapp',
                        phoneNumber: normalizedMobile,
                        status: 'active',
                        messages: [],
                        metadata: { isMatched: !!(lead || contact) }
                    });
                }

                // 3. User Message
                conversation.messages.push({ 
                    role: 'user', 
                    content: messageText,
                    metadata: attachment ? { attachment } : null 
                });
                await conversation.save();

                // [NOTIFICATION] Notify Lead/Contact Owner
                const targetUserId = lead?.assignment?.assignedTo || lead?.owner || contact?.owner || null;
                const NotificationEngine = (await import('../services/NotificationEngine.js')).default;
                
                await NotificationEngine.notifyWhatsApp(
                    targetUserId,
                    lead?.firstName || contact?.fullName || contact?.name || fromNumber,
                    messageText,
                    lead ? `/leads/${lead._id}` : (contact ? `/contacts/${contact._id}` : '/communication'),
                    entityId
                );

                // 3.1 Create formal Activity Log
                const activityDept = lead?.department || contact?.department || null;
                await Activity.create({
                    type: 'WhatsApp',
                    subject: `Inbound WhatsApp: ${messageText.substring(0, 40)}${messageText.length > 40 ? '...' : ''}`,
                    entityId: entityId,
                    entityType: entityType,
                    status: 'Completed',
                    performedBy: 'WhatsApp User',
                    dueDate: new Date(),
                    description: messageText,
                    department: activityDept,
                    details: {
                        direction: 'incoming',
                        platform: 'whatsapp',
                        from: fromNumber,
                        conversationId: conversation._id,
                        attachment: attachment
                    }
                }).catch(err => console.error('[WhatsApp Live Bot] Failed to create Activity:', err.message));

                // 4. Generate AI Response (Only if it's text or has a caption)
                const chatHistoryContext = conversation.messages.map(m => `${m.role}: ${m.content}`).join('\n');
                
                // 🧠 Neural Context Injection (Phase 1: Identity Awareness)
                const aiContext = {
                    chatHistory: chatHistoryContext,
                    lead: lead ? {
                        id: lead._id,
                        firstName: lead.firstName,
                        lastName: lead.lastName,
                        mobile: lead.mobile,
                        status: lead.status,
                        intentIndex: lead.intent_index,
                        description: lead.description,
                        customFields: lead.customFields
                    } : null,
                    entityType: entityType,
                    intakeResult: intakeResult
                };

                const aiResult = await generateBotResponse(messageText, aiContext);

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
                                    to: fromNumber,
                                    type: "text",
                                    text: { preview_url: false, body: aiResult.reply }
                                },
                                {
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );

                            conversation.messages.push({ role: 'assistant', content: aiResult.reply });
                            await conversation.save();

                            if (lead) {
                                lead.intent_index = Math.min(100, (lead.intent_index || 40) + 2);
                                await lead.save();
                            }
                        } catch (waError) {
                            console.error('[WhatsApp Live Bot] Failed to send reply:', waError.response?.data || waError.message);
                        }
                    }
                }
            }
            res.sendStatus(200); // Always return 200 OK to FB
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('[WebhookController] whatsAppLiveBotWebhook error:', error);
        res.sendStatus(500);
    }
};

// ── POST /api/webhooks/website-chat ─────────────────────────────────────────
// Incoming Live AI Message Processing from Public Website Widget
export const websiteLiveBotWebhook = async (req, res) => {
    try {
        const { sessionId, message, name, mobile, email } = req.body;
        console.log(`[WEBSITE_CHAT_AUDIT] Incoming from Session: ${sessionId} | Msg: ${message}`);

        if (!sessionId || !message) {

        let lead = null;
        let contact = null;
        let entityType = 'Anonymous';
        let entityId = null;

        // If user provided a mobile number, process through Intake Engine
        if (mobile) {
            const normalizedMobile = normalizePhone(mobile);
            const intakeEngine = (await import('../src/utils/intakeEngine.js')).default;
            const intakeResult = await intakeEngine.processIntake({
                mobile: normalizedMobile,
                name: name || 'Website Visitor',
                email: email,
                message: message,
                source: 'Website Chatbot'
            });

            if (intakeResult.type === 'LEAD') {
                lead = intakeResult.data;
                entityType = 'Lead';
                entityId = lead._id;
            } else if (intakeResult.type === 'DEAL' || intakeResult.type === 'INVENTORY') {
                contact = await Contact.findOne({ 'phones.number': normalizedMobile });
                entityType = contact ? 'Contact' : 'Anonymous';
                entityId = contact?._id || null;
            } else if (intakeResult.type === 'CONTACT') {
                contact = intakeResult.data;
                entityType = 'Contact';
                entityId = contact._id;
            }
        }

        // Find or create Conversation
        let conversation = await Conversation.findOne({ 
            $or: [
                { 'metadata.sessionId': sessionId },
                ...(mobile ? [{ phoneNumber: normalizePhone(mobile), channel: 'website_chat' }] : [])
            ],
            status: 'active' 
        });

        if (!conversation) {
            conversation = await Conversation.create({
                lead: lead?._id || null,
                contact: contact?._id || null,
                channel: 'website_chat',
                phoneNumber: mobile ? normalizePhone(mobile) : null,
                status: 'active',
                messages: [],
                metadata: { sessionId, isMatched: !!(lead || contact) }
            });
        }

        // Add User Message
        conversation.messages.push({ role: 'user', content: message });
        await conversation.save();

        // Formal Activity Log (Only if identity is known)
        if (entityId) {
            const activityDept = lead?.department || contact?.department || null;
            await Activity.create({
                type: 'Website Chat',
                subject: `Website Chat: ${message.substring(0, 40)}${message.length > 40 ? '...' : ''}`,
                entityId: entityId,
                entityType: entityType,
                status: 'Completed',
                performedBy: name || 'Website Visitor',
                dueDate: new Date(),
                description: message,
                department: activityDept,
                details: {
                    direction: 'incoming',
                    platform: 'website',
                    sessionId: sessionId,
                    conversationId: conversation._id
                }
            }).catch(err => console.error('[Website Bot] Failed to create Activity:', err.message));
        }

        // Context Setup for AI
        const chatHistoryContext = conversation.messages.map(m => `${m.role}: ${m.content}`).join('\n');
        
        const aiContext = {
            chatHistory: chatHistoryContext,
            lead: lead ? {
                id: lead._id,
                firstName: lead.firstName,
                lastName: lead.lastName,
                mobile: lead.mobile,
                status: lead.status,
                intentIndex: lead.intent_index,
                description: lead.description,
                customFields: lead.customFields
            } : null,
            entityType: entityType,
            intakeResult: mobile ? { type: entityType, data: lead || contact } : null
        };

        // Generate AI Response using the dynamically configured `website_live_chat` useCase
        const aiResult = await generateBotResponse(message, aiContext, { useCase: 'website_live_chat' });

        if (aiResult.success && aiResult.reply) {
            conversation.messages.push({ role: 'assistant', content: aiResult.reply });
            await conversation.save();

            // If it's a known lead and the bot replied, boost intent slightly
            if (lead) {
                lead.intent_index = Math.min(100, (lead.intent_index || 40) + 2);
                await lead.save();
            }

            return res.status(200).json({ success: true, reply: aiResult.reply, sessionId });
        } else {
            return res.status(500).json({ success: false, message: 'AI generation failed: ' + (aiResult.error || 'Unknown error') });
        }

    } catch (error) {
        console.error('[WebhookController] websiteLiveBotWebhook error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// ── POST /api/webhooks/campaign/launch ──────────────────────────────────────
// Manual trigger: launch a campaign for an existing deal
export const launchCampaignManual = async (req, res) => {
    try {
        const { dealId } = req.body;
        if (!dealId || !mongoose.Types.ObjectId.isValid(dealId)) {
            return res.status(400).json({ success: false, message: 'Valid dealId is required.' });
        }

        const CampaignEngine = (await import('../services/CampaignEngine.js')).default;
        // Non-blocking
        CampaignEngine.launch(dealId).catch(err =>
            console.error('[WebhookController] Manual campaign launch error:', err)
        );

        return res.status(200).json({
            success: true,
            message: `Campaign launch initiated for Deal ${dealId}. Check logs for status.`,
        });
    } catch (error) {
        console.error('[WebhookController] launchCampaignManual error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
// ── POST /api/webhooks/exotel-callback ───────────────────────────────────────
export const exotelCallback = async (req, res) => {
    try {
        const {
            CallSid,
            Status,
            RecordingUrl,
            Duration,
            Direction,
            CustomField, // leadId
            To,          // Lead number
            From,        // Agent number
        } = req.body;

        console.log(`[ExotelWebhook] Call ${CallSid} status: ${Status} for Lead: ${CustomField}`);

        if (!CustomField || !mongoose.Types.ObjectId.isValid(CustomField)) {
            return res.status(200).json({ success: true, message: 'Invalid leadId in CustomField' });
        }

        const lead = await Lead.findById(CustomField);
        if (!lead) return res.status(200).json({ success: true, message: 'Lead not found' });

        // Update Nurture State based on Status
        if (Status === 'completed') {
            lead.customFields = {
                ...(lead.customFields || {}),
                nurtureState: 'HANDOFF', // Successfully connected!
                callSid: CallSid,
                callRecording: RecordingUrl,
                callDuration: Duration,
                callCompletedAt: new Date()
            };
            lead.intent_index = Math.min(100, (lead.intent_index || 50) + 15);
        } else {
            // Busy, No-Answer, etc.
            lead.customFields = {
                ...(lead.customFields || {}),
                nurtureState: 'FOLLOWUP_REQUIRED',
                lastCallFailure: Status,
                callSid: CallSid
            };
        }
        await lead.save();

        // 🔔 TRIGGER SENIOR NOTIFICATION
        // Dynamic import to avoid circular dependency if any
        const { default: NotificationEngine } = await import('../services/NotificationEngine.js');
        await NotificationEngine.notify({
            userId: lead.owner,
            type: 'messaging',
            title: `📞 Call Status: ${Status}`,
            message: `Lead: ${lead.fullName}. Outcome: ${Status}${Duration ? ` (${Duration}s)` : ''}`,
            link: `/leads/${lead._id}`,
            metadata: { leadId: lead._id, callSid: CallSid },
            priority: Status === 'completed' ? 'medium' : 'high'
        });

        // Log as an Activity
        const Activity = mongoose.model('Activity');
        if (Activity) {
            await Activity.create({
                type: 'Call',
                subject: `Automated Connect: ${Status}`,
                status: 'Completed',
                entityId: lead._id,
                entityType: 'Lead',
                description: `Exotel Call SID: ${CallSid}. Status: ${Status}. Duration: ${Duration}s. Recording: ${RecordingUrl || 'N/A'}`,
                details: {
                    direction: Direction || 'Outgoing',
                    duration: Duration,
                    outcome: Status,
                    recordingUrl: RecordingUrl,
                    sid: CallSid
                },
                dueDate: new Date()
            });
        }

        return res.status(200).send('OK');
    } catch (error) {
        console.error('[WebhookController] exotelCallback error:', error);
        return res.status(500).json({ success: false });
    }
};
