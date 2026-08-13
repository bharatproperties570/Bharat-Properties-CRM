import { Queue } from '../../src/config/redis.js';
import redisConnection from '../../src/config/redis.js';
import AutomationLog from '../../models/AutomationLog.js';

const automationQueue = new Queue('crm-automation-queue', { connection: redisConnection });

export const enqueueAction = async (actionData, delayMs) => {
    try {
        console.log(`[AutomationQueue] Enqueueing delayed action with delay: ${delayMs}ms`);
        
        await automationQueue.add('execute-action', actionData, {
            delay: delayMs,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true, // Clean up successful jobs
            removeOnFail: false // Keep failed jobs for inspection
        });

        return true;
    } catch (error) {
        console.error(`[AutomationQueue] Failed to enqueue action:`, error);
        
        // Log failure to queue
        if (actionData.trigger && actionData.entityData) {
            await AutomationLog.create({
                ruleType: 'Trigger',
                ruleId: actionData.trigger._id,
                targetEntityId: actionData.entityData._id || actionData.entityData.id,
                targetModule: actionData.trigger.module,
                status: 'failed',
                details: { error: 'Failed to enqueue delayed job: ' + error.message },
                companyId: actionData.companyId
            });
        }
        
        return false;
    }
};

export default automationQueue;
