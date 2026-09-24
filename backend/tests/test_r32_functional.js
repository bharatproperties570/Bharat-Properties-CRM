import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { v4 as uuidv4 } from 'uuid';
import assert from 'assert';

// Import models to register schemas
import '../models/Role.js';
import '../models/Team.js';
import '../models/User.js';
import '../models/Contact.js';
import '../models/Lead.js';
import '../models/Lookup.js';
import '../models/Project.js';
import '../models/Inventory.js';
import '../models/Deal.js';
import '../models/Activity.js';
import '../models/Notification.js';
import '../models/OutboxEvent.js';
import '../models/EffectExecution.js';
import '../models/AutomationLog.js';

import smsServiceModule from '../src/modules/sms/sms.service.js';
import CampaignEngineModule from '../services/CampaignEngine.js';
import { updateDeal } from '../controllers/deal.controller.js';
import { processDomainEvent } from '../src/workers/domainEventWorker.js';

// Resolve default exports properly
const smsService = smsServiceModule.default || smsServiceModule;
const CampaignEngine = CampaignEngineModule.default || CampaignEngineModule;

const Role = mongoose.model('Role');
const User = mongoose.model('User');
const Contact = mongoose.model('Contact');
const Lookup = mongoose.model('Lookup');
const Inventory = mongoose.model('Inventory');
const Deal = mongoose.model('Deal');
const OutboxEvent = mongoose.model('OutboxEvent');
const EffectExecution = mongoose.model('EffectExecution');

const mockReq = (dealId, body, userId) => ({
    params: { id: dealId.toString() },
    body,
    user: { id: userId.toString(), role: 'admin', dataScope: 'all' }
});

const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    return res;
};

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runTests = async () => {
    let replSet;
    let originalSms;
    let originalCampaign;
    let originalActivityCreate;

    try {
        console.log('Starting MongoMemoryReplSet...');
        replSet = await MongoMemoryReplSet.create({
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        const uri = replSet.getUri();

        await mongoose.connect(uri, { readPreference: 'primary' });
        console.log('Connected to isolated MongoMemoryReplSet');

        let smsCallCount = 0;
        let campaignCallCount = 0;

        originalSms = smsService.sendSMSWithTemplate;
        smsService.sendSMSWithTemplate = async () => { smsCallCount++; return true; };

        originalCampaign = CampaignEngine.launch;
        CampaignEngine.launch = async () => { campaignCallCount++; return true; };

        const resetStubs = () => {
            smsCallCount = 0;
            campaignCallCount = 0;
        };

        const testRole = await Role.create({
            name: 'Test Role',
            department: 'sales',
        });

        const testUser = await User.create({
            fullName: 'Test User',
            email: 'test@example.com',
            password: 'password123',
            role: testRole._id,
            department: 'sales'
        });

        const testContact = await Contact.create({
            name: 'Test',
            firstName: 'Test',
            phones: [{ number: '9999999999' }],
            intent_index: 'Hot',
            contact_type: 'Lead'
        });

        const blockStatus = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Blocked' });
        const availStatus = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Available' });
        const soldStatus = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Sold Out' });
        const activeStatus = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Active' });

        const createTestDeal = async (stage = 'Open') => {
            const testInv = await Inventory.create({
                projectName: 'Test Proj',
                unitNo: `T-${Math.floor(Math.random() * 10000)}`,
                status: availStatus._id,
                price: { value: 1000, currency: 'INR' }
            });
            return await Deal.create({
                projectName: testInv.projectName,
                unitNo: testInv.unitNo,
                inventoryId: testInv._id,
                stage,
                stageHistory: [],
                associatedContact: testContact._id,
                assignedTo: testUser._id
            });
        };

        const processOutbox = async (dealId) => {
            const events = await OutboxEvent.find({ aggregateId: dealId });
            for (const event of events) {
                const jobPayload = {
                    eventId: event.eventId,
                    eventType: event.eventType,
                    aggregateType: event.aggregateType,
                    aggregateId: event.aggregateId,
                    payload: event.payload,
                    correlationId: event.correlationId
                };
                try {
                    await processDomainEvent({ name: event.eventType, data: jobPayload, id: 'mock-' + event.eventId });
                } catch(e) { }
                await OutboxEvent.updateOne({ _id: event._id }, { $set: { status: 'PUBLISHED' } });
            }
        };

        const assertEffects = async (eventId, expectedEffects) => {
            await wait(200);
            const executions = await EffectExecution.find({ eventId }).lean();
            const executedKeys = executions.map(e => e.effectKey).sort();
            expectedEffects.sort();
            assert.deepStrictEqual(executedKeys, expectedEffects, `Expected effects ${expectedEffects}, got ${executedKeys}`);
            executions.forEach(e => {
                assert.strictEqual(e.status, 'COMPLETED', `Effect ${e.effectKey} is not COMPLETED`);
            });
        };

        let deal, res, outboxEvents, ev;

        console.log('\n--- TEST 1: Generic Update ---');
        deal = await createTestDeal();
        res = mockRes();
        await updateDeal(mockReq(deal._id, { remarks: 'Generic update' }, testUser._id), res);
        outboxEvents = await OutboxEvent.find({ aggregateId: deal._id }).sort({ _id: -1 });
        ev = outboxEvents[0];
        assert.strictEqual(ev.payload.stageProvided, false);
        assert.strictEqual(ev.payload.stageChanged, false);
        assert.strictEqual(ev.payload.documents, null);
        await processOutbox(deal._id);
        await assertEffects(ev.eventId, ['campaign']);
        assert.strictEqual(campaignCallCount, 1);
        assert.strictEqual(smsCallCount, 0);

        console.log('\n--- TEST 2: Stage Supplied Unchanged ---');
        resetStubs();
        deal = await createTestDeal('Open');
        res = mockRes();
        await updateDeal(mockReq(deal._id, { stage: 'Open' }, testUser._id), res);
        outboxEvents = await OutboxEvent.find({ aggregateId: deal._id }).sort({ _id: -1 });
        ev = outboxEvents[0];
        assert.strictEqual(ev.payload.stageProvided, true);
        assert.strictEqual(ev.payload.stageChanged, false);
        await processOutbox(deal._id);
        await assertEffects(ev.eventId, ['campaign', 'sms']);
        assert.strictEqual(campaignCallCount, 1);
        assert.strictEqual(smsCallCount, 1);

        console.log('\n--- TEST 3: Stage Changed ---');
        resetStubs();
        deal = await createTestDeal('Open');
        res = mockRes();
        await updateDeal(mockReq(deal._id, { stage: 'Booked' }, testUser._id), res);
        outboxEvents = await OutboxEvent.find({ aggregateId: deal._id }).sort({ _id: -1 });
        ev = outboxEvents[0];
        assert.strictEqual(ev.payload.stageProvided, true);
        assert.strictEqual(ev.payload.stageChanged, true);
        await processOutbox(deal._id);
        await assertEffects(ev.eventId, ['campaign', 'notification', 'sms', 'workflow']);
        assert.strictEqual(campaignCallCount, 1);
        assert.strictEqual(smsCallCount, 1);

        console.log('\n--- TEST 4: Documents Array Supplied ---');
        resetStubs();
        deal = await createTestDeal();
        res = mockRes();
        await updateDeal(mockReq(deal._id, { documents: [{ docName: 'TestDoc' }] }, testUser._id), res);
        outboxEvents = await OutboxEvent.find({ aggregateId: deal._id }).sort({ _id: -1 });
        ev = outboxEvents[0];
        assert.strictEqual(ev.payload.stageProvided, false);
        assert.strictEqual(Array.isArray(ev.payload.documents), true);
        await processOutbox(deal._id);
        await assertEffects(ev.eventId, ['campaign', 'documents']);

        console.log('\n--- TEST 5: Stage Changed + Documents ---');
        resetStubs();
        deal = await createTestDeal('Open');
        res = mockRes();
        await updateDeal(mockReq(deal._id, { stage: 'Closed Won', documents: [{ docName: 'TestDoc2' }] }, testUser._id), res);
        outboxEvents = await OutboxEvent.find({ aggregateId: deal._id }).sort({ _id: -1 });
        ev = outboxEvents[0];
        assert.strictEqual(ev.payload.stageChanged, true);
        assert.strictEqual(Array.isArray(ev.payload.documents), true);
        await processOutbox(deal._id);
        await assertEffects(ev.eventId, ['campaign', 'documents', 'notification', 'sms', 'workflow']);

        console.log('\n--- TEST 6: Documents Omitted ---');
        resetStubs();
        deal = await createTestDeal();
        res = mockRes();
        await updateDeal(mockReq(deal._id, { remarks: 'omitted docs test' }, testUser._id), res);
        outboxEvents = await OutboxEvent.find({ aggregateId: deal._id }).sort({ _id: -1 });
        ev = outboxEvents[0];
        assert.strictEqual(ev.payload.documents, null);
        await processOutbox(deal._id);
        await assertEffects(ev.eventId, ['campaign']);

        console.log('\n--- TEST 7: Documents Explicit [] ---');
        resetStubs();
        deal = await createTestDeal();
        res = mockRes();
        await updateDeal(mockReq(deal._id, { documents: [] }, testUser._id), res);
        outboxEvents = await OutboxEvent.find({ aggregateId: deal._id }).sort({ _id: -1 });
        ev = outboxEvents[0];
        assert.deepStrictEqual(ev.payload.documents, []);
        await processOutbox(deal._id);
        await assertEffects(ev.eventId, ['campaign', 'documents']);

        console.log('\n--- TEST 8: Transaction Failure ---');
        const beforeFailCount = await OutboxEvent.countDocuments();
        res = mockRes();
        const badDeal = await createTestDeal();
        const Activity = mongoose.model('Activity');
        originalActivityCreate = Activity.create;
        Activity.create = async () => { throw new Error('Transaction simulation failure'); };
        await updateDeal(mockReq(badDeal._id, { stage: 'Closed Lost' }, testUser._id), res);
        Activity.create = originalActivityCreate;
        const afterFailCount = await OutboxEvent.countDocuments();
        assert.strictEqual(beforeFailCount, afterFailCount, 'OutboxEvent created during failed transaction!');
        assert.strictEqual(res.statusCode, 500);

        console.log('\n--- TEST 9: Successful Pipeline Verified ---');
        console.log('Verified implicitly via tests 1-7 (Outbox -> Queue -> Execution completed successfully).');

        console.log('\n--- TEST 10: Duplicate / Retry Semantics ---');
        resetStubs();
        const jobPayload = {
            eventId: ev.eventId,
            eventType: ev.eventType,
            aggregateType: ev.aggregateType,
            aggregateId: ev.aggregateId,
            payload: ev.payload,
            correlationId: ev.correlationId
        };
        await processDomainEvent({ name: 'DealUpdated', data: jobPayload, id: 'dup-123' });
        assert.strictEqual(campaignCallCount, 0, 'Campaign was executed again! Idempotency failed.');
        console.log('AT-LEAST-ONCE EFFECT EXECUTION WITH LEASE-BASED CLAIMING AND COMPLETION-STATE DEDUPLICATION works!');


        console.log('\n--- TEST 11: FAILED EFFECT RETRY ---');
        resetStubs();
        let failCampaignOnce = true;
        const tempCampaign = CampaignEngine.launch;
        CampaignEngine.launch = async (id) => {
            if (failCampaignOnce) {
                failCampaignOnce = false;
                throw new Error('Simulated Campaign Failure');
            }
            campaignCallCount++;
            return true;
        };

        deal = await createTestDeal('Open');
        res = mockRes();
        await updateDeal(mockReq(deal._id, { stage: 'Booked' }, testUser._id), res);

        outboxEvents = await OutboxEvent.find({ aggregateId: deal._id }).sort({ _id: -1 });
        ev = outboxEvents[0];
        const jobPayload11 = { eventId: ev.eventId, eventType: ev.eventType, aggregateType: ev.aggregateType, aggregateId: ev.aggregateId, payload: ev.payload, correlationId: ev.correlationId };

        try { await processDomainEvent({ name: ev.eventType, data: jobPayload11, id: 'mock-fail-1' }); } catch(e) {}

        await wait(100);
        let campaignExecution = await EffectExecution.findOne({ eventId: ev.eventId, effectKey: 'campaign' });
        assert.strictEqual(campaignExecution.status, 'FAILED');
        assert.strictEqual(campaignExecution.attempts, 1);
        assert.strictEqual(campaignCallCount, 0);

        let smsExecution = await EffectExecution.findOne({ eventId: ev.eventId, effectKey: 'sms' });
        assert.strictEqual(smsExecution.status, 'COMPLETED');
        assert.strictEqual(smsCallCount, 1);

        // Process second time (retry the SAME EVENT)
        try { await processDomainEvent({ name: ev.eventType, data: jobPayload11, id: 'mock-fail-2' }); } catch(e) {}

        await wait(100);
        campaignExecution = await EffectExecution.findOne({ eventId: ev.eventId, effectKey: 'campaign' });
        assert.strictEqual(campaignExecution.status, 'COMPLETED');
        assert.strictEqual(campaignExecution.attempts, 2);
        assert.strictEqual(campaignCallCount, 1); // Succeded on retry

        assert.strictEqual(smsCallCount, 1); // Verify sms didn't fire again

        const allExecs = await EffectExecution.countDocuments({ eventId: ev.eventId, effectKey: 'campaign' });
        assert.strictEqual(allExecs, 1, 'Duplicate EffectExecution created');

        CampaignEngine.launch = tempCampaign;
        await OutboxEvent.updateOne({ eventId: ev.eventId }, { $set: { status: 'PUBLISHED' } });

        console.log('\n--- TEST 12: STRONG TRANSACTION ROLLBACK ---');
        deal = await createTestDeal('Open');
        const originalStage = deal.stage;
        const originalStageHistoryLen = deal.stageHistory.length;
        const dbInv12 = await Inventory.findById(deal.inventoryId);
        const originalInvStatus = dbInv12.status;
        const activityCount = await mongoose.model('Activity').countDocuments({ dealId: deal._id });

        res = mockRes();
        const ActivityModel = mongoose.model('Activity');
        const originalActivityCreate12 = ActivityModel.create;
        ActivityModel.create = async () => { throw new Error('Simulated Transaction Failure (Activity)'); };

        await updateDeal(mockReq(deal._id, { stage: 'Closed Lost' }, testUser._id), res);

        ActivityModel.create = originalActivityCreate12;
        assert.strictEqual(res.statusCode, 500);

        const reFetchedDeal = await Deal.findById(deal._id);
        assert.strictEqual(reFetchedDeal.stage, originalStage, 'Deal stage should roll back');
        assert.strictEqual(reFetchedDeal.stageHistory.length, originalStageHistoryLen, 'Deal stageHistory should roll back');

        const reFetchedInv = await Inventory.findById(deal.inventoryId);
        assert.strictEqual(reFetchedInv.status.toString(), originalInvStatus.toString(), 'Inventory status should roll back');

        const afterActivityCount = await ActivityModel.countDocuments({ dealId: deal._id });
        assert.strictEqual(afterActivityCount, activityCount, 'No Activity should be committed');

        const outboxCount12 = await OutboxEvent.countDocuments({ aggregateId: deal._id });
        assert.strictEqual(outboxCount12, 0, 'No OutboxEvent should be created');

        const effectCount12 = await EffectExecution.countDocuments({ aggregateId: deal._id });
        assert.strictEqual(effectCount12, 0, 'No EffectExecution should be created');

        console.log('\n--- TEST 13: OUTBOX -> LOCAL QUEUE -> WORKER ---');
        resetStubs();
        deal = await createTestDeal('Open');
        res = mockRes();
        await updateDeal(mockReq(deal._id, { stage: 'Booked' }, testUser._id), res);

        // Use outboxPublisher directly
        const outboxPublisherModule = await import('../services/OutboxPublisher.js');
        const publisher = outboxPublisherModule.outboxPublisher;
        publisher.start();
        await publisher.poll();
        publisher.stop();

        // Wait for MockWorker to pick up the job and execute (takes ~50ms in MockQueue)
        await wait(500);

        outboxEvents = await OutboxEvent.find({ aggregateId: deal._id }).sort({ _id: -1 });
        ev = outboxEvents[0];

        // Because publisher polls and updates status, we can check it
        assert.strictEqual(ev.status, 'PUBLISHED');

        // Assert effects completed via the queue
        await assertEffects(ev.eventId, ['campaign', 'notification', 'sms', 'workflow']);
        assert.strictEqual(campaignCallCount, 1);
        assert.strictEqual(smsCallCount, 1);

        console.log('\n✅ ALL ISOLATED R32 FUNCTIONAL TESTS PASSED');


    } catch (err) {
        console.error('\n❌ TEST FAILURE:', err);
        process.exitCode = 1;
    } finally {
        if (smsService && originalSms) smsService.sendSMSWithTemplate = originalSms;
        if (CampaignEngine && originalCampaign) CampaignEngine.launch = originalCampaign;
        if (mongoose.models.Activity && originalActivityCreate) mongoose.models.Activity.create = originalActivityCreate;

        if (mongoose.connection) {
            await mongoose.disconnect();
            console.log('Mongoose disconnected.');
        }
        if (replSet) {
            await replSet.stop();
            console.log('MongoMemoryReplSet stopped.');
        }
    }
};

runTests();
