import { randomUUID } from 'node:crypto';
import OwnerOutreachCampaign from '../models/OwnerOutreachCampaign.js';
import OwnerOutreachBatch from '../models/OwnerOutreachBatch.js';

export const OWNER_OUTREACH_BATCH_LEASE_MS = 60_000;
export const OWNER_OUTREACH_MAX_CLAIM_SCAN = 25;

export function isWithinDispatchWindow(now, dispatchWindow = {}, timezone = 'Asia/Kolkata') {
    const start = dispatchWindow?.start || '10:00';
    const end = dispatchWindow?.end || '18:00';
    const validClock = (value) => typeof value === 'string' && /^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(value);
    if (!validClock(start) || !validClock(end) || start >= end) return false;

    let parts;
    try {
        parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(now);
    } catch {
        return false;
    }
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const current = `${values.hour}:${values.minute}`;
    return current >= start && current < end;
}

/**
 * Claims due planning batches using MongoDB compare-and-set semantics.
 * This scheduler layer does not dispatch messages or enqueue provider jobs.
 */
export default class OwnerOutreachScheduler {
    async claimNextDueBatch({ workerId, now = new Date(), leaseMs = OWNER_OUTREACH_BATCH_LEASE_MS } = {}) {
        if (typeof workerId !== 'string' || !workerId.trim()) throw new Error('A stable scheduler worker id is required');
        if (!Number.isFinite(leaseMs) || leaseMs < 5_000 || leaseMs > 10 * 60_000) throw new Error('Lease duration must be between 5 seconds and 10 minutes');

        // A claimed batch whose lease expired must remain recoverable even when
        // the campaign cursor has already advanced to a later scheduled batch.
        const expiredClaimCampaignIds = await OwnerOutreachBatch.distinct('campaignId', {
            status: 'CLAIMED',
            'claim.leaseExpiresAt': { $lte: now }
        });
        const campaigns = await OwnerOutreachCampaign.find({
            status: { $in: ['APPROVED', 'ACTIVE'] },
            $or: [
                { nextRunAt: { $lte: now } },
                { _id: { $in: expiredClaimCampaignIds } }
            ]
        }).select('_id status timezone dispatchWindow').sort({ nextRunAt: 1, _id: 1 }).limit(OWNER_OUTREACH_MAX_CLAIM_SCAN).lean();

        for (const campaign of campaigns) {
            // Enforce the persisted campaign-local window before claiming either
            // a new or expired lease. Out-of-window ticks leave batches scheduled.
            if (!isWithinDispatchWindow(now, campaign.dispatchWindow, campaign.timezone || 'Asia/Kolkata')) continue;
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
