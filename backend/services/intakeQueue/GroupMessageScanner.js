/**
 * ============================================================
 *  GROUP MESSAGE SCANNER  v1.0
 *  Enterprise WhatsApp Group → Deal Intake Pipeline Scanner
 * ============================================================
 *
 *  Architecture:
 *  ┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
 *  │  Conversation    │─────▶│  GroupMessage     │─────▶│  UnifiedIntakeQueue │
 *  │  (isGroup=true)  │      │  Scanner (this)   │      │  (addToIntakeQueue) │
 *  │  messages[]      │      │  - cursor tracking│      │  ──▶ Connector      │
 *  └─────────────────┘      │  - property filter │      │  ──▶ AI Verify      │
 *                           │  - dedup guard     │      │  ──▶ AI Assistant   │
 *                           └──────────────────┘      └─────────────────────┘
 *
 *  Key Design Decisions:
 *  ✅ Cursor-based — monotonically advancing index per group
 *  ✅ Exactly-once — cursor + duplicate_hash double guard
 *  ✅ Two-stage filter — regex pre-filter + intakeParser validation
 *  ✅ node-cron scheduler — same pattern as AutomatedIntakeService
 *  ✅ Concurrency guard — prevents overlapping scanner runs
 *  ✅ Admin toggle — per-group is_active flag
 *  ✅ Auto-discovery — new groups get cursors automatically
 *  ✅ Graceful shutdown — compatible with PM2/SIGTERM
 * ============================================================
 */

import crypto from 'crypto';
import cron from 'node-cron';
import Conversation from '../../models/Conversation.js';
import IntakeGroupCursor from '../../models/IntakeGroupCursor.js';
import { addToIntakeQueue } from './IntakeQueue.js';
import Intake from '../../models/Intake.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const SCAN_INTERVAL_CRON = '*/15 * * * *'; // 15-minute background reconciliation net (real-time stream is in baileysWorker)
const MAX_MESSAGES_PER_SCAN = 50;          // Rate limit per group per scan cycle
const MAX_ERROR_LOG_SIZE = 30;             // Cap error log per cursor document
const MAX_CONSECUTIVE_FAILURES = 5;        // Auto-deactivate after N failures
const STARTUP_JITTER_MS = 3_000;           // Random jitter at boot

// ─── Property Content Filter (Two-Stage) ──────────────────────────────────────
// Stage 1: Fast regex pre-filter to eliminate obviously non-property messages
const PROPERTY_KEYWORDS_REGEX = /\b(plot|flat|floor|bhk|sector|sec\-?\d|marla|kanal|gaz|sqyd|sqft|sq\s?yd|sq\s?ft|bigha|acre|cr|crore|lac|lakh|sco|scf|dss|kothi|villa|house|shop|showroom|booth|office|penthouse|duplex|apartment|available|sale|sell|rent|lease|buy|budget|commercial|residential|industrial|farm|farmhouse|warehouse|godown|factory|builder|property|dealer|real\s?estate|auction|bank\s?property|pre\s?rented|investment|emi|possession|registry|colony|township|society|jlpl|bestech|omaxe|dlf|gmada|puda|huda|chandigarh|mohali|zirakpur|panchkula|kharar|derabassi|ambala|kurukshetra|karnal|panipat|ludhiana|jalandhar|amritsar|bathinda|patiala)\b/i;

// Messages shorter than this are likely greetings/emojis — skip
const MIN_MESSAGE_LENGTH = 15;

// ─── Structured Logger ────────────────────────────────────────────────────────
const log = {
    info:  (msg, meta = {}) => console.log(JSON.stringify({ level: 'info',  svc: 'GroupScanner', msg, ...meta, ts: new Date().toISOString() })),
    warn:  (msg, meta = {}) => console.warn(JSON.stringify({ level: 'warn',  svc: 'GroupScanner', msg, ...meta, ts: new Date().toISOString() })),
    error: (msg, meta = {}) => console.error(JSON.stringify({ level: 'error', svc: 'GroupScanner', msg, ...meta, ts: new Date().toISOString() })),
};

class GroupMessageScanner {
    constructor() {
        this._cronJob = null;
        this._isRunning = false;
        this._shuttingDown = false;
        this._consecutiveFailures = 0;
        this._stats = {
            totalScans: 0,
            totalProcessed: 0,
            totalSkipped: 0,
            totalErrors: 0,
            lastScanAt: null
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Initialize the scanner on server startup.
     * Discovers existing groups, creates cursors, starts cron.
     */
    async initialize() {
        log.info('Initializing GroupMessageScanner');

        try {
            // Auto-discover groups and ensure cursors exist
            await this._discoverAndCreateCursors();

            // Start cron with jitter to prevent thundering herd
            const jitter = Math.floor(Math.random() * STARTUP_JITTER_MS);
            setTimeout(() => {
                this._cronJob = cron.schedule(SCAN_INTERVAL_CRON, () => this._runWithGuard(), {
                    scheduled: true,
                    timezone: 'Asia/Kolkata'
                });
                log.info('Scanner cron scheduled', { cron: SCAN_INTERVAL_CRON });
            }, jitter);

            log.info('GroupMessageScanner initialized successfully');
        } catch (err) {
            log.error('Initialization failed', { error: err.message });
            // Don't rethrow — server should still start
        }
    }

    /**
     * Manual trigger for admin panel / testing.
     */
    async triggerNow() {
        log.info('Manual scan triggered');
        await this._scanAllGroups();
    }

    /**
     * Health check for /healthz endpoint.
     */
    getHealth() {
        return {
            status: this._shuttingDown ? 'shutting_down' : (this._isRunning ? 'scanning' : 'idle'),
            ...this._stats
        };
    }

    /**
     * Graceful shutdown — waits for current scan to finish.
     */
    async shutdown(timeoutMs = 15_000) {
        this._shuttingDown = true;
        log.info('Shutdown initiated');

        if (this._cronJob) {
            this._cronJob.stop();
        }

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline && this._isRunning) {
            await new Promise(r => setTimeout(r, 200));
        }

        log.info('Shutdown complete');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRIVATE — Scanner Core
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Concurrency guard — prevents overlapping scan cycles.
     */
    async _runWithGuard() {
        if (this._shuttingDown) return;
        if (this._isRunning) {
            log.warn('Scan skipped — previous scan still running');
            return;
        }

        this._isRunning = true;
        try {
            await this._scanAllGroups();
            this._consecutiveFailures = 0;
        } catch (err) {
            this._consecutiveFailures++;
            this._stats.totalErrors++;
            log.error('Scan cycle failed', { 
                error: err.message, 
                consecutiveFailures: this._consecutiveFailures 
            });
        } finally {
            this._isRunning = false;
        }
    }

    /**
     * Main scan loop — iterates over all active group cursors.
     */
    async _scanAllGroups() {
        const traceId = crypto.randomBytes(6).toString('hex');
        this._stats.totalScans++;
        this._stats.lastScanAt = new Date();

        // Re-discover new groups each cycle
        await this._discoverAndCreateCursors();

        // Fetch all active cursors
        const cursors = await IntakeGroupCursor.find({ is_active: true }).lean();

        if (cursors.length === 0) {
            log.info('No active group cursors found', { traceId });
            return;
        }

        log.info('Scan cycle started', { traceId, groupCount: cursors.length });

        let cycleProcessed = 0;
        let cycleSkipped = 0;

        for (const cursor of cursors) {
            if (this._shuttingDown) break;

            try {
                const result = await this._scanSingleGroup(cursor, traceId);
                cycleProcessed += result.processed;
                cycleSkipped += result.skipped;
            } catch (err) {
                log.error('Error scanning group', {
                    traceId,
                    groupJid: cursor.groupJid,
                    groupName: cursor.groupName,
                    error: err.message
                });

                // Record error in cursor
                await IntakeGroupCursor.findByIdAndUpdate(cursor._id, {
                    $push: {
                        error_log: {
                            $each: [{ timestamp: new Date(), message: err.message, traceId }],
                            $slice: -MAX_ERROR_LOG_SIZE
                        }
                    }
                });
            }
        }

        this._stats.totalProcessed += cycleProcessed;
        this._stats.totalSkipped += cycleSkipped;

        log.info('Scan cycle completed', {
            traceId,
            groupCount: cursors.length,
            processed: cycleProcessed,
            skipped: cycleSkipped
        });
    }

    /**
     * Scan a single group conversation for new property messages.
     */
    async _scanSingleGroup(cursor, traceId) {
        let processed = 0;
        let skipped = 0;

        // Fetch the conversation with its messages
        const conversation = await Conversation.findById(cursor.conversationId)
            .select('messages groupName groupJid isGroup')
            .lean();

        if (!conversation || !conversation.isGroup) {
            log.warn('Conversation not found or not a group', {
                traceId,
                conversationId: cursor.conversationId,
                groupJid: cursor.groupJid
            });
            return { processed: 0, skipped: 0 };
        }

        const messages = conversation.messages || [];
        if (messages.length === 0) {
            return { processed: 0, skipped: 0 };
        }

        // Bounded slice resilient message extraction (Pillar 2 & 3 compatible)
        let candidateMessages = [];
        if (cursor.lastProcessedMessageId) {
            const lastIdx = messages.findIndex(m => m.metadata?.messageId === cursor.lastProcessedMessageId);
            if (lastIdx !== -1) {
                candidateMessages = messages.slice(lastIdx + 1);
            } else if (cursor.lastProcessedAt) {
                const cutoff = new Date(cursor.lastProcessedAt).getTime();
                candidateMessages = messages.filter(m => new Date(m.timestamp).getTime() > cutoff);
            } else {
                candidateMessages = messages.slice(-MAX_MESSAGES_PER_SCAN);
            }
        } else if (cursor.lastProcessedAt) {
            const cutoff = new Date(cursor.lastProcessedAt).getTime();
            candidateMessages = messages.filter(m => new Date(m.timestamp).getTime() > cutoff);
        } else {
            candidateMessages = messages.slice(-MAX_MESSAGES_PER_SCAN);
        }

        if (candidateMessages.length === 0) {
            return { processed: 0, skipped: 0 };
        }

        // Rate limit candidate messages per scan cycle
        const messagesToProcess = candidateMessages.slice(0, MAX_MESSAGES_PER_SCAN);
        let latestProcessedMessageId = cursor.lastProcessedMessageId;
        let latestProcessedTimestamp = cursor.lastProcessedAt;

        for (let i = 0; i < messagesToProcess.length; i++) {
            if (this._shuttingDown) break;

            const msg = messagesToProcess[i];
            const msgId = msg.metadata?.messageId;
            const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date();

            // Skip assistant/system messages (only process user = incoming)
            if (msg.role !== 'user') {
                latestProcessedMessageId = msgId || latestProcessedMessageId;
                latestProcessedTimestamp = msgTime;
                skipped++;
                continue;
            }

            const content = (msg.content || '').trim();

            // Stage 1: Fast filter — skip short/non-property messages
            if (!this._isLikelyPropertyMessage(content)) {
                latestProcessedMessageId = msgId || latestProcessedMessageId;
                latestProcessedTimestamp = msgTime;
                skipped++;
                continue;
            }

            // Stage 2: Dedup check — use messageId if available
            if (msgId) {
                const existingIntake = await Intake.findOne({ 
                    'raw_source_data.messageId': msgId 
                }).select('_id').lean();

                if (existingIntake) {
                    latestProcessedMessageId = msgId;
                    latestProcessedTimestamp = msgTime;
                    skipped++;
                    continue;
                }
            }

            // Enqueue to UnifiedIntakeQueue
            try {
                const rawData = {
                    text: content,
                    source: `WhatsApp Group: ${conversation.groupName || cursor.groupName || cursor.groupJid}`,
                    groupName: conversation.groupName || cursor.groupName,
                    groupJid: cursor.groupJid,
                    senderName: msg.metadata?.senderName || 'Unknown',
                    participant: msg.metadata?.participant || null,
                    messageId: msgId || `idx_${cursor.conversationId}_${Date.now()}_${i}`,
                    timestamp: msgTime,
                    conversationId: cursor.conversationId
                };

                const result = await addToIntakeQueue('whatsapp_group', rawData, null);

                if (result.success) {
                    processed++;
                    latestProcessedMessageId = msgId || latestProcessedMessageId;
                    latestProcessedTimestamp = msgTime;
                } else {
                    // Duplicate detected by IntakeQueue — still advance cursor
                    latestProcessedMessageId = msgId || latestProcessedMessageId;
                    latestProcessedTimestamp = msgTime;
                    skipped++;
                }
            } catch (enqueueErr) {
                log.error('Failed to enqueue message', {
                    traceId,
                    groupJid: cursor.groupJid,
                    messageIndex: i,
                    error: enqueueErr.message
                });
                break;
            }
        }

        // Update cursor position with resilient timestamp and message ID
        if (latestProcessedMessageId !== cursor.lastProcessedMessageId || latestProcessedTimestamp !== cursor.lastProcessedAt) {
            await IntakeGroupCursor.findByIdAndUpdate(cursor._id, {
                $set: {
                    lastProcessedMessageId: latestProcessedMessageId,
                    lastProcessedAt: latestProcessedTimestamp || new Date()
                },
                $inc: {
                    totalProcessed: processed,
                    totalSkipped: skipped
                }
            });
        }

        if (processed > 0) {
            log.info('Group scan found property messages', {
                traceId,
                groupJid: cursor.groupJid,
                groupName: cursor.groupName,
                processed,
                skipped,
                latestProcessedMessageId
            });
        }

        return { processed, skipped };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRIVATE — Utilities
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Two-stage property content filter.
     * Stage 1 (this method): Fast regex pre-filter.
     * Stage 2 (connector): intakeParser with LLM fallback.
     */
    _isLikelyPropertyMessage(text) {
        if (!text || text.length < MIN_MESSAGE_LENGTH) return false;

        // Skip media-only messages, join/leave notifications
        if (/^\u200e/.test(text)) return false; // WhatsApp system message marker
        if (/^(image|video|audio|document|sticker)\s+omitted$/i.test(text)) return false;
        if (/joined using this group|was added|left$/i.test(text)) return false;
        if (/^(good morning|good night|happy|congratulations|namaste|jai|om|🙏|🎉|❤️)/i.test(text)) return false;

        // Must match at least one property keyword
        return PROPERTY_KEYWORDS_REGEX.test(text);
    }

    /**
     * Auto-discover WhatsApp group conversations and create cursors.
     * This ensures new groups are automatically picked up.
     */
    async _discoverAndCreateCursors() {
        try {
            const groupConversations = await Conversation.find({
                isGroup: true,
                groupJid: { $ne: null, $exists: true }
            }).select('_id groupJid groupName whatsappIntegrationId').lean();

            if (groupConversations.length === 0) return;

            // Get existing cursors
            const existingCursors = await IntakeGroupCursor.find({}).select('groupJid').lean();
            const existingJids = new Set(existingCursors.map(c => c.groupJid));

            // Create cursors for new groups
            const newGroups = groupConversations.filter(g => !existingJids.has(g.groupJid));

            if (newGroups.length > 0) {
                const bulkOps = newGroups.map(g => ({
                    insertOne: {
                        document: {
                            groupJid: g.groupJid,
                            groupName: g.groupName,
                            conversationId: g._id,
                            whatsappIntegrationId: g.whatsappIntegrationId,
                            lastProcessedIndex: -1,
                            is_active: true
                        }
                    }
                }));

                await IntakeGroupCursor.bulkWrite(bulkOps, { ordered: false });
                log.info('Discovered new groups', {
                    count: newGroups.length,
                    groups: newGroups.map(g => g.groupName || g.groupJid)
                });
            }
        } catch (err) {
            // Ignore duplicate key errors from race conditions
            if (err.code !== 11000) {
                log.error('Auto-discovery failed', { error: err.message });
            }
        }
    }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────
const groupMessageScanner = new GroupMessageScanner();

// ─── Graceful Shutdown Hook ───────────────────────────────────────────────────
if (typeof process !== 'undefined') {
    const onSignal = async (sig) => {
        log.info(`${sig} received — shutting down GroupMessageScanner`);
        await groupMessageScanner.shutdown(15_000);
    };
    process.once('SIGTERM', () => onSignal('SIGTERM'));
    process.once('SIGINT', () => onSignal('SIGINT'));
}

export default groupMessageScanner;
