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
    const VERIFY_TOKEN = "bharat_crm_ai_token_2025"; // A hardcoded secure string or from env
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
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
                const messageObj = body.entry[0].changes[0].value.messages[0];
                const fromNumber = messageObj.from;
                const messageText = messageObj.text?.body || '';

                if (!messageText) return res.sendStatus(200);

                const normalizedMobile = normalizePhone(fromNumber);

                // 1. Find or Create Identity (Lead or Contact)
                let lead = await Lead.findOne({ mobile: normalizedMobile });
                let contact = null;

                if (!lead) {
                    // Check if they exist as a Contact
                    contact = await Contact.findOne({ 'phones.number': normalizedMobile });
                    if (!contact) {
                        // Fallback search for contact with regex (fuzzy matching for formatted numbers)
                        contact = await Contact.findOne({ 'phones.number': { $regex: new RegExp(`${normalizedMobile}$`) } });
                    }
                }

                if (!lead && !contact) {
                    const sourceId = await resolveLeadLookup('Source', 'AI Bot WhatsApp');
                    lead = await Lead.create({
                        firstName: 'WhatsApp',
                        lastName: 'Lead',
                        mobile: normalizedMobile,
                        source: sourceId,
                        intent_index: 50,
                        tags: ['AI Auto-Engaged'],
                    });
                }

                const entityId = lead?._id || contact?._id;
                const entityType = lead ? 'Lead' : 'Contact';

                // 2. Find or Create Conversation
                let conversation = await Conversation.findOne({ 
                    $or: [
                        { lead: lead?._id },
                        { metadata: { entityId: contact?._id } },
                        { phoneNumber: normalizedMobile }
                    ],
                    status: 'active' 
                });

                if (!conversation) {
                    conversation = await Conversation.create({
                        lead: lead?._id || new mongoose.Types.ObjectId(), // Required field in schema, but we'll use metadata for Contacts
                        channel: 'whatsapp',
                        phoneNumber: normalizedMobile,
                        status: 'active',
                        messages: [],
                        metadata: {
                            entityId: entityId,
                            entityType: entityType,
                            isContact: !!contact
                        }
                    });
                }

                // 3. User Message
                conversation.messages.push({ role: 'user', content: messageText });
                await conversation.save();

                // 4. Generate AI Response
                // Convert past messages to simple context string for prompt
                const chatHistoryContext = conversation.messages.map(m => `${m.role}: ${m.content}`).join('\n');
                const aiResult = await generateBotResponse(messageText, chatHistoryContext);

                if (aiResult.success && aiResult.reply) {
                    // 5. Send strictly to WhatsApp Meta API (Standardized via SystemSetting)
                    const setting = await mongoose.model('SystemSetting').findOne({ key: 'meta_wa_config' }).lean();
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

                            // 6. Save AI reply to conversation
                            conversation.messages.push({ role: 'assistant', content: aiResult.reply });
                            await conversation.save();

                            // Optional: Update Intent Index dynamically if chat grows
                            lead.intent_index = Math.min(100, lead.intent_index + 2);
                            await lead.save();

                        } catch (waError) {
                            console.error('[WhatsApp Live Bot] Failed to send reply via Meta API:', waError.response?.data || waError.message);
                        }
                    } else {
                        console.error('[WhatsApp Live Bot] Missing WhatsApp credentials in SystemSettings (meta_wa_config).');
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
