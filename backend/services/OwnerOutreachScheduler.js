import { randomUUID } from 'node:crypto';
import OwnerOutreachCampaign from '../models/OwnerOutreachCampaign.js';
import OwnerOutreachBatch from '../models/OwnerOutreachBatch.js';

export const OWNER_OUTREACH_BATCH_LEASE_MS = 60_000;
export const OWNER_OUTREACH_MAX_CLAIM_SCAN = 25;

/**
 * Claims due planning batches using MongoDB compare-and-set semantics.
 * This scheduler layer does not dispatch messages or enqueue provider jobs.
 */
export default class OwnerOutreachScheduler {
    async claimNextDueBatch({ workerId, now = new Date(), leaseMs = OWNER_OUTREACH_BATCH_LEASE_MS } = {}) {
        if (typeof workerId !== 'string' || !workerId.trim()) throw new Error('A stable scheduler worker id is required');
        if (!Number.isFinite(leaseMs) || leaseMs < 5_000 || leaseMs > 10 * 60_000) throw new Error('Lease duration must be between 5 seconds and 10 minutes');

        const campaigns = await OwnerOutreachCampaign.find({
            status: { $in: ['APPROVED', 'ACTIVE'] },
            nextRunAt: { $lte: now }
        }).select('_id status').sort({ nextRunAt: 1, _id: 1 }).limit(OWNER_OUTREACH_MAX_CLAIM_SCAN).lean();

        for (const campaign of campaigns) {
            const token = randomUUID();
            const leaseExpiresAt = new Date(now.getTime() + leaseMs);
            const batch = await OwnerOutreachBatch.findOneAndUpdate(
                {
                    campaignId: campaign._id,
                    scheduledAt: { $lte: now },
                    $or: [
                        { status: 'SCHEDULED' },
                        { status: 'CLAIMED', 'claim.leaseExpiresAt': { $lte: now } }
                    ]
                },
                {
                    $set: {
                        status: 'CLAIMED',
                        claim: { owner: workerId, token, claimedAt: now, leaseExpiresAt },
                        startedAt: now
                    }
                },
                { new: true, sort: { sequence: 1 } }
            ).lean();

            if (!batch) continue;

            // Re-check campaign lifecycle after claiming. A concurrent pause/cancel
            // wins; release our lease and leave the batch inert.
            const stillRunnable = await OwnerOutreachCampaign.exists({
                _id: campaign._id,
                status: { $in: ['APPROVED', 'ACTIVE'] }
            });
            if (!stillRunnable) {
                await OwnerOutreachBatch.updateOne(
                    { _id: batch._id, status: 'CLAIMED', 'claim.token': token },
                    { $set: { status: 'SCHEDULED', claim: { owner: null, token: null, claimedAt: null, leaseExpiresAt: null }, startedAt: null } }
                );
                continue;
            }

            // Advance the campaign cursor to its next still-scheduled batch.
            // This prevents a large campaign from monopolizing every bounded scan
            // after its earliest batch has already been claimed.
            const nextBatch = await OwnerOutreachBatch.findOne({
                campaignId: campaign._id,
                status: 'SCHEDULED'
            }).sort({ scheduledAt: 1, sequence: 1 }).select('scheduledAt').lean();
            await OwnerOutreachCampaign.updateOne(
                { _id: campaign._id, status: { $in: ['APPROVED', 'ACTIVE'] } },
                { $set: { nextRunAt: nextBatch?.scheduledAt || null, lastRunAt: now } }
            );

            return { batch, claimToken: token };
        }
        return null;
    }

    async renewLease({ batchId, claimToken, now = new Date(), leaseMs = OWNER_OUTREACH_BATCH_LEASE_MS } = {}) {
        if (!batchId || !claimToken) throw new Error('Batch id and claim token are required');
        const leaseExpiresAt = new Date(now.getTime() + leaseMs);
        const result = await OwnerOutreachBatch.findOneAndUpdate(
            { _id: batchId, status: 'CLAIMED', 'claim.token': claimToken, 'claim.leaseExpiresAt': { $gt: now } },
            { $set: { 'claim.leaseExpiresAt': leaseExpiresAt } },
            { new: true }
        ).select('_id status claim.leaseExpiresAt').lean();
        return result;
    }

    async releaseClaim({ batchId, claimToken, now = new Date(), reasonCode = 'PREFLIGHT_NOT_READY' } = {}) {
        if (!batchId || !claimToken) throw new Error('Batch id and claim token are required');
        return OwnerOutreachBatch.findOneAndUpdate(
            { _id: batchId, status: 'CLAIMED', 'claim.token': claimToken },
            {
                $set: {
                    status: 'SCHEDULED',
                    claim: { owner: null, token: null, claimedAt: null, leaseExpiresAt: null },
                    startedAt: null,
                    lastErrorCode: String(reasonCode).slice(0, 100)
                }
            },
            { new: true }
        ).select('_id status scheduledAt').lean();
    }
}
