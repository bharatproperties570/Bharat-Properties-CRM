import dotenv from 'dotenv';
import connectDB from './src/config/db.js';
import Intake from './models/Intake.js';
import { addToIntakeQueue } from './services/intakeQueue/IntakeQueue.js';
import { clearCacheEndpoint } from './src/modules/parsing/parsingRule.controller.js';

dotenv.config();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const run = async () => {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected.');

    // 1. Verify Structured Logging & DLQ Hooks
    console.log('\n--- 1. Testing IntakeWorker Structured Logging & DLQ In MongoDB ---');

    // Create a dummy raw intake record that will fail processing (e.g. invalid source type or data)
    // We will bypass actual connector success by enqueuing a job that triggers a throw.
    // Let's create an Intake record and queue it.
    // Wait, if we queue a job with sourceType = 'error_trigger', the registry will throw 'unknown connector'
    // which triggers worker failure!
    const result = await addToIntakeQueue('manual', {});
    console.log('Enqueued failing intake job:', result);

    if (!result.success) {
        console.error('❌ Failed to enqueue test job!');
        process.exit(1);
    }

    const { intakeId } = result;

    // Spy on console.log to check if we emit structured JSON
    const originalConsoleLog = console.log;
    let jsonLogsCount = 0;
    let hasDLQLog = false;

    console.log = (msg, ...args) => {
        // Run original console log so it prints
        originalConsoleLog(msg, ...args);
        
        try {
            const parsed = JSON.parse(msg);
            if (parsed.svc === 'IntakeWorker') {
                jsonLogsCount++;
                if (parsed.level === 'error' && parsed.msg.includes('Job has failed permanently')) {
                    hasDLQLog = true;
                }
            }
        } catch (e) {
            // Not JSON, ignore
        }
    };

    // Wait for the mock queue processor to run (which executes after 50ms)
    console.log('Waiting for job to execute...');
    await sleep(1000);

    // Restore console.log
    console.log = originalConsoleLog;

    // Check status in DB
    const intake = await Intake.findById(intakeId);
    console.log('Final Intake status in MongoDB:', intake?.status);
    console.log('Structured JSON logs processed:', jsonLogsCount);
    console.log('Error logs count on document:', intake?.error_log?.length);

    // Clean up
    if (intake) {
        await Intake.deleteOne({ _id: intakeId });
        console.log('Cleaned up temporary failing intake.');
    }

    if (intake && intake.status === 'Needs Review' && intake.error_log.some(l => l.message.includes('DLQ'))) {
        console.log('✅ Dead Letter Queue (DLQ) state successfully set in MongoDB!');
    } else {
        console.error('❌ DLQ verification failed! Final status:', intake?.status);
        process.exit(1);
    }

    if (jsonLogsCount > 0) {
        console.log('✅ Structured Logging works correctly!');
    } else {
        console.error('❌ Structured Logging failed to output any JSON logs!');
        process.exit(1);
    }

    // 2. Verify Cache Clearing API endpoint
    console.log('\n--- 2. Testing Cache Invalidation API endpoint ---');
    const mockReq = {};
    const mockRes = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(obj) {
            this.body = obj;
            return this;
        }
    };

    await clearCacheEndpoint(mockReq, mockRes);
    console.log('API Response:', JSON.stringify(mockRes.body));

    if (mockRes.statusCode === 200 && mockRes.body.success === true) {
        console.log('✅ Cache invalidation API endpoint works successfully!');
    } else {
        console.error('❌ Cache invalidation API endpoint failed! Response:', mockRes.body);
        process.exit(1);
    }

    console.log('\n🎉 ALL PRIORITY 2 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
};

run().catch(err => {
    console.error('Unhandled verification error:', err);
    process.exit(1);
});
