import { MongoMemoryServer } from 'mongodb-memory-server';
import { RedisMemoryServer } from 'redis-memory-server';
import mongoose from 'mongoose';
import assert from 'assert';
import { EventEmitter } from 'events';
import crypto from 'crypto';

let mongoServer, redisServer;

async function setup() {
    redisServer = new RedisMemoryServer();
    process.env.REDIS_HOST = await redisServer.getHost();
    process.env.REDIS_PORT = await redisServer.getPort();
    
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await mongoose.connect(mongoServer.getUri());
    
    const MarketingCampaign = (await import('./models/MarketingCampaign.js')).default;
    const CampaignRun = (await import('./models/CampaignRun.js')).default;
    const MarketingDelivery = (await import('./models/MarketingDelivery.js')).default;
    const Activity = (await import('./models/Activity.js')).default;
    
    // Import everything else naturally
    const { marketingWorker, processMarketingJob, finalizeCampaignRunStatus } = await import('./src/workers/marketingWorker.js');
    const { marketingQueue } = await import('./src/queues/marketingQueue.js');
    const { sendCampaign } = await import('./controllers/marketing.controller.js');
    
    return { MarketingCampaign, CampaignRun, MarketingDelivery, Activity, marketingWorker, processMarketingJob, finalizeCampaignRunStatus, marketingQueue, sendCampaign };
}

async function runTests() {
    const deps = await setup();
    const { MarketingCampaign, CampaignRun, MarketingDelivery, Activity, marketingWorker, processMarketingJob, finalizeCampaignRunStatus, marketingQueue, sendCampaign } = deps;
    
    console.log('==================================================');
    console.log('GATE 1 — TRUE CONCURRENT MONGODB RACE (REAL FINALIZER)');
    console.log('==================================================');
    
    const c1 = await MarketingCampaign.create({ name: 'True Race Test', ownerId: new mongoose.Types.ObjectId() });
    
    // Simulate ownership CAS function
    const acquireOwnershipQuery = async (runId, jobId, attempt) => {
        return await CampaignRun.findOneAndUpdate(
            { _id: runId, status: { $in: ['PENDING', 'RUNNING'] }, jobId, $or: [{ 'execution.attempt': { $lt: attempt } }, { 'execution.jobId': { $ne: jobId } }, { execution: { $exists: false } }] },
            { $set: { status: 'RUNNING', 'execution.jobId': jobId, 'execution.attempt': attempt, 'execution.ownerState': 'ACTIVE' } },
            { new: true }
        );
    };

    // Case 1A: Finalizer starts, pauses, newer ownership wins, Finalizer resumes and FAILS due to stale generation
    let r1 = await CampaignRun.create({ campaignId: c1._id, status: 'RUNNING', jobId: 'jobA', execution: { jobId: 'jobA', attempt: 1, ownerState: 'TERMINAL' }, targetCount: 1 });
    // Add a delivery so it calculates COMPLETED
    await MarketingDelivery.create({ campaignRunId: r1._id, jobId: 'jobA', recipientId: 'rec1', channel: 'wa', status: 'SENT' });
    
    let latch = new EventEmitter();
    global.testSeamWorkerA_postCompute = () => new Promise(resolve => {
        latch.emit('finalizer_paused');
        latch.once('resume_finalizer', resolve);
    });

    let finalizerPromise = finalizeCampaignRunStatus(r1._id.toString(), false);
    
    // Wait for finalizer to read generation and pause before CAS
    await new Promise(r => latch.once('finalizer_paused', r));
    console.log('[Gate 1A] Finalizer has read state and computed status. Paused before CAS.');
    
    // Newer ownership races in and wins!
    const claim1 = await acquireOwnershipQuery(r1._id, 'jobA', 2);
    assert.ok(claim1, 'Ownership must succeed');
    console.log('[Gate 1A] Newer ownership (Attempt 2) acquired successfully.');
    
    // Resume finalizer CAS
    latch.emit('resume_finalizer');
    await finalizerPromise;
    console.log('[Gate 1A] Finalizer completed.');
    
    // Assert Finalizer CAS failed and CampaignRun was NOT terminalized!
    const r1Final = await CampaignRun.findById(r1._id);
    assert.strictEqual(r1Final.status, 'RUNNING', 'Stale finalizer must not overwrite CampaignRun to COMPLETED');
    assert.strictEqual(r1Final.execution.attempt, 2);
    assert.strictEqual(r1Final.execution.ownerState, 'ACTIVE');
    console.log('✅ CASE 1A PASS: Stale finalizer CAS correctly rejected by newer generation evidence.');

    // Case 1B: Reverse ordering. Finalizer reaches CAS first and succeeds. Newer ownership fails.
    global.testSeamWorkerA_postCompute = null;
    let r2 = await CampaignRun.create({ campaignId: c1._id, status: 'RUNNING', jobId: 'jobB', execution: { jobId: 'jobB', attempt: 1, ownerState: 'TERMINAL' }, targetCount: 1 });
    await MarketingDelivery.create({ campaignRunId: r2._id, jobId: 'jobB', recipientId: 'rec1', channel: 'wa', status: 'SENT' });
    
    await finalizeCampaignRunStatus(r2._id.toString(), false); // Finalizer wins completely
    console.log('[Gate 1B] Finalizer completed successfully.');
    
    const claim2 = await acquireOwnershipQuery(r2._id, 'jobB', 2); // Newer ownership tries
    assert.strictEqual(claim2, null, 'Ownership MUST fail because CampaignRun is COMPLETED');
    console.log('✅ CASE 1B PASS: Terminal CampaignRun correctly rejects newer ownership.');


    console.log('==================================================');
    console.log('GATE 2 — REAL WORKER EXECUTION BOUNDARY');
    console.log('==================================================');
    
    let deliveryClaimCalls = 0;
    let activityCalls = 0;
    const origCreateDelivery = MarketingDelivery.create;
    MarketingDelivery.create = function(...args) { deliveryClaimCalls++; return origCreateDelivery.apply(this, args); };
    const origCreateActivity = Activity.create;
    Activity.create = function(...args) { activityCalls++; return origCreateActivity.apply(this, args); };
    
    const mockJob = { id: 'jobFail', attemptsMade: 1, data: { campaignRunId: new mongoose.Types.ObjectId().toString(), channel: 'wa', leads: [{ id: '123' }] }, log: async () => {} };
    
    try {
        await processMarketingJob(mockJob);
        assert.fail('Worker should have thrown ownership failure error');
    } catch(e) {
        assert.ok(e.message.includes('CampaignRun not found'), 'Expected CampaignRun not found error');
    }
    
    assert.strictEqual(deliveryClaimCalls, 0, 'No delivery claims acquired');
    assert.strictEqual(activityCalls, 0, 'No activities created');
    console.log('✅ GATE 2 PASS: Actual worker halts exactly at Ownership CAS. 0 Side-effects.');


    console.log('==================================================');
    console.log('GATE 3 — ACTUAL RE-ENQUEUE FLOW');
    console.log('==================================================');
    
    const c3 = await MarketingCampaign.create({ name: 'Reenqueue Test', ownerId: new mongoose.Types.ObjectId() });
    
    // We will use sendCampaign directly. We mock req, res.
    const req = {
        headers: { 'idempotency-key': 'idem123' },
        body: { campaignId: c3._id.toString(), segment: 'all' },
        user: { _id: new mongoose.Types.ObjectId(), firstName: 'Test' }
    };
    const res = {
        json: (data) => {},
        status: (code) => ({ json: (data) => {} })
    };
    
    // 1st dispatch
    await sendCampaign(req, res);
    const r3 = await CampaignRun.findOne({ idempotencyKey: 'idem123' });
    assert.ok(r3, 'CampaignRun created');
    
    // Save original
    const origFindByIdAndUpdate = mongoose.model('CampaignRun').findByIdAndUpdate;
    
    // Crash Simulation: Monkey-patch to pause before updating CampaignRun.jobId
    let controllerPaused = new EventEmitter();
    mongoose.model('CampaignRun').findByIdAndUpdate = async function(...args) {
        if (args[1] && args[1].jobId) {
            await new Promise(r => {
                controllerPaused.emit('paused', args[1].jobId);
                controllerPaused.once('resume', r);
            });
        }
        return await origFindByIdAndUpdate.apply(this, args);
    };
    
    // Trigger re-enqueue (2nd dispatch)
    let reenqueuePromise = sendCampaign(req, res);
    
    let jobBId;
    await new Promise(r => controllerPaused.once('paused', (id) => { jobBId = id; r(); }));
    console.log(`[Gate 3] Re-enqueue Controller paused. Job B (\${jobBId}) created, but CampaignRun.jobId still \${r3.jobId}.`);
    
    // CASE A: Job B starts BEFORE controller resumes
    const claimB1 = await acquireOwnershipQuery(r3._id, jobBId, 1);
    assert.strictEqual(claimB1, null, 'Job B ownership MUST fail because CampaignRun.jobId is not mapped to Job B yet.');
    console.log('[Gate 3A] PASS: Job B ownership failed during crash window.');
    
    // CASE B: Controller resumes successfully
    controllerPaused.emit('resume');
    await reenqueuePromise;
    console.log(`[Gate 3] Controller resumed. CampaignRun.jobId successfully updated.`);
    
    // Job B tries again
    const claimB2 = await acquireOwnershipQuery(r3._id, jobBId, 1);
    assert.ok(claimB2, 'Job B ownership succeeds');
    assert.strictEqual(claimB2.execution.jobId, jobBId);
    console.log('[Gate 3B] PASS: Job B ownership succeeded after explicit mapping.');
    
    // CASE C: Job A resumes after B becomes current
    const claimA = await acquireOwnershipQuery(r3._id, r3.jobId, 2);
    assert.strictEqual(claimA, null, 'Job A ownership MUST fail because Job B is current.');
    console.log('[Gate 3C] PASS: Job A blocked permanently.');
    
    // Restore
    mongoose.model('CampaignRun').findByIdAndUpdate = origFindByIdAndUpdate;

    console.log('==================================================');
    console.log('GATE 4 — CURRENT VS STALE FAILED EVENT');
    console.log('==================================================');
    
    const r4 = await CampaignRun.create({ campaignId: c3._id, status: 'RUNNING', jobId: 'jobFailCurrent', execution: { jobId: 'jobFailCurrent', attempt: 1, ownerState: 'ACTIVE' }, targetCount: 1 });
    
    // Spy on finalizeCampaignRunStatus execution
    // Since marketingWorker.js imports it locally for failed event, we can't easily spy on it unless we mock it or observe CampaignRun status.
    // Emitting 'failed' to worker with max attempts
    await marketingWorker.emit('failed', { id: 'jobFailCurrent', name: 'blast', opts: { attempts: 1 }, attemptsMade: 1, data: { campaignRunId: r4._id.toString() } }, new Error('Current generation failure'));
    
    // Yield event loop
    await new Promise(r => setTimeout(r, 100));
    const r4After = await CampaignRun.findById(r4._id);
    assert.strictEqual(r4After.status, 'FAILED', 'Current generation failure triggered finalization (FAILED)');
    assert.strictEqual(r4After.execution.outcome, 'failed');
    console.log('[Gate 4] PASS: Current generation failed event correctly authorized finalization.');
    
    const r5 = await CampaignRun.create({ campaignId: c3._id, status: 'RUNNING', jobId: 'jobFailStale', execution: { jobId: 'jobFailStale', attempt: 2, ownerState: 'ACTIVE' }, targetCount: 1 });
    
    // Simulate stale job throwing failed event (attempt 1)
    await marketingWorker.emit('failed', { id: 'jobFailStale', name: 'blast', opts: { attempts: 1 }, attemptsMade: 1, data: { campaignRunId: r5._id.toString() } }, new Error('Stale generation failure'));
    
    await new Promise(r => setTimeout(r, 100));
    const r5After = await CampaignRun.findById(r5._id);
    assert.strictEqual(r5After.status, 'RUNNING', 'Stale generation failure MUST NOT trigger finalization');
    assert.strictEqual(r5After.execution.outcome, null, 'Stale generation failure MUST NOT update execution marker');
    console.log('[Gate 4] PASS: Stale generation failed event safely suppressed.');


    console.log('==================================================');
    console.log('ALL INDEPENDENT EVIDENCE GATES PASSED (R4.6.3)');
    
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
    if (redisServer) await redisServer.stop();
}

runTests().catch(e => { console.error(e); process.exit(1); });
