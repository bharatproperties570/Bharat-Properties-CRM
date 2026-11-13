import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import OwnerOutreachCampaign from '../models/OwnerOutreachCampaign.js';
import OwnerOutreachBatch from '../models/OwnerOutreachBatch.js';
import OwnerOutreachScheduler from '../services/OwnerOutreachScheduler.js';

let replSet;
let scheduler;
let ownerId;

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(replSet.getUri());
    await Promise.all([OwnerOutreachCampaign.init(), OwnerOutreachBatch.init()]);
    scheduler = new OwnerOutreachScheduler();
});

after(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
});

beforeEach(async () => {
    await Promise.all([OwnerOutreachCampaign.deleteMany({}), OwnerOutreachBatch.deleteMany({})]);
    ownerId = new mongoose.Types.ObjectId();
});

async function seed({ status = 'APPROVED', scheduledAt = new Date('2026-11-13T04:00:00.000Z'), nextRunAt = scheduledAt } = {}) {
    const campaign = await OwnerOutreachCampaign.create({
        name: 'Scheduler concurrency test',
        createdBy: ownerId,
        status,
        channels: ['whatsapp'],
        frequency: 'DAILY',
        batchSize: 50,
        startAt: scheduledAt,
        nextRunAt
    });
    const batch = await OwnerOutreachBatch.create({
        campaignId: campaign._id,
        sequence: 1,
        status: 'SCHEDULED',
        scheduledAt,
        recipientIds: [new mongoose.Types.ObjectId()],
        counts: { selected: 1 }
    });
    return { campaign, batch };
}

test('two workers cannot claim the same due batch concurrently', async () => {
    const now = new Date('2026-11-13T05:00:00.000Z');
    await seed({ scheduledAt: new Date('2026-11-13T04:00:00.000Z') });
    const results = await Promise.all([
        scheduler.claimNextDueBatch({ workerId: 'worker-a', now }),
        scheduler.claimNextDueBatch({ workerId: 'worker-b', now })
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    const stored = await OwnerOutreachBatch.findOne().lean();
    assert.equal(stored.status, 'CLAIMED');
    assert.ok(['worker-a', 'worker-b'].includes(stored.claim.owner));
});

test('expired lease is recoverable and replaces the fencing token', async () => {
    const now = new Date('2026-11-13T05:00:00.000Z');
    const { batch } = await seed({ scheduledAt: new Date('2026-11-13T04:00:00.000Z') });
    const first = await scheduler.claimNextDueBatch({ workerId: 'worker-a', now: new Date('2026-11-13T04:30:00.000Z'), leaseMs: 60_000 });
    assert.ok(first);
    const recovered = await scheduler.claimNextDueBatch({ workerId: 'worker-b', now });
    assert.ok(recovered);
    assert.equal(String(recovered.batch._id), String(batch._id));
    assert.notEqual(recovered.claimToken, first.claimToken);
    assert.equal(recovered.batch.claim.owner, 'worker-b');
});

test('lease renew and release are fenced by the active token', async () => {
    const now = new Date('2026-11-13T05:00:00.000Z');
    const { batch } = await seed({ scheduledAt: new Date('2026-11-13T04:00:00.000Z') });
    const claim = await scheduler.claimNextDueBatch({ workerId: 'worker-a', now });
    assert.ok(claim);
    assert.equal(await scheduler.renewLease({ batchId: batch._id, claimToken: 'stale-token', now }), null);
    assert.ok(await scheduler.renewLease({ batchId: batch._id, claimToken: claim.claimToken, now }));
    assert.equal(await scheduler.releaseClaim({ batchId: batch._id, claimToken: 'stale-token', now }), null);
    const released = await scheduler.releaseClaim({ batchId: batch._id, claimToken: claim.claimToken, now, reasonCode: 'TEST_RELEASE' });
    assert.equal(released.status, 'SCHEDULED');
});

test('paused or cancelled campaigns are never claimed', async () => {
    const now = new Date('2026-11-13T05:00:00.000Z');
    await seed({ status: 'PAUSED', scheduledAt: new Date('2026-11-13T04:00:00.000Z') });
    assert.equal(await scheduler.claimNextDueBatch({ workerId: 'worker-a', now }), null);
});

test('planner cannot transition a claimed batch to PLANNED after Pause commits', async () => {
    const { campaign, batch } = await seed({ scheduledAt: new Date('2026-11-13T04:00:00.000Z') });
    const now = new Date('2026-11-13T05:00:00.000Z');
    const claimed = await scheduler.claimNextDueBatch({ workerId: 'planner-pause-race', now });
    assert.ok(claimed);
    const { default: OwnerOutreachPlanningService } = await import('../services/OwnerOutreachPlanningService.js');
    const { default: OwnerOutreachRecipient } = await import('../models/OwnerOutreachRecipient.js');
    await OwnerOutreachRecipient.create({
        _id: batch.recipientIds[0], campaignId: campaign._id, channel: 'whatsapp',
        endpointHash: 'race-pause-endpoint', maskedEndpoint: '******1234',
        consentState: 'CONSENTED', eligibility: 'ELIGIBLE', dispatchState: 'PENDING'
    });
    const originalFind = OwnerOutreachRecipient.find.bind(OwnerOutreachRecipient);
    let reachedGate;
    const gate = new Promise(resolve => { reachedGate = resolve; });
    let continuePlanner;
    const resume = new Promise(resolve => { continuePlanner = resolve; });
    OwnerOutreachRecipient.find = (...args) => {
        const query = originalFind(...args);
        return {
            select: (projection) => ({
                lean: async () => {
                    reachedGate();
                    await resume;
                    return query.select(projection).lean();
                }
            })
        };
    };
    const planner = new OwnerOutreachPlanningService({ scheduler: { claimNextDueBatch: async () => claimed, releaseClaim: (...args) => scheduler.releaseClaim(...args) } });
    try {
        const processing = planner.processOne({ workerId: 'planner-pause-race', now });
        await gate;
        const service = new (await import('../services/OwnerOutreachService.js')).default();
        await service.pauseCampaign({ _id: ownerId }, campaign._id);
        continuePlanner();
        const result = await processing;
        assert.equal(result.processed, false);
        assert.equal(result.code, 'CAMPAIGN_PAUSED_OR_CANCELLED');
        const stored = await OwnerOutreachBatch.findById(batch._id).lean();
        assert.equal(stored.status, 'SCHEDULED');
        assert.equal((await OwnerOutreachCampaign.findById(campaign._id).lean()).status, 'PAUSED');
    } finally {
        OwnerOutreachRecipient.find = originalFind;
    }
});

test('planner cannot transition a claimed batch to PLANNED after Cancel commits', async () => {
    const { campaign, batch } = await seed({ scheduledAt: new Date('2026-11-13T04:00:00.000Z') });
    const now = new Date('2026-11-13T05:00:00.000Z');
    const claimed = await scheduler.claimNextDueBatch({ workerId: 'planner-cancel-race', now });
    assert.ok(claimed);
    const { default: OwnerOutreachRecipient } = await import('../models/OwnerOutreachRecipient.js');
    await OwnerOutreachRecipient.create({
        _id: batch.recipientIds[0], campaignId: campaign._id, channel: 'whatsapp',
        endpointHash: 'race-cancel-endpoint', maskedEndpoint: '******5678',
        consentState: 'CONSENTED', eligibility: 'ELIGIBLE', dispatchState: 'PENDING'
    });
    const originalFind = OwnerOutreachRecipient.find.bind(OwnerOutreachRecipient);
    let reachedGate;
    const gate = new Promise(resolve => { reachedGate = resolve; });
    let continuePlanner;
    const resume = new Promise(resolve => { continuePlanner = resolve; });
    OwnerOutreachRecipient.find = (...args) => {
        const query = originalFind(...args);
        return {
            select: (projection) => ({
                lean: async () => {
                    reachedGate();
                    await resume;
                    return query.select(projection).lean();
                }
            })
        };
    };
    const planner = new (await import('../services/OwnerOutreachPlanningService.js')).default({
        scheduler: { claimNextDueBatch: async () => claimed, releaseClaim: (...args) => scheduler.releaseClaim(...args) }
    });
    try {
        const processing = planner.processOne({ workerId: 'planner-cancel-race', now });
        await gate;
        const service = new (await import('../services/OwnerOutreachService.js')).default();
        await service.cancelCampaign({ _id: ownerId }, campaign._id, 'race test');
        continuePlanner();
        const result = await processing;
        assert.equal(result.processed, false);
        assert.equal(result.code, 'CAMPAIGN_PAUSED_OR_CANCELLED');
        const stored = await OwnerOutreachBatch.findById(batch._id).lean();
        assert.equal(stored.status, 'CANCELLED');
        assert.equal((await OwnerOutreachCampaign.findById(campaign._id).lean()).status, 'CANCELLED');
    } finally {
        OwnerOutreachRecipient.find = originalFind;
    }
});
