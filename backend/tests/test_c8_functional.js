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
import { processDomainEvent, domainEventWorker } from '../src/workers/domainEventWorker.js';
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
        
        if (summary.failed > 0) process.exit(1);
    }
}

runTests();
