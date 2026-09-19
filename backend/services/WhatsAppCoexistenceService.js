import mongoose from 'mongoose';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import Contact from '../models/Contact.js';
import Conversation from '../models/Conversation.js';

export const resolveIntegration = async (phone_number_id, waba_id) => {
    if (phone_number_id) {
        const byPhone = await WhatsAppIntegration.findOne({ phoneNumberId: phone_number_id, status: { $ne: 'REVOKED' } }).lean();
        if (byPhone) return byPhone;
    }
    if (waba_id) {
        const byWaba = await WhatsAppIntegration.findOne({ wabaId: waba_id, status: { $ne: 'REVOKED' } }).lean();
        if (byWaba) return byWaba;
    }
    return null;
};

const normalizePhone = (num) => {
    if (!num) return null;
    let n = num.replace(/\D/g, '');
    if (n.startsWith('0')) n = n.substring(1);
    if (n.length === 10) n = '91' + n;
    return n;
};

const checkDuplicateMessage = async (waId) => {
    if (!waId) return false;
    return await Conversation.exists({
        $or: [{ 'messages.metadata.waId': waId }, { 'messages.waId': waId }]
    });
};

const getOrCreateConversation = async (contactPhone, integration = null) => {
    const filter = {
        phoneNumber: contactPhone,
        status: 'active'
    };
    if (integration?.phoneNumberId) {
        filter.businessPhoneNumberId = integration.phoneNumberId;
    }

    const setOnInsert = {
        phoneNumber: contactPhone,
        channel: 'whatsapp',
        status: 'active'
    };
    if (integration) {
        setOnInsert.whatsappIntegrationId = integration._id;
        setOnInsert.businessPhoneNumberId = integration.phoneNumberId;
        setOnInsert.businessPhoneNumber = integration.displayPhoneNumber;
    }

    return await Conversation.findOneAndUpdate(
        filter,
        { $setOnInsert: setOnInsert },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

export const processMessageEchoes = async (echoes, phone_number_id, waba_id) => {
    const integration = await resolveIntegration(phone_number_id, waba_id);
    if (!integration) return;

    for (const echo of echoes) {
        if (await checkDuplicateMessage(echo.id)) continue;

        // Echoes are sent BY the business (from) TO the customer (to)
        const customerMobile = normalizePhone(echo.to);
        if (!customerMobile) continue;

        // 1. Upsert Contact silently
        await Contact.findOneAndUpdate(
            { 'phones.number': customerMobile },
            { 
                $setOnInsert: { 
                    name: 'WhatsApp Contact', 
                    phones: [{ number: customerMobile, type: 'Personal' }] 
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // 2. Add message as assistant
        const conversation = await getOrCreateConversation(customerMobile, integration);
        const textContent = echo.text?.body || (echo.type ? `[${echo.type} message]` : 'Message sent from WhatsApp Business App');

        const msgObj = {
            role: 'assistant',
            content: textContent,
            timestamp: new Date(Number(echo.timestamp || 0) * 1000),
            metadata: {
                waId: echo.id,
                source: 'smb_message_echo',
                status: 'sent',
                businessPhoneNumberId: integration.phoneNumberId,
                integrationId: integration._id
            }
        };

        await Conversation.updateOne(
            { _id: conversation._id },
            { 
                $push: { messages: msgObj },
                $set: { 
                    'metadata.lastMessageAt': msgObj.timestamp,
                    whatsappIntegrationId: integration._id,
                    businessPhoneNumberId: integration.phoneNumberId,
                    businessPhoneNumber: integration.displayPhoneNumber
                }
            }
        );
    }
};

export const processAppStateSync = async (stateSyncs) => {
    for (const sync of stateSyncs) {
        if (sync.action === 'add' || sync.action === 'edit') {
            const mobile = normalizePhone(sync.contact?.phone_number);
            if (!mobile) continue;

            const name = sync.contact?.full_name || sync.contact?.first_name || 'WhatsApp Contact';

            await Contact.findOneAndUpdate(
                { 'phones.number': mobile },
                { 
                    $set: { name },
                    $setOnInsert: { phones: [{ number: mobile, type: 'Personal' }] }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }
        // If action === 'remove', we don't hard delete contacts in CRM as per rules.
    }
};

export const processHistory = async (historyBatches, phone_number_id, waba_id) => {
    const integration = await resolveIntegration(phone_number_id, waba_id);
    if (!integration) return;

    for (const batch of historyBatches) {
        const messages = batch.messages || [];
        for (const msg of messages) {
            if (await checkDuplicateMessage(msg.id)) continue;

            const isOutbound = msg.from === phone_number_id; // Check actual logic, but generally in history 'from' dictates direction
            const customerMobile = normalizePhone(isOutbound ? msg.to : msg.from);
            if (!customerMobile) continue;

            await Contact.findOneAndUpdate(
                { 'phones.number': customerMobile },
                { $setOnInsert: { name: 'WhatsApp Contact', phones: [{ number: customerMobile, type: 'Personal' }] } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            const conversation = await getOrCreateConversation(customerMobile, integration);
            const textContent = msg.text?.body || (msg.type ? `[${msg.type} message]` : 'Historical Message');

            const msgObj = {
                role: isOutbound ? 'assistant' : 'user',
                content: textContent,
                timestamp: new Date(Number(msg.timestamp || 0) * 1000),
                metadata: {
                    waId: msg.id,
                    source: 'history_import',
                    businessPhoneNumberId: integration.phoneNumberId,
                    integrationId: integration._id
                }
            };

            await Conversation.updateOne(
                { _id: conversation._id },
                { 
                    $push: { messages: msgObj },
                    $set: {
                        whatsappIntegrationId: integration._id,
                        businessPhoneNumberId: integration.phoneNumberId,
                        businessPhoneNumber: integration.displayPhoneNumber
                    }
                }
            );
        }
    }
};

export default {
    processMessageEchoes,
    processAppStateSync,
    processHistory
};
