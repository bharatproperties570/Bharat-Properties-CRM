import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'assert';
import crypto from 'crypto';
import { execSync } from 'child_process';
import path from 'path';

let mongoServer;

async function runTests() {
    console.log('Starting R4-B5 Tests...');
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = mongoServer.getUri();
    await mongoose.connect(mongoServer.getUri());
    
    // Import all models needed by controllers to prevent Mongoose errors
    await import('./models/Company.js');
    await import('./models/Project.js');
    await import('./models/Inventory.js');
    await import('./models/Contact.js');
    await import('./models/Lead.js');
    await import('./models/User.js');
    await import('./models/Activity.js');
    await import('./models/OutboxEvent.js');
    await import('./models/AuditLog.js');
    
    let passed = 0;
    let failed = 0;
    let total = 0;
    let results = [];

    const assertTest = async (name, testFn) => {
        total++;
        try {
            await testFn();
            passed++;
            console.log(`✅ PASS: ${name}`);
            results.push(`${name} — PASS — Executed successfully`);
        } catch (e) {
            failed++;
            console.error(`❌ FAIL: ${name}`);
            console.error(e);
            results.push(`${name} — FAIL — ${e.message}`);
        }
    };

    const { authorizeTargetEntity } = await import('./utils/authorization.js');
    const { DomainEventPublisher } = await import('./utils/DomainEventPublisher.js');
    const { runEnrichment } = await import('./src/modules/prospectingEnrichment/enrichment.controller.js');
    const webController = await import('./controllers/activity.controller.js');
    const remoteController = await import('./controllers/activity.controller.remote.js');
    const { ServerAuthorityProof } = await import('./utils/ServerAuthorityProof.js');
    
    const OutboxEvent = mongoose.model('OutboxEvent');
    const Activity = mongoose.model('Activity');
    const Lead = mongoose.model('Lead');
    const User = mongoose.model('User');
    
    global.getCorrelationId = () => 'test-correlation-id';

    const teamId1 = new mongoose.Types.ObjectId();
    const teamId2 = new mongoose.Types.ObjectId();
    
    const uIdA = new mongoose.Types.ObjectId();
    const uIdB = new mongoose.Types.ObjectId();
    
    // Use the SAME value for _id and id to avoid bugs
    const userA = { _id: uIdA, id: uIdA.toString(), role: { name: 'agent' }, dataScope: 'assigned', department: 'sales', teams: [teamId1], isSuperAdmin: true };
    const userB = { _id: uIdB, id: uIdB.toString(), role: { name: 'agent' }, dataScope: 'assigned', department: 'sales', teams: [teamId2], isSuperAdmin: true };
    
    const leadA = await Lead.create({ firstName: 'Lead', lastName: 'A', email: 'leadA@example.com', mobile: '9999999999', owner: userA._id, teams: [teamId1] });
    const leadB = await Lead.create({ firstName: 'Lead', lastName: 'B', email: 'leadB@example.com', mobile: '8888888888', owner: userB._id, teams: [teamId2] });

    await assertTest('T1', async () => {
        const target = await authorizeTargetEntity(userA, 'Lead', leadA._id);
        assert.strictEqual(target._id.toString(), leadA._id.toString());
    });
    await assertTest('T2', async () => {
        try { await authorizeTargetEntity(userB, 'Lead', leadA._id); assert.fail(); } catch(e) { assert.strictEqual(e.statusCode || e.status, 403); }
    });
    await assertTest('T3', async () => {
        const target = await authorizeTargetEntity(userA, 'Lead', leadA._id);
        assert.ok(target);
    });
    await assertTest('T4', async () => {
        try { await authorizeTargetEntity(userB, 'Lead', leadA._id); assert.fail(); } catch(e) { assert.strictEqual(e.statusCode || e.status, 403); }
    });

    const mockReqRes = (user, body = {}, params = {}) => {
        let status = 200, jsonBody;
        const req = { user, body, params };
        const res = {
            status: (s) => { status = s; return res; },
            json: (b) => { jsonBody = b; return res; },
            send: (b) => { jsonBody = b; return res; }
        };
        return { req, res, getStatus: () => status, getJson: () => jsonBody };
    };

    await assertTest('T5', async () => {
        const { req, res, getStatus } = mockReqRes(userA, { entityId: leadA._id.toString(), entityType: 'Lead', type: 'Call', dueDate: new Date(), subject: 'Web Call' });
        await webController.addActivity(req, res, (e) => { throw e; });
        assert.strictEqual(getStatus(), 201);
        const unauth = mockReqRes(userB, { entityId: leadA._id.toString(), entityType: 'Lead', type: 'Call', dueDate: new Date(), subject: 'Victim Call' });
        await webController.addActivity(unauth.req, unauth.res, (e) => { throw e; });
        assert.ok(unauth.getStatus() === 403 || unauth.getStatus() === 400 || unauth.getStatus() === 500 || unauth.getStatus() === 404); 
    });

    await assertTest('T6', async () => {
        const { req, res, getStatus } = mockReqRes(userA, { entityId: leadA._id.toString(), entityType: 'Lead', type: 'Meeting', dueDate: new Date(), subject: 'Mobile Meeting' });
        await remoteController.addActivity(req, res, (e) => { throw e; });
        assert.strictEqual(getStatus(), 201);
        const unauth = mockReqRes(userB, { entityId: leadA._id.toString(), entityType: 'Lead', type: 'Meeting', dueDate: new Date(), subject: 'Victim Meeting' });
        await remoteController.addActivity(unauth.req, unauth.res, (e) => { throw e; });
        assert.ok(unauth.getStatus() === 403 || unauth.getStatus() === 400 || unauth.getStatus() === 500 || unauth.getStatus() === 404); 
    });

    const webAct = await Activity.create({ type: 'Call', entityId: leadA._id, entityType: 'Lead', dueDate: new Date(), subject: 'Test', owner: userA._id, assignedTo: userA._id, createdBy: userA._id });
    await assertTest('T7', async () => {
        const { req, res, getStatus } = mockReqRes(userA, { subject: 'Updated' }, { id: webAct._id.toString() });
        await webController.updateActivity(req, res, (e) => { throw e; });
        assert.strictEqual(getStatus(), 200);
        const unauth = mockReqRes(userB, { subject: 'Hacked' }, { id: webAct._id.toString() });
        await webController.updateActivity(unauth.req, unauth.res, (e) => { throw e; });
        assert.ok(unauth.getStatus() === 403 || unauth.getStatus() === 400 || unauth.getStatus() === 500 || unauth.getStatus() === 404); 
    });

    const mobAct = await Activity.create({ type: 'Call', entityId: leadA._id, entityType: 'Lead', dueDate: new Date(), subject: 'Test Mob', owner: userA._id, assignedTo: userA._id, createdBy: userA._id });
    await assertTest('T8', async () => {
        const { req, res, getStatus } = mockReqRes(userA, { subject: 'Updated Mob' }, { id: mobAct._id.toString() });
        await remoteController.updateActivity(req, res, (e) => { throw e; });
        assert.strictEqual(getStatus(), 200);
        const unauth = mockReqRes(userB, { subject: 'Hacked Mob' }, { id: mobAct._id.toString() });
        await remoteController.updateActivity(unauth.req, unauth.res, (e) => { throw e; });
        assert.ok(unauth.getStatus() === 403 || unauth.getStatus() === 400 || unauth.getStatus() === 500 || unauth.getStatus() === 404); 
    });

    await assertTest('T9', async () => {
        const { req, res, getStatus } = mockReqRes(userA, { entityId: leadB._id.toString(), entityType: 'Lead' }, { id: webAct._id.toString() });
        await webController.updateActivity(req, res, (e) => { throw e; });
        assert.ok(getStatus() === 403 || getStatus() === 400 || getStatus() === 500); 
    });

    await assertTest('T10', async () => {
        const { req, res, getStatus } = mockReqRes(userA, { entityId: leadB._id.toString(), entityType: 'Lead' }, { id: mobAct._id.toString() });
        await remoteController.updateActivity(req, res, (e) => { throw e; });
        assert.ok(getStatus() === 403 || getStatus() === 400 || getStatus() === 500); 
    });

    await assertTest('T11', async () => {
        const { req, res, getStatus } = mockReqRes(userB, {}, { id: webAct._id.toString() });
        await webController.deleteActivity(req, res, (e) => { throw e; });
        assert.ok(getStatus() === 403 || getStatus() === 400 || getStatus() === 500 || getStatus() === 404);
    });

    await assertTest('T12', async () => {
        const session = await mongoose.startSession();
        const testActivity = await Activity.create({ type: 'Call', entityId: leadA._id, entityType: 'Lead', dueDate: new Date(), subject: 'Test' });
        await session.withTransaction(async () => {
            await DomainEventPublisher.publishFromHttp({ user: userA }, session, {
                eventType: 'ActivityCreated',
                aggregateType: 'Activity',
                aggregateId: testActivity._id,
                payload: { businessData: "exists" }
            });
        });
        const evt = await OutboxEvent.findOne({ eventType: 'ActivityCreated' }).sort({ createdAt: -1 });
        assert.strictEqual(evt.payload.businessData, "exists");
    });

    const runEnrichmentReq = async (user, leadId) => {
        let status, jsonBody;
        const req = { user, params: { leadId: leadId.toString() } };
        const res = {
            status: (s) => { status = s; return res; },
            json: (b) => { jsonBody = b; return res; }
        };
        const next = (err) => { throw err; };
        await runEnrichment(req, res, next);
        return { status, jsonBody };
    };

    const leadReq = await Lead.create({ firstName: 'Req', mobile: '9999999991', enrichmentState: { status: 'REQUESTED' }, owner: userA._id, teams: [teamId1] });
    await assertTest('T13', async () => { const res = await runEnrichmentReq(userA, leadReq._id); assert.strictEqual(res.status, 409); });
    const leadClaim = await Lead.create({ firstName: 'Claim', mobile: '9999999992', enrichmentState: { status: 'CLAIMED' }, owner: userA._id, teams: [teamId1] });
    await assertTest('T14', async () => { const res = await runEnrichmentReq(userA, leadClaim._id); assert.strictEqual(res.status, 409); });
    const leadComp = await Lead.create({ firstName: 'Comp', mobile: '9999999993', enrichmentState: { status: 'COMPLETED' }, owner: userA._id, teams: [teamId1] });
    await assertTest('T15', async () => { const res = await runEnrichmentReq(userA, leadComp._id); assert.strictEqual(res.status, 200); });
    const leadNone = await Lead.create({ firstName: 'None', mobile: '9999999994', enrichmentState: { status: 'NONE' }, owner: userA._id, teams: [teamId1] });
    await assertTest('T16', async () => { const res = await runEnrichmentReq(userA, leadNone._id); assert.strictEqual(res.status, 200); });
    const leadFail = await Lead.create({ firstName: 'Fail', mobile: '9999999995', enrichmentState: { status: 'FAILED' }, owner: userA._id, teams: [teamId1] });
    await assertTest('T17', async () => { const res = await runEnrichmentReq(userA, leadFail._id); assert.strictEqual(res.status, 200); });
    const leadConc = await Lead.create({ firstName: 'Conc', mobile: '9999999996', enrichmentState: { status: 'COMPLETED' }, owner: userA._id, teams: [teamId1] });
    await assertTest('T18', async () => {
        const [res1, res2] = await Promise.all([runEnrichmentReq(userA, leadConc._id), runEnrichmentReq(userA, leadConc._id)]);
        assert.deepStrictEqual([res1.status, res2.status].sort(), [200, 409]);
    });
    const leadConcNone = await Lead.create({ firstName: 'Conc2', mobile: '9999999997', enrichmentState: { status: 'NONE' }, owner: userA._id, teams: [teamId1] });
    await assertTest('T19', async () => {
        const [res1, res2, res3] = await Promise.all([runEnrichmentReq(userA, leadConcNone._id), runEnrichmentReq(userA, leadConcNone._id), runEnrichmentReq(userA, leadConcNone._id)]);
        assert.deepStrictEqual([res1.status, res2.status, res3.status].sort(), [200, 409, 409]);
    });
    await assertTest('T20', async () => {
        const evts = await OutboxEvent.find({ aggregateId: leadConc._id, eventType: "ManualEnrichmentRequested" });
        assert.strictEqual(evts.length, 1);
    });
    await assertTest('T21', async () => {
        try { const session = await mongoose.startSession(); await DomainEventPublisher.publishFromHttp({ user: userA }, session, { eventType: 'InvalidEvent', aggregateType: 'Lead', aggregateId: leadA._id, payload: {} }); assert.fail(); } catch (e) { assert.ok(e.message.includes('Unauthorized event type')); }
    });
    await assertTest('T22', async () => {
        try { const session = await mongoose.startSession(); await DomainEventPublisher.publishFromHttp({ user: userA }, session, { eventType: 'ActivityCreated', aggregateType: 'Lead', aggregateId: leadA._id, payload: {} }); assert.fail(); } catch (e) { assert.ok(e.message.includes('aggregateType must be')); }
    });
    await assertTest('T23', async () => {
        try { const session = await mongoose.startSession(); await DomainEventPublisher.publishFromHttp({ user: userA }, session, { eventType: 'LeadUpdated', aggregateType: 'Lead', aggregateId: 'invalid', payload: {} }); assert.fail(); } catch (e) { assert.ok(e.message.includes('Invalid aggregateId')); }
    });
    await assertTest('T24', async () => {
        try { const session = await mongoose.startSession(); await DomainEventPublisher.publishFromHttp({ user: userA }, session, { eventType: 'LeadUpdated', aggregateType: 'Lead', aggregateId: new mongoose.Types.ObjectId(), payload: {} }); assert.fail(); } catch (e) { assert.ok(e.message.includes('does not exist')); }
    });
    await assertTest('T25', async () => {
        try { await DomainEventPublisher.publishFromHttp({ user: userA }, null, { eventType: 'LeadUpdated', aggregateType: 'Lead', aggregateId: leadA._id, payload: {} }); assert.fail(); } catch (e) { assert.ok(e.message.includes('session is required')); }
    });
    await assertTest('T26', async () => {
        const session = await mongoose.startSession();
        await session.withTransaction(async () => { await DomainEventPublisher.publishFromMobile({ user: userA }, session, { eventType: 'LeadUpdated', aggregateType: 'Lead', aggregateId: leadA._id, payload: {} }); });
        const evt = await OutboxEvent.findOne({ aggregateId: leadA._id }).sort({ createdAt: -1 });
        assert.strictEqual(evt.provenance.source, 'MOBILE');
    });

    await assertTest('T27', async () => {
        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
            const maliciousReq = { user: userA, provenance: { actorType: 'SYSTEM', source: 'WORKER' }, body: { actorType: 'SYSTEM' } };
            await DomainEventPublisher.publishFromHttp(maliciousReq, session, {
                eventType: 'LeadUpdated',
                aggregateType: 'Lead',
                aggregateId: leadA._id,
                payload: {}
            });
        });
        const evt = await OutboxEvent.findOne({ aggregateId: leadA._id }).sort({ createdAt: -1 });
        assert.strictEqual(evt.provenance.source, 'HTTP');
        assert.strictEqual(evt.provenance.actorType, 'HUMAN');
        assert.strictEqual(evt.provenance.actorId.toString(), userA._id.toString());
    });

    await assertTest('T28', async () => { assert.strictEqual(DomainEventPublisher.publishFromWorker, undefined); });

    await assertTest('T29', async () => {
        // Use a precise string search for the exact invocation in ServerAuthorityProof.js
        const grepRes = execSync(`grep "enrichmentQueue.add(" backend/utils/ServerAuthorityProof.js | wc -l`).toString().trim();
        assert.strictEqual(parseInt(grepRes), 1);
        
        // Assert no OTHER place uses enrichmentQueue.add
        const otherRes = execSync(`grep -R "enrichmentQueue.add(" backend/controllers backend/services backend/src/modules | wc -l`).toString().trim();
        assert.strictEqual(parseInt(otherRes), 0);
    });

    await assertTest('T30', async () => {
        const testAct = await Activity.create({ type: 'Note', entityId: leadA._id, entityType: 'Lead', dueDate: new Date(), subject: 'Target' });
        await Lead.updateOne({ _id: leadA._id }, { $set: { "enrichmentState.status": "NONE" } });
        
        const { domainEventQueue } = await import('./src/queues/queueManager.js');
        await domainEventQueue.add('processEvent', { 
            eventId: 'test-event-rehyd', 
            aggregateId: testAct._id, 
            aggregateType: 'Activity', 
            eventType: 'ActivityCreated',
            payload: { entityType: 'Lead', entityId: leadA._id, type: 'Note', subject: 'Target' }
        });
        
        let count = 0;
        while(count < 150) {
            await new Promise(r => setTimeout(r, 100));
            const check = await Lead.findById(leadA._id);
            if (check.enrichmentState?.status === 'REQUESTED') break;
            count++;
        }
        
        const updatedLead = await Lead.findById(leadA._id);
        assert.strictEqual(updatedLead.enrichmentState.status, 'REQUESTED');
    });

    await assertTest('T31', async () => {
        const { AuthorityProofIssuer } = await import('./utils/ServerAuthorityProof.js');
        await Lead.updateOne({ _id: leadA._id }, { $set: { "enrichmentState.status": "NONE" } });
        const testToken = "raw-secret-token";
        const testTokenHash = crypto.createHash('sha256').update(testToken).digest('hex');
        const jobId = "job-123";
        
        await Lead.updateOne({ _id: leadA._id }, { $set: { "enrichmentState.status": "REQUESTED", "enrichmentState.claimTokenHash": testTokenHash } });
        const proof = await AuthorityProofIssuer.resolveSystemProof(leadA._id.toString(), jobId, testToken);
        assert.ok(AuthorityProofIssuer.finalizeSystemProof !== undefined);
        
        await Lead.updateOne({ _id: leadA._id }, { $set: { "enrichmentState.status": "REQUESTED", "enrichmentState.claimTokenHash": testTokenHash } });
        try { await AuthorityProofIssuer.resolveSystemProof(leadA._id.toString(), "job-999", "wrong"); assert.fail(); } catch(e) { assert.ok(e.message.includes("Missing execution context") || e.message.includes("SECURITY_VIOLATION")); }
        await Lead.findOneAndUpdate({ _id: leadA._id }, { $set: { "enrichmentState.status": "REQUESTED", "enrichmentState.claimTokenHash": testTokenHash } });
        
        console.log("DB STATE:", await Lead.findById(leadA._id).lean());
        const claim2 = await AuthorityProofIssuer.resolveSystemProof(leadA._id.toString(), "job-abc", testToken);
        await Lead.updateOne({ _id: leadA._id }, { $set: { "enrichmentState.lastJobId": "hacked-job" } });
        try { await AuthorityProofIssuer.finalizeSystemProof(claim2); assert.fail(); } catch(e) { assert.ok(e.message.includes("Finalization failed")); }
        
        await Lead.findOneAndUpdate({ _id: leadA._id }, { $set: { "enrichmentState.status": "REQUESTED", "enrichmentState.claimTokenHash": testTokenHash } });
        const claim3 = await AuthorityProofIssuer.resolveSystemProof(leadA._id.toString(), "job-def", testToken);
        await AuthorityProofIssuer.finalizeSystemProof(claim3, "job-def");
        try { await AuthorityProofIssuer.resolveSystemProof(leadA._id.toString(), "job-def2", testToken); assert.fail(); } catch(e) { assert.ok(e.message.includes('Missing execution context')); }
    });

    console.log(`\nResults: ${passed}/${total} passed`);
    if (failed > 0) process.exit(1);
    
    await mongoose.disconnect();
    await mongoServer.stop();
    return results;
}

runTests().then(res => {
    import('fs').then(fs => fs.default.writeFileSync('r4b5_test_results.json', JSON.stringify(res)))
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
