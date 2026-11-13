import OwnerOutreachCampaign from '../models/OwnerOutreachCampaign.js';
import OwnerOutreachBatch from '../models/OwnerOutreachBatch.js';
import OwnerOutreachRecipient from '../models/OwnerOutreachRecipient.js';
import OwnerOutreachScheduler from './OwnerOutreachScheduler.js';

const MAX_RECIPIENTS_PER_BATCH = 2000;

/**
 * Planner-only lifecycle consumer. It converts a leased scheduled batch into
 * PLANNED after validating the immutable recipient ledger and campaign state.
 * It intentionally does not query provider credentials, reserve send quotas,
 * enqueue BullMQ outbound jobs, or invoke any provider adapter.
 */
export default class OwnerOutreachPlanningService {
    constructor({ scheduler = new OwnerOutreachScheduler() } = {}) {
        this.scheduler = scheduler;
    }

    async processOne({ workerId, now = new Date() } = {}) {
        const claim = await this.scheduler.claimNextDueBatch({ workerId, now });
        if (!claim) return { processed: false, code: 'NO_DUE_BATCH' };

        const { batch, claimToken } = claim;
        const campaign = await OwnerOutreachCampaign.findOne({
            _id: batch.campaignId,
            status: { $in: ['APPROVED', 'ACTIVE'] }
        }).select('_id status').lean();

        if (!campaign) {
            await this.scheduler.releaseClaim({
                batchId: batch._id, claimToken, now, reasonCode: 'CAMPAIGN_NOT_RUNNABLE'
            });
            return { processed: false, code: 'CAMPAIGN_NOT_RUNNABLE' };
        }

        if (!Array.isArray(batch.recipientIds) || batch.recipientIds.length === 0 ||
            batch.recipientIds.length > MAX_RECIPIENTS_PER_BATCH) {
            await this.scheduler.releaseClaim({
                batchId: batch._id, claimToken, now, reasonCode: 'INVALID_BATCH_RECIPIENT_SET'
            });
            return { processed: false, code: 'INVALID_BATCH_RECIPIENT_SET' };
        }

        const recipients = await OwnerOutreachRecipient.find({
            _id: { $in: batch.recipientIds },
            campaignId: batch.campaignId
        }).select('_id eligibility consentState dispatchState').lean();

        const valid = recipients.length === batch.recipientIds.length &&
            recipients.every((recipient) =>
                recipient.eligibility === 'ELIGIBLE' &&
                recipient.consentState === 'CONSENTED' &&
                recipient.dispatchState === 'PENDING'
            );

        if (!valid) {
            await this.scheduler.releaseClaim({
                batchId: batch._id, claimToken, now, reasonCode: 'RECIPIENT_LEDGER_REVALIDATION_FAILED'
            });
            return { processed: false, code: 'RECIPIENT_LEDGER_REVALIDATION_FAILED' };
        }

        // Fence the final state transition with the lease token and current
        // campaign status. Pause/cancel or lease replacement prevents planning.
        const stillRunnable = await OwnerOutreachCampaign.exists({
            _id: batch.campaignId,
            status: { $in: ['APPROVED', 'ACTIVE'] }
        });
        if (!stillRunnable) {
            await this.scheduler.releaseClaim({
                batchId: batch._id, claimToken, now, reasonCode: 'CAMPAIGN_PAUSED_OR_CANCELLED'
            });
            return { processed: false, code: 'CAMPAIGN_PAUSED_OR_CANCELLED' };
        }

        const planned = await OwnerOutreachBatch.findOneAndUpdate(
            {
                _id: batch._id,
                status: 'CLAIMED',
                'claim.token': claimToken,
                'claim.leaseExpiresAt': { $gt: now }
            },
            {
                $set: {
                    status: 'PLANNED',
                    counts: {
                        selected: recipients.length,
                        consentBlocked: 0,
                        suppressed: 0,
                        accepted: 0,
                        delivered: 0,
                        failedConfirmed: 0,
                        deliveryUnknown: 0
                    },
                    claim: { owner: null, token: null, claimedAt: null, leaseExpiresAt: null },
                    completedAt: now,
                    lastErrorCode: null
                }
            },
            { new: true }
        ).select('_id status counts').lean();

        if (!planned) return { processed: false, code: 'CLAIM_LOST_OR_LEASE_EXPIRED' };

        // nextRunAt remains the scheduler's next SCHEDULED batch cursor.
        // PLANNED means planning is complete only; it does not mean sent/delivered.
        return {
            processed: true,
            code: 'BATCH_PLANNED',
            batchId: String(planned._id),
            plannedRecipients: planned.counts.selected,
            dispatchEnabled: false
        };
    }

    async processDue({ workerId, now = new Date(), maxBatches = 10 } = {}) {
        if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 25) {
            throw new Error('maxBatches must be an integer between 1 and 25');
        }
        const results = [];
        for (let index = 0; index < maxBatches; index += 1) {
            const result = await this.processOne({ workerId, now });
            results.push(result);
            if (!result.processed && result.code === 'NO_DUE_BATCH') break;
        }
        return {
            processed: results.filter((result) => result.processed).length,
            results,
            dispatchEnabled: false
        };
    }
}
