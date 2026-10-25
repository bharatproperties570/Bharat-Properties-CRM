import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { processDomainEvent } from '../src/workers/domainEventWorker.js';
import { WorkflowEngine } from '../src/utils/WorkflowEngine.js';
import AutomationLog from '../models/AutomationLog.js';
import Trigger from '../models/Trigger.js';
import mongoose from 'mongoose';

let executeActionCalls = [];
let triggersStore = [];
let autoLogStore = new Map();

const origExecuteAction = WorkflowEngine.executeAction;
const origTriggerFind = Trigger.find;
const origAutoLogFindOne = AutomationLog.findOne;
const origAutoLogCreate = AutomationLog.create;
const origAutoLogUpdateOne = AutomationLog.updateOne;
const origAutoLogFindOneAndUpdate = AutomationLog.findOneAndUpdate;
const origMongooseModel = mongoose.model;

describe('Phase E.3-D.1 — Shadow State Regression', () => {
    beforeEach(() => {
        executeActionCalls = [];
        triggersStore = [];
        autoLogStore.clear();

        WorkflowEngine.executeAction = async () => { executeActionCalls.push(1); };
        Trigger.find = (q) => ({ sort: () => triggersStore.filter(t => t.module === q.module) });

        mongoose.model = (name) => ({
            findById: (id) => ({
                lean: async () => ({ _id: id, dealId: id, stage: 'Open', assignedTo: 'user-1' })
            })
        });

        AutomationLog.findOne = (q) => ({ lean: async () => autoLogStore.get(q.idempotencyKey) || null });
        AutomationLog.create = async (doc) => {
            if (autoLogStore.has(doc.idempotencyKey)) {
                const err = new Error('E11000 dup key'); err.code = 11000; throw err;
            }
            autoLogStore.set(doc.idempotencyKey, { ...doc });
            return doc;
        };
        AutomationLog.findOneAndUpdate = async (q, u) => {
            const doc = autoLogStore.get(q.idempotencyKey);
            if (!doc) return null;
            if (doc.status !== q.status) return null;
            const updated = { ...doc, ...u.$set };
            autoLogStore.set(q.idempotencyKey, updated);
            return updated;
        };
        AutomationLog.updateOne = async (q, u) => {
            const doc = autoLogStore.get(q.idempotencyKey);
            if (!doc) return { modifiedCount: 0 };
            Object.assign(doc, u.$set);
            autoLogStore.set(q.idempotencyKey, doc);
            return { modifiedCount: 1 };
        };
    });

    afterEach(() => {
        WorkflowEngine.executeAction = origExecuteAction;
        Trigger.find = origTriggerFind;
        AutomationLog.findOne = origAutoLogFindOne;
        AutomationLog.create = origAutoLogCreate;
        AutomationLog.updateOne = origAutoLogUpdateOne;
        AutomationLog.findOneAndUpdate = origAutoLogFindOneAndUpdate;
        mongoose.model = origMongooseModel;
    });

    const createJob = (id) => ({ id, data: { eventId: id, eventType: 'DealCreated', entityType: 'deal', entityId: "1", payload: { dealId: "1" }, occurredAt: new Date().toISOString() } });

    it('TEST-5: Shadow does not consume real idempotency key', async () => {
        triggersStore.push({ _id: 'trg1', module: 'deals', event: 'deal_created', actions: [{ type: 'a' }] });
        await processDomainEvent(createJob('job1'));
        assert.ok(autoLogStore.has('shadow-job1-trg1-0'), 'Shadow key must exist');
        assert.equal(autoLogStore.has('outbox-job1-trg1-0'), false, 'Real key must NOT exist');
    });

    it('TEST-6: Same event can subsequently execute in a real durable execution test harness', async () => {
        triggersStore.push({ _id: 'trg1', module: 'deals', event: 'deal_created', actions: [{ type: 'a' }] });
        // 1. Shadow run
        await processDomainEvent(createJob('job1'));
        assert.equal(executeActionCalls.length, 0);

        // 2. Real run (simulating post-cutover or real execution harness)
        await processDomainEvent(createJob('job1'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        assert.equal(executeActionCalls.length, 1, 'Real run must execute');
        assert.ok(autoLogStore.has('outbox-job1-trg1-0'));
    });

    it('TEST-7: Shadow idempotency cannot block real idempotency', async () => {
        triggersStore.push({ _id: 'trg1', module: 'deals', event: 'deal_created', actions: [{ type: 'a' }] });
        // Force a failed/pending shadow key to prove it doesn't block outbox
        autoLogStore.set('shadow-job2-trg1-0', { idempotencyKey: 'shadow-job2-trg1-0', status: 'pending' });

        await processDomainEvent(createJob('job2'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        assert.equal(executeActionCalls.length, 1);
        assert.ok(autoLogStore.has('outbox-job2-trg1-0'));
    });
});
