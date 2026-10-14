import { makeWASocket, DisconnectReason, useMultiFileAuthState, normalizeMessageContent } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import WhatsAppIntegration from '../../models/WhatsAppIntegration.js';
import { useMongoDBAuthState } from './useMongoDBAuthState.js';
import { normalizePhone } from '../../utils/normalization.js';
import qrcode from 'qrcode';

const logger = pino({ level: 'silent' });
const connections = new Map();
const inFlightPromises = new Map();
const reconnectTimers = new Map();
const groupSubjectCache = new Map();
const instanceId = `${process.pid}_${Math.random().toString(36).substring(2, 9)}`;
const activeHeartbeats = new Map();

/**
 * Universal text and media unwrapper for Baileys messages
 */
const extractBaileysMessageContent = (rawMsg) => {
    if (!rawMsg) return '';
    let m = rawMsg;
    while (m?.ephemeralMessage || m?.viewOnceMessage || m?.viewOnceMessageV2 || m?.documentWithCaptionMessage) {
        m = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message;
    }
    const c = normalizeMessageContent(m) || m;
    return c?.conversation || 
           c?.extendedTextMessage?.text || 
           c?.imageMessage?.caption || 
           c?.videoMessage?.caption || 
           c?.documentMessage?.caption ||
           (c?.documentMessage?.fileName ? `📄 Document: ${c.documentMessage.fileName}` : '') ||
           (c?.imageMessage ? '📷 Photo' : '') ||
           (c?.videoMessage ? '🎥 Video' : '') ||
           (c?.audioMessage ? '🎵 Voice Note' : '') ||
           (c?.contactMessage?.displayName ? `👤 Contact: ${c.contactMessage.displayName}` : '') ||
           (c?.locationMessage ? `📍 Location` : '') ||
           c?.buttonsResponseMessage?.selectedDisplayText ||
           c?.templateButtonReplyMessage?.selectedDisplayText ||
           c?.listResponseMessage?.title ||
           c?.interactiveResponseMessage?.body?.text ||
           c?.pollCreationMessage?.name ||
           '';
};

export const BaileysConnectionManager = {
    async initializeAll() {
        try {
            const integrations = await WhatsAppIntegration.find({ 
                provider: 'BAILEYS', 
                status: { $in: ['ACTIVE', 'PENDING_ONBOARDING'] }
            });
            for (const integration of integrations) {
                await this.connect(integration._id.toString());
            }
        } catch (error) {
            console.error('[BaileysConnectionManager] Failed to initialize integrations:', error);
        }
    },

    async connect(integrationId) {
        // 1. If an active socket exists and is open or connecting, reuse it
        if (connections.has(integrationId)) {
            const existing = connections.get(integrationId);
            if (existing && existing.ws && (existing.ws.isOpen || existing.ws.isConnecting)) {
                return existing;
            }
        }

        // 2. Mutex: If connection is already in flight, reuse the promise
        if (inFlightPromises.has(integrationId)) {
            return inFlightPromises.get(integrationId);
        }

        const connectPromise = (async () => {
            try {
                // Clear any pending reconnect timer
                if (reconnectTimers.has(integrationId)) {
                    clearTimeout(reconnectTimers.get(integrationId));
                    reconnectTimers.delete(integrationId);
                }

                // 🔒 Cluster Leader Lock: Ensure only one instance manages this socket
                try {
                    const { default: redisProxy } = await import('../../src/config/redis.js');
                    if (redisProxy && !redisProxy.isMock) {
                        const lockKey = `lock:baileys_socket:${integrationId}`;
                        const currentHolder = await redisProxy.get(lockKey);
                        if (currentHolder && currentHolder !== instanceId) {
                            console.warn(`[BaileysConnectionManager] Socket for integration ${integrationId} is actively managed by another instance (${currentHolder}). Skipping duplicate connection.`);
                            return null;
                        }
                        await redisProxy.set(lockKey, instanceId, 'EX', 45);

                        if (activeHeartbeats.has(integrationId)) {
                            clearInterval(activeHeartbeats.get(integrationId));
                        }
                        const hb = setInterval(async () => {
                            try {
                                const cur = await redisProxy.get(lockKey);
                                if (cur === instanceId) {
                                    await redisProxy.set(lockKey, instanceId, 'EX', 45);
                                }
                            } catch (e) {}
                        }, 20000);
                        activeHeartbeats.set(integrationId, hb);
                    }
                } catch (lockErr) {}

                // Cleanly close prior stale socket
                const oldSock = connections.get(integrationId);
                if (oldSock) {
                    connections.delete(integrationId);
                    try {
                        if (oldSock.ws) oldSock.ws.close();
                        oldSock.ev?.removeAllListeners();
                    } catch (e) {}
                }

                const { state, saveCreds } = await useMongoDBAuthState(integrationId);
                
                const sock = makeWASocket({
                    auth: state,
                    printQRInTerminal: false,
                    logger,
                    connectTimeoutMs: 30000,
                    keepAliveIntervalMs: 25000,
                    defaultQueryTimeoutMs: 20000
                });

                connections.set(integrationId, sock);

                sock.ev.on('connection.update', async (update) => {
                    const { connection, lastDisconnect, qr } = update;
                    
                    if (qr) {
                        try {
                            const qrDataUrl = await qrcode.toDataURL(qr);
                            await WhatsAppIntegration.findByIdAndUpdate(integrationId, {
                                onboardingStatus: 'QR_PENDING',
                                failureReason: qrDataUrl
                            });
                        } catch (e) {
                            console.error('[BaileysConnectionManager] QR Code generation failed', e);
                        }
                    }

                    if (connection === 'close') {
                        if (activeHeartbeats.has(integrationId)) {
                            clearInterval(activeHeartbeats.get(integrationId));
                            activeHeartbeats.delete(integrationId);
                        }
                        try {
                            const { default: redisProxy } = await import('../../src/config/redis.js');
                            if (redisProxy && !redisProxy.isMock) {
                                const lockKey = `lock:baileys_socket:${integrationId}`;
                                const cur = await redisProxy.get(lockKey);
                                if (cur === instanceId) {
                                    await redisProxy.del(lockKey);
                                }
                            }
                        } catch (e) {}

                        const statusCode = (lastDisconnect?.error instanceof Boom)
                            ? lastDisconnect.error.output?.statusCode
                            : null;
                        const errorMsg = lastDisconnect?.error?.message || '';
                        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                        const isConflict = statusCode === DisconnectReason.connectionReplaced || errorMsg.includes('conflict');
                        
                        console.log(`[BaileysConnectionManager] Connection closed for ${integrationId} (code: ${statusCode}, reason: ${errorMsg})`);
                        
                        if (connections.get(integrationId) === sock) {
                            connections.delete(integrationId);
                        }

                        if (isLoggedOut) {
                            try {
                                await WhatsAppIntegration.findByIdAndUpdate(integrationId, {
                                    status: 'REVOKED',
                                    onboardingStatus: 'REVOKED'
                                });
                            } catch (revErr) {
                                console.error('[BaileysConnectionManager] Error marking revoked:', revErr.message);
                            }
                            return;
                        }

                        // Prevent tight conflict loops when another connection took over
                        if (isConflict) {
                            console.warn(`[BaileysConnectionManager] Conflict / connection replaced for ${integrationId}. Checking for duplicate numbers...`);
                            try {
                                const currentDoc = await WhatsAppIntegration.findById(integrationId);
                                const norm = currentDoc?.displayPhoneNumber ? normalizePhone(currentDoc.displayPhoneNumber) : null;
                                if (norm) {
                                    const dup = await WhatsAppIntegration.findOne({
                                        _id: { $ne: integrationId },
                                        provider: 'BAILEYS',
                                        status: 'ACTIVE',
                                        $or: [
                                            { displayPhoneNumber: { $regex: norm + '$' } },
                                            { phoneNumberId: { $regex: norm + '$' } }
                                        ]
                                    });
                                    if (dup) {
                                        console.error(`[BaileysConnectionManager] Duplicate phone ${currentDoc.displayPhoneNumber} detected between ${integrationId} and ${dup._id}. Aborting reconnect loop to preserve system stability.`);
                                        await WhatsAppIntegration.findByIdAndUpdate(integrationId, {
                                            status: 'ERROR',
                                            onboardingStatus: 'ERROR',
                                            failureReason: `DUPLICATE_NUMBER: Another active connection exists with this phone number (${currentDoc.displayPhoneNumber}). Reconnect loop stopped.`
                                        });
                                        return;
                                    }
                                }
                            } catch (err) {
                                console.error('[BaileysConnectionManager] Error checking duplicate conflict:', err.message);
                            }

                            const timer = setTimeout(() => {
                                reconnectTimers.delete(integrationId);
                                if (!connections.has(integrationId)) {
                                    this.connect(integrationId).catch(err => console.error('[BaileysConnectionManager] Conflict reconnect error:', err.message));
                                }
                            }, 10000);
                            reconnectTimers.set(integrationId, timer);
                            return;
                        }

                        // Normal disconnect: reconnect with 2.5s delay
                        const timer = setTimeout(() => {
                            reconnectTimers.delete(integrationId);
                            if (!connections.has(integrationId)) {
                                this.connect(integrationId).catch(recErr => console.error('[BaileysConnectionManager] Reconnect error:', recErr.message));
                            }
                        }, 2500);
                        reconnectTimers.set(integrationId, timer);
                    } else if (connection === 'open') {
                        console.log(`[BaileysConnectionManager] opened connection for integration ${integrationId}`);
                        try {
                            const phone = sock.user?.id ? sock.user.id.split(':')[0].replace(/\D/g, '') : undefined;
                            const currentInt = await WhatsAppIntegration.findById(integrationId);
                            
                            // 🔒 CRITICAL ENTERPRISE CHECK: One WhatsApp number can only belong to ONE user across the entire CRM
                            if (phone) {
                                const normPhone = normalizePhone(phone);
                                const existingConflict = await WhatsAppIntegration.findOne({
                                    _id: { $ne: integrationId },
                                    provider: 'BAILEYS',
                                    status: 'ACTIVE',
                                    connectedBy: { $ne: currentInt?.connectedBy },
                                    $or: [
                                        { displayPhoneNumber: { $regex: normPhone + '$' } },
                                        { phoneNumberId: { $regex: normPhone + '$' } }
                                    ]
                                }).populate('connectedBy', 'fullName name email');

                                if (existingConflict) {
                                    const conflictUserName = existingConflict.connectedBy?.fullName || existingConflict.connectedBy?.name || 'another user';
                                    console.warn(`[BaileysConnectionManager] ⚠️ REJECTING DUPLICATE WHATSAPP CONNECTION for ${integrationId} (Phone: ${phone}). Already active on user ${conflictUserName} (ID: ${existingConflict._id})`);

                                    // Cleanly disconnect socket immediately
                                    try {
                                        await sock.logout();
                                    } catch (e) {}
                                    try {
                                        if (sock.ws) sock.ws.close();
                                        sock.ev?.removeAllListeners();
                                    } catch (e) {}
                                    connections.delete(integrationId);

                                    // Wipe auth credentials for this duplicate attempt
                                    const { default: BaileysAuthModel } = await import('../../models/BaileysAuth.js');
                                    await BaileysAuthModel.deleteMany({ sessionId: integrationId.toString() });

                                    await WhatsAppIntegration.findByIdAndUpdate(integrationId, {
                                        status: 'ERROR',
                                        onboardingStatus: 'ERROR',
                                        failureReason: `DUPLICATE_NUMBER: Yeh WhatsApp number (+${phone}) pehle se hi "${conflictUserName}" ke sath connect hai. Pure CRM me ek number sirf ek hi user ke scanner pr use ho sakta hai.`
                                    });
                                    return;
                                }
                            }

                            const name = sock.user?.name || currentInt?.accountLabel || 'WhatsApp Web';
                            await WhatsAppIntegration.findByIdAndUpdate(integrationId, {
                                status: 'ACTIVE',
                                onboardingStatus: 'CONNECTED',
                                ...(phone ? { displayPhoneNumber: phone, phoneNumberId: phone } : {}),
                                accountLabel: name,
                                allowedUsers: currentInt?.connectedBy ? [currentInt.connectedBy] : (currentInt?.allowedUsers || []),
                                failureReason: null
                            });
                            console.log(`[BaileysConnectionManager] Integration ${integrationId} marked as ACTIVE / CONNECTED (Phone: ${phone})`);

                            // 👥 Auto-cache all participating group subjects
                            sock.groupFetchAllParticipating().then(groups => {
                                Object.values(groups || {}).forEach(g => {
                                    if (g.id && g.subject) {
                                        groupSubjectCache.set(g.id, g.subject);
                                    }
                                });
                                console.log(`[BaileysConnectionManager] Cached ${groupSubjectCache.size} group subjects`);
                            }).catch(err => {
                                console.warn('[BaileysConnectionManager] Group subject sync notice:', err.message);
                            });
                        } catch (openErr) {
                            console.error('[BaileysConnectionManager] Error updating integration on open:', openErr.message);
                        }
                    }
                });

                sock.ev.on('creds.update', saveCreds);

        // Handle incoming and outgoing messages from WhatsApp Web (Real-time & 24h catch-up)
        const CATCHUP_HORIZON_SECONDS = Math.floor(Date.now() / 1000) - 86400; // 24-hour catchup horizon

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            for (const msg of messages) {
                if (!msg.message) continue;

                // Safely convert messageTimestamp to seconds
                let rawTs = msg.messageTimestamp;
                if (typeof rawTs === 'object' && rawTs !== null) {
                    rawTs = rawTs.low || rawTs.toNumber?.() || 0;
                }
                const msgTsSeconds = Number(rawTs || 0);

                // Ignore historical sync messages older than 24 hours
                if (msgTsSeconds && msgTsSeconds < CATCHUP_HORIZON_SECONDS) continue;

                const isFromMe = !!msg.key.fromMe;
                const remoteJid = msg.key.remoteJid;
                if (!remoteJid || remoteJid === 'status@broadcast') continue;

                const isGroup = remoteJid.endsWith('@g.us');
                const rawPhone = remoteJid.replace(/@s\.whatsapp\.net|@g\.us/, '');
                const cleanPhone = normalizePhone(rawPhone) || rawPhone;
                const targetPhone = isGroup ? remoteJid : cleanPhone;

                // Extract message text or media description
                const messageText = extractBaileysMessageContent(msg.message);
                if (!messageText) continue;

                // Write to Activity and Conversation asynchronously with enterprise isolation
                (async () => {
                    const messageId = msg.key.id;
                    const Activity = (await import('../../models/Activity.js')).default;
                    const Conversation = (await import('../../models/Conversation.js')).default;

                    // 1. Idempotent Deduplication Check
                    if (messageId) {
                        try {
                            const exists = await Activity.findOne({ 'details.messageId': messageId }).select('_id').lean();
                            if (exists) return; // Already recorded, skip duplicate
                        } catch (e) {}
                    }

                    // Clean participant identifier (strips device suffix :1, :2)
                    let participantRaw = '';
                    if (msg.key.participant) {
                        participantRaw = msg.key.participant.split('@')[0].split(':')[0];
                    }
                    const participantId = participantRaw ? (normalizePhone(participantRaw) || participantRaw) : cleanPhone;

                    // Resolve group subject / title
                    let groupSubject = isGroup ? groupSubjectCache.get(remoteJid) : null;
                    if (isGroup && !groupSubject) {
                        try {
                            const metadata = await sock.groupMetadata(remoteJid).catch(() => null);
                            if (metadata?.subject) {
                                groupSubject = metadata.subject;
                                groupSubjectCache.set(remoteJid, metadata.subject);
                            }
                        } catch (e) {}
                    }
                    const groupDisplay = groupSubject || (isGroup ? `Group (${remoteJid.split('@')[0]})` : null);

                    const WhatsAppIntegrationModel = (await import('../../models/WhatsAppIntegration.js')).default;
                    const currentInt = await WhatsAppIntegrationModel.findById(integrationId).select('connectedBy').lean();
                    const userOwner = currentInt?.connectedBy || null;

                    // Lookup participant name if in group
                    const pushName = (msg.pushName && String(msg.pushName).trim()) ? String(msg.pushName).trim() : null;
                    let memberName = isGroup ? (pushName || (participantId ? (participantId.length === 10 ? `+91 ${participantId}` : `+${participantId}`) : 'Group Member')) : (pushName || participantId);
                    if (isGroup && !isFromMe && participantId) {
                        try {
                            const Lead = (await import('../../models/Lead.js')).default;
                            const Contact = (await import('../../models/Contact.js')).default;
                            const clean10 = String(participantId).replace(/\D/g, '').slice(-10);
                            if (clean10) {
                                const reg = new RegExp(clean10 + '$');
                                const [l, c] = await Promise.all([
                                    Lead.findOne({ mobile: reg }).select('firstName lastName fullName').lean(),
                                    Contact.findOne({ 'phones.number': reg }).select('name').lean()
                                ]);
                                if (l) memberName = (l.fullName || `${l.firstName || ''} ${l.lastName || ''}`).trim() || memberName;
                                else if (c?.name) memberName = c.name;
                            }
                        } catch (e) {}
                    }

                    const resolvedSenderName = isFromMe ? 'Agent' : (isGroup ? memberName : (pushName || participantId));
                    const msgDate = new Date(msgTsSeconds ? msgTsSeconds * 1000 : Date.now());

                    // Phase A: Create Activity record (Isolated try/catch)
                    try {
                        await Activity.create({
                            type: 'WhatsApp',
                            subject: isGroup ? `Group WhatsApp: ${groupDisplay}` : (isFromMe ? `Outgoing WhatsApp (Scanner)` : `Incoming WhatsApp (Scanner)`),
                            entityType: isGroup ? 'WhatsAppGroup' : (isFromMe ? 'User' : 'General'),
                            entityId: isGroup ? remoteJid : (isFromMe ? userOwner : null),
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
                                whatsappIntegrationId: integrationId
                            },
                            participants: [
                                { 
                                    mobile: isGroup ? (isFromMe ? targetPhone : participantId) : targetPhone, 
                                    name: resolvedSenderName 
                                }
                            ],
                            performedBy: resolvedSenderName,
                            performedAt: msgDate
                        });
                    } catch (actErr) {
                        console.error('[BaileysConnectionManager] Error creating Activity:', actErr.message);
                    }

                    // Phase B: Update Conversation (Isolated try/catch)
                    try {
                        const updateOps = {
                            $push: {
                                messages: {
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
                                        participant: isGroup ? participantId : null
                                    }
                                }
                            },
                            $set: {
                                updatedAt: new Date(),
                                whatsappIntegrationId: integrationId,
                                isGroup: isGroup,
                                groupName: groupDisplay,
                                groupJid: isGroup ? remoteJid : null,
                                title: groupDisplay || (isGroup ? remoteJid : targetPhone),
                                'metadata.isGroup': isGroup,
                                'metadata.groupName': groupDisplay,
                                'metadata.groupJid': isGroup ? remoteJid : null,
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

                        await Conversation.findOneAndUpdate(
                            { 
                                $or: [
                                    { phoneNumber: targetPhone },
                                    ...(isGroup ? [{ 'metadata.groupJid': remoteJid }] : [{ phoneNumber: rawPhone }])
                                ]
                            },
                            updateOps,
                            { upsert: true }
                        );
                    } catch (convErr) {
                        console.error('[BaileysConnectionManager] Error updating Conversation:', convErr.message);
                    }

                    // Phase C: Trigger NotificationEngine (Isolated try/catch)
                    if (!isFromMe) {
                        try {
                            const NotificationEngine = (await import('../NotificationEngine.js')).default;
                            let senderLabel = isGroup ? `${groupDisplay} - ${memberName}` : (targetPhone || 'Customer');
                            if (!isGroup) {
                                try {
                                    const Lead = (await import('../../models/Lead.js')).default;
                                    const Contact = (await import('../../models/Contact.js')).default;
                                    const clean10 = String(targetPhone).replace(/\D/g, '').slice(-10);
                                    if (clean10) {
                                        const reg = new RegExp(clean10 + '$');
                                        const [l, c] = await Promise.all([
                                            Lead.findOne({ mobile: reg }).select('firstName lastName').lean(),
                                            Contact.findOne({ 'phones.number': reg }).select('name').lean()
                                        ]);
                                        if (l) senderLabel = `${l.firstName || ''} ${l.lastName || ''}`.trim() || targetPhone;
                                        else if (c?.name) senderLabel = c.name;
                                    }
                                } catch (e) {}
                            }

                            const link = `/communication?channel=WhatsApp_Web&selected=${encodeURIComponent(targetPhone)}`;
                            await NotificationEngine.notifyWhatsApp(
                                userOwner,
                                senderLabel,
                                messageText,
                                link,
                                integrationId
                            );
                        } catch (notifErr) {
                            console.error('[BaileysConnectionManager] Notification trigger error:', notifErr.message);
                        }
                    }

                    // Phase D: ⚡ Enterprise Real-Time Push to CRM Active Windows (Isolated try/catch)
                    try {
                        const RealtimeHub = (await import('../RealtimeHub.js')).default;
                        const msgIsoTime = msgDate.toISOString();
                        const prefix = isFromMe ? 'You: ' : (isGroup ? `${memberName}: ` : 'Customer: ');
                        RealtimeHub.emitMessage({
                            phone: targetPhone,
                            channel: 'WhatsApp',
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
                                participant: isGroup ? groupDisplay : targetPhone,
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
                        console.error('[BaileysConnectionManager] RealtimeHub emit error:', rtErr.message);
                    }
                })().catch((err) => {
                    console.error('[BaileysConnectionManager] Unhandled message processing error:', err.message);
                });
            }
        });

        return sock;
    } finally {
                inFlightPromises.delete(integrationId);
            }
        })();

        inFlightPromises.set(integrationId, connectPromise);
        return connectPromise;
    },

    getSocket(integrationId) {
        return connections.get(integrationId);
    },

    getGroupSubject(jid) {
        if (!jid) return null;
        return groupSubjectCache.get(jid) || groupSubjectCache.get(jid.replace('@g.us', '')) || null;
    },

    setGroupSubject(jid, subject) {
        if (jid && subject) groupSubjectCache.set(jid, subject);
    },

    getAllGroupSubjects() {
        return new Map(groupSubjectCache);
    },

    async logout(integrationId) {
        if (activeHeartbeats.has(integrationId)) {
            clearInterval(activeHeartbeats.get(integrationId));
            activeHeartbeats.delete(integrationId);
        }
        try {
            const { default: redisProxy } = await import('../../src/config/redis.js');
            if (redisProxy && !redisProxy.isMock) {
                const lockKey = `lock:baileys_socket:${integrationId}`;
                const cur = await redisProxy.get(lockKey);
                if (cur === instanceId) {
                    await redisProxy.del(lockKey);
                }
            }
        } catch (e) {}

        const sock = connections.get(integrationId);
        if (sock) {
            try {
                // Ensure logout never hangs: race with a 2-second timeout
                await Promise.race([
                    sock.logout().catch(() => {}),
                    new Promise(resolve => setTimeout(resolve, 2000))
                ]);
            } catch (e) {
                // Ignore
            } finally {
                try {
                    if (sock.ws) sock.ws.close();
                } catch(e) {}
                connections.delete(integrationId);
            }
        }
    }
};
