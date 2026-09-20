import test, { mock } from 'node:test';
import assert from 'node:assert';

// Mock dependencies before importing the module under test
mock.module('../models/Lead.js', {
    defaultExport: {
        findById: mock.fn(),
        updateOne: mock.fn(),
        aggregate: mock.fn()
    }
});

mock.module('../models/Deal.js', {
    defaultExport: {
        findById: mock.fn(),
        updateOne: mock.fn(),
        create: mock.fn(),
        aggregate: mock.fn()
    }
});

mock.module('../models/DistributionRule.js', {
    defaultExport: {
        find: mock.fn(),
        findByIdAndUpdate: mock.fn()
    }
});

mock.module('../models/User.js', {
    defaultExport: {
        find: mock.fn(),
        findById: mock.fn()
    }
});

mock.module('../models/DistributionAudit.js', {
    defaultExport: {
        create: mock.fn()
    }
});

mock.module('../utils/withMongoTransaction.js', {
    namedExports: {
        withMongoTransaction: async (cb) => {
            await cb({}); // run with fake session
        }
    }
});

mock.module('../src/queues/queueManager.js', {
    namedExports: {
        distributionQueue: {
            add: mock.fn()
        }
    }
});

// Mock event bus
mock.module('../services/EventBus.js', {
    defaultExport: {
        emit: mock.fn(),
        on: mock.fn()
    }
});

mock.module('bullmq', {
    namedExports: {
        Worker: class {
            constructor(name, cb, opts) {
                this.name = name;
                this.cb = cb;
                this.opts = opts;
                this._listeners = {};
            }
            on(event, handler) {
                if (!this._listeners[event]) this._listeners[event] = [];
                this._listeners[event].push(handler);
            }
            listeners(event) {
                return this._listeners[event] || [];
            }
        }
    }
});

mock.module('../src/config/redis.js', {
    defaultExport: {}
});
import fs from 'node:fs';
import path from 'node:path';

const servicesDir = path.resolve(import.meta.dirname, '../services');
if (!fs.existsSync(servicesDir)) fs.mkdirSync(servicesDir, { recursive: true });
const notifPath = path.join(servicesDir, 'notificationService.js');
let createdNotif = false;
if (!fs.existsSync(notifPath)) {
    fs.writeFileSync(notifPath, 'export const createNotification = () => {};');
    createdNotif = true;
}

process.on('exit', () => {
    if (createdNotif) {
        try { fs.unlinkSync(notifPath); } catch(e){}
    }
});

mock.module('../services/notificationService.js', {
    namedExports: {
        createNotification: mock.fn()
    }
});



// Import the module after mocks are registered
const { executeDistributionCycle, distributeEntity } = await import('../src/utils/distributionEngine.js');
const Lead = (await import('../models/Lead.js')).default;
const DistributionRule = (await import('../models/DistributionRule.js')).default;
const User = (await import('../models/User.js')).default;
const DistributionAudit = (await import('../models/DistributionAudit.js')).default;
const { distributionQueue } = await import('../src/queues/queueManager.js');

test('R20 Durable Distribution Tests', async (t) => {

    await t.test('TEST 1: Producer strictly queues pointer payload', async () => {
        distributionQueue.add.mock.resetCalls();
        const res = await distributeEntity({ _id: '123', constructor: { modelName: 'Lead' } }, 'onCreate');

        assert.strictEqual(res, null);
        assert.strictEqual(distributionQueue.add.mock.calls.length, 1);
        const args = distributionQueue.add.mock.calls[0].arguments;
        assert.strictEqual(args[0], 'distribute');
        assert.strictEqual(args[1].entityId, '123');
        assert.strictEqual(args[1].modelName, 'Lead');
        assert.ok(args[1].cycleId.startsWith('cycle_'));
        assert.strictEqual(args[1].attempt, 1);
        assert.strictEqual(args[2].jobId, `dist:123:onCreate:${args[1].cycleId}`);
    });

    await t.test('TEST 2: STALE PAYLOAD & FRESH HYDRATION', async () => {
        DistributionAudit.create.mock.resetCalls();

        const freshLead = { _id: '123', owner: null, leadScore: 50, toObject: () => ({ _id: '123' }) };
        Lead.findById.mock.mockImplementation(() => ({ session: () => freshLead, then: (cb) => cb(freshLead) }));
        Lead.updateOne.mock.mockImplementationOnce(() => ({ modifiedCount: 1 }));

        DistributionRule.find.mock.mockImplementationOnce(() => ({ sort: () => [{ _id: 'r1', name: 'Rule 1', distributionType: 'roundRobin', assignmentTarget: { type: 'user', ids: ['u1'] }, conditions: [] }] }));
        DistributionRule.findByIdAndUpdate.mock.mockImplementationOnce(() => ({ lastAssignedIndex: 1 }));

        User.find.mock.mockImplementationOnce(() => ({ select: () => ({ lean: () => [{ _id: 'u1' }] }), lean: () => [{ _id: 'u1', status: 'active', isActive: true, isDeleted: false, availability: 'Available' }] }));

        await executeDistributionCycle({ entityId: '123', modelName: 'Lead', triggerEvent: 'onCreate', cycleId: 'c1', attempt: 1 });

        assert.strictEqual(DistributionAudit.create.mock.calls.length, 1);
        const auditArg = DistributionAudit.create.mock.calls[0].arguments[0][0];
        assert.strictEqual(auditArg.status, 'COMPLETED');
        assert.strictEqual(auditArg.cycleId, 'c1');
    });

    await t.test('TEST 3: MANUAL OWNER CHANGE (Optimistic Concurrency skips update)', async () => {
        DistributionAudit.create.mock.resetCalls();

        // Lead is already manually assigned to 'u2'
        const freshLead = { _id: '123', owner: 'u2', toObject: () => ({ _id: '123' }) };
        Lead.findById.mock.mockImplementation(() => ({ session: () => freshLead, then: (cb) => cb(freshLead) }));

        const res = await executeDistributionCycle({ entityId: '123', modelName: 'Lead', triggerEvent: 'onCreate', cycleId: 'c2', attempt: 1 });

        assert.strictEqual(res, null);
        assert.strictEqual(DistributionAudit.create.mock.calls.length, 1);
        const auditArg = DistributionAudit.create.mock.calls[0].arguments[0];
        assert.strictEqual(auditArg.status, 'SKIPPED');
        assert.strictEqual(auditArg.reason, 'Entity already assigned by another actor');
    });

    await t.test('TEST 4: CONCURRENT EXECUTION (modifiedCount === 0)', async () => {
        DistributionAudit.create.mock.resetCalls();

        // Initial state: not assigned
        const freshLead = { _id: '123', owner: null, toObject: () => ({ _id: '123' }) };

        // Lead.findById is called twice in this flow (initial + after failed update)
        let findByIdCount = 0;
        Lead.findById.mock.mockImplementation(() => {
            findByIdCount++;
            if (findByIdCount === 1) return { session: () => freshLead, then: (cb) => cb(freshLead) };
            if (findByIdCount === 2) return { session: () => ({ _id: '123', owner: 'other_worker' }) };
        });

        Lead.updateOne.mock.mockImplementationOnce(() => ({ modifiedCount: 0 }));

        DistributionRule.find.mock.mockImplementationOnce(() => ({ sort: () => [{ _id: 'r1', name: 'Rule 1', distributionType: 'roundRobin', assignmentTarget: { type: 'user', ids: ['u1'] }, conditions: [] }] }));
        DistributionRule.findByIdAndUpdate.mock.mockImplementationOnce(() => ({ lastAssignedIndex: 1 }));
        User.find.mock.mockImplementationOnce(() => ({ select: () => ({ lean: () => [{ _id: 'u1' }] }), lean: () => [{ _id: 'u1', status: 'active', isActive: true, isDeleted: false, availability: 'Available' }] }));

        await executeDistributionCycle({ entityId: '123', modelName: 'Lead', triggerEvent: 'onCreate', cycleId: 'c3', attempt: 1 });

        assert.strictEqual(DistributionAudit.create.mock.calls.length, 1);
        const auditArg = DistributionAudit.create.mock.calls[0].arguments[0][0];
        assert.strictEqual(auditArg.status, 'SKIPPED');
        assert.strictEqual(auditArg.reason, 'Entity already assigned by another actor / manual override');
    });

    await t.test('TEST 5: RETRY (Throws on no agents)', async () => {
        const freshLead = { _id: '123', owner: null, toObject: () => ({ _id: '123' }) };
        Lead.findById.mock.mockImplementation(() => ({ session: () => freshLead, then: (cb) => cb(freshLead) }));
        DistributionRule.find.mock.mockImplementationOnce(() => ({ sort: () => [{ _id: 'r1', name: 'Rule 1', distributionType: 'roundRobin', assignmentTarget: { type: 'user', ids: ['u1'] }, conditions: [] }] }));

        // No users returned
        User.find.mock.mockImplementationOnce(() => ({ select: () => ({ lean: () => [] }), lean: () => [] }));

        await assert.rejects(
            executeDistributionCycle({ entityId: '123', modelName: 'Lead', triggerEvent: 'onCreate', cycleId: 'c4', attempt: 1 }),
            /No eligible agents available yet/
        );
    });

    await t.test('TEST 6: TERMINAL FAILURE AUDIT (via worker)', async () => {
        // We will simulate the worker logic for terminal failure since we can't easily mock BullMQ Worker internals here
        // The worker uses job.attemptsMade >= maxAttempts
        const job = { id: 'j1', attemptsMade: 12, opts: { attempts: 12 }, data: { entityId: '123', modelName: 'Lead', triggerEvent: 'onCreate', cycleId: 'c5' } };

        DistributionAudit.create.mock.resetCalls();
        DistributionAudit.create.mock.mockImplementationOnce(() => Promise.resolve());

        const { distributionWorker } = await import('../src/workers/distributionWorker.js');

        // We manually trigger the 'failed' event handler
        const failedListeners = distributionWorker.listeners('failed');
        assert.ok(failedListeners.length > 0);

        const failedHandler = failedListeners[0];
        await failedHandler(job, new Error('Terminal Error'));

        assert.strictEqual(DistributionAudit.create.mock.calls.length, 1);
        const auditArg = DistributionAudit.create.mock.calls[0].arguments[0];
        assert.strictEqual(auditArg.status, 'FAILED');
        assert.strictEqual(auditArg.reason, 'Terminal Error');
    });

    await t.test('TEST 7: User Eligibility Strict Enforcement - Primary Eligible Only', async () => {
        DistributionAudit.create.mock.resetCalls();
        const freshLead = { _id: '123', owner: null, toObject: () => ({ _id: '123' }) };

        const mockUsers = [
            { _id: 'u_active', status: 'active', isActive: true, isDeleted: false, availability: 'Available' },
            { _id: 'u_inactive', status: 'inactive', isActive: true, isDeleted: false, availability: 'Available' }
        ];

        Lead.findById.mock.mockImplementation(() => ({ session: () => freshLead, then: (cb) => cb(freshLead) }));
        Lead.updateOne.mock.mockImplementation(() => ({ modifiedCount: 1 }));

        DistributionRule.find.mock.mockImplementation(() => ({ sort: () => [{
            _id: 'r1',
            name: 'Eligibility Rule',
            distributionType: 'roundRobin',
            assignmentTarget: { type: 'user', ids: mockUsers.map(u => u._id) },
            conditions: []
        }] }));
        DistributionRule.findByIdAndUpdate.mock.mockImplementation(() => ({ lastAssignedIndex: 0 }));
        User.find.mock.mockImplementation(() => ({ select: () => ({ lean: () => mockUsers }), lean: () => mockUsers }));

        const res = await executeDistributionCycle({ entityId: '123', modelName: 'Lead', triggerEvent: 'onCreate', cycleId: 'c_eligibility_1', attempt: 1 });

        assert.strictEqual(res.assignedTo, 'u_active');
    });

    await t.test('TEST 7.1: Fallback Ineligible -> Fails', async () => {
        DistributionAudit.create.mock.resetCalls();
        const freshLead = { _id: '123', owner: null, toObject: () => ({ _id: '123' }) };

        const mockUsers = [
            { _id: 'u_inactive_1', status: 'inactive', isActive: true, isDeleted: false, availability: 'Available' },
            { _id: 'u_ooo_1', status: 'active', isActive: true, isDeleted: false, availability: 'Available', outOfOffice: { active: true, until: new Date(Date.now() + 86400000) } }
        ];

        Lead.findById.mock.mockImplementation(() => ({ session: () => freshLead, then: (cb) => cb(freshLead) }));
        Lead.updateOne.mock.mockImplementation(() => ({ modifiedCount: 1 }));

        DistributionRule.find.mock.mockImplementation(() => ({ sort: () => [{
            _id: 'r1',
            name: 'Eligibility Rule',
            distributionType: 'roundRobin',
            assignmentTarget: { type: 'user', ids: ['u_inactive_1'] },
            fallbackTarget: { type: 'user', id: 'u_ooo_1' },
            conditions: []
        }] }));
        DistributionRule.findByIdAndUpdate.mock.mockImplementation(() => ({ lastAssignedIndex: 0 }));

        let callCount = 0;
        User.find.mock.mockImplementation(() => {
            callCount++;
            if (callCount === 1) return { select: () => ({ lean: () => [mockUsers[0]] }), lean: () => [mockUsers[0]] };
            if (callCount === 2) return { select: () => ({ lean: () => [mockUsers[1]] }), lean: () => [mockUsers[1]] };
            return { select: () => ({ lean: () => [] }), lean: () => [] };
        });

        await assert.rejects(
            executeDistributionCycle({ entityId: '123', modelName: 'Lead', triggerEvent: 'onCreate', cycleId: 'c_eligibility_2', attempt: 1 }),
            /No eligible agents available yet/
        );
    });

    await t.test('TEST 7.2: Fallback Eligible -> Succeeds with (Fallback)', async () => {
        DistributionAudit.create.mock.resetCalls();
        const freshLead = { _id: '123', owner: null, toObject: () => ({ _id: '123' }) };

        const mockUsers = [
            { _id: 'u_suspended', status: 'suspended', isActive: true, isDeleted: false, availability: 'Available' },
            { _id: 'u_fallback_active', status: 'active', isActive: true, isDeleted: false, availability: 'Available' }
        ];

        Lead.findById.mock.mockImplementation(() => ({ session: () => freshLead, then: (cb) => cb(freshLead) }));
        Lead.updateOne.mock.mockImplementation(() => ({ modifiedCount: 1 }));

        DistributionRule.find.mock.mockImplementation(() => ({ sort: () => [{
            _id: 'r1',
            name: 'Base Rule',
            distributionType: 'roundRobin',
            assignmentTarget: { type: 'user', ids: ['u_suspended'] },
            fallbackTarget: { type: 'user', id: 'u_fallback_active' },
            conditions: []
        }] }));
        DistributionRule.findByIdAndUpdate.mock.mockImplementation(() => ({ lastAssignedIndex: 0 }));

        let callCount = 0;
        User.find.mock.mockImplementation(() => {
            callCount++;
            if (callCount === 1) return { select: () => ({ lean: () => [mockUsers[0]] }), lean: () => [mockUsers[0]] };
            if (callCount === 2) return { select: () => ({ lean: () => [mockUsers[1]] }), lean: () => [mockUsers[1]] };
            return { select: () => ({ lean: () => [] }), lean: () => [] };
        });

        const res = await executeDistributionCycle({ entityId: '123', modelName: 'Lead', triggerEvent: 'onCreate', cycleId: 'c_eligibility_3', attempt: 1 });

        assert.strictEqual(res.assignedTo, 'u_fallback_active');
        assert.strictEqual(res.ruleName, 'Base Rule (Fallback)');
    });

    await t.test('TEST 8: Deal and Lead Assignment Notification Title', async () => {
        DistributionAudit.create.mock.resetCalls();
        const { createNotification } = await import('../services/notificationService.js');
        createNotification.mock.resetCalls();

        // 1. Deal
        const freshDeal = { _id: 'deal1', assignedTo: null, toObject: () => ({ _id: 'deal1' }) };
        const Deal = (await import('../models/Deal.js')).default;

        Deal.findById.mock.mockImplementation(() => ({ session: () => freshDeal, then: (cb) => cb(freshDeal) }));
        Deal.updateOne.mock.mockImplementation(() => ({ modifiedCount: 1 }));

        DistributionRule.find.mock.mockImplementation(() => ({ sort: () => [{ _id: 'r2', name: 'Deal Rule', distributionType: 'roundRobin', assignmentTarget: { type: 'user', ids: ['u_deal'] }, conditions: [] }] }));
        DistributionRule.findByIdAndUpdate.mock.mockImplementation(() => ({ lastAssignedIndex: 0 }));
        User.find.mock.mockImplementation(() => ({ select: () => ({ lean: () => [{ _id: 'u_deal' }] }), lean: () => [{ _id: 'u_deal', status: 'active', isActive: true, isDeleted: false, availability: 'Available' }] }));

        const resDeal = await executeDistributionCycle({ entityId: 'deal1', modelName: 'Deal', triggerEvent: 'onCreate', cycleId: 'c_deal', attempt: 1 });
        assert.strictEqual(resDeal.assignedTo, 'u_deal');

        assert.strictEqual(createNotification.mock.calls.length, 1);
        assert.strictEqual(createNotification.mock.calls[0].arguments[2], 'New Deal Assigned');

        createNotification.mock.resetCalls();

        // 2. Lead
        const freshLead = { _id: 'lead1', owner: null, toObject: () => ({ _id: 'lead1' }) };
        Lead.findById.mock.mockImplementation(() => ({ session: () => freshLead, then: (cb) => cb(freshLead) }));
        Lead.updateOne.mock.mockImplementation(() => ({ modifiedCount: 1 }));

        const resLead = await executeDistributionCycle({ entityId: 'lead1', modelName: 'Lead', triggerEvent: 'onCreate', cycleId: 'c_lead', attempt: 1 });
        assert.strictEqual(resLead.assignedTo, 'u_deal');

        assert.strictEqual(createNotification.mock.calls.length, 1);
        assert.strictEqual(createNotification.mock.calls[0].arguments[2], 'New Lead Assigned');
    });
});
