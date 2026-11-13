import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import OwnerOutreachDispatchBudget from '../models/OwnerOutreachDispatchBudget.js';
import OwnerOutreachPeriodReservation from '../models/OwnerOutreachPeriodReservation.js';
import OwnerOutreachReservationService from '../services/OwnerOutreachReservationService.js';

let replSet;
let service;
const campaignId = () => new mongoose.Types.ObjectId();
const recipientId = () => new mongoose.Types.ObjectId();

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(replSet.getUri());
    await Promise.all([
        OwnerOutreachDispatchBudget.init(),
        OwnerOutreachPeriodReservation.init()
    ]);
    service = new OwnerOutreachReservationService();
});

after(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
});

beforeEach(async () => {
    await Promise.all([
        OwnerOutreachDispatchBudget.deleteMany({}),
        OwnerOutreachPeriodReservation.deleteMany({})
    ]);
});

async function seedBudgets(bucketKey, globalCap, channelCap, channel = 'whatsapp') {
    await OwnerOutreachDispatchBudget.create([
        { bucketKey, scope: 'GLOBAL', cap: globalCap, reservedCount: 0 },
        { bucketKey, scope: channel, cap: channelCap, reservedCount: 0 }
    ]);
}

function request(overrides = {}) {
    return {
        endpointHash: 'hmac-endpoint-001',
        channel: 'whatsapp',
        periodKey: '2026-11',
        bucketKey: '2026-11-13',
        campaignId: campaignId(),
        recipientId: recipientId(),
        globalDailyCap: 100,
        channelDailyCap: 50,
        ...overrides
    };
}

test('replica-set concurrent reservations never exceed the global or channel cap', async () => {
    const bucketKey = '2026-11-13-concurrency';
    await seedBudgets(bucketKey, 5, 5);
    const requests = Array.from({ length: 20 }, (_, i) => request({
        endpointHash: `endpoint-${i}`,
        periodKey: `period-${i}`,
        bucketKey,
        globalDailyCap: 5,
        channelDailyCap: 5
    }));
    const results = await Promise.all(requests.map((item) => service.reserve(item)));
    assert.equal(results.filter((item) => item.reserved).length, 5);
    assert.equal(results.filter((item) => item.code === 'GLOBAL_DAILY_CAP_REACHED').length +
        results.filter((item) => item.code === 'CHANNEL_DAILY_CAP_REACHED').length, 15);
    const global = await OwnerOutreachDispatchBudget.findOne({ bucketKey, scope: 'GLOBAL' }).lean();
    const channel = await OwnerOutreachDispatchBudget.findOne({ bucketKey, scope: 'whatsapp' }).lean();
    assert.equal(global.reservedCount, 5);
    assert.equal(channel.reservedCount, 5);
});

test('replica-set unique period reservation blocks the same endpoint across campaigns', async () => {
    const bucketKey = '2026-11-13-duplicate';
    await seedBudgets(bucketKey, 20, 20);
    const first = request({ bucketKey });
    const second = request({ ...first, campaignId: campaignId(), recipientId: recipientId() });
    const [a, b] = await Promise.all([service.reserve(first), service.reserve(second)]);
    assert.equal([a, b].filter((item) => item.reserved).length, 1);
    assert.equal([a, b].filter((item) => item.code === 'PERIOD_DUPLICATE_SUPPRESSED').length, 1);
    assert.equal(await OwnerOutreachPeriodReservation.countDocuments({ endpointHash: first.endpointHash, channel: first.channel, periodKey: first.periodKey }), 1);
});

test('replica-set transaction rolls back the global quota increment when channel cap blocks', async () => {
    const bucketKey = '2026-11-13-rollback';
    await OwnerOutreachDispatchBudget.create([
        { bucketKey, scope: 'GLOBAL', cap: 10, reservedCount: 0 },
        { bucketKey, scope: 'whatsapp', cap: 1, reservedCount: 1 }
    ]);
    const result = await service.reserve(request({ bucketKey, endpointHash: 'rollback-endpoint' }));
    assert.deepEqual(result, { reserved: false, code: 'CHANNEL_DAILY_CAP_REACHED' });
    const global = await OwnerOutreachDispatchBudget.findOne({ bucketKey, scope: 'GLOBAL' }).lean();
    assert.equal(global.reservedCount, 0);
    assert.equal(await OwnerOutreachPeriodReservation.countDocuments({ bucketKey }), 0);
});

test('replica-set reservation fails closed when transaction infrastructure is unavailable', async () => {
    const bucketKey = '2026-11-13-no-budget';
    const item = request({ bucketKey });
    const original = mongoose.startSession;
    mongoose.startSession = async () => { throw new Error('TRANSACTIONS_UNAVAILABLE'); };
    try {
        await assert.rejects(() => service.reserve(item), /TRANSACTIONS_UNAVAILABLE/);
    } finally {
        mongoose.startSession = original;
    }
    assert.equal(await OwnerOutreachPeriodReservation.countDocuments({ bucketKey }), 0);
});
