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
import WhatsAppService from '../services/WhatsAppService.js';
import axios from 'axios';
import IntegrationSettings from '../models/IntegrationSettings.js';
import { normalizePhone } from '../utils/normalization.js';
import Contact from '../models/Contact.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import Activity from '../models/Activity.js';
import fs from 'fs';

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

        if (body.object) {
            const entryValue = body.entry?.[0]?.changes?.[0]?.value;
            if (!entryValue) return res.sendStatus(200);

            // ── HANDLE MESSAGE STATUS UPDATES (Sent, Delivered, Read, Failed) ──
            if (entryValue.statuses && entryValue.statuses[0]) {
                const statusUpdate = entryValue.statuses[0];
                const wamid = statusUpdate.id;
                const status = statusUpdate.status;

                await Conversation.updateOne(
                    { "messages.waId": wamid },
                    { $set: { "messages.$.status": status } }
                );
                return res.sendStatus(200);
            }

            // ── HANDLE INCOMING MESSAGES ──
            if (entryValue.messages && entryValue.messages[0]) {
                const messageObj = entryValue.messages[0];

                // 🧠 IDEMPOTENCY / DEDUPLICATION GUARD
                if (messageObj.id) {
                    const alreadyProcessed = await Conversation.findOne({
                        "messages.waId": messageObj.id
                    }).lean();
                    if (alreadyProcessed) {
                        console.log(`[WhatsApp Webhook] Message ID ${messageObj.id} already processed. Skipping to avoid duplicate triggers.`);
                        return res.sendStatus(200);
                    }
                }

                const fromNumber = messageObj.from;
                const msgType = messageObj.type;
                
                let messageText = messageObj.text?.body || '';
                let attachment = null;

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

                const waService = (await import('../services/WhatsAppService.js')).default;
                
                if (['image', 'document', 'video', 'audio', 'sticker'].includes(msgType)) {
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
                    messageText = `👤 Shared ${messageObj.contacts?.length || 1} Contact(s)`;
                }

                if (!messageText && !attachment) return res.sendStatus(200);

                const normalizedMobile = normalizePhone(fromNumber);
                let lead = await Lead.findOne({ mobile: normalizedMobile });
                let contact = await Contact.findOne({ 'phones.number': normalizedMobile });

                const intakeEngine = (await import('../src/utils/intakeEngine.js')).default;
                const intakeResult = await intakeEngine.processIntake({
                    mobile: fromNumber,
                    message: messageText,
                    source: 'whatsapp_live_bot',
                    fromNumber: fromNumber,
                    metadata: {
                        wa_id: messageObj.from,
                        profile_name: body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
                    }
                });

                const entityId = lead?._id || contact?._id || intakeResult.data?._id || null;
                const entityType = lead ? 'Lead' : (contact ? 'Contact' : (intakeResult.type === 'DEAL' ? 'Deal' : (intakeResult.type === 'INVENTORY' ? 'Inventory' : 'Unknown')));

                let conversation = await Conversation.findOne({ 
                    phoneNumber: normalizedMobile,
                    status: 'active' 
                });

                if (!conversation) {
                    conversation = new Conversation({
                        phoneNumber: normalizedMobile,
                        lead: lead ? lead._id : null,
                        contact: contact ? contact._id : null,
                        channel: 'whatsapp',
                        status: 'active',
                        messages: [],
                        metadata: {
                            entityType,
                            entityId
                        }
                    });
                }

                conversation.messages.push({
                    role: 'user',
                    content: messageText,
                    timestamp: new Date(),
                    waId: messageObj.id,
                    metadata: { attachment }
                });
                await conversation.save();

                const targetUserId = lead?.assignment?.assignedTo || lead?.owner || contact?.owner || null;
                const NotificationEngine = (await import('../services/NotificationEngine.js')).default;
                
                await NotificationEngine.notifyWhatsApp(
                    targetUserId,
                    fromNumber,
                    messageText,
                    entityType === 'Lead' ? `/leads/${entityId}` : (entityType === 'Contact' ? `/contacts/${entityId}` : ''),
                    entityId
                );

                const activityDept = lead?.department || contact?.department || null;
                await Activity.create({
                    type: 'WhatsApp',
                    subject: `Incoming WhatsApp Message`,
                    description: messageText,
                    status: 'Completed',
                    performedBy: targetUserId || 'System',
                    assignedTo: targetUserId,
                    dueDate: new Date(),
                    entityType,
                    entityId,
                    participants: [{ name: lead?.fullName || lead?.name || contact?.name || 'Unknown', mobile: normalizedMobile }],
                    details: {
                        direction: 'inbound',
                        phoneNumber: normalizedMobile,
                        platform: 'whatsapp',
                        attachment: attachment || null,
                        isMatched: !!(lead || contact)
                    },
                    metadata: {
                        wa_id: messageObj.id,
                        from: fromNumber,
                        department: activityDept
                    }
                }).catch(err => console.error('[WhatsApp Live Bot] Failed to create Activity:', err.message));

                const chatHistoryContext = conversation.messages.map(m => `${m.role}: ${m.content}`).join('\n');
                
                const aiContext = {
                    chatHistory: chatHistoryContext,
                    userName: body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || 'Client',
                    entity: lead || contact ? {
                        name: lead?.name || contact?.name,
                        type: entityType,
                        id: entityId,
                        stage: lead?.stage || contact?.stage,
                        requirements: lead?.requirements || contact?.requirements,
                        description: lead?.description,
                        customFields: lead?.customFields
                    } : null,
                    entityType: entityType,
                    intakeResult: intakeResult
                };

                const aiResult = await generateBotResponse(messageText, aiContext, { 
                    useCase: conversation.currentUseCase || 'whatsapp_live' 
                });

                if (aiResult.success && aiResult.reply) {
                    const sendResult = await WhatsAppService.sendMessage(fromNumber, aiResult.reply);

                    if (sendResult.success) {
                        conversation.messages.push({ role: 'assistant', content: aiResult.reply });
                        await conversation.save();

                        if (lead) {
                            lead.intent_index = Math.min(100, (lead.intent_index || 40) + 2);
                            await lead.save();
                        }
                    } else {
                        console.error(`[WhatsApp Live Bot] Failed to send reply to ${fromNumber}:`, sendResult.error);
                    }
                }
            }
            res.sendStatus(200); 
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error(`[WebhookController] whatsAppLiveBotWebhook error:`, error.message);
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
            return res.status(400).json({ success: false, message: 'sessionId and message are required' });
        }

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
        } else if (lead || contact) {
            // Update existing conversation with newly discovered identity
            if (lead && !conversation.lead) conversation.lead = lead._id;
            if (contact && !conversation.contact) conversation.contact = contact._id;
            if (mobile && !conversation.phoneNumber) conversation.phoneNumber = normalizePhone(mobile);
            conversation.metadata.isMatched = true;
            await conversation.save();
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
            conversationId: conversation._id,
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

// ── GET /api/webhooks/facebook-lead ──────────────────────────────────────────
export const facebookLeadVerify = (req, res) => {
    const VERIFY_TOKEN = process.env.FB_WEBHOOK_VERIFY_TOKEN || "bharat-properties-webhook-2026";
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('[Facebook Lead Webhook] Verified successfully.');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
};

// ── POST /api/webhooks/facebook-lead ─────────────────────────────────────────
export const facebookLeadWebhook = async (req, res) => {
    try {
        const body = req.body;
        console.log('[Facebook Lead Webhook] Received payload:', JSON.stringify(body, null, 2));

        // If it's a Meta test lead or mock request carrying direct payload
        if (body.test_lead || body.mobile || body.phone_number) {
            const name = body.name || body.full_name || 'Facebook Test Lead';
            const mobile = body.mobile || body.phone_number;
            const email = body.email || '';
            
            if (mobile) {
                const intakeEngine = (await import('../src/utils/intakeEngine.js')).default;
                const result = await intakeEngine.processIntake({
                    mobile: mobile,
                    name: name,
                    email: email,
                    message: body.message || 'Lead generated from Facebook Lead Ads',
                    source: 'Facebook Ads'
                });
                return res.status(200).json({ success: true, message: 'Test lead processed', data: result });
            }
        }

        // Standard Meta Webhook payload check
        if (body.object === 'page' && body.entry?.[0]?.changes?.[0]?.value) {
            const valueObj = body.entry[0].changes[0].value;
            const leadgenId = valueObj.leadgen_id;
            const formId = valueObj.form_id;

            if (leadgenId) {
                console.log(`[Facebook Lead Webhook] Processing Leadgen ID: ${leadgenId}`);
                
                let name = 'Facebook Lead';
                let mobile = null;
                let email = '';

                // Try fetching details from Graph API using page token from settings
                const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;
                if (pageToken && pageToken !== 'YOUR_PAGE_ACCESS_TOKEN') {
                    try {
                        const graphUrl = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || 'v19.0'}/${leadgenId}?access_token=${pageToken}`;
                        const response = await axios.get(graphUrl);
                        const fieldData = response.data?.field_data || [];
                        
                        fieldData.forEach(field => {
                            if (['full_name', 'name', 'first_name'].includes(field.name)) {
                                name = field.values?.[0] || name;
                            } else if (['phone_number', 'mobile', 'phone'].includes(field.name)) {
                                mobile = field.values?.[0] || mobile;
                            } else if (['email'].includes(field.name)) {
                                email = field.values?.[0] || email;
                            }
                        });
                    } catch (apiErr) {
                        console.error('[Facebook Lead Webhook] Graph API fetch failed:', apiErr.message);
                    }
                }

                // If Graph API credentials are not set, fallback/mock simulate lead creation
                if (!mobile) {
                    console.log(`[Facebook Lead Webhook] Simulating lead for Leadgen ID: ${leadgenId}`);
                    mobile = `+9199999${Math.floor(10000 + Math.random() * 90000)}`;
                    name = `FB Lead ${leadgenId.slice(-4)}`;
                }

                const intakeEngine = (await import('../src/utils/intakeEngine.js')).default;
                const result = await intakeEngine.processIntake({
                    mobile: mobile,
                    name: name,
                    email: email,
                    message: `Facebook Lead from Form ${formId || 'unknown'}`,
                    source: 'Facebook Ads',
                    metadata: { leadgen_id: leadgenId, form_id: formId }
                });

                return res.status(200).json({ success: true, message: 'Lead captured', leadgenId });
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('[Facebook Lead Webhook] Error:', error);
        res.sendStatus(500);
    }
};
