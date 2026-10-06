import { MongoMemoryServer } from 'mongodb-memory-server';
import { RedisMemoryServer } from 'redis-memory-server';
import mongoose from 'mongoose';
import assert from 'assert';
import { EventEmitter } from 'events';

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
    const { marketingWorker } = await import('./src/workers/marketingWorker.js');
    const { marketingQueue } = await import('./src/queues/marketingQueue.js');
    
    return { MarketingCampaign, CampaignRun, marketingWorker, marketingQueue };
}

async function runTests() {
    const { MarketingCampaign, CampaignRun, marketingWorker, marketingQueue } = await setup();

    const acquireOwnershipQuery = async (runId, jobId, attempt) => {
        return await CampaignRun.findOneAndUpdate(
            { _id: runId, status: { $in: ['PENDING', 'RUNNING'] }, jobId, $or: [{ 'execution.attempt': { $lt: attempt } }, { 'execution.jobId': { $ne: jobId } }, { execution: { $exists: false } }] },
            { $set: { status: 'RUNNING', 'execution.jobId': jobId, 'execution.attempt': attempt, 'execution.ownerState': 'ACTIVE' } },
            { new: true }
        );
    };

    console.log('==================================================');
    console.log('GATE 3 — ACTUAL RE-ENQUEUE FLOW');
    console.log('==================================================');
    
    const c3 = await MarketingCampaign.create({ name: 'Reenqueue Test', ownerId: new mongoose.Types.ObjectId() });
    
    // Create first run
    const r3 = await CampaignRun.create({ campaignId: c3._id, status: 'RUNNING', jobId: 'jobA', idempotencyKey: 'idem123', execution: { jobId: 'jobA', attempt: 1, ownerState: 'TERMINAL' }, targetCount: 1 });
    
    // Re-enqueue actual controller logic
    const reEnqueueLogic = async () => {
        const run = await CampaignRun.findOneAndUpdate(
            { idempotencyKey: 'idem123' },
            { $setOnInsert: { campaignId: c3._id, status: 'PENDING', audienceQuery: 'direct_list', targetCount: 1 } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        
        const job = await marketingQueue.add('blast', { campaignRunId: run._id });
        
        await mongoose.model('CampaignRun').findByIdAndUpdate(run._id, { jobId: String(job.id) });
        return job.id;
    };
    
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
    
    // Trigger re-enqueue 
    let reenqueuePromise = reEnqueueLogic();
    
    let jobBId;
    await new Promise(r => controllerPaused.once('paused', (id) => { jobBId = id; r(); }));
    console.log(`[Gate 3] Re-enqueue Controller paused. Job B (${jobBId}) created, but CampaignRun.jobId still ${r3.jobId}.`);
    
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
    const claimA = await acquireOwnershipQuery(r3._id, 'jobA', 2);
    assert.strictEqual(claimA, null, 'Job A ownership MUST fail because Job B is current.');
    console.log('[Gate 3C] PASS: Job A blocked permanently.');
    
    // Restore
    mongoose.model('CampaignRun').findByIdAndUpdate = origFindByIdAndUpdate;

    console.log('==================================================');
    console.log('GATE 4 — CURRENT VS STALE FAILED EVENT');
    console.log('==================================================');
    
    const r4 = await CampaignRun.create({ campaignId: c3._id, status: 'RUNNING', jobId: 'jobFailCurrent', execution: { jobId: 'jobFailCurrent', attempt: 1, ownerState: 'ACTIVE' }, targetCount: 1 });
    
    await marketingWorker.emit('failed', { id: 'jobFailCurrent', name: 'blast', opts: { attempts: 1 }, attemptsMade: 1, data: { campaignRunId: r4._id.toString() } }, new Error('Current generation failure'));
    
    await new Promise(r => setTimeout(r, 100));
    const r4After = await CampaignRun.findById(r4._id);
    assert.strictEqual(r4After.status, 'FAILED', 'Current generation failure triggered finalization (FAILED)');
    assert.strictEqual(r4After.execution.outcome, 'failed');
    console.log('[Gate 4] PASS: Current generation failed event correctly authorized finalization.');
    
    const r5 = await CampaignRun.create({ campaignId: c3._id, status: 'RUNNING', jobId: 'jobFailStale', execution: { jobId: 'jobFailStale', attempt: 2, ownerState: 'ACTIVE' }, targetCount: 1 });
    
    await marketingWorker.emit('failed', { id: 'jobFailStale', name: 'blast', opts: { attempts: 1 }, attemptsMade: 1, data: { campaignRunId: r5._id.toString() } }, new Error('Stale generation failure'));
    
    await new Promise(r => setTimeout(r, 100));
    const r5After = await CampaignRun.findById(r5._id);
    assert.strictEqual(r5After.status, 'RUNNING', 'Stale generation failure MUST NOT trigger finalization');
    assert.strictEqual(r5After.execution.outcome, null, 'Stale generation failure MUST NOT update execution marker');
    console.log('[Gate 4] PASS: Stale generation failed event safely suppressed.');

    console.log('==================================================');
    console.log('ALL INDEPENDENT EVIDENCE GATES PASSED (R4.6.3 PT2)');
    
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
    if (redisServer) await redisServer.stop();
}

runTests().catch(e => { console.error(e); process.exit(1); });
