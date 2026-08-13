import { Worker } from '../../src/config/redis.js';
import redisConnection from '../../src/config/redis.js';
import { WorkflowEngine } from '../../src/utils/WorkflowEngine.js';
import AutomationLog from '../../models/AutomationLog.js';

// ── Structured logger ──────────────────────────────────────────
const log = {
    info:  (jobId, msg, m={}) => console.log(JSON.stringify({ level:'info',  svc:'AutomationWorker', jobId, msg, ...m, ts: new Date().toISOString() })),
    error: (jobId, msg, m={}) => console.error(JSON.stringify({ level:'error', svc:'AutomationWorker', jobId, msg, ...m, ts: new Date().toISOString() })),
};

const processAutomationJob = async (job) => {
    const { action, entityData, trigger, companyId } = job.data;
    
    log.info(job.id, `Starting delayed execution for Trigger ${trigger?.name}`);
    
    try {
        // We pass a special flag `isDelayedExecution: true` so the WorkflowEngine knows 
        // to actually execute it now rather than re-queueing it.
        await WorkflowEngine.executeAction(action, entityData, trigger, companyId, true);
        log.info(job.id, `Successfully completed delayed execution for Trigger ${trigger?.name}`);
    } catch (error) {
        log.error(job.id, `Failed to execute delayed action`, { error: error.message });
        throw error; // Let BullMQ handle retries
    }
};

const automationWorker = new Worker('crm-automation-queue', processAutomationJob, {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 delayed triggers concurrently
});

automationWorker.on('completed', (job) => {
    log.info(job.id, `Job marked as completed in BullMQ.`);
});

automationWorker.on('failed', (job, err) => {
    log.error(job?.id, `Job failed in BullMQ: ${err.message}`);
});

export default automationWorker;
