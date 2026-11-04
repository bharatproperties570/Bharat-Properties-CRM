import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { v4 as uuidv4 } from 'uuid';
import OutboxEvent from '../models/OutboxEvent.js';
import EffectExecution from '../models/EffectExecution.js';
import Activity from '../models/Activity.js';
import Contact from '../models/Contact.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import '../models/Company.js';
import '../models/Project.js';
import '../models/Inventory.js';
import { addActivity, updateActivity, deleteActivity } from '../controllers/activity.controller.js';
import { createContact } from '../controllers/contact.controller.js';
import { domainEventWorker } from '../src/workers/domainEventWorker.js';
import { processDomainEventJob as processDomainEvent } from '../src/workers/domainEventWorkerLogic.js';
import { domainEventQueue } from '../src/queues/queueManager.js';

let replSet;

const mockUserId = new mongoose.Types.ObjectId();
const mockReq = (body, params = {}, user = { _id: mockUserId, id: mockUserId.toString(), email: 'bharatproperties570@gmail.com' }) => ({ body, params, user });
const mockRes = () => {
    const res = {};
    res.status = function(code) { this.statusCode = code; return this; };
    res.json = function(data) { this.data = data; return this; };
    return res;
};

async function assertEffects(eventId, expectedEffects, notExpectedEffects = []) {
    const execs = await EffectExecution.find({ eventId });
    const keys = execs.map(e => e.effectKey);
    for (const eff of expectedEffects) {
        if (!keys.includes(eff)) throw new Error(`Missing expected effect: ${eff} in ${keys}`);
    }
    for (const eff of notExpectedEffects) {
        if (keys.includes(eff)) throw new Error(`Unexpected effect found: ${eff} in ${keys}`);
    }
}

const dispatchDomainEventThroughQueue = (jobData, timeoutMs = 5000) => {
    return new Promise((resolve, reject) => {
        let cleanupTimer = null;
        let isDone = false;
        let addedJobId = null;

        const cleanup = () => {
            if (cleanupTimer) {
                clearTimeout(cleanupTimer);
                cleanupTimer = null;
            }
            domainEventWorker.removeListener('completed', onCompleted);
            domainEventWorker.removeListener('failed', onFailed);
        };

        const onCompleted = (j) => {
            if (j && j.id === addedJobId) {
                if (!isDone) {
                    isDone = true;
                    cleanup();
                    resolve({ success: true, jobId: j.id });
                }
            }
        };

        const onFailed = (j, err) => {
            if (j && j.id === addedJobId) {
                if (!isDone) {
                    isDone = true;
                    cleanup();
                    reject(err || new Error(`Job ${addedJobId} failed`));
                }
            }
        };

        domainEventWorker.on('completed', onCompleted);
        domainEventWorker.on('failed', onFailed);

        domainEventQueue.add('event', jobData).then(async (addedJob) => {
            addedJobId = addedJob.id;

            if (typeof addedJob.isCompleted === 'function' && await addedJob.isCompleted()) {
                if (!isDone) {
                    isDone = true;
                    cleanup();
                    resolve({ success: true, jobId: addedJob.id });
                }
                return;
            }

            if (typeof addedJob.isFailed === 'function' && await addedJob.isFailed()) {
                if (!isDone) {
                    isDone = true;
                    cleanup();
                    reject(new Error(`Job ${addedJob.id} already failed`));
                }
                return;
            }

            cleanupTimer = setTimeout(() => {
                if (!isDone) {
                    isDone = true;
                    cleanup();
                    reject(new Error(`Timeout (${timeoutMs}ms) waiting for domainEventWorker completion for job ${addedJobId}`));
                }
            }, timeoutMs);
        }).catch((err) => {
            cleanup();
            reject(err);
        });
    });
};

async function runTests() {
    let summary = { total: 0, passed: 0, failed: 0, limited: 0 };
    const runTest = async (id, name, testFn) => {
        summary.total++;
        console.log(`\n[START] ${id} ${name}`);
        try {
            await testFn();
            console.log(`[PASS] ${id} ${name}`);
            summary.passed++;
        } catch (e) {
            console.error(`[FAIL] ${id} ${name} - ${e.message}`);
            summary.failed++;
        }
    };

    try {
        console.log('Starting MongoMemoryReplSet...');
        replSet = await MongoMemoryReplSet.create({
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        const uri = replSet.getUri();
        await mongoose.connect(uri);
        console.log('Connected to MongoMemoryReplSet');

        const dummyLead = await Lead.create({ firstName: 'C8 Test', mobile: '9999999999' });

        let act01, obAc01;
        await runTest('C8-AC-01', 'Normal ActivityCreated', async () => {
            const req = mockReq({
                type: 'Email',
                subject: 'Follow up',
                entityType: 'Lead',
                entityId: dummyLead._id,
                dueDate: new Date()
            });
            const res = mockRes();
            await addActivity(req, res);
            if (!res.data || !res.data.success) throw new Error(`addActivity failed: ${JSON.stringify(res.data)}`);
            act01 = res.data.data;

            const outboxes = await OutboxEvent.find({ aggregateId: act01._id, eventType: 'ActivityCreated' });
            if (outboxes.length !== 1) throw new Error('Expected exactly 1 OutboxEvent');
            obAc01 = outboxes[0];
            
            if (!obAc01.payload || obAc01.payload.subject !== 'Follow up') throw new Error('Snapshot missing subject');
            if (!obAc01.payload._id) throw new Error('Snapshot missing _id');
            if (obAc01.payload.actorId !== mockUserId.toString()) throw new Error('Actor ID not captured');

            await processDomainEvent({ data: obAc01.toJSON() });
            await assertEffects(obAc01.eventId, ['activity_google_sync', 'activity_workflow_created'], ['activity_workflow_call_logged', 'activity_workflow_call_outcome']);
        });

        await runTest('C8-AC-02', 'Call without outcome', async () => {
            const req = mockReq({
                type: 'Call',
                subject: 'Call Lead',
                entityType: 'Lead',
                entityId: dummyLead._id,
                dueDate: new Date()
            });
            const res = mockRes();
            await addActivity(req, res);
            if (!res.data || !res.data.success) throw new Error(`addActivity failed: ${JSON.stringify(res.data)}`);
            const outboxes = await OutboxEvent.find({ aggregateId: res.data.data._id, eventType: 'ActivityCreated' });
            await processDomainEvent({ data: outboxes[0].toJSON() });
            await assertEffects(outboxes[0].eventId, 
                ['activity_workflow_created', 'activity_workflow_call_logged'], 
                ['activity_workflow_call_outcome']
            );
        });

        let act03;
        await runTest('C8-AC-03', 'Call with outcome', async () => {
            const req = mockReq({
                type: 'Voice',
                subject: 'Voice mail',
                entityType: 'Lead',
                entityId: dummyLead._id,
                dueDate: new Date(),
                details: { callOutcome: 'Left Message' }
            });
            const res = mockRes();
            await addActivity(req, res);
            if (!res.data || !res.data.success) throw new Error(`addActivity failed: ${JSON.stringify(res.data)}`);
            act03 = res.data.data;
            const outboxes = await OutboxEvent.find({ aggregateId: act03._id, eventType: 'ActivityCreated' });
            await processDomainEvent({ data: outboxes[0].toJSON() });
            await assertEffects(outboxes[0].eventId, 
                ['activity_workflow_created', 'activity_workflow_call_logged', 'activity_workflow_call_outcome']
            );
        });

        await runTest('C8-AU-01', 'ActivityUpdated completed', async () => {
            const req = mockReq({ status: 'Completed' }, { id: act01._id });
            const res = mockRes();
            await updateActivity(req, res);
            if (!res.data || !res.data.success) throw new Error(`updateActivity failed: ${JSON.stringify(res.data)}`);
            const outboxes = await OutboxEvent.find({ aggregateId: act01._id, eventType: 'ActivityUpdated' }).sort({ createdAt: -1 });
            const ob = outboxes[0];
            await processDomainEvent({ data: ob.toJSON() });
            await assertEffects(ob.eventId, ['activity_google_sync_updated', 'activity_workflow_completed']);
        });

        await runTest('C8-AU-02', 'Outcome changed', async () => {
            const req = mockReq({ details: { callOutcome: 'Connected' } }, { id: act03._id });
            const res = mockRes();
            await updateActivity(req, res);
            if (!res.data || !res.data.success) throw new Error(`updateActivity failed: ${JSON.stringify(res.data)}`);
            const outboxes = await OutboxEvent.find({ aggregateId: act03._id, eventType: 'ActivityUpdated' }).sort({ createdAt: -1 });
            const ob = outboxes[0];
            if (ob.payload.outcomeChanged !== true) throw new Error('outcomeChanged should be true');
            await processDomainEvent({ data: ob.toJSON() });
            await assertEffects(ob.eventId, ['activity_workflow_call_outcome']);
        });

        await runTest('C8-AU-03', 'Outcome unchanged', async () => {
            const req = mockReq({ description: 'Added notes' }, { id: act03._id });
            const res = mockRes();
            await updateActivity(req, res);
            if (!res.data || !res.data.success) throw new Error(`updateActivity failed: ${JSON.stringify(res.data)}`);
            const outboxes = await OutboxEvent.find({ aggregateId: act03._id, eventType: 'ActivityUpdated' }).sort({ createdAt: -1 });
            const ob = outboxes[0];
            if (ob.payload.outcomeChanged === true) throw new Error('outcomeChanged should be false');
            await processDomainEvent({ data: ob.toJSON() });
            await assertEffects(ob.eventId, [], ['activity_workflow_call_outcome']);
        });

        await runTest('C8-AU-04', 'Already completed behavior', async () => {
            // act01 is already completed.
            const req = mockReq({ description: 'Updating already completed' }, { id: act01._id });
            const res = mockRes();
            await updateActivity(req, res);
            if (!res.data || !res.data.success) throw new Error(`updateActivity failed: ${JSON.stringify(res.data)}`);
            const outboxes = await OutboxEvent.find({ aggregateId: act01._id, eventType: 'ActivityUpdated' }).sort({ createdAt: -1 });
            const ob = outboxes[0];
            await processDomainEvent({ data: ob.toJSON() });
            await assertEffects(ob.eventId, ['activity_workflow_completed']); 
            // Legacy behavior fires it if status === completed, which we preserved.
        });

        await runTest('C8-AU-05', 'ActivityUpdated EntityType Normalization & Production Capability Boundary', async () => {
            const { ServerAuthorityProof, AuthorityProofIssuer } = await import('../utils/ServerAuthorityProof.js');

            // 1. Lowercase 'lead' through production domainEventQueue -> domainEventWorker -> domainEventIssuer capability
            const leadLower = await Lead.create({ firstName: 'LowerLead', mobile: '9999990001' });
            const actLower = await Activity.create({ type: 'Call', subject: 'Lower Test', entityType: 'lead', entityId: leadLower._id, dueDate: new Date() });
            await dispatchDomainEventThroughQueue({
                eventId: uuidv4(),
                eventType: 'ActivityUpdated',
                aggregateType: 'Activity',
                aggregateId: actLower._id,
                payload: { entityType: 'lead', entityId: leadLower._id }
            });
            const checkLower = await Lead.findById(leadLower._id).select('+enrichmentState.claimTokenHash');
            if (checkLower.enrichmentState?.status !== 'REQUESTED') {
                throw new Error("Expected Lead to transition to REQUESTED via capability for entityType: 'lead'");
            }
            if (!checkLower.enrichmentState?.claimTokenHash) {
                throw new Error("Expected Lead to have claimTokenHash minted by capability for entityType: 'lead'");
            }

            // 2. Titlecase 'Lead' through production domainEventQueue -> domainEventWorker -> domainEventIssuer capability
            const leadTitle = await Lead.create({ firstName: 'TitleLead', mobile: '9999990002' });
            const actTitle = await Activity.create({ type: 'Call', subject: 'Title Test', entityType: 'Lead', entityId: leadTitle._id, dueDate: new Date() });
            await dispatchDomainEventThroughQueue({
                eventId: uuidv4(),
                eventType: 'ActivityUpdated',
                aggregateType: 'Activity',
                aggregateId: actTitle._id,
                payload: { entityType: 'Lead', entityId: leadTitle._id }
            });
            const checkTitle = await Lead.findById(leadTitle._id).select('+enrichmentState.claimTokenHash');
            if (checkTitle.enrichmentState?.status !== 'REQUESTED') {
                throw new Error("Expected Lead to transition to REQUESTED via capability for entityType: 'Lead'");
            }
            if (!checkTitle.enrichmentState?.claimTokenHash) {
                throw new Error("Expected Lead to have claimTokenHash minted by capability for entityType: 'Lead'");
            }

            // 3. Uppercase 'LEAD' with surrounding whitespace in both persisted Activity and payload through production domainEventQueue -> domainEventWorker -> domainEventIssuer capability
            const leadUpper = await Lead.create({ firstName: 'UpperLead', mobile: '9999990003' });
            const actUpper = await Activity.create({ type: 'Call', subject: 'Upper Test', entityType: '  LEAD  ', entityId: leadUpper._id, dueDate: new Date() });
            await dispatchDomainEventThroughQueue({
                eventId: uuidv4(),
                eventType: 'ActivityUpdated',
                aggregateType: 'Activity',
                aggregateId: actUpper._id,
                payload: { entityType: '  LEAD  ', entityId: leadUpper._id }
            });
            const checkUpper = await Lead.findById(leadUpper._id).select('+enrichmentState.claimTokenHash');
            if (checkUpper.enrichmentState?.status !== 'REQUESTED') {
                throw new Error("Expected Lead to transition to REQUESTED via capability for persisted entityType: '  LEAD  '");
            }
            if (!checkUpper.enrichmentState?.claimTokenHash) {
                throw new Error("Expected Lead to have claimTokenHash minted by capability for persisted entityType: '  LEAD  '");
            }

            // 4. Non-lead entityType (e.g. 'Deal') through production path must NOT request enrichment
            const leadDeal = await Lead.create({ firstName: 'DealLead', mobile: '9999990004' });
            const actDeal = await Activity.create({ type: 'Call', subject: 'Deal Test', entityType: 'Deal', entityId: leadDeal._id, dueDate: new Date() });
            await dispatchDomainEventThroughQueue({
                eventId: uuidv4(),
                eventType: 'ActivityUpdated',
                aggregateType: 'Activity',
                aggregateId: actDeal._id,
                payload: { entityType: 'Deal', entityId: leadDeal._id }
            });
            const checkDeal = await Lead.findById(leadDeal._id);
            if (checkDeal.enrichmentState?.status === 'REQUESTED') {
                throw new Error("Did NOT expect Lead to transition to REQUESTED for entityType: 'Deal'");
            }

            // 5. Missing or null entityType through production path must NOT request enrichment
            const leadNull = await Lead.create({ firstName: 'NullLead', mobile: '9999990005' });
            const actNull = await Activity.create({ type: 'Call', subject: 'Null Test', entityType: 'Lead', entityId: leadNull._id, dueDate: new Date() });
            await dispatchDomainEventThroughQueue({
                eventId: uuidv4(),
                eventType: 'ActivityUpdated',
                aggregateType: 'Activity',
                aggregateId: actNull._id,
                payload: { entityType: null, entityId: leadNull._id }
            });
            const checkNull = await Lead.findById(leadNull._id);
            if (checkNull.enrichmentState?.status === 'REQUESTED') {
                throw new Error("Did NOT expect Lead to transition to REQUESTED for entityType: null");
            }

            // 6. Security verification: Untrusted direct invocation cannot bypass capability boundary
            let constructorBlocked = false;
            try {
                new ServerAuthorityProof('fake_secret', leadLower._id.toString(), 'fake_job');
            } catch (err) {
                if (err.message.includes('SECURITY_VIOLATION')) constructorBlocked = true;
            }
            if (!constructorBlocked) {
                throw new Error("Expected direct ServerAuthorityProof constructor to throw SECURITY_VIOLATION");
            }

            let directResolveBlocked = false;
            try {
                await AuthorityProofIssuer.resolveSystemProof(leadLower._id.toString(), 'unauthorized_job', 'invalid_token');
            } catch (err) {
                if (err.message.includes('SECURITY_VIOLATION')) directResolveBlocked = true;
            }
            if (!directResolveBlocked) {
                throw new Error("Expected direct resolveSystemProof with invalid token to throw SECURITY_VIOLATION");
            }

            if (typeof domainEventWorker.processFn !== 'undefined') {
                throw new Error("domainEventWorker must not expose direct processFn execution method");
            }
        });

        await runTest('C8-AD-01', 'ActivityDeleted', async () => {
            const req = mockReq({}, { id: act01._id });
            const res = mockRes();
            await deleteActivity(req, res);
            if (!res.data || !res.data.success) throw new Error(`deleteActivity failed: ${JSON.stringify(res.data)}`);
            const deleted = await Activity.findById(act01._id);
            if (deleted && !deleted.isDeleted) throw new Error('Activity not soft deleted');
            const outboxes = await OutboxEvent.find({ aggregateId: act01._id, eventType: 'ActivityDeleted' });
            if (outboxes.length !== 1) throw new Error('Missing ActivityDeleted OutboxEvent');
            const ob = outboxes[0];
            if (ob.payload.entityType !== 'Lead' || !ob.payload.activityId) throw new Error('Missing payload fields');
            
            await processDomainEvent({ data: ob.toJSON() });
            await assertEffects(ob.eventId, ['activity_entity_update']);
            // Google sync is conditionally fired if googleEventId exists, which we didn't set, but that's fine.
        });

        await runTest('C8-CC-01', 'Manual ContactCreated', async () => {
            const req = mockReq({ name: 'Manual Contact', phones: [{ number: '9999999999' }] });
            const res = mockRes();
            let nextError = null;
            await createContact(req, res, (err) => { nextError = err; });
            if (nextError) throw nextError;
            if (!res.data || !res.data.success) throw new Error(`createContact failed: ${JSON.stringify(res.data)}`);
            const contact = res.data.data;
            const outboxes = await OutboxEvent.find({ aggregateId: contact._id, eventType: 'ContactCreated' });
            if (outboxes.length !== 1) throw new Error('Missing ContactCreated OutboxEvent');
            const ob = outboxes[0];
            if (ob.payload.syncToGoogle !== true) throw new Error('syncToGoogle must be true');
            await processDomainEvent({ data: ob.toJSON() });
            await assertEffects(ob.eventId, ['contact_google_sync']);
        });

        await runTest('C8-CC-02', 'System-generated Contact', async () => {
            // Cannot easily invoke dealForm or inventory controller safely without larger mocking, 
            // but we can simulate the system create by invoking Contact.create directly, 
            // verifying it doesn't hook into googleSync natively.
            const sysContact = await Contact.create({ name: 'System Contact' });
            const outboxes = await OutboxEvent.find({ aggregateId: sysContact._id, eventType: 'ContactCreated' });
            if (outboxes.length > 0) throw new Error('System creation should not generate C8 OutboxEvent');
        });

        await runTest('C8-ID-01', 'Idempotency replay', async () => {
            const execBefore = await EffectExecution.countDocuments({ eventId: obAc01.eventId, effectKey: 'activity_google_sync' });
            if (execBefore !== 1) throw new Error('Precondition failed');
            
            await processDomainEvent({ data: obAc01.toJSON() });
            
            const execs = await EffectExecution.find({ eventId: obAc01.eventId, effectKey: 'activity_google_sync' });
            if (execs.length !== 1) throw new Error('Duplicate execution records created');
            if (execs[0].attempts > 1) throw new Error('Attempts incremented despite being completed');
        });

    } catch (err) {
        console.error('HARNESS CRASHED:', err);
        summary.failed++;
    } finally {
        await mongoose.disconnect();
        if (replSet) await replSet.stop();
        domainEventQueue.close();
        domainEventWorker.close();

        console.log(`\nC8 FUNCTIONAL HARNESS RESULT`);
        console.log(`Total: ${summary.total}`);
        console.log(`Passed: ${summary.passed}`);
        console.log(`Failed: ${summary.failed}`);
        console.log(`Limited: ${summary.limited}`);
        
        if (summary.failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
}

runTests();
