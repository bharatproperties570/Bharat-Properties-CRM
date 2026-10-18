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
const lidPhoneCache = new Map();

// 🚀 Phase 4 Enterprise Optimization: Bounded Memory Caches (Max 2,000 entries)
const MAX_CACHE_ENTRIES = 2000;
function safeSetBoundedCache(map, key, value) {
    if (map.size >= MAX_CACHE_ENTRIES) {
        const firstKey = map.keys().next().value;
        if (firstKey) map.delete(firstKey);
    }
    map.set(key, value);
}

/**
 * Resolves a WhatsApp JID (phone, group, or LID) into a clean, normalized identifier.
 * If JID is a group (@g.us), returns the group JID.
 * If JID is an LID (@lid), looks up the reverse mapping in Baileys auth keys / database to find the actual phone number.
 * If JID is a standard phone (@s.whatsapp.net), strips the suffix and normalizes.
 */
async function resolveJidToPhone(jid, integrationId) {
    if (!jid) return { cleanPhone: '', targetPhone: '', rawPhone: '', isLid: false };

    const jidStr = String(jid).trim();
    const isGroup = jidStr.endsWith('@g.us');
    if (isGroup) {
        const raw = jidStr.replace('@g.us', '');
        return { cleanPhone: jidStr, targetPhone: jidStr, rawPhone: raw, isLid: false };
    }

    // Extract core numeric identifier
    const rawDigits = jidStr.split('@')[0].split(':')[0].replace(/\D/g, '');
    const isExplicitLid = jidStr.endsWith('@lid') || jidStr.includes('@lid');
    const isLidLength = rawDigits.length >= 13;
    
    // Normalized 10-digit number if Indian format with country code
    const tenDigitCandidate = (rawDigits.length === 12 && rawDigits.startsWith('91')) 
        ? rawDigits.substring(2) 
        : (rawDigits.length === 10 ? rawDigits : null);

    // 1. Check in-memory cache
    if (rawDigits && lidPhoneCache.has(rawDigits)) {
        const cachedPhone = lidPhoneCache.get(rawDigits);
        const target = cachedPhone.startsWith('+') ? cachedPhone : (cachedPhone.length === 10 ? `+91${cachedPhone}` : `+${cachedPhone}`);
        return { cleanPhone: cachedPhone, targetPhone: target, rawPhone: cachedPhone, isLid: true };
    }
    if (tenDigitCandidate && lidPhoneCache.has(tenDigitCandidate)) {
        const cachedPhone = lidPhoneCache.get(tenDigitCandidate);
        const target = cachedPhone.startsWith('+') ? cachedPhone : (cachedPhone.length === 10 ? `+91${cachedPhone}` : `+${cachedPhone}`);
        return { cleanPhone: cachedPhone, targetPhone: target, rawPhone: cachedPhone, isLid: true };
    }

    // 2. Database resolution: Check if this is an explicit LID, long LID (13+ digits), or previously sliced LID
    if (isExplicitLid || isLidLength || tenDigitCandidate) {
        try {
            const BaileysAuth = (await import('../../models/BaileysAuth.js')).default;
            const sessionFilter = integrationId ? { sessionId: String(integrationId) } : {};

            let reverseDoc = null;

            // Direct reverse lookup if rawDigits is an LID
            if (isExplicitLid || isLidLength) {
                reverseDoc = await BaileysAuth.findOne({
                    ...sessionFilter,
                    fileId: `lid-mapping-${rawDigits}_reverse`
                }).lean();

                if (!reverseDoc && integrationId) {
                    reverseDoc = await BaileysAuth.findOne({
                        fileId: `lid-mapping-${rawDigits}_reverse`
                    }).lean();
                }
            }

            // If not found and we have a 10-digit number, check if it's the tail of a sliced LID
            if (!reverseDoc && tenDigitCandidate) {
                reverseDoc = await BaileysAuth.findOne({
                    ...sessionFilter,
                    fileId: { $regex: `${tenDigitCandidate}_reverse$` }
                }).lean();

                if (!reverseDoc && integrationId) {
                    reverseDoc = await BaileysAuth.findOne({
                        fileId: { $regex: `${tenDigitCandidate}_reverse$` }
                    }).lean();
                }
            }

            if (reverseDoc?.data) {
                let parsed = reverseDoc.data;
                try {
                    parsed = JSON.parse(reverseDoc.data);
                } catch (e) {}
                const phoneDigits = String(parsed).replace(/\D/g, '');
                if (phoneDigits) {
                    const cleanPhone = normalizePhone(phoneDigits) || phoneDigits;
                    const targetPhone = cleanPhone.length === 10 ? `+91${cleanPhone}` : (cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`);
                    safeSetBoundedCache(lidPhoneCache, rawDigits, cleanPhone);
                    if (tenDigitCandidate) safeSetBoundedCache(lidPhoneCache, tenDigitCandidate, cleanPhone);
                    safeSetBoundedCache(lidPhoneCache, phoneDigits, cleanPhone);
                    return { cleanPhone, targetPhone, rawPhone: phoneDigits, isLid: true };
                }
            }

            // Forward lookup fallback
            if (isExplicitLid || isLidLength) {
                const forwardDoc = await BaileysAuth.findOne({
                    ...sessionFilter,
                    fileId: { $regex: '^lid-mapping-\\d+$' },
                    data: new RegExp(rawDigits)
                }).lean();

                if (forwardDoc?.fileId) {
                    const phoneDigits = forwardDoc.fileId.replace('lid-mapping-', '').replace(/\D/g, '');
                    if (phoneDigits) {
                        const cleanPhone = normalizePhone(phoneDigits) || phoneDigits;
                        const targetPhone = cleanPhone.length === 10 ? `+91${cleanPhone}` : (cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`);
                        safeSetBoundedCache(lidPhoneCache, rawDigits, cleanPhone);
                        return { cleanPhone, targetPhone, rawPhone: phoneDigits, isLid: true };
                    }
                }
            }
        } catch (err) {
            console.error('[BaileysConnectionManager] Error resolving LID:', err.message);
        }

        if (isExplicitLid || isLidLength) {
            console.warn(`[BaileysConnectionManager] Could not resolve LID mapping for ${jid}`);
            return { cleanPhone: jidStr, targetPhone: jidStr, rawPhone: jidStr, isLid: true };
        }
    }

    // Standard phone JID (@s.whatsapp.net or raw)
    const rawPhone = jidStr.replace(/@s\.whatsapp\.net/, '').split(':')[0];
    const cleanPhone = normalizePhone(rawPhone) || rawPhone;
    const targetPhone = cleanPhone.length === 10 ? `+91${cleanPhone}` : (cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`);
    return { cleanPhone, targetPhone, rawPhone, isLid: false };
}

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
        if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_BAILEYS !== 'true') {
            console.log('[BaileysConnectionManager] Non-production environment detected. Skipping Baileys auto-connect to protect production WhatsApp socket.');
            return;
        }
        try {
            const integrations = await WhatsAppIntegration.find({ 
                provider: 'BAILEYS', 
                status: 'ACTIVE'
            });
            for (const integration of integrations) {
                await this.connect(integration._id.toString());
            }
        } catch (error) {
            console.error('[BaileysConnectionManager] Failed to initialize integrations:', error);
        }
    },

    async connect(integrationId) {
        if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_BAILEYS !== 'true') {
            console.warn(`[BaileysConnectionManager] Skipping connect(${integrationId}) in non-production environment to protect production WhatsApp.`);
            return null;
        }
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
                    syncFullHistory: false,
                    markOnlineOnConnect: false,
                    shouldIgnoreJid: (jid) => !jid || jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.includes('newsletter'),
                    connectTimeoutMs: 30000,
                    keepAliveIntervalMs: 25000,
                    defaultQueryTimeoutMs: 20000,
                    fireInitQueries: false
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
                                        safeSetBoundedCache(groupSubjectCache, g.id, g.subject);
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
                if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@broadcast') || remoteJid.includes('newsletter')) continue;

                const isGroup = remoteJid.endsWith('@g.us');
                // Enterprise resolution: automatically resolves WhatsApp LIDs (@lid) to actual mobile numbers
                const { cleanPhone, targetPhone, rawPhone, isLid } = await resolveJidToPhone(remoteJid, integrationId);

                // Extract message text or media description
                const messageText = extractBaileysMessageContent(msg.message);
                if (!messageText) continue;

                // ── Phase 2: Enterprise Inbound Decoupling via BullMQ ─────────────
                // Fast non-blocking enqueue (<2ms) keeps Node.js event loop free for API traffic
                const messageId = msg.key.id;
                const inboundJobData = {
                    integrationId,
                    messageId,
                    remoteJid,
                    participant: msg.key.participant || null,
                    isFromMe,
                    isGroup,
                    cleanPhone,
                    targetPhone,
                    rawPhone,
                    isLid,
                    messageText,
                    pushName: (msg.pushName && String(msg.pushName).trim()) ? String(msg.pushName).trim() : null,
                    msgTsSeconds
                };

                try {
                    const { enqueueBaileysInboundMessage } = await import('./baileysWorker.js');
                    await enqueueBaileysInboundMessage(inboundJobData);
                } catch (qErr) {
                    console.error('[BaileysConnectionManager] Queue enqueue error, running fallback:', qErr.message);
                    const { processInboundMessageCore } = await import('./baileysWorker.js');
                    processInboundMessageCore(inboundJobData).catch(err => {
                        console.error('[BaileysConnectionManager] Fallback processing error:', err.message);
                    });
                }
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
        if (jid && subject) safeSetBoundedCache(groupSubjectCache, jid, subject);
    },

    getAllGroupSubjects() {
        return new Map(groupSubjectCache);
    },

    async resolveJidToPhone(jid, integrationId) {
        return resolveJidToPhone(jid, integrationId);
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
