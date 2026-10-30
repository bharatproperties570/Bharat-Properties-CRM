import assert from 'assert';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { autoTriggerStageChange } from '../controllers/activity.controller.js';
import { submitWaSiteVisit } from '../controllers/public.controller.js';
import Activity from '../models/Activity.js';
import Lead from '../models/Lead.js';
import SystemSetting from '../models/SystemSetting.js';
import Lookup from '../models/Lookup.js';

console.log('=== Phase 2: Runtime Reliability & Contract Fixes Suite ===\n');

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
}

async function runContractTests() {
    let passed = 0;
    let failed = 0;
    const mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    async function recordAsync(name, fn) {
        try {
            await fn();
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${name}`);
            console.error(err);
            failed++;
        }
    }

    console.log('--- 1. Polymorphic autoTriggerStageChange ---');
    await recordAsync('autoTriggerStageChange returns null on null/undefined input', async () => {
        const res1 = await autoTriggerStageChange(null);
        assert.strictEqual(res1, null);

        const res2 = await autoTriggerStageChange(undefined);
        assert.strictEqual(res2, null);
    });

    await recordAsync('autoTriggerStageChange returns null on non-lead entityType or non-completed status', async () => {
        const mockDealAct = {
            entityType: 'Deal',
            status: 'Completed',
            entityId: new mongoose.Types.ObjectId()
        };
        const resDeal = await autoTriggerStageChange(mockDealAct);
        assert.strictEqual(resDeal, null);

        const mockPendingAct = {
            entityType: 'Lead',
            status: 'Pending',
            entityId: new mongoose.Types.ObjectId()
        };
        const resPending = await autoTriggerStageChange(mockPendingAct);
        assert.strictEqual(resPending, null);
    });

    await recordAsync('autoTriggerStageChange accepts an activity document or ID string polymorphically', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();

        const originalFindById = Activity.findById;
        const origLeadFindById = Lead.findById;
        const origLeadFindOneAndUpdate = Lead.findOneAndUpdate;
        const origLeadFindByIdAndUpdate = Lead.findByIdAndUpdate;
        const origSystemSettingFindOne = SystemSetting.findOne;
        const origLookupFindOne = Lookup.findOne;

        let queriedId = null;

        Activity.findById = (id) => {
            queriedId = String(id);
            return Promise.resolve({
                _id: fakeActId,
                entityType: 'Lead',
                status: 'Completed',
                entityId: fakeLeadId,
                type: 'Call',
                details: { outcome: 'Not Interested' }
            });
        };

        const mockLeadDoc = {
            _id: fakeLeadId,
            firstName: 'Aarav',
            budget: '50L',
            timeline: 'Immediate',
            stage: 'Working'
        };

        const createQueryMock = (doc) => {
            const p = Promise.resolve(doc);
            p.lean = () => Promise.resolve(doc);
            p.select = () => createQueryMock(doc);
            p.populate = () => createQueryMock(doc);
            return p;
        };

        Lead.findById = () => createQueryMock(mockLeadDoc);
        Lead.find = () => createQueryMock([mockLeadDoc]);
        Lead.findOneAndUpdate = () => createQueryMock(mockLeadDoc);
        Lead.findByIdAndUpdate = () => createQueryMock(mockLeadDoc);
        SystemSetting.findOne = () => createQueryMock(null);
        Lookup.findOne = () => createQueryMock(null);

        try {
            // Test 1: Passing ID string
            await autoTriggerStageChange(String(fakeActId), 'user123');
            assert.strictEqual(queriedId, String(fakeActId), 'Should have queried Activity.findById with the ID string');

            // Test 2: Passing ObjectId
            queriedId = null;
            await autoTriggerStageChange(fakeActId, 'user123');
            assert.strictEqual(queriedId, String(fakeActId), 'Should have queried Activity.findById with the ObjectId');

            // Test 3: Passing full document
            queriedId = null;
            const fullDoc = {
                _id: fakeActId,
                entityType: 'Lead',
                status: 'Completed',
                entityId: fakeLeadId,
                type: 'Site Visit',
                details: { outcome: 'Interested' }
            };
            await autoTriggerStageChange(fullDoc, 'user123');
            assert.strictEqual(queriedId, null, 'Should NOT query findById when full document with type is passed');
        } finally {
            Activity.findById = originalFindById;
            Lead.findById = origLeadFindById;
            Lead.findOneAndUpdate = origLeadFindOneAndUpdate;
            Lead.findByIdAndUpdate = origLeadFindByIdAndUpdate;
            SystemSetting.findOne = origSystemSettingFindOne;
            Lookup.findOne = origLookupFindOne;
        }
    });

    console.log('\n--- 2. Public Site Visit Idempotency & Validation ---');
    await recordAsync('submitWaSiteVisit rejects missing fields with 400', async () => {
        const reqMissing = { body: { token: 'sample' } }; // missing date & time
        const resMissing = createMockRes();
        await submitWaSiteVisit(reqMissing, resMissing);
        assert.strictEqual(resMissing.statusCode, 400);
        assert.strictEqual(resMissing.body.message, 'Missing required fields');
    });

    await recordAsync('submitWaSiteVisit provides idempotent response for existing pending visit', async () => {
        const origJwt = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'test_secret_for_contracts_suite';

        const leadId = new mongoose.Types.ObjectId();
        const existingActId = new mongoose.Types.ObjectId();
        const validToken = jwt.sign({ leadId: String(leadId) }, process.env.JWT_SECRET);

        const origLeadFindById = Lead.findById;
        const origActFindOne = Activity.findOne;

        Lead.findById = () => Promise.resolve({ _id: leadId, firstName: 'Aarav' });
        Activity.findOne = (query) => {
            if (query.type === 'Site Visit' && query.status === 'Pending') {
                return Promise.resolve({ _id: existingActId });
            }
            return Promise.resolve(null);
        };

        try {
            const req = {
                body: {
                    token: validToken,
                    date: '2026-11-15',
                    time: '11:00 AM'
                }
            };
            const res = createMockRes();
            await submitWaSiteVisit(req, res);

            assert.strictEqual(res.statusCode, 200, 'Duplicate submission should return HTTP 200');
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(String(res.body.activityId), String(existingActId));
            assert(res.body.message.includes('already scheduled'));
        } finally {
            Lead.findById = origLeadFindById;
            Activity.findOne = origActFindOne;
            process.env.JWT_SECRET = origJwt;
        }
    });

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongod) {
        await mongod.stop();
    }

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runContractTests().catch(err => {
    console.error('Unexpected contract test error:', err);
    process.exit(1);
});
