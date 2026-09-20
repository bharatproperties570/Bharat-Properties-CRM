import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert';
import EffectExecution from '../models/EffectExecution.js';
import { executeEffect } from '../src/workers/effectOrchestrator.js';

describe('R56 Stage 3 - Deal Effect Execution', function() {
    this.timeout(60000);
    let replset;

    before(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replset.getUri();
        await mongoose.connect(uri, { autoIndex: false });
        await EffectExecution.createCollection();
        await EffectExecution.ensureIndexes();
    });

    after(async () => {
        await mongoose.disconnect();
        await replset.stop();
    });

    beforeEach(async () => {
        await EffectExecution.deleteMany({});
    });

    it('1. Deal independent failure semantics work', async () => {
        const aggId = new mongoose.Types.ObjectId();
        const state = { dist: 0, sms: 0, docs: 0 };
        
        // Simulating Deal worker loop
        const runDealWorker = async (failSms = false) => {
            const failures = [];
            const dealEffects = [
                { key: 'distribution', fn: async () => { state.dist++; } },
                { key: 'sms', fn: async () => { if(failSms) throw new Error('SMS fail'); state.sms++; } },
                { key: 'documents', fn: async () => { state.docs++; } }
            ];

            for (const effect of dealEffects) {
                try {
                    await executeEffect('evt-deal-1', effect.key, 'Deal', aggId, effect.fn);
                } catch (err) {
                    failures.push(err);
                }
            }

            if (failures.length > 0) throw new AggregateError(failures);
        };

        // First attempt: SMS fails
        try {
            await runDealWorker(true);
            assert.fail('Should have thrown aggregate error');
        } catch (err) {
            assert.strictEqual(err.errors.length, 1);
            assert.strictEqual(err.errors[0].message, 'SMS fail');
        }

        // Distribution and documents SHOULD HAVE executed despite SMS failure
        assert.strictEqual(state.dist, 1);
        assert.strictEqual(state.sms, 0);
        assert.strictEqual(state.docs, 1);

        // Check DB
        const distRec = await EffectExecution.findOne({ effectKey: 'distribution' });
        const smsRec = await EffectExecution.findOne({ effectKey: 'sms' });
        const docRec = await EffectExecution.findOne({ effectKey: 'documents' });
        
        assert.strictEqual(distRec.status, 'COMPLETED');
        assert.strictEqual(smsRec.status, 'FAILED');
        assert.strictEqual(docRec.status, 'COMPLETED');

        // Second attempt (BullMQ retry)
        await runDealWorker(false);
        
        // dist and docs should skip, sms should retry
        assert.strictEqual(state.dist, 1);
        assert.strictEqual(state.sms, 1);
        assert.strictEqual(state.docs, 1);
        
        const smsRecRetry = await EffectExecution.findOne({ effectKey: 'sms' });
        assert.strictEqual(smsRecRetry.status, 'COMPLETED');
        assert.strictEqual(smsRecRetry.attempts, 2);
    });
    
    it('2. Lease expiry reclaim', async () => {
        const aggId = new mongoose.Types.ObjectId();
        
        // establish stale lock
        await EffectExecution.create({
            eventId: 'evt-deal-2', effectKey: 'marketing', aggregateType: 'Deal', aggregateId: aggId,
            status: 'PROCESSING', attempts: 1, lockedUntil: new Date(Date.now() - 10000), executionId: 'old-exec'
        });

        let executed = false;
        await executeEffect('evt-deal-2', 'marketing', 'Deal', aggId, async () => {
            executed = true;
        });

        assert.strictEqual(executed, true);
        const finalRec = await EffectExecution.findOne({ effectKey: 'marketing' });
        assert.strictEqual(finalRec.status, 'COMPLETED');
        assert.strictEqual(finalRec.attempts, 2);
    });
});
