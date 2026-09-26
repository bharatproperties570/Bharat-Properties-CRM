import FailedJobLog from '../../models/FailedJobLog.js';
import { isUnrecoverableJobError, classifyError } from './jobErrorClassifier.js';

export const writeFailedJobLog = async (job, err) => {
    const isUnrecoverable = isUnrecoverableJobError(err);
    const isExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    const isTerminal = isUnrecoverable || isExhausted;

    if (!isTerminal) {
        return; // Intermediate retry failures MUST NOT create FailedJobLog records.
    }

    const classification = classifyError(err);
    const errorMessage = err?.message ? err.message.substring(0, 2000) : 'Unknown error';

    try {
        await FailedJobLog.findOneAndUpdate(
            { jobId: job.id },
            {
                $setOnInsert: {
                    queueName: job.queueName,
                    jobName: job.name,
                    firstFailureAt: new Date(),
                    correlationId: job.data?.correlationId,
                    entityId: job.data?.leadId || job.data?.contactId || job.data?.activityId || job.data?.userId,
                    entityType: job.data?.leadId ? 'Lead' : 
                                job.data?.contactId ? 'Contact' : 
                                job.data?.activityId ? 'Activity' : 
                                job.data?.userId ? 'User' : undefined,
                    eventId: job.data?.eventId,
                    payloadRef: {
                        type: 'identifier',
                        ref: job.id
                    }
                },
                $set: {
                    attemptsMade: job.attemptsMade,
                    maxAttempts: job.opts.attempts ?? 1,
                    terminalFailureAt: new Date(),
                    errorType: classification.type,
                    errorCode: classification.code,
                    errorMessage,
                    retryable: classification.retryable,
                    status: 'TERMINAL'
                }
            },
            {
                upsert: true,
                new: true
            }
        );
    } catch (logErr) {
        console.error(`[FailedJobLogger] Failed to write FailedJobLog for job ${job.id}:`, logErr.message);
    }
};
