import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert';
import EffectExecution from '../models/EffectExecution.js';
import { executeEffect } from '../src/workers/effectOrchestrator.js';

describe('R56 Stage 3 - Lead Effect Execution', function() {
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

    it('1. Single effect success', async () => {
        let called = false;
        await executeEffect('evt-1', 'enrichment', 'Lead', new mongoose.Types.ObjectId(), async () => {
            called = true;
        });

        assert.strictEqual(called, true);
        const record = await EffectExecution.findOne({ eventId: 'evt-1' });
        assert.strictEqual(record.status, 'COMPLETED');
        assert.ok(record.executionId);
    });

    it('2. COMPLETED effect skip', async () => {
        await EffectExecution.create({
            eventId: 'evt-2',
            effectKey: 'enrichment',
            aggregateType: 'Lead',
            aggregateId: new mongoose.Types.ObjectId(),
            status: 'COMPLETED',
            attempts: 1,
            workerId: 'w-1',
            executionId: 'exec-1'
        });

        let called = false;
        const res = await executeEffect('evt-2', 'enrichment', 'Lead', new mongoose.Types.ObjectId(), async () => {
            called = true;
        });

        assert.strictEqual(called, false);
        assert.strictEqual(res.status, 'SKIPPED');
    });

    it('3. Lead sequential ordering & retry resumption', async () => {
        const aggId = new mongoose.Types.ObjectId();
        const state = { enrichment: 0, scoring: 0, dist: 0 };
        
        // Simulating the worker loop for a Lead
        const runLeadWorker = async (failEnrich = false) => {
            await executeEffect('evt-3', 'enrichment', 'Lead', aggId, async () => {
                if (failEnrich) throw new Error('Enrichment failed');
                state.enrichment++;
            });
            await executeEffect('evt-3', 'scoring', 'Lead', aggId, async () => {
                state.scoring++;
            });
            await executeEffect('evt-3', 'distribution', 'Lead', aggId, async () => {
                state.dist++;
            });
        };

        // First attempt: enrichment fails
        try {
            await runLeadWorker(true);
            assert.fail('Should have thrown');
        } catch (e) {
            assert.strictEqual(e.message, 'Enrichment failed');
        }

        assert.strictEqual(state.enrichment, 0);
        assert.strictEqual(state.scoring, 0); // never reached

        const enrichmentDoc = await EffectExecution.findOne({ effectKey: 'enrichment' });
        assert.strictEqual(enrichmentDoc.status, 'FAILED');

        // Second attempt (BullMQ retry): enrichment succeeds
        await runLeadWorker(false);
        assert.strictEqual(state.enrichment, 1);
        assert.strictEqual(state.scoring, 1);
        assert.strictEqual(state.dist, 1);

        // Third attempt (simulate dupe job)
        await runLeadWorker(false);
        // Counters should NOT increment because they are skipped
        assert.strictEqual(state.enrichment, 1);
        assert.strictEqual(state.scoring, 1);
        assert.strictEqual(state.dist, 1);
    });

    it('4. Stale worker completion rejected', async () => {
        const aggId = new mongoose.Types.ObjectId();
        
        // 1. establish
        await EffectExecution.create({
            eventId: 'evt-4', effectKey: 'enrichment', aggregateType: 'Lead', aggregateId: aggId,
            status: 'PROCESSING', attempts: 1, lockedUntil: new Date(Date.now() - 10000), executionId: 'old-exec'
        });

        let executed = false;
        await executeEffect('evt-4', 'enrichment', 'Lead', aggId, async () => {
            executed = true;
            
            // SIMULATE: another worker steals it during execution (should be impossible due to claim, but let's force DB)
            await EffectExecution.updateOne({ eventId: 'evt-4' }, { $set: { executionId: 'stolen' } });
        }).catch(err => {
            assert.ok(err.message.includes('Stale worker exception'));
        });

        assert.strictEqual(executed, true); // It ran, but failed to checkpoint
    });

    it('5. MAX_ATTEMPTS terminal behavior', async () => {
        const aggId = new mongoose.Types.ObjectId();
        
        await EffectExecution.create({
            eventId: 'evt-5', effectKey: 'enrichment', aggregateType: 'Lead', aggregateId: aggId,
            status: 'FAILED', attempts: 5
        });

        try {
            await executeEffect('evt-5', 'enrichment', 'Lead', aggId, async () => {});
            assert.fail('Should have thrown terminal');
        } catch (err) {
            assert.ok(err.message.includes('Terminal failure reached'));
        }
    });

    it('6. Concurrent claim protection', async () => {
        const aggId = new mongoose.Types.ObjectId();
        let execCount = 0;

        const workerA = executeEffect('evt-6', 'enrichment', 'Lead', aggId, async () => {
            execCount++;
            await new Promise(r => setTimeout(r, 100)); // simulate work
        });

        const workerB = executeEffect('evt-6', 'enrichment', 'Lead', aggId, async () => {
            execCount++;
            await new Promise(r => setTimeout(r, 100));
        });

        const results = await Promise.allSettled([workerA, workerB]);
        
        // One should succeed, one should fail due to lock
        const succeeded = results.filter(r => r.status === 'fulfilled');
        const failed = results.filter(r => r.status === 'rejected');
        
        assert.strictEqual(succeeded.length, 1);
        assert.strictEqual(failed.length, 1);
        assert.ok(failed[0].reason.message.includes('currently locked by another worker'));
        assert.strictEqual(execCount, 1);
    });

    it('7. FAILED state terminal transition', async () => {
        const aggId = new mongoose.Types.ObjectId();
        
        await EffectExecution.create({
            eventId: 'evt-7', effectKey: 'enrichment', aggregateType: 'Lead', aggregateId: aggId,
            status: 'FAILED', attempts: 4
        });

        // 1st attempt: 4 -> 5 -> Fails
        try {
            await executeEffect('evt-7', 'enrichment', 'Lead', aggId, async () => {
                throw new Error('Still failing');
            });
            assert.fail('Should have thrown');
        } catch (e) {
            assert.strictEqual(e.message, 'Still failing');
        }

        const doc = await EffectExecution.findOne({ eventId: 'evt-7' });
        assert.strictEqual(doc.status, 'FAILED');
        assert.strictEqual(doc.attempts, 5);

        // Next automatic attempt -> Terminal failure, fn must not execute
        let executed = false;
        try {
            await executeEffect('evt-7', 'enrichment', 'Lead', aggId, async () => {
                executed = true;
            });
            assert.fail('Should have thrown terminal');
        } catch (e) {
            assert.ok(e.message.includes('Terminal failure reached'));
        }
        
        assert.strictEqual(executed, false);
    });
});
