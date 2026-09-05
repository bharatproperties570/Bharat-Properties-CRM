import whatsAppCoexistenceService from '../services/WhatsAppCoexistenceService.js';
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
import Inventory from '../models/Inventory.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import Activity from '../models/Activity.js';
import fs from 'fs';
import DealVerificationService from '../services/DealVerificationService.js';
import { extractWhatsAppChanges, extractCoexistenceChanges, isValidMetaSignature, isValidVerifyToken, normalizeTextMessage } from '../utils/whatsappWebhook.utils.js';
import { autoTriggerStageChange } from './activity.controller.js';

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

const getVerifyToken = async () => {
    const config = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
    return config?.value?.verifyToken || process.env.FB_WEBHOOK_VERIFY_TOKEN || '';
};

export const normalizeInboundMessage = async (message) => {
    const type = message?.type;
    const normalizedText = normalizeTextMessage(message);
    let text = normalizedText.text;
    let attachment = null;
    const flowResponse = normalizedText.flowResponse;

    if (['image', 'document', 'video', 'audio', 'sticker'].includes(type)) {
        const media = message[type] || {};
        try {
            const downloaded = await WhatsAppService.downloadMedia(media.id);
            attachment = { type, url: downloaded.url, mimeType: downloaded.mimeType, filename: media.filename || downloaded.fileName, caption: media.caption || '' };
            text = media.caption || `[Sent ${type}]`;
        } catch (error) {
            console.error('[WhatsApp Live Bot] Media download failed:', error.message);
            text = `[Sent ${type} - Download Failed]`;
        }
    } else if (type === 'location') {
        const location = message.location || {};
        attachment = { type: 'location', location: { latitude: location.latitude, longitude: location.longitude, name: location.name, address: location.address } };
        text = `📍 Location: ${location.name || location.address || 'Shared Location'}`;
    } else if (type === 'contacts') {
        attachment = { type: 'contacts', contacts: message.contacts || [] };
        text = `👤 Shared ${message.contacts?.length || 1} Contact(s)`;
    }
    return { text, attachment, flowResponse };
};

export const reserveInboundMessage = async ({ mobile, message, text, attachment }) => {
    if (!message.id) return { duplicate: false, conversation: null };

    // Quick check across all conversations for idempotency
    const existing = await Conversation.exists({ $or: [{ 'messages.metadata.waId': message.id }, { 'messages.waId': message.id }] });
    if (existing) return { duplicate: true, conversation: null };

    // Step 1: Find or create the active conversation for this user safely
    // We avoid checking waId here to prevent `upsert: true` from creating a duplicate
    // active conversation if a concurrent thread just pushed this waId.
    const conversation = await Conversation.findOneAndUpdate(
        { phoneNumber: mobile, status: 'active' },
        { $setOnInsert: { phoneNumber: mobile, channel: 'whatsapp', status: 'active' } },
        { new: true, upsert: true }
    );

    // Step 2: Push the new message into the conversation, provided it doesn't already have this waId
    const now = new Date();
    const updated = await Conversation.findOneAndUpdate(
        { _id: conversation._id, 'messages.metadata.waId': { $ne: message.id }, 'messages.waId': { $ne: message.id } },
        {
            $push: { messages: { role: 'user', content: text, timestamp: now, metadata: { waId: message.id, attachment: attachment || null } } },
            $inc: { 'metadata.unreadCount': 1 },
            $set: { 'metadata.lastMessageAt': now }
        },
        { new: true }
    );

    if (!updated) {
        // The document wasn't updated because it already contains the waId (concurrent race won by another thread)
        return { duplicate: true, conversation: null };
    }

    return { duplicate: false, conversation: updated };
};

export const applyFlowFeedback = async (mobile, flowResponse, flowSummary) => {
    if (!flowResponse) return;
    try {
        const phones = [mobile, mobile.startsWith('+') ? mobile.slice(1) : '+' + mobile];
        const inventory = await Inventory.findOne({
            $or: [
                { 'owners.phones.number': { $in: phones } },
                { 'ownerPhone': { $in: phones } },
                { 'associates.contact.phones.number': { $in: phones } },
                { 'associatedPhone': { $in: phones } }
            ]
        }).sort({ lastContactedAt: -1 }).populate('owners');

        if (!inventory) {
            console.warn(`[WhatsApp Flow] No matching Inventory found for mobile ${mobile}`);
            return;
        }

        let result = 'Not Interested';
        let reason = 'Unknown';
        let status = 'Active';
        let intent = null;
        let scheduleFollowUp = false;

        if (flowResponse.interested) {
            result = 'Interested';
            scheduleFollowUp = true;
            if (flowResponse.interested === 'ready_to_sell') { reason = 'Ready to Sell Now'; intent = 'For Sale'; }
            else if (flowResponse.interested === 'wants_to_buy') { reason = 'Wants to Buy (Invest)'; intent = 'For Sale'; }
            else if (flowResponse.interested === 'sell_and_buy') { reason = 'Sell & Buy (Re-invest)'; intent = 'For Sale'; }
            else if (flowResponse.interested === 'wants_to_rent') { reason = 'Wants to Rent'; intent = 'For Rent'; }
        } else if (flowResponse.not_interested) {
            result = 'Not Interested';
            if (flowResponse.not_interested === 'sold_out') { reason = 'Sold Out'; status = 'Sold Out'; }
            else if (flowResponse.not_interested === 'rented_out') { reason = 'Rented Out'; status = 'Rented Out'; }
            else if (flowResponse.not_interested === 'unreasonable_demand') { reason = 'Unreasonable demand'; status = 'Inactive'; }
            else if (flowResponse.not_interested === 'plan_dropped') { reason = 'Plan Dropped/Personal'; status = 'Inactive'; }
            else if (flowResponse.not_interested === 'family_dispute') { reason = 'Family Dispute'; status = 'Inactive'; }
            else if (flowResponse.not_interested === 'self_use') { reason = 'Self Use'; status = 'Inactive'; }
            else if (flowResponse.not_interested === 'sell_future') { reason = 'Sell in Future'; status = 'Inactive'; scheduleFollowUp = true; }
            else if (flowResponse.not_interested === 'inquiring_rates') { reason = 'Inquiring Rates Only'; status = 'Inactive'; }
        }

        const customMessage = flowResponse.message || '';
        const interactionNote = `${result} (${reason}) - Flow Auto-Reply: ${customMessage}`;

        const updatePayload = {
            $push: {
                interactions: {
                    note: interactionNote,
                    actor: mobile,
                    details: { result, reason, feedback: customMessage, source: 'WhatsApp Flow' }
                }
            },
            $set: {
                lastContactedAt: new Date().toISOString(),
                lastContactDate: new Date().toLocaleDateString('en-GB'),
                lastContactUser: 'Auto (Flow)',
                remarks: `${result} (${reason}): ${customMessage}`,
                status: status
            }
        };

        if (intent && !inventory.intent?.includes(intent)) updatePayload.$addToSet = { intent };

        let nextActionDateObj = null;
        if (flowResponse.call_date && flowResponse.call_date !== 'undefined' && flowResponse.call_date !== 'null') {
            const parsedDate = new Date(parseInt(flowResponse.call_date));
            if (!isNaN(parsedDate.getTime())) {
                const dateStr = parsedDate.toISOString().split('T')[0];
                let timeStr = '10:00';
                if (flowResponse.call_time === 'afternoon') timeStr = '14:00';
                else if (flowResponse.call_time === 'evening') timeStr = '17:00';
                nextActionDateObj = new Date(`${dateStr}T${timeStr}:00`);
                updatePayload.$set.followUpDate = nextActionDateObj.toISOString();
                scheduleFollowUp = true;
            }
        }

        await Inventory.findByIdAndUpdate(inventory._id, updatePayload);

        if (scheduleFollowUp && nextActionDateObj) {
            await Activity.create({
                type: 'Follow Up',
                subject: `Flow Follow-up: Call for Unit ${inventory.unitNo}`,
                status: 'Pending',
                priority: 'High',
                scheduledDate: nextActionDateObj,
                dueDate: nextActionDateObj,
                relatedTo: [{ id: inventory._id, name: inventory.unitNo, model: 'Inventory' }],
                participants: [{ name: 'Owner (Flow)', mobile }],
                description: `Owner requested follow-up via WhatsApp Flow.\nReason: ${reason}\nMessage: ${customMessage}`
            });
        }

        if (inventory.assignedTo) {
            const NotificationEngine = (await import('../services/NotificationEngine.js')).default;
            await NotificationEngine.notifyWhatsApp(inventory.assignedTo, mobile, `📱 Flow Feedback Received! Owner of Unit ${inventory.unitNo} submitted feedback via WhatsApp: ${result} (${reason}).`, `/inventory/${inventory._id}`, inventory._id);
        }
    } catch (e) {
        console.error(`[WhatsApp Flow] Error processing Flow submission for ${mobile}:`, e.message);
    }
};

const reviveTerminalLeadOnInboundWhatsApp = async (lead, text) => {
    if (!lead?.stage) return;
    const stageName = lead.stage.lookup_value || '';
    const terminalStages = ['closed', 'closed lost', 'closed won', 'dormant', 'stalled'];
    if (!terminalStages.some(stage => stageName.toLowerCase().includes(stage))) return;
    const activity = await Activity.create({
        entityType: 'Lead', entityId: lead._id, type: 'WhatsApp',
        subject: 'Inbound WhatsApp Revival', description: `Inbound WhatsApp message received: "${text}"`,
        status: 'Completed', dueDate: new Date(), createdBy: lead.owner || null
    });
    await autoTriggerStageChange(activity._id, lead.owner);
    if (lead.owner) {
        await createNotification(lead.owner, 'leads', '🔥 Lead Auto-Revived!', `Lead ${lead.firstName || ''} was revived from ${stageName} due to an inbound WhatsApp message.`, `/leads/${lead._id}`);
    }
};

// ── GET /api/webhooks/whatsapp-live-bot ─────────────────────────────────────
export const whatsAppLiveBotVerify = async (req, res) => {
    try {
        const token = await getVerifyToken();
        if (isValidVerifyToken(req.query['hub.mode'], req.query['hub.verify_token'], token)) return res.status(200).send(req.query['hub.challenge']);
        return res.sendStatus(403);
    } catch (error) {
        console.error('[WhatsApp Live Bot] Verification error:', error.message);
        return res.sendStatus(500);
    }
};

const processInboundMessage = async (message, value) => {
    const fromNumber = message?.from;
    const mobile = normalizePhone(fromNumber);
    if (!mobile) return;
    const { text, attachment, flowResponse } = await normalizeInboundMessage(message);
    if (!text && !attachment) return;

    const reservation = await reserveInboundMessage({ mobile, message, text, attachment });
    if (reservation.duplicate) return;

    const conversation = reservation.conversation;
    if (!conversation) {
        console.warn(`[WhatsApp Webhook] Null conversation returned for message ${message?.id}. Skipping to avoid crash.`);
        return;
    }

    try {
        if (flowResponse) await applyFlowFeedback(mobile, flowResponse, text);

        // Deal verification remains a distinct domain flow and must not fall through to generic AI.
        if (await DealVerificationService.processVerificationReply(mobile, text, { message, value })) return;

        const phones = [mobile, mobile.startsWith('+') ? mobile.slice(1) : '+' + mobile];
        let lead = await Lead.findOne({ mobile: { $in: phones } });
        let contact = await Contact.findOne({ 'phones.number': { $in: phones } });
        const intakeEngine = (await import('../src/utils/intakeEngine.js')).default;
        const intakeResult = await intakeEngine.processIntake({ mobile: fromNumber, message: text, source: 'whatsapp_live_bot', metadata: { wa_id: message.from, profile_name: value?.contacts?.[0]?.profile?.name } });
        if (!lead && intakeResult.type === 'LEAD') lead = intakeResult.data;
        if (!contact && intakeResult.type === 'CONTACT') contact = intakeResult.data;
        if (lead) await reviveTerminalLeadOnInboundWhatsApp(await Lead.findById(lead._id).populate('stage'), text);

        const entityId = lead?._id || contact?._id || intakeResult.data?._id || null;
        const entityType = lead ? 'Lead' : (contact ? 'Contact' : (intakeResult.type === 'DEAL' ? 'Deal' : (intakeResult.type === 'INVENTORY' ? 'Inventory' : 'Unknown')));

        conversation.lead = lead?._id || conversation.lead;
        conversation.contact = contact?._id || conversation.contact;
        conversation.metadata = { ...(conversation.metadata || {}), entityType, entityId };
        await conversation.save();

        try {
            const { WorkflowEngine } = await import('../src/utils/WorkflowEngine.js');
            await WorkflowEngine.fireEvent('communication', 'message_received', conversation, lead?.companyId || contact?.companyId || null);
        } catch (error) { console.error('[WorkflowEngine] message_received trigger failed:', error.message); }

        const targetUserId = lead?.assignment?.assignedTo || lead?.owner || contact?.owner || null;
        const NotificationEngine = (await import('../services/NotificationEngine.js')).default;
        await NotificationEngine.notifyWhatsApp(targetUserId, fromNumber, text, entityType === 'Lead' ? `/leads/${entityId}` : (entityType === 'Contact' ? `/contacts/${entityId}` : ''), entityId);

        await Activity.create({
            type: 'WhatsApp', subject: 'Incoming WhatsApp Message', description: text, status: 'Completed', performedBy: targetUserId || 'System', assignedTo: targetUserId, dueDate: new Date(),
            entityType, entityId, participants: [{ name: lead?.fullName || lead?.name || contact?.name || 'Unknown', mobile }],
            details: { direction: 'inbound', phoneNumber: mobile, platform: 'whatsapp', attachment: attachment || null, isMatched: !!(lead || contact), waId: message.id, from: fromNumber, department: lead?.department || contact?.department || null }
        });

        const aiResult = await generateBotResponse(text, {
            chatHistory: conversation.messages.map(item => `${item.role}: ${item.content}`).join('\n'), userName: value?.contacts?.[0]?.profile?.name || 'Client',
            entity: lead || contact ? { name: lead?.name || contact?.name, type: entityType, id: entityId, stage: lead?.stage || contact?.stage, requirements: lead?.requirements || contact?.requirements, description: lead?.description, customFields: lead?.customFields } : null,
            entityType, intakeResult
        }, { useCase: conversation.currentUseCase || 'whatsapp_live' });
        if (aiResult.success && aiResult.reply) {
            const result = await WhatsAppService.sendMessage(fromNumber, aiResult.reply);
            if (result.success) {
                conversation.messages.push({ role: 'assistant', content: aiResult.reply, metadata: { waId: result.messageId || null, inReplyToWaId: message.id } });
                await conversation.save();
                if (lead) { lead.intent_index = Math.min(100, (lead.intent_index || 40) + 2); await lead.save(); }
            }
        }
    } catch (error) {
        // Release the reservation so Meta can safely retry a failed message.
        if (message.id && conversation && conversation._id) {
            await Conversation.updateOne({ _id: conversation._id }, { $pull: { messages: { 'metadata.waId': message.id } }, $inc: { 'metadata.unreadCount': -1 } });
        }
        throw error;
    }
};

// ── POST /api/webhooks/whatsapp-live-bot ────────────────────────────────────
export const whatsAppLiveBotWebhook = async (req, res) => {
    const appSecret = process.env.FB_APP_SECRET;
    if (!isValidMetaSignature(req.rawBody, req.headers['x-hub-signature-256'], appSecret)) return res.sendStatus(401);
    if (req.body?.object !== 'whatsapp_business_account') return res.sendStatus(404);

    // 1. Acknowledge Meta immediately to prevent timeouts and duplicate retries
    res.sendStatus(200);

    // 2. Process asynchronously
    setImmediate(async () => {
        try {
            // 1. Standard Inbound (Messages & Statuses)
            for (const value of extractWhatsAppChanges(req.body)) {
                for (const status of value.statuses || []) {
                    await Conversation.updateOne({ $or: [{ 'messages.metadata.waId': status.id }, { 'messages.waId': status.id }] }, { $set: { 'messages.$.metadata.status': status.status, 'messages.$.metadata.statusAt': new Date(Number(status.timestamp || 0) * 1000) } });
                }
                for (const message of value.messages || []) await processInboundMessage(message, value);
            }
            
            // 2. Coexistence Sync (History, State, Echoes)
            for (const change of extractCoexistenceChanges(req.body)) {
                const waba_id = req.body.entry?.[0]?.id;
                const phone_number_id = change.value?.metadata?.phone_number_id; // standard Meta metadata structure

                if (change.field === 'smb_message_echoes' && change.value.message_echoes) {
                    await whatsAppCoexistenceService.processMessageEchoes(change.value.message_echoes, phone_number_id, waba_id);
                } else if (change.field === 'smb_app_state_sync' && change.value.state_sync) {
                    await whatsAppCoexistenceService.processAppStateSync(change.value.state_sync);
                } else if (change.field === 'history' && change.value.history) {
                    await whatsAppCoexistenceService.processHistory(change.value.history, phone_number_id, waba_id);
                }
            }
        } catch (error) {
            console.error('[WebhookController] Async processing error:', error.message);
        }
    });
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
