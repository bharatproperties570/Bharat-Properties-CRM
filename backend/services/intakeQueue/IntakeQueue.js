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

export const addToIntakeQueue = async (sourceType, rawData, userId = null) => {
    // Basic deduplication check using raw text if manual
    if (sourceType === 'manual' && rawData.text) {
        const tempConnector = connectorRegistry.getConnector('manual');
        const hash = tempConnector.generateDuplicateHash(rawData.text);
        
        const existing = await Intake.findOne({ duplicate_hash: hash });
        if (existing) {
            return { success: false, message: 'Duplicate intake detected', intakeId: existing._id };
        }
    }

    // 1. Create a "Queued" record in MongoDB
    const intakeRecord = new Intake({
        source: rawData.source || 'Other',
        source_type: sourceType,
        status: 'Queued',
        raw_source_data: rawData,
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
