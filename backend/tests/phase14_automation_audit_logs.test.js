process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import AutomationLog from '../models/AutomationLog.js';
import Trigger from '../models/Trigger.js';
import Sequence from '../models/Sequence.js';
import AutomatedAction from '../models/AutomatedAction.js';
import { getAutomatedActions, getAuditLogs } from '../controllers/automation.controller.js';

const createMockRes = () => {
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
};

describe('Phase 14 — Enterprise Automation Audit Logs & Trigger Name Resolution Suite', () => {
    let replset;

    before(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replset.getUri();
        await mongoose.connect(uri);

        await AutomationLog.createCollection();
        await Trigger.createCollection();
        await Sequence.createCollection();
        await AutomatedAction.createCollection();
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        await AutomationLog.deleteMany({});
        await Trigger.deleteMany({});
        await Sequence.deleteMany({});
        await AutomatedAction.deleteMany({});
    });

    it('1. getAutomatedActions: batch resolves invokedByTrigger IDs to Trigger names', async () => {
        const trigger = await Trigger.create({
            name: 'High Value Lead Trigger',
            module: 'leads',
            event: 'created',
            conditions: []
        });

        await AutomatedAction.create({
            name: 'Assign to Senior Agent',
            targetModule: 'leads',
            actionType: 'UPDATE_ENTITY',
            invokedByTrigger: trigger._id
        });

        const req = { user: {} };
        const res = createMockRes();

        await getAutomatedActions(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.length, 1);
        assert.equal(res.body[0].name, 'Assign to Senior Agent');
        assert.equal(res.body[0].invokedByTriggerName, 'High Value Lead Trigger');
    });

    it('2. getAutomatedActions: returns null invokedByTriggerName when unlinked', async () => {
        await AutomatedAction.create({
            name: 'Manual Broadcast Action',
            targetModule: 'deals',
            actionType: 'SEND_NOTIFICATION'
        });

        const req = { user: {} };
        const res = createMockRes();

        await getAutomatedActions(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.length, 1);
        assert.equal(res.body[0].invokedByTriggerName, null);
    });

    it('3. getAutomatedActions: gracefully marks deleted trigger with short ID suffix', async () => {
        const staleTriggerId = new mongoose.Types.ObjectId();

        await AutomatedAction.create({
            name: 'Orphaned Action',
            targetModule: 'leads',
            actionType: 'UPDATE_ENTITY',
            invokedByTrigger: staleTriggerId
        });

        const req = { user: {} };
        const res = createMockRes();

        await getAutomatedActions(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.length, 1);
        assert.equal(
            res.body[0].invokedByTriggerName,
            `Deleted Trigger (${staleTriggerId.toString().slice(-6)})`
        );
    });

    it('4. getAutomatedActions: preserves legacy plain-string trigger names', async () => {
        await AutomatedAction.create({
            name: 'Legacy Action',
            targetModule: 'leads',
            actionType: 'UPDATE_ENTITY',
            invokedByTrigger: 'Legacy Inbound Hook'
        });

        const req = { user: {} };
        const res = createMockRes();

        await getAutomatedActions(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.length, 1);
        assert.equal(res.body[0].invokedByTriggerName, 'Legacy Inbound Hook');
    });

    it('5. getAuditLogs: returns empty array and correct metadata when no logs exist', async () => {
        const req = { query: {}, user: {} };
        const res = createMockRes();

        await getAuditLogs(req, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body.logs, []);
        assert.equal(res.body.total, 0);
        assert.equal(res.body.page, 1);
        assert.equal(res.body.limit, 100);
    });

    it('6. getAuditLogs: resolves actionName across Trigger, AutomatedAction, and Sequence in batch', async () => {
        const trigger = await Trigger.create({
            name: 'Site Visit Scheduled Trigger',
            module: 'leads',
            event: 'status_changed'
        });

        const action = await AutomatedAction.create({
            name: 'Send WhatsApp Confirmation',
            targetModule: 'leads',
            actionType: 'SEND_NOTIFICATION'
        });

        const sequence = await Sequence.create({
            name: 'Nurture 7-Day Buyer Flow',
            module: 'deals',
            steps: []
        });

        const entityId1 = new mongoose.Types.ObjectId();
        const entityId2 = new mongoose.Types.ObjectId();
        const entityId3 = new mongoose.Types.ObjectId();

        await AutomationLog.create([
            {
                ruleType: 'Trigger',
                ruleId: trigger._id,
                targetEntityId: entityId1,
                targetModule: 'leads',
                status: 'success',
                details: { executionTime: 42 },
                executedAt: new Date(Date.now() - 3000)
            },
            {
                ruleType: 'AutomatedAction',
                ruleId: action._id,
                targetEntityId: entityId2,
                targetModule: 'leads',
                status: 'success',
                details: { executionTime: 88 },
                executedAt: new Date(Date.now() - 2000)
            },
            {
                ruleType: 'Sequence',
                ruleId: sequence._id,
                targetEntityId: entityId3,
                targetModule: 'deals',
                status: 'failed',
                details: { error: 'Recipient phone missing', executionTime: 12 },
                executedAt: new Date(Date.now() - 1000)
            }
        ]);

        const req = { query: { page: 1, limit: 10 }, user: {} };
        const res = createMockRes();

        await getAuditLogs(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.total, 3);
        assert.equal(res.body.logs.length, 3);

        // Sorted executedAt: -1 (newest first)
        const [logSeq, logAction, logTrigger] = res.body.logs;

        assert.equal(logSeq.actionName, 'Nurture 7-Day Buyer Flow');
        assert.equal(logSeq.ruleType, 'Sequence');
        assert.equal(logSeq.status, 'failed');
        assert.equal(logSeq.success, false);
        assert.equal(logSeq.executionTime, 12);

        assert.equal(logAction.actionName, 'Send WhatsApp Confirmation');
        assert.equal(logAction.ruleType, 'AutomatedAction');
        assert.equal(logAction.status, 'success');
        assert.equal(logAction.success, true);
        assert.equal(logAction.executionTime, 88);

        assert.equal(logTrigger.actionName, 'Site Visit Scheduled Trigger');
        assert.equal(logTrigger.ruleType, 'Trigger');
        assert.equal(logTrigger.status, 'success');
        assert.equal(logTrigger.success, true);
        assert.equal(logTrigger.executionTime, 42);
    });

    it('7. getAuditLogs: enforces company/tenant isolation', async () => {
        const tenantA = new mongoose.Types.ObjectId();
        const tenantB = new mongoose.Types.ObjectId();
        const dummyEntity = new mongoose.Types.ObjectId();

        await AutomationLog.create([
            {
                ruleType: 'Trigger',
                ruleId: new mongoose.Types.ObjectId(),
                targetEntityId: dummyEntity,
                targetModule: 'leads',
                companyId: tenantA,
                status: 'success'
            },
            {
                ruleType: 'Trigger',
                ruleId: new mongoose.Types.ObjectId(),
                targetEntityId: dummyEntity,
                targetModule: 'leads',
                companyId: tenantB,
                status: 'success'
            }
        ]);

        const reqA = { query: {}, user: { companyId: tenantA } };
        const resA = createMockRes();
        await getAuditLogs(reqA, resA);

        assert.equal(resA.statusCode, 200);
        assert.equal(resA.body.total, 1);
        assert.equal(resA.body.logs.length, 1);

        const reqB = { query: {}, user: { companyId: tenantB } };
        const resB = createMockRes();
        await getAuditLogs(reqB, resB);

        assert.equal(resB.statusCode, 200);
        assert.equal(resB.body.total, 1);
        assert.equal(resB.body.logs.length, 1);
    });

    it('8. getAuditLogs: caps limit to 500 max and respects pagination', async () => {
        const req = { query: { limit: 1000, page: 2 }, user: {} };
        const res = createMockRes();

        await getAuditLogs(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.limit, 500);
        assert.equal(res.body.page, 2);
    });
});
