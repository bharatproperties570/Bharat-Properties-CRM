import { Queue, Worker } from 'bullmq';
import Intake from '../../models/Intake.js';
import connectorRegistry from '../intakeConnectors/ConnectorRegistry.js';
import aiVerificationEngine from '../intakeVerification/AIVerificationEngine.js';
import intakeAIAssistantEngine from '../intakeVerification/IntakeAIAssistantEngine.js';

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
};

const intakeQueue = new Queue('UnifiedIntakeQueue', { connection });

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
    await intakeQueue.add('process-intake', {
        intakeId: intakeRecord._id,
        sourceType,
        rawData,
        userId
    }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
    });

    return { success: true, intakeId: intakeRecord._id };
};

// Worker to process the queue
const intakeWorker = new Worker('UnifiedIntakeQueue', async job => {
    const { intakeId, sourceType, rawData, userId } = job.data;
    const intake = await Intake.findById(intakeId);
    
    if (!intake) return;

    try {
        console.log(`[UnifiedIntake] Processing Job ${job.id} | Intake: ${intakeId} | Type: ${sourceType}`);
        console.log(`[UnifiedIntake] Raw Data:`, JSON.stringify(rawData));

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
        
        console.log(`[UnifiedIntake] Successfully processed and verified intake: ${intakeId}`);
    } catch (error) {
        console.error(`[UnifiedIntake] Error processing intake: ${intakeId}`, error);
        
        intake.error_log.push({
            message: error.message,
            stack: error.stack
        });
        
        intake.status = 'Failed';
        await intake.save();
        
        throw error; // Rethrow to trigger BullMQ retry logic
    }
}, { connection });

intakeWorker.on('completed', job => {
    console.log(`Job ${job.id} has completed!`);
});

intakeWorker.on('failed', (job, err) => {
    console.log(`Job ${job.id} has failed with ${err.message}`);
});

export default intakeQueue;
