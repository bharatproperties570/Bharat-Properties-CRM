import mongoose from 'mongoose';
import OwnerOutreachDispatchBudget from '../models/OwnerOutreachDispatchBudget.js';
import OwnerOutreachPeriodReservation from '../models/OwnerOutreachPeriodReservation.js';

const MAX_BUDGET_UPSERT_RACE_RETRIES = 3;

function isPeriodDuplicate(error) {
    const keyPattern = error?.keyPattern || {};
    return (
        (keyPattern.endpointHash === 1 && keyPattern.channel === 1 && keyPattern.periodKey === 1) ||
        String(error?.message || '').includes('uniq_owner_outreach_endpoint_period')
    );
}

function isBudgetUpsertRace(error) {
    const keyPattern = error?.keyPattern || {};
    return (
        (keyPattern.bucketKey === 1 && keyPattern.scope === 1) ||
        String(error?.message || '').includes('uniq_owner_outreach_daily_budget')
    );
}

// Durable policy reservation primitive. Must run on a MongoDB replica set because
// period de-duplication and both quota increments must commit or roll back together.
export default class OwnerOutreachReservationService {
    async reserve({ endpointHash, channel, periodKey, bucketKey, campaignId, recipientId, globalDailyCap, channelDailyCap }) {
        if (!endpointHash || !channel || !periodKey || !bucketKey || !campaignId || !recipientId) {
            throw new Error('All endpoint, period, bucket and ownership identifiers are required');
        }
        if (!['whatsapp', 'sms', 'rcs', 'email'].includes(channel)) throw new Error('Unsupported outreach channel');
        for (const cap of [globalDailyCap, channelDailyCap]) {
            if (!Number.isInteger(cap) || cap < 1) throw new Error('Daily quota caps must be positive integers');
        }

        for (let attempt = 1; attempt <= MAX_BUDGET_UPSERT_RACE_RETRIES; attempt += 1) {
            const session = await mongoose.startSession();
            let reservation = null;
            try {
                await session.withTransaction(async () => {
                    // Unique endpoint/channel/period key is the cross-campaign dedupe fence.
                    const created = await OwnerOutreachPeriodReservation.create([{
                        endpointHash, channel, periodKey, campaignId, recipientId, state: 'RESERVED'
                    }], { session });
                    reservation = created[0];

                    const scopes = [
                        { scope: 'GLOBAL', cap: globalDailyCap },
                        { scope: channel, cap: channelDailyCap }
                    ];
                    for (const item of scopes) {
                        await OwnerOutreachDispatchBudget.updateOne(
                            { bucketKey, scope: item.scope },
                            { $setOnInsert: { cap: item.cap, reservedCount: 0 } },
                            { upsert: true, session }
                        );
                        const budget = await OwnerOutreachDispatchBudget.findOneAndUpdate(
                            { bucketKey, scope: item.scope, cap: item.cap, reservedCount: { $lt: item.cap } },
                            { $inc: { reservedCount: 1 } },
                            { new: true, session }
                        ).lean();
                        if (!budget) throw new Error(item.scope === 'GLOBAL' ? 'GLOBAL_DAILY_CAP_REACHED' : 'CHANNEL_DAILY_CAP_REACHED');
                    }
                }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
                return { reserved: true, reservationId: reservation?._id };
            } catch (error) {
                if (error?.code === 11000) {
                    if (isPeriodDuplicate(error)) {
                        return { reserved: false, code: 'PERIOD_DUPLICATE_SUPPRESSED' };
                    }

                    // Concurrent first-use requests can race while inserting the
                    // same GLOBAL/channel budget row. Retry the entire transaction
                    // with a fresh session; never retry only the counter increment.
                    if (isBudgetUpsertRace(error) && attempt < MAX_BUDGET_UPSERT_RACE_RETRIES) {
                        continue;
                    }

                    // Some MongoDB versions omit keyPattern. Confirm a period
                    // reservation before classifying an otherwise unknown duplicate.
                    const duplicate = await OwnerOutreachPeriodReservation.exists({ endpointHash, channel, periodKey });
                    if (duplicate) return { reserved: false, code: 'PERIOD_DUPLICATE_SUPPRESSED' };
                    throw error;
                }
                if (['GLOBAL_DAILY_CAP_REACHED', 'CHANNEL_DAILY_CAP_REACHED'].includes(error.message)) {
                    return { reserved: false, code: error.message };
                }
                throw error;
            } finally {
                await session.endSession();
            }
        }

        return { reserved: false, code: 'BUDGET_INITIALIZATION_CONTENTION' };
    }
}
