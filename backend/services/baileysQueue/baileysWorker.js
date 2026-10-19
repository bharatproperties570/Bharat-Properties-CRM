import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import config from '../../config/env.js';
import { BaileysConnectionManager } from './BaileysConnectionManager.js';
import { normalizePhone } from '../../utils/normalization.js';

const redisConnectionOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
};

// ── In-Memory Identity Cache (Max 5,000 entries, 1-hour TTL) ─────────────────
const MAX_IDENTITY_CACHE = 5000;
const IDENTITY_CACHE_TTL_MS = 60 * 60 * 1000;
const phoneIdentityCache = new Map();

function getCachedIdentity(phone10) {
    if (!phone10) return null;
    const cached = phoneIdentityCache.get(phone10);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > IDENTITY_CACHE_TTL_MS) {
        phoneIdentityCache.delete(phone10);
        return null;
    }
    return cached.data;
}

function setCachedIdentity(phone10, data) {
    if (!phone10) return;
    if (phoneIdentityCache.size >= MAX_IDENTITY_CACHE) {
        const oldestKey = phoneIdentityCache.keys().next().value;
        if (oldestKey) phoneIdentityCache.delete(oldestKey);
    }
    phoneIdentityCache.set(phone10, { data, timestamp: Date.now() });
}

// ── Real-Time Property Stream Detection Filter (<10ms) ───────────────────────
const PROPERTY_KEYWORDS_REGEX = /\b(plot|flat|floor|bhk|sector|sec\-?\d|marla|kanal|gaz|sqyd|sq\s?yd|sqft|sq\s?ft|bigha|acre|cr|crore|lac|lakh|sco|scf|dss|kothi|villa|house|shop|showroom|booth|office|penthouse|duplex|apartment|available|sale|sell|rent|lease|buy|budget|commercial|residential|industrial|farm|farmhouse|warehouse|godown|factory|builder|property|dealer|real\s?estate|auction|bank\s?property|pre\s?rented|investment|registry|colony|township|society|jlpl|bestech|omaxe|dlf|gmada|puda|huda|chandigarh|mohali|zirakpur|panchkula|kharar|derabassi|ambala|kurukshetra|karnal|panipat|ludhiana|jalandhar|amritsar|bathinda|patiala)\b/i;

function isLikelyPropertyDeal(text) {
    if (!text || text.length < 15) return false;
    if (/^\u200e/.test(text)) return false; // WhatsApp system message
    if (/^(image|video|audio|document|sticker)\s+omitted$/i.test(text)) return false;
    if (/joined using this group|was added|left$/i.test(text)) return false;
    if (/^(good morning|good night|happy|congratulations|namaste|jai|om|🙏|🎉|❤️)/i.test(text)) return false;
    return PROPERTY_KEYWORDS_REGEX.test(text);
}

// Outbound Message Queue Worker
export const baileysWorker = new Worker('whatsapp_baileys_outbound', async (job) => {
    const { integrationId, to, text, mediaUrl } = job.data;

    const sock = BaileysConnectionManager.getSocket(integrationId);
    if (!sock) {
        throw new Error(`[BaileysWorker] Socket not found or disconnected for integration ${integrationId}`);
    }

    try {
        const jid = to.includes('@s.whatsapp.net') || to.includes('@g.us') ? to : `${to}@s.whatsapp.net`;
        
        // Anti-ban pacing: 3 to 5 seconds jitter
        const jitter = Math.floor(Math.random() * 2000) + 3000;
        await new Promise(resolve => setTimeout(resolve, jitter));

        // Simulate human typing
        await sock.presenceSubscribe(jid);
        await new Promise(resolve => setTimeout(resolve, 500));
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sock.sendPresenceUpdate('paused', jid);

        await sock.sendMessage(jid, { text });

        return { success: true, jid };
    } catch (error) {
        console.error(`[BaileysWorker] Error sending outbound message:`, error);
        throw error;
    }
}, { connection: redisConnectionOptions, concurrency: 1 });

baileysWorker.on('failed', (job, err) => {
    console.error(`[BaileysWorker] Outbound job ${job?.id} failed:`, err.message);
});

baileysWorker.on('error', (err) => {
    if (!err.message?.includes('ECONNREFUSED')) {
        console.warn('[BaileysWorker] Outbound worker error:', err.message);
    }
});

// ── Phase 2: Inbound Decoupled Queue & Worker ─────────────────────────────────

export const baileysInboundQueue = new Queue('whatsapp_baileys_inbound', {
    connection: redisConnectionOptions,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 }
    }
});

baileysInboundQueue.on('error', (err) => {
    if (!err.message?.includes('ECONNREFUSED')) {
        console.warn('[BaileysInboundQueue] Queue error:', err.message);
    }
});

export async function enqueueBaileysInboundMessage(jobData) {
    if (!jobData) return null;
    try {
        const jobId = jobData.messageId ? `inbound_${jobData.messageId}` : undefined;
        return await baileysInboundQueue.add('inbound_msg', jobData, { jobId });
    } catch (err) {
        console.warn('[BaileysWorker] Queue add failed, falling back to direct async execution:', err.message);
        return await processInboundMessageCore(jobData);
    }
}

/**
 * Enterprise Inbound Message Core Processor
 * Decoupled from the Baileys socket loop to protect HTTP API responsiveness.
 */
export async function processInboundMessageCore(jobData) {
    const {
        integrationId,
        messageId,
        remoteJid,
        participant,
        isFromMe,
        isGroup,
        cleanPhone,
        targetPhone,
        rawPhone,
        isLid,
        messageText,
        pushName,
        msgTsSeconds
    } = jobData;

    try {
        const Activity = (await import('../../models/Activity.js')).default;
        const Conversation = (await import('../../models/Conversation.js')).default;

        // 1. Idempotent Deduplication Check
        if (messageId) {
            try {
                const exists = await Activity.findOne({ 'details.messageId': messageId }).select('_id').lean();
                if (exists) return { skipped: true, reason: 'duplicate' };
            } catch (e) {}
        }

        // Clean participant identifier
        let participantRaw = '';
        if (participant) {
            participantRaw = participant.split('@')[0].split(':')[0];
        }
        let participantId = cleanPhone;
        if (participant) {
            const resolvedPart = await BaileysConnectionManager.resolveJidToPhone(participant, integrationId);
            participantId = (resolvedPart && resolvedPart.cleanPhone && !resolvedPart.cleanPhone.includes('@')) 
                ? resolvedPart.cleanPhone 
                : (participantRaw ? (normalizePhone(participantRaw) || participantRaw) : cleanPhone);
        }

        // Resolve group subject / title
        let groupSubject = isGroup ? BaileysConnectionManager.getGroupSubject(remoteJid) : null;
        if (isGroup && !groupSubject) {
            try {
                const sock = BaileysConnectionManager.getSocket(integrationId);
                if (sock) {
                    const metadata = await sock.groupMetadata(remoteJid).catch(() => null);
                    if (metadata?.subject) {
                        groupSubject = metadata.subject;
                        BaileysConnectionManager.setGroupSubject(remoteJid, metadata.subject);
                    }
                }
            } catch (e) {}
        }
        const groupDisplay = groupSubject || (isGroup ? `Group (${remoteJid.split('@')[0]})` : null);

        const WhatsAppIntegrationModel = (await import('../../models/WhatsAppIntegration.js')).default;
        const currentInt = await WhatsAppIntegrationModel.findById(integrationId).select('connectedBy allowedUsers').lean();
        const userOwner = currentInt?.connectedBy || null;

        // Enterprise Identity Resolution: Fast indexed lookup + in-memory LRU cache
        let matchedEntity = null;
        let resolvedCrmName = null;
        const lookupPhone = isGroup ? participantId : targetPhone;
        const clean10 = String(lookupPhone || '').replace(/\D/g, '').slice(-10);

        if (clean10 && clean10.length === 10) {
            const cached = getCachedIdentity(clean10);
            if (cached !== null) {
                matchedEntity = cached.matchedEntity;
                resolvedCrmName = cached.resolvedCrmName;
            } else {
                try {
                    const Lead = (await import('../../models/Lead.js')).default;
                    const Contact = (await import('../../models/Contact.js')).default;
                    // B-Tree indexed equality query across standard phone formats (<0.5ms)
                    const phoneVariants = [clean10, `+91${clean10}`, `91${clean10}`, `0${clean10}`];
                    const [l, c] = await Promise.all([
                        Lead.findOne({ mobile: { $in: phoneVariants }, isDeleted: { $ne: true } }).select('firstName lastName fullName assignedTo owner').lean(),
                        Contact.findOne({ 'phones.number': { $in: phoneVariants }, isDeleted: { $ne: true } }).select('name assignedTo owner').lean()
                    ]);
                    if (l) {
                        resolvedCrmName = (l.fullName || `${l.firstName || ''} ${l.lastName || ''}`).trim();
                        matchedEntity = { id: l._id, type: 'Lead', assignee: l.assignedTo || l.owner };
                    } else if (c?.name) {
                        resolvedCrmName = c.name;
                        matchedEntity = { id: c._id, type: 'Contact', assignee: c.assignedTo || c.owner };
                    } else {
                        // Suffix regex fallback only if exact variants didn't match
                        const reg = new RegExp(clean10 + '$');
                        const [lRegex, cRegex] = await Promise.all([
                            Lead.findOne({ mobile: reg, isDeleted: { $ne: true } }).select('firstName lastName fullName assignedTo owner').lean(),
                            Contact.findOne({ 'phones.number': reg, isDeleted: { $ne: true } }).select('name assignedTo owner').lean()
                        ]);
                        if (lRegex) {
                            resolvedCrmName = (lRegex.fullName || `${lRegex.firstName || ''} ${lRegex.lastName || ''}`).trim();
                            matchedEntity = { id: lRegex._id, type: 'Lead', assignee: lRegex.assignedTo || lRegex.owner };
                        } else if (cRegex?.name) {
                            resolvedCrmName = cRegex.name;
                            matchedEntity = { id: cRegex._id, type: 'Contact', assignee: cRegex.assignedTo || cRegex.owner };
                        }
                    }
                    // Cache the identity resolution (including nulls to avoid repeated DB scans for unknown group senders)
                    setCachedIdentity(clean10, { matchedEntity, resolvedCrmName });
                } catch (e) {
                    console.warn('[BaileysWorker:Identity Error]:', e.message);
                }
            }
        }

        const memberName = isGroup 
            ? (resolvedCrmName || pushName || (participantId ? (participantId.length === 10 ? `+91 ${participantId}` : `+${participantId}`) : 'Group Member'))
            : null;

        const customerDisplayName = resolvedCrmName || pushName || (cleanPhone.length === 10 ? `+91 ${cleanPhone}` : cleanPhone);
        const resolvedSenderName = isFromMe ? 'Agent' : (isGroup ? memberName : customerDisplayName);
        const msgDate = new Date(msgTsSeconds ? msgTsSeconds * 1000 : Date.now());

        // Phase A: Create Activity record
        try {
            await Activity.create({
                type: 'WhatsApp',
                subject: isGroup ? `Group WhatsApp: ${groupDisplay}` : (isFromMe ? `Outgoing WhatsApp (Scanner)` : `Incoming WhatsApp (Scanner)`),
                entityType: isGroup ? 'WhatsAppGroup' : (matchedEntity?.type || 'General'),
                entityId: isGroup ? remoteJid : (matchedEntity?.id || null),
                description: messageText,
                dueDate: new Date(),
                status: 'Completed',
                visibleTo: 'Everyone',
                ...(userOwner ? { assignedTo: userOwner, createdBy: userOwner } : {}),
                details: {
                    direction: isFromMe ? 'Outgoing' : 'Incoming',
                    platform: 'WhatsApp Web',
                    message: messageText,
                    text: messageText,
                    renderedBody: messageText,
                    from: isFromMe ? null : (isGroup ? participantId : cleanPhone),
                    to: isFromMe ? (isGroup ? remoteJid : cleanPhone) : null,
                    messageId: messageId,
                    phoneNumber: targetPhone,
                    isGroup: isGroup,
                    groupJid: isGroup ? remoteJid : null,
                    groupName: groupDisplay,
                    participant: isGroup ? participantId : null,
                    senderName: resolvedSenderName,
                    whatsappIntegrationId: integrationId,
                    ...(isLid ? { lid: remoteJid } : {})
                },
                participants: [
                    { 
                        mobile: isGroup ? (isFromMe ? targetPhone : participantId) : targetPhone, 
                        name: isGroup ? (isFromMe ? 'Agent' : memberName) : customerDisplayName
                    }
                ],
                performedBy: resolvedSenderName,
                performedAt: msgDate
            });
        } catch (actErr) {
            console.error('[BaileysWorker] Error creating Activity:', actErr.message);
        }

        // Phase A.2: Check if this message is a broker reply to a Deal Intake WhatsApp Verification
        if (!isGroup && !isFromMe && (cleanPhone || targetPhone)) {
            const checkPhone = cleanPhone || targetPhone;
            import('../intakeVerification/DealVerificationAgent.js')
                .then(({ default: dealVerificationAgent }) => {
                    dealVerificationAgent.processBrokerReply(checkPhone, messageText, integrationId).catch(err => {
                        console.error('[BaileysWorker:DealVerification Error]:', err.message);
                    });
                })
                .catch(vErr => {
                    console.error('[BaileysWorker:DealVerification Import Error]:', vErr.message);
                });
        }

        // Phase B.1: Standalone High-Scale ChatMessage Persistence (Pillar 2)
        try {
            const ChatMessage = (await import('../../models/ChatMessage.js')).default;
            await ChatMessage.findOneAndUpdate(
                { messageId: messageId || `cm_${remoteJid}_${msgDate.getTime()}` },
                {
                    $set: {
                        remoteJid: remoteJid,
                        groupJid: isGroup ? remoteJid : null,
                        groupName: groupDisplay,
                        isGroup: isGroup,
                        fromMe: isFromMe,
                        senderPhone: isGroup ? participantId : targetPhone,
                        senderName: resolvedSenderName,
                        content: messageText,
                        role: isFromMe ? 'assistant' : 'user',
                        timestamp: msgDate,
                        whatsappIntegrationId: integrationId,
                        status: isFromMe ? 'sent' : 'received',
                        metadata: {
                            messageId: messageId,
                            participant: isGroup ? participantId : null,
                            ...(isLid ? { lid: remoteJid } : {})
                        }
                    }
                },
                { upsert: true }
            );
        } catch (cmErr) {
            console.error('[BaileysWorker] Error persisting ChatMessage:', cmErr.message);
        }

        // Phase B.2: Update Conversation with bounded $slice: -50 (Pillar 2)
        let updatedConv = null;
        try {
            const updateOps = {
                $push: {
                    messages: {
                        $each: [{
                            role: isFromMe ? 'assistant' : 'user',
                            content: messageText,
                            timestamp: msgDate,
                            metadata: { 
                                messageId: messageId,
                                whatsappIntegrationId: integrationId,
                                isGroup: isGroup,
                                groupJid: isGroup ? remoteJid : null,
                                groupName: groupDisplay,
                                senderName: resolvedSenderName,
                                participant: isGroup ? participantId : null,
                                ...(isLid ? { lid: remoteJid } : {})
                            }
                        }],
                        $slice: -50 // 🛡️ Pillar 2: Caps embedded array to 50 items (<50 KB), preventing 16MB document limit crash permanently
                    }
                },
                $set: {
                    updatedAt: new Date(),
                    whatsappIntegrationId: integrationId,
                    isGroup: isGroup,
                    groupName: groupDisplay,
                    groupJid: isGroup ? remoteJid : null,
                    title: groupDisplay || (isGroup ? remoteJid : (resolvedCrmName || targetPhone)),
                    'metadata.isGroup': isGroup,
                    'metadata.groupName': groupDisplay,
                    'metadata.groupJid': isGroup ? remoteJid : null,
                    ...(isLid ? { 'metadata.lid': remoteJid } : {}),
                    ...(matchedEntity?.type === 'Lead' ? { lead: matchedEntity.id } : {}),
                    ...(matchedEntity?.type === 'Contact' ? { contact: matchedEntity.id } : {}),
                    channel: 'whatsapp',
                    status: 'active'
                },
                $setOnInsert: {
                    phoneNumber: targetPhone
                }
            };

            if (!isFromMe) {
                updateOps.$inc = { 'metadata.unreadCount': 1 };
            }

            const queryFilters = [
                { phoneNumber: targetPhone }
            ];
            if (isGroup) {
                queryFilters.push({ 'metadata.groupJid': remoteJid });
            } else {
                if (rawPhone && rawPhone !== targetPhone) {
                    queryFilters.push({ phoneNumber: rawPhone });
                }
                if (isLid) {
                    queryFilters.push({ 'metadata.lid': remoteJid });
                }
            }

            updatedConv = await Conversation.findOneAndUpdate(
                { $or: queryFilters },
                updateOps,
                { upsert: true, new: true }
            );
        } catch (convErr) {
            console.error('[BaileysWorker] Error updating Conversation:', convErr.message);
        }

        // Phase B.3: Real-Time Stream Property Deal Intake (Pillar 3)
        // Discovers real-estate deals in <10ms and directly streams to UnifiedIntakeQueue
        if (isGroup && !isFromMe && messageText && isLikelyPropertyDeal(messageText)) {
            import('../intakeQueue/IntakeQueue.js')
                .then(({ addToIntakeQueue }) => {
                    const rawIntakeData = {
                        text: messageText,
                        source: `WhatsApp Group: ${groupDisplay || remoteJid}`,
                        groupName: groupDisplay,
                        groupJid: remoteJid,
                        senderName: memberName || resolvedSenderName || 'Broker',
                        participant: participantId,
                        messageId: messageId || `wa_${remoteJid}_${Date.now()}`,
                        timestamp: msgDate,
                        conversationId: updatedConv?._id || null,
                        whatsappIntegrationId: integrationId
                    };
                    addToIntakeQueue('whatsapp_group', rawIntakeData, null).catch(err => {
                        console.error('[BaileysWorker:StreamIntake Error]:', err.message);
                    });
                })
                .catch(importErr => {
                    console.error('[BaileysWorker:StreamIntake Import Error]:', importErr.message);
                });
        }

        // Phase C: Trigger NotificationEngine (1-on-1 direct customer chats only to prevent notification flooding)
        if (!isFromMe && !isGroup) {
            try {
                const NotificationEngine = (await import('../NotificationEngine.js')).default;
                let senderLabel = resolvedCrmName || targetPhone || 'Customer';
                const recipientUserIds = new Set();
                if (userOwner) recipientUserIds.add(String(userOwner));
                if (matchedEntity?.assignee) recipientUserIds.add(String(matchedEntity.assignee));

                if (Array.isArray(currentInt?.allowedUsers)) {
                    currentInt.allowedUsers.forEach(u => u && recipientUserIds.add(String(u)));
                }

                if (recipientUserIds.size === 0) {
                    try {
                        const User = (await import('../../models/User.js')).default;
                        const admins = await User.find({
                            $or: [
                                { email: { $in: ['bharatproperties570@gmail.com', 'shreykeshwar@gmail.com'] } }
                            ]
                        }).select('_id').lean();
                        admins.forEach(a => recipientUserIds.add(String(a._id)));
                    } catch (e) {}
                }

                const link = `/communication?channel=WhatsApp_Web&selected=${encodeURIComponent(targetPhone)}`;
                await Promise.allSettled(
                    Array.from(recipientUserIds).map(targetUid =>
                        NotificationEngine.notifyWhatsApp(
                            targetUid,
                            senderLabel,
                            messageText,
                            link,
                            integrationId
                        )
                    )
                );
            } catch (notifErr) {
                console.error('[BaileysWorker] Notification trigger error:', notifErr.message);
            }
        }

        // Phase D: Real-Time Push to CRM Active Windows via RealtimeHub
        try {
            const RealtimeHub = (await import('../RealtimeHub.js')).default;
            const msgIsoTime = msgDate.toISOString();
            const prefix = isFromMe ? 'You: ' : (isGroup ? `${memberName}: ` : 'Customer: ');
            RealtimeHub.emitMessage({
                phone: targetPhone,
                channel: 'WhatsApp',
                isGroup: isGroup,
                message: {
                    id: messageId,
                    sender: isFromMe ? 'agent' : 'customer',
                    fromMe: isFromMe,
                    text: messageText,
                    time: msgIsoTime,
                    timestamp: msgIsoTime,
                    status: isFromMe ? 'delivered' : 'received',
                    senderName: resolvedSenderName,
                    metadata: {
                        messageId: messageId,
                        whatsappIntegrationId: integrationId,
                        isGroup: isGroup,
                        groupJid: isGroup ? remoteJid : null,
                        groupName: groupDisplay,
                        participant: isGroup ? participantId : null
                    }
                },
                streamItem: {
                    _id: messageId || Date.now().toString(),
                    type: 'WhatsApp',
                    via: 'WhatsApp',
                    subject: isGroup ? `Group WhatsApp: ${groupDisplay}` : (isFromMe ? `Outgoing WhatsApp (Scanner)` : `Incoming WhatsApp (Scanner)`),
                    description: prefix + messageText,
                    snippet: prefix + messageText,
                    participant: isGroup ? groupDisplay : (customerDisplayName || targetPhone),
                    phone: targetPhone,
                    phoneNumber: targetPhone,
                    groupJid: isGroup ? remoteJid : null,
                    groupName: groupDisplay,
                    outcome: isFromMe ? 'Delivered' : 'Received',
                    timestamp: msgIsoTime,
                    date: msgIsoTime,
                    platform: 'WhatsApp Web',
                    isGroup: isGroup,
                    whatsappIntegrationId: integrationId
                }
            });
        } catch (rtErr) {
            console.error('[BaileysWorker] RealtimeHub emit error:', rtErr.message);
        }

        return { success: true, messageId };
    } catch (err) {
        console.error('[BaileysWorker] Unhandled job processing error:', err.message);
        throw err;
    }
}

// Inbound BullMQ Worker with concurrency = 5
export const baileysInboundWorker = new Worker('whatsapp_baileys_inbound', async (job) => {
    return await processInboundMessageCore(job.data);
}, { connection: redisConnectionOptions, concurrency: 5 });

baileysInboundWorker.on('failed', (job, err) => {
    console.error(`[BaileysInboundWorker] Job ${job?.id} failed:`, err.message);
});

baileysInboundWorker.on('error', (err) => {
    if (!err.message?.includes('ECONNREFUSED')) {
        console.warn('[BaileysInboundWorker] Inbound worker error:', err.message);
    }
});
