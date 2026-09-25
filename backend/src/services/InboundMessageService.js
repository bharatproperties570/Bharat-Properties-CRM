import mongoose from 'mongoose';
import Conversation from '../../models/Conversation.js';
import Activity from '../../models/Activity.js';
import OutboxEvent from '../../models/OutboxEvent.js';
import Lead from '../../models/Lead.js';
import Contact from '../../models/Contact.js';
import intakeEngine from '../utils/intakeEngine.js';

export const InboundMessageService = {
    /**
     * Extracts text and minimal metadata for processing.
     * Media download is deferred to background worker.
     */
    normalizeMessage: (message) => {
        const type = message?.type;

        let text = '';
        let attachment = null;
        let flowResponse = null;

        if (type === 'text') {
            text = message.text?.body || '';
        } else if (type === 'interactive') {
            const interactive = message.interactive || {};
            if (interactive.type === 'button_reply') text = interactive.button_reply?.title || '';
            else if (interactive.type === 'list_reply') text = interactive.list_reply?.title || '';
            else if (interactive.type === 'nfm_reply') {
                try {
                    flowResponse = JSON.parse(interactive.nfm_reply?.response_json || '{}');
                    text = `[Flow Submitted: ${interactive.nfm_reply?.name || 'Unknown'}]`;
                } catch (e) { text = `[Flow Submitted]`; }
            }
        } else if (['image', 'document', 'video', 'audio', 'sticker'].includes(type)) {
            const media = message[type] || {};
            attachment = {
                type,
                id: media.id,
                mimeType: media.mime_type,
                filename: media.filename,
                caption: media.caption || ''
            };
            text = media.caption || `[Sent ${type}]`;
        } else if (type === 'location') {
            const location = message.location || {};
            attachment = { type: 'location', location: { latitude: location.latitude, longitude: location.longitude, name: location.name, address: location.address } };
            text = `📍 Location: ${location.name || location.address || 'Shared Location'}`;
        } else if (type === 'contacts') {
            attachment = { type: 'contacts', contacts: message.contacts || [] };
            text = `👤 Shared ${message.contacts?.length || 1} Contact(s)`;
        }

        return { text, attachment, flowResponse };
    },

    /**
     * Transactional processing of an inbound message.
     */
    processInboundMessageTx: async (message, value) => {
        const mobile = message.from;
        if (!mobile) return { success: false, reason: 'missing_mobile' };

        const businessPhoneNumberId = value?.metadata?.phone_number_id || null;
        const businessPhoneNumber = value?.metadata?.display_phone_number || null;

        let integrationId = null;
        if (businessPhoneNumberId) {
            try {
                const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || mongoose.model('WhatsAppIntegration');
                const integration = await WhatsAppIntegration.findOne({ phoneNumberId: businessPhoneNumberId, status: 'ACTIVE' }).lean();
                if (integration) integrationId = integration._id;
            } catch (_) {}
        }

        const { text, attachment, flowResponse } = InboundMessageService.normalizeMessage(message);
        if (!text && !attachment) return { success: false, reason: 'empty_payload' };

        const session = await mongoose.startSession();

        try {
            return await session.withTransaction(async () => {
                // 1. Conversation lookup & creation
                const query = { phoneNumber: mobile, status: 'active' };
                if (businessPhoneNumberId) query.businessPhoneNumberId = businessPhoneNumberId;

                const setOnInsert = { phoneNumber: mobile, channel: 'whatsapp', status: 'active' };
                if (businessPhoneNumberId) setOnInsert.businessPhoneNumberId = businessPhoneNumberId;
                if (integrationId) setOnInsert.whatsappIntegrationId = integrationId;
                if (businessPhoneNumber) setOnInsert.businessPhoneNumber = businessPhoneNumber;

                const conversation = await Conversation.findOneAndUpdate(
                    query,
                    { $setOnInsert: setOnInsert },
                    { new: true, upsert: true, session }
                );

                // 2. Atomic duplicate suppression and message push
                const now = new Date();
                const updateSet = { 'metadata.lastMessageAt': now };
                if (businessPhoneNumberId) updateSet.businessPhoneNumberId = businessPhoneNumberId;
                if (integrationId) updateSet.whatsappIntegrationId = integrationId;
                if (businessPhoneNumber) updateSet.businessPhoneNumber = businessPhoneNumber;

                const updatedConversation = await Conversation.findOneAndUpdate(
                    { _id: conversation._id, 'messages.metadata.waId': { $ne: message.id }, 'messages.waId': { $ne: message.id } },
                    {
                        $push: {
                            messages: {
                                role: 'user',
                                content: text,
                                timestamp: now,
                                metadata: {
                                    waId: message.id,
                                    attachment: attachment || null,
                                    businessPhoneNumberId: businessPhoneNumberId || null,
                                    integrationId: integrationId || null,
                                    flowResponse: flowResponse || null
                                }
                            }
                        },
                        $inc: { 'metadata.unreadCount': 1 },
                        $set: updateSe
                    },
                    { new: true, session }
                );

                if (!updatedConversation) {
                    // Duplicate webhook delivery suppressed atomically.
                    return { success: true, duplicate: true };
                }

                // 3. IntakeEngine - Resolve/create Lead/Contact within the transaction
                const intakeResult = await intakeEngine.processIntake({
                    mobile,
                    message: text,
                    source: 'whatsapp_live_bot',
                    metadata: { wa_id: message.from, profile_name: value?.contacts?.[0]?.profile?.name }
                }, { session });

                const phones = [mobile, mobile.startsWith('+') ? mobile.slice(1) : '+' + mobile];
                let lead = await Lead.findOne({ mobile: { $in: phones } }).session(session).lean();
                let contact = await Contact.findOne({ 'phones.number': { $in: phones } }).session(session).lean();

                if (!lead && intakeResult.type === 'LEAD') lead = intakeResult.data;
                if (!contact && intakeResult.type === 'CONTACT') contact = intakeResult.data;

                const entityId = lead?._id || contact?._id || intakeResult.data?._id || null;
                const entityType = lead ? 'Lead' : (contact ? 'Contact' : (intakeResult.type === 'DEAL' ? 'Deal' : (intakeResult.type === 'INVENTORY' ? 'Inventory' : 'Unknown')));
                const targetUserId = lead?.assignment?.assignedTo || lead?.owner || contact?.owner || null;

                // Sync entity info to conversation
                updatedConversation.lead = lead?._id || updatedConversation.lead;
                updatedConversation.contact = contact?._id || updatedConversation.contact;
                updatedConversation.metadata = { ...(updatedConversation.metadata || {}), entityType, entityId };
                await updatedConversation.save({ session });

                // 4. Create Activity
                const activities = await Activity.create([{
                    type: 'WhatsApp', subject: 'Incoming WhatsApp Message', description: text, status: 'Completed', performedBy: targetUserId || 'System', assignedTo: targetUserId, dueDate: new Date(),
                    entityType, entityId, participants: [{ name: lead?.fullName || lead?.name || contact?.name || 'Unknown', mobile }],
                    details: {
                        direction: 'inbound',
                        phoneNumber: mobile,
                        platform: 'whatsapp',
                        attachment: attachment || null,
                        isMatched: !!(lead || contact),
                        waId: message.id,
                        from: mobile,
                        department: lead?.department || contact?.department || null,
                        businessPhoneNumberId: businessPhoneNumberId || null,
                        integrationId: integrationId || null
                    }
                }], { session });

                const activity = activities[0];

                // 5. Create ActivityCreated OutboxEven
                await OutboxEvent.create([{
                    aggregateType: 'Activity',
                    aggregateId: activity._id,
                    eventType: 'ActivityCreated',
                    payload: activity.toObject()
                }], { session });

                return { success: true, activity, duplicate: false };
            });
        } finally {
            await session.endSession();
        }
    }
};

export default InboundMessageService;
