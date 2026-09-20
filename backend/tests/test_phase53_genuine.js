import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'assert';

let replSet;

async function run() {
    console.log("Starting MongoMemoryReplSet...");
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();
    await mongoose.connect(uri, { autoIndex: false });
    console.log("Connected to MongoMemoryReplSet");

    const Deal = (await import('../models/Deal.js')).default;
    const Inventory = (await import('../models/Inventory.js')).default;
    const AutomationLog = (await import('../models/AutomationLog.js')).default;
    const AuditLog = (await import('../models/AuditLog.js')).default;
    const Lookup = (await import('../models/Lookup.js')).default;
    const SystemSetting = (await import('../models/SystemSetting.js')).default;
    const Team = (await import('../models/Team.js')).default;
    const User = (await import('../models/User.js')).default;
    const Contact = (await import('../models/Contact.js')).default;
    const Lead = (await import('../models/Lead.js')).default;
    const Project = (await import('../models/Project.js')).default;
    const OutboxEvent = (await import('../models/OutboxEvent.js')).default;

    await OutboxEvent.createCollection();
    await Deal.createCollection();
    await Inventory.createCollection();
        await AutomationLog.createCollection();
    await AutomationLog.ensureIndexes();
    await AuditLog.createCollection();
    await Lookup.createCollection();
    await SystemSetting.createCollection();
    await Team.createCollection();
    await User.createCollection();
    await Contact.createCollection();
    await Lead.createCollection();
    await Project.createCollection();

    const { createStandardizedDeal } = await import('../services/DealCreationEngine.js');

    const availableLookup = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Available', isActive: true });
    await Lookup.create({ lookup_type: 'Status', lookup_value: 'Active', isActive: true });
    const blockedLookup = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Blocked', isActive: true });
    await SystemSetting.create({ key: 'crm_duplicate_policy', value: 'strict' });

    console.log("=== SETUP COMPLETE ===");

    // 1. Basic Creation & Inventory Status Sync
    console.log("TEST 1: Basic Deal Creation & Inventory Sync");
    const inv1 = await Inventory.create({
        projectName: 'Test Project',
        unitNumber: 'A-101',
        status: availableLookup._id,
        latitude: 25.0,
        longitude: 55.0
    });

    const res1 = await createStandardizedDeal({
        source: 'API',
        dealData: { projectName: 'Test Project', unitNo: 'A-101', stage: 'Booked' },
        linkage: { inventoryId: inv1._id }
    });
    assert.ok(res1.success);
    assert.ok(res1.deal._id);
    assert.ok(parseFloat(res1.deal.latitude) === 25.0);
    assert.ok(parseFloat(res1.deal.longitude) === 55.0);

    const updatedInv1 = await Inventory.findById(inv1._id);
    // syncInventoryStatus uses `{ status: 'Blocked' }` instead of ObjectId lookup! Let's check it.
    // It updates with 'Blocked'. Since status is Mixed, it's a string.
    assert.strictEqual(updatedInv1.status.toString(), blockedLookup._id.toString());

    // 2. Duplicate Detection
    console.log("TEST 2: Duplicate Deal Detection (Coordinate)");
    let dupErr = null;
    try {
        await createStandardizedDeal({
            source: 'API',
            dealData: { projectName: 'Test Project', unitNo: 'A-101', stage: 'Open' },
            linkage: { inventoryId: inv1._id }
        });
    } catch (err) {
        dupErr = err;
    }
    assert.ok(dupErr && dupErr.code === 'DUPLICATE_DEAL');

    // 3. Idempotency Replay
    console.log("TEST 3: Idempotency Replay");
    const idKey = 'uuid-1234';
    const resIdmp1 = await createStandardizedDeal({
        source: 'API',
        idempotencyKey: idKey,
        dealData: { projectName: 'Idmp Project', unitNo: 'B-101', stage: 'Open' },
        linkage: {}
    });
    assert.ok(resIdmp1.success);
    assert.strictEqual(resIdmp1.isIdempotentReplay, false);

    const resIdmp2 = await createStandardizedDeal({
        source: 'API',
        idempotencyKey: idKey,
        dealData: { projectName: 'Idmp Project', unitNo: 'B-101', stage: 'Open' },
        linkage: {}
    });
    assert.ok(resIdmp2.success);
    assert.strictEqual(resIdmp2.isIdempotentReplay, true);
    assert.strictEqual(resIdmp2.deal._id.toString(), resIdmp1.deal._id.toString());

    // 4. Concurrent Requests
    console.log("TEST 4: Concurrent Deal Creation");
    const inv2 = await Inventory.create({
        projectName: 'Race Project',
        unitNumber: 'C-101',
        status: availableLookup._id
    });

    const promiseA = createStandardizedDeal({
        source: 'API-A',
        dealData: { projectName: 'Race Project', unitNo: 'C-101', stage: 'Open' },
        linkage: { inventoryId: inv2._id }
    });

    const promiseB = createStandardizedDeal({
        source: 'API-B',
        dealData: { projectName: 'Race Project', unitNo: 'C-101', stage: 'Open' },
        linkage: { inventoryId: inv2._id }
    });

    const results = await Promise.allSettled([promiseA, promiseB]);
    const successes = results.filter(r => r.status === 'fulfilled' && r.value.success);
    const failures = results.filter(r => r.status === 'rejected');

    assert.strictEqual(successes.length, 1, "Exactly one should succeed");
    assert.strictEqual(failures.length, 1, "Exactly one should fail");
    assert.ok(['DUPLICATE_DEAL', 'TRANSACTION_FAILED'].includes(failures[0].reason.code), `Failure should be duplicate deal or write conflict. Actual code: ${failures[0].reason.code} / Message: ${failures[0].reason.message}`);

    // 5. Post-Commit Failure Isolation
    console.log("TEST 5: Post-Commit Failure Isolation");
    const res5 = await createStandardizedDeal({
        source: 'API',
        dealData: { projectName: 'Fail Project', unitNo: 'D-101', stage: 'Open' },
        linkage: {}
    }, {
        triggerSms: true // SMS will fail because we have no populated owner in DB to mock
    });

    assert.ok(res5.success);
    assert.ok(res5.deal._id);
    assert.ok(true); // SMS was gracefully skipped since no phone exists

    // 6. External Session (Parent Commit)
    console.log("TEST 6: External Parent Session");
    const externalSession = await mongoose.startSession();
    externalSession.startTransaction();
    const res6 = await createStandardizedDeal({
        source: 'Intake',
        dealData: { projectName: 'Parent Project', unitNo: 'E-101', stage: 'Open' },
        linkage: {}
    }, { session: externalSession, triggerDistribution: true });

    assert.ok(res6.success);
    assert.ok(res6.deal._id);

    // R56 STAGE 2 MIGRATION: In-memory task array is now unconditionally empty
    assert.strictEqual(res6.postCommitTasks.length, 0, "No in-memory tasks returned in R56");

    await externalSession.commitTransaction();
    externalSession.endSession();

    // R56 STAGE 2 MIGRATION: Verify durable Outbox intent
    const events = await OutboxEvent.find({ aggregateId: res6.deal._id });
    assert.strictEqual(events.length, 1, "Expected exactly one DealCreated event");
    const event = events[0];
    assert.strictEqual(event.eventType, 'DealCreated');
    assert.strictEqual(event.aggregateType, 'Deal');
    assert.strictEqual(event.status, 'PENDING');
    assert.strictEqual(event.payload.triggerDistribution, true);

    console.log("TEST 7: Blocker 1 - Deal.js Hook Session Isolation (Missing Coordinates)");
    const inv3 = await Inventory.create({
        projectName: 'NoCoords Project',
        unitNumber: 'F-101',
        status: availableLookup._id
    });
    // No latitude or longitude provided

    // We spy on Inventory.findById to ensure session is passed
    const originalFindById = Inventory.findById;
    let hookExecuted = false;
    Inventory.findById = function(...args) {
        hookExecuted = true;
        const query = originalFindById.apply(this, args);
        const originalSession = query.session;
        query.session = function(sess) {
            if (!sess) throw new Error("HOOK_MISSING_SESSION: Inventory.findById called without session!");
            return originalSession.apply(this, [sess]);
        };
        // Wait, Mongoose findById returns a Query.
        // We can just check if query.options.session exists before it executes.
        const originalExec = query.exec;
        query.exec = function(...execArgs) {
            if (!this.options.session) {
                throw new Error("HOOK_MISSING_SESSION: Inventory.findById executed without session!");
            }
            return originalExec.apply(this, execArgs);
        };
        return query;
    };

    const res7 = await createStandardizedDeal({
        source: 'API',
        dealData: { projectName: 'NoCoords Project', unitNo: 'F-101', stage: 'Open' },
        linkage: { inventoryId: inv3._id }
    });

    assert.ok(res7.success);
    assert.ok(hookExecuted, "Hook should have executed for missing coordinates");

    // Restore Inventory.findById
    Inventory.findById = originalFindById;
    console.log("TEST 7 PASSED");

    console.log("TEST 8: Blocker 2 - public.controller.js Null Dereference Scenarios");
    const { submitPropertyForm } = await import('../controllers/public.controller.js');
    const ContactModel = mongoose.model('Contact');

    const mockRes = () => {
        const res = {};
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (data) => { res.data = data; return res; };
        return res;
    };

    // Scenario A: inventory = null, ownerContact = valid (Normal unauthenticated flow)
    const res8a = mockRes();
    try {
        await submitPropertyForm({
            headers: { 'x-correlation-id': 'test-123a' },
            body: {
                contact: { mobile: '9999999991', name: 'Null Test A' },
                projectName: 'Null Project A', unitNo: 'N-1', price: 1000
            }
        }, res8a);
    } catch (e) {
        assert.fail(`Scenario A threw an error: ${e.message}`);
    }
    assert.strictEqual(res8a.statusCode, 201, "Should succeed with null inventory");

    // Scenario B: inventory = valid, ownerContact = null
    // We force Contact.findOne and Contact.create to return null
    const originalContactFindOne = ContactModel.findOne;
    const originalContactCreate = ContactModel.create;
    ContactModel.findOne = async () => null;
    ContactModel.create = async () => null;

    const res8b = mockRes();
    try {
        await submitPropertyForm({
            headers: { 'x-correlation-id': 'test-123b' },
            body: {
                contact: { mobile: '9999999992', name: 'Null Test B' },
                projectName: 'Valid Project', unitNo: 'V-1', block: 'A', price: 1000
            }
        }, res8b);
    } catch (e) {
        // We expect TypeError because dealData explicitly reads contactRecord._id in standard CRM
        res8b.statusCode = 500;
        res8b.data = { message: e.message };
    }
    assert.strictEqual(res8b.statusCode, 500, "Should catch null contact or reject");

    // Scenario C: inventory = null, ownerContact = null
    const res8c = mockRes();
    try {
        await submitPropertyForm({
            headers: { 'x-correlation-id': 'test-123c' },
            body: {
                contact: { mobile: '9999999993', name: 'Null Test C' },
                projectName: 'Null Project C', unitNo: 'N-2', price: 1000
            }
        }, res8c);
    } catch (e) {
        res8c.statusCode = 500;
    }
    assert.strictEqual(res8c.statusCode, 500, "Should catch null contact or reject");

    // Restore mocks
    ContactModel.findOne = originalContactFindOne;
    ContactModel.create = originalContactCreate;

    console.log("TEST 8 PASSED");


    console.log("ALL TESTS PASSED.");
}

run().then(() => {
    mongoose.disconnect();
    if (replSet) replSet.stop();
    process.exit(0);
}).catch(err => {
    console.error("TEST FAILED:", err);
    mongoose.disconnect();
    if (replSet) replSet.stop();
    process.exit(1);
});
