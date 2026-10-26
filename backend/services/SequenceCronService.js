import SequenceEnrollment from '../models/SequenceEnrollment.js';
import { SequenceEngine } from '../src/utils/SequenceEngine.js';

export class SequenceCronService {
    /**
     * Recovery and cron execution loop for sequences.
     * Finds active enrollments where nextExecutionAt <= now, and lease is either unheld or expired,
     * then executes the pending step.
     */
    static async processSequences(limit = 50) {
        console.log('[SequenceCronService] Running Sequence processing and recovery job...');
        try {
            const now = new Date();
            const overdueEnrollments = await SequenceEnrollment.find({
                status: 'active',
                nextExecutionAt: { $lte: now },
                $or: [
                    { leaseUntil: { $exists: false } },
                    { leaseUntil: null },
                    { leaseUntil: { $lte: now } }
                ]
            }).limit(limit);

            console.log(`[SequenceCronService] Found ${overdueEnrollments.length} overdue sequence enrollments to process/recover.`);

            const results = [];
            for (const enrollment of overdueEnrollments) {
                try {
                    const res = await SequenceEngine.executeNextStep(enrollment._id, enrollment.currentStepNumber);
                    results.push({ enrollmentId: enrollment._id, step: enrollment.currentStepNumber, res });
                } catch (stepErr) {
                    console.error(`[SequenceCronService] Failed executing enrollment ${enrollment._id} step ${enrollment.currentStepNumber}:`, stepErr.message);
                    results.push({ enrollmentId: enrollment._id, step: enrollment.currentStepNumber, error: stepErr.message });
                }
            }

            return { processedCount: results.length, results };
        } catch (error) {
            console.error('[SequenceCronService] Error processing sequences:', error);
            throw error;
        }
    }
}
