import crypto from 'crypto';
import { Queue, Worker } from '../../src/config/redis.js';
import redisConnection from '../../src/config/redis.js';
import Intake from '../../models/Intake.js';
import connectorRegistry from '../intakeConnectors/ConnectorRegistry.js';
import aiVerificationEngine from '../intakeVerification/AIVerificationEngine.js';
import intakeAIAssistantEngine from '../intakeVerification/IntakeAIAssistantEngine.js';
import NotificationEngine from '../NotificationEngine.js';
import { tracer } from '../../src/config/otel.js';

// ── Structured logger ──────────────────────────────────────────
const log = {
    info:  (jobId, msg, m={}) => console.log(JSON.stringify({ level:'info',  svc:'IntakeWorker', jobId, msg, ...m, ts: new Date().toISOString() })),
    warn:  (jobId, msg, m={}) => console.warn(JSON.stringify({ level:'warn',  svc:'IntakeWorker', jobId, msg, ...m, ts: new Date().toISOString() })),
    error: (jobId, msg, m={}) => console.error(JSON.stringify({ level:'error', svc:'IntakeWorker', jobId, msg, ...m, ts: new Date().toISOString() })),
};

const intakeQueue = new Queue('UnifiedIntakeQueue', { connection: redisConnection });

/**
 * Generates a normalized semantic content hash for property listings (Pillar 4).
 * Strips URLs, phone numbers, emojis, and punctuation variations to catch
 * cross-posted and forwarded listings across 500+ groups.
 */
export function generateNormalizedDealHash(text) {
    if (!text || typeof text !== 'string') return null;
    const clean = text
        .toLowerCase()
        // Strip URLs and invite links
        .replace(/https?:\/\/\S+/gi, '')
        // Strip Indian phone numbers (10 digits)
        .replace(/(?:\+?91[\-\s]?)?[6-9]\d{9}/g, '')
        // Strip common contact verbs before/after numbers
        .replace(/\b(call|contact|dm|msg|whatsapp|ph|mob|phone|mo|wa\.me)\b/gi, '')
        // Strip emojis and non-standard unicode
        .replace(/[\u{1F300}-\u{1F9FF}|\u{2600}-\u{26FF}|\u{1F600}-\u{1F64F}|\u{1F680}-\u{1F6FF}]/gu, '')
        // Strip punctuation and special chars
        .replace(/[^\w\s]/gi, ' ')
        // Normalize multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
    
    if (clean.length < 15) return null;
    return crypto.createHash('sha256').update(clean).digest('hex');
}

export const addToIntakeQueue = async (sourceType, rawData, userId = null) => {
    // 🛡️ Pillar 4: Exact WhatsApp Message ID Deduplication Guard
    if (rawData?.messageId) {
        try {
            const msgExists = await Intake.findOne({ 
                'raw_source_data.messageId': rawData.messageId 
            }).select('_id').lean();
            if (msgExists) {
                return { success: false, duplicate: true, reason: 'exact_message_id', intakeId: msgExists._id };
            }
        } catch (e) {}
    }

    // 🛡️ Pillar 4: Cross-Group 24-Hour Deal Deduplication Gate
    // 80-85% of WhatsApp group deals are duplicate forwards.
    // Suppress redundant BullMQ + AI Verification to prevent 429 quota exhaustion.
    let dealHash = null;
    if ((sourceType === 'whatsapp_group' || sourceType === 'manual') && rawData.text) {
        dealHash = generateNormalizedDealHash(rawData.text);
        if (dealHash) {
            try {
                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const existing = await Intake.findOne({
                    $or: [
                        { duplicate_hash: dealHash },
                        { 'raw_source_data.deal_hash': dealHash }
                    ],
                    createdAt: { $gte: twentyFourHoursAgo }
                });

                if (existing) {
                    // Record sighting in existing intake document without triggering LLM
                    Intake.updateOne(
                        { _id: existing._id },
                        {
                            $inc: { 'duplicate_intelligence.duplicate_probability': 5 },
                            $addToSet: {
                                'raw_source_data.seen_in_groups': rawData.groupName || rawData.groupJid || 'group',
                                ...(rawData.participant ? { 'contact_numbers': rawData.participant } : {})
                            }
                        }
                    ).catch(() => {});

                    return { 
                        success: false, 
                        duplicate: true, 
                        reason: 'forwarded_cross_group_duplicate', 
                        intakeId: existing._id 
                    };
                }
            } catch (err) {
                console.warn('[IntakeQueue:Dedup Error]:', err.message);
            }
        }
    }

    // Fallback connector hash for manual entries
    if (!dealHash && sourceType === 'manual' && rawData.text) {
        const tempConnector = connectorRegistry.getConnector('manual');
        dealHash = tempConnector.generateDuplicateHash(rawData.text);
        const existing = await Intake.findOne({ duplicate_hash: dealHash });
        if (existing) {
            return { success: false, duplicate: true, message: 'Duplicate intake detected', intakeId: existing._id };
        }
    }

    // 1. Create a "Queued" record in MongoDB with duplicate_hash pre-populated
    const intakeRecord = new Intake({
        source: rawData.source || 'Other',
        source_type: sourceType,
        status: 'Queued',
        duplicate_hash: dealHash || undefined,
        whatsappIntegrationId: rawData.whatsappIntegrationId || undefined,
        raw_source_data: {
            ...rawData,
            deal_hash: dealHash,
            whatsappIntegrationId: rawData.whatsappIntegrationId
        },
        createdBy: userId
    });
    await intakeRecord.save();

    // 2. Add to BullMQ Queue for background processing
    try {
        await intakeQueue.add('process-intake', {
            intakeId: intakeRecord._id,
            sourceType,
            rawData,
            userId
        }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 }
        });
    } catch (queueErr) {
        console.warn(`[IntakeQueue] Warning: Redis connection failed (${queueErr.message}). Intake record successfully created in MongoDB under 'Queued' state.`);
    }

    return { success: true, intakeId: intakeRecord._id };
};

// Worker to process the queue
const intakeWorker = new Worker('UnifiedIntakeQueue', async job => {
    return tracer.startActiveSpan('process-intake', async (span) => {
        const { intakeId, sourceType, rawData, userId } = job.data;
        span.setAttribute('job.id', job.id);
        span.setAttribute('intake.id', String(intakeId));
        span.setAttribute('source.type', sourceType);
        
        const intake = await Intake.findById(intakeId);
        
        if (!intake) {
            log.warn(job.id, 'Intake document not found in DB', { intakeId });
            span.recordException(new Error('Intake document not found'));
            span.setStatus({ code: 2, message: 'Intake document not found' });
            span.end();
            return;
        }

        try {
            log.info(job.id, 'Processing intake job', { intakeId, sourceType });
            log.info(job.id, 'Raw input data received', { rawData });

            // 1. Update status to Processing
            intake.status = 'Processing';
            intake.processing_attempts += 1;
            await intake.save();

            // 2. Fetch appropriate connector
            const connector = connectorRegistry.getConnector(sourceType);
            
            // 3. Process the data (extract, normalize, validate)
            const normalizedData = await connector.process(rawData);

            // 4. Temporarily assign normalized data for Verification Engine to use
            Object.assign(intake, normalizedData);

            // 5. Run AI Verification Layer
            const verificationResult = await aiVerificationEngine.verify(intake);
            Object.assign(intake, verificationResult);

            // 6. Run AI Assistant Layer
            const aiAssistantResult = intakeAIAssistantEngine.analyze(intake);
            intake.ai_assistant = aiAssistantResult;

            // 7. Finalize Status
            intake.status = 'Processed'; // Overriding base processing status, but preserving verification_status
            intake.createdBy = userId;
            
            await intake.save();

            // 🛡️ Auto-Verification Dispatch Hook (Option B: Meta-Safe Anti-Ban Autonomous Pacing)
            if (intake.source_type === 'whatsapp_group') {
                try {
                    const { default: autoVerificationDispatcher } = await import('../intakeVerification/AutoVerificationDispatcher.js');
                    await autoVerificationDispatcher.evaluateAndQueue(intake);
                } catch (autoErr) {
                    console.error('[IntakeWorker] Auto-Verification Queue Error:', autoErr.message);
                }
            }
            
            log.info(job.id, 'Successfully processed and verified intake', { intakeId });
            span.setStatus({ code: 1 });
        } catch (error) {
            log.error(job.id, 'Error processing intake', { intakeId, error: error.message, stack: error.stack });
            span.recordException(error);
            span.setStatus({ code: 2, message: error.message });
            
            intake.error_log.push({
                message: error.message,
                stack: error.stack
            });
            
            intake.status = 'Failed';
            await intake.save();
            
            throw error; // Rethrow to trigger BullMQ retry logic
        } finally {
            span.end();
        }
    });
}, { connection: redisConnection });

intakeWorker.on('completed', job => {
    log.info(job.id, 'Job has completed successfully!');
});

intakeWorker.on('failed', async (job, err) => {
    log.error(job.id, `Job has failed permanently after max retries: ${err.message}`, { error: err.message, stack: err.stack });

    try {
        const { intakeId } = job.data;
        const intake = await Intake.findById(intakeId);
        if (intake) {
            intake.status = 'Needs Review';
            intake.error_log.push({
                timestamp: new Date(),
                message: `DLQ: Permanent failure after max attempts. Error: ${err.message}`,
                stack: err.stack
            });
            await intake.save();

            // Send notification to alert system administrators
            await NotificationEngine.notify({
                type: 'system_alert',
                title: `🚨 Intake Job Failure DLQ Alert`,
                message: `Intake ID ${intakeId} (Job ${job.id}) has permanently failed after 3 attempts. Error: ${err.message}`,
                priority: 'high',
                metadata: { jobId: job.id, intakeId, error: err.message }
            });
            log.info(job.id, 'DLQ processing complete, admin notification sent.', { intakeId });
        }
    } catch (dlqErr) {
        log.error(job.id, `Critical: DLQ hook failed: ${dlqErr.message}`, { error: dlqErr.message });
    }
});

export default intakeQueue;
export { intakeWorker };
