import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { processDomainEvent } from '../src/workers/domainEventWorker.js';
import { WorkflowEngine } from '../src/utils/WorkflowEngine.js';
import AutomationLog from '../models/AutomationLog.js';
import Trigger from '../models/Trigger.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

// ── In-Memory Test Stores & Spies ──────────────────────────────
let executeActionCalls = [];
let triggersStore = [];
let autoLogStore = new Map();
let mockEntities = new Map();
let findByIdCalls = [];

const origExecuteAction = WorkflowEngine.executeAction;
const origTriggerFind = Trigger.find;
const origAutoLogFindOne = AutomationLog.findOne;
const origAutoLogCreate = AutomationLog.create;
const origAutoLogUpdateOne = AutomationLog.updateOne;
const origAutoLogFindOneAndUpdate = AutomationLog.findOneAndUpdate;
const origMongooseModel = mongoose.model;

describe('Phase E.3-D.5-A-I — Hydration Implementation & Regression Suite', () => {
    beforeEach(() => {
        executeActionCalls = [];
        triggersStore = [];
        autoLogStore.clear();
        mockEntities.clear();
        findByIdCalls = [];

        WorkflowEngine.executeAction = async (action, entityData, trigger, companyId) => {
            executeActionCalls.push({ action, entityData, trigger, companyId });
        };

        Trigger.find = (q) => ({
            sort: () => triggersStore.filter(t => t.module === q.module && t.event === q.event && t.isActive !== false)
        });

        AutomationLog.findOne = (q) => ({
            lean: async () => autoLogStore.get(q.idempotencyKey) || null
        });

        AutomationLog.create = async (doc) => {
            if (autoLogStore.has(doc.idempotencyKey)) {
                const err = new Error('E11000 duplicate key error');
                err.code = 11000;
                throw err;
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
            if (q.claimToken && doc.claimToken !== q.claimToken) {
                return { modifiedCount: 0 };
            }
            Object.assign(doc, u.$set);
            autoLogStore.set(q.idempotencyKey, doc);
            return { modifiedCount: 1 };
        };

        mongoose.model = (name) => ({
            findById: (id) => {
                findByIdCalls.push({ modelName: name, id });
                return {
                    lean: async () => mockEntities.get(`${name}:${id}`) || null
                };
            }
        });
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

    const createJob = (id, eventType, entityType, entityId, payload) => ({
        id,
        data: {
            eventId: id,
            eventType,
            entityType,
            entityId,
            occurredAt: new Date().toISOString(),
            payload: payload || { dealId: 'D-101', stage: 'Open' }
        }
    });

    // ── Test 1: Hydrated entity exposes canonical _id ──────────
    it('HYD-1: Hydrated entity exposes canonical _id to executeAction', async () => {
        triggersStore.push({
            _id: 'trg-hyd-1', module: 'deals', event: 'deal_created', isActive: true,
            actions: [{ type: 'send_communication' }]
        });
        mockEntities.set('Deal:650000000000000000000001', {
            _id: '650000000000000000000001',
            dealId: 'D-101',
            stage: 'Open',
            assignedTo: 'user-77',
            projectName: 'Grand Heritage'
        });

        const job = createJob('job-h1', 'DealCreated', 'Deal', '650000000000000000000001');
        const res = await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(res.status, 'EXECUTION_COMPLETE');
        assert.equal(executeActionCalls.length, 1);
        const passedEntity = executeActionCalls[0].entityData;
        assert.equal(passedEntity._id, '650000000000000000000001', 'Must receive canonical _id');
        assert.equal(passedEntity.dealId, 'D-101');
    });

    // ── Test 2: assignedTo and action-required fields available ─
    it('HYD-2: assignedTo and relational fields are preserved on hydrated entity', async () => {
        triggersStore.push({
            _id: 'trg-hyd-2', module: 'deals', event: 'deal_created', isActive: true,
            actions: [{ type: 'send_notification' }]
        });
        mockEntities.set('Deal:deal-888', {
            _id: 'deal-888',
            assignedTo: 'user-sales-42',
            owner: 'contact-999',
            projectName: 'Tower A',
            unitNo: '102'
        });

        const job = createJob('job-h2', 'DealCreated', 'Deal', 'deal-888');
        await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(executeActionCalls.length, 1);
        const entity = executeActionCalls[0].entityData;
        assert.equal(entity.assignedTo, 'user-sales-42');
        assert.equal(entity.owner, 'contact-999');
        assert.equal(entity.projectName, 'Tower A');
        assert.equal(entity.unitNo, '102');
    });

    // ── Test 3: Trigger conditions evaluate on event-time payload ─
    it('HYD-3: Trigger conditions strictly evaluate against event-time payload (semantic isolation)', async () => {
        // Trigger requires stage == 'Open' (creation state)
        triggersStore.push({
            _id: 'trg-hyd-3', module: 'deals', event: 'deal_created', isActive: true,
            conditions: { field: 'stage', operator: '==', value: 'Open' },
            actions: [{ type: 'send_communication' }]
        });

        // Current entity in DB has already advanced to 'Negotiation'
        mockEntities.set('Deal:deal-drift', {
            _id: 'deal-drift',
            stage: 'Negotiation', // DB state changed!
            price: 7500000
        });

        // Payload has stage: 'Open' (state at creation time)
        const job = createJob('job-h3', 'DealCreated', 'Deal', 'deal-drift', {
            dealId: 'D-DRIFT',
            stage: 'Open' // Initial snapshot
        });

        await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        // Trigger should match because conditions evaluate payload (Open),
        // but action receives hydrated entity (Negotiation context)
        assert.equal(executeActionCalls.length, 1, 'Trigger must fire based on event-time payload');
        assert.equal(executeActionCalls[0].entityData.stage, 'Negotiation', 'Action receives current hydrated entity');
    });

    // ── Test 4: Shadow mode skips hydration & action execution ──
    it('HYD-4: Shadow mode performs zero hydration and zero executeAction calls', async () => {
        triggersStore.push({
            _id: 'trg-hyd-4', module: 'deals', event: 'deal_created', isActive: true,
            actions: [{ type: 'send_communication' }]
        });
        mockEntities.set('Deal:deal-shadow', {
            _id: 'deal-shadow',
            stage: 'Open'
        });

        const job = createJob('job-h4', 'DealCreated', 'Deal', 'deal-shadow');
        // No test override = Production Shadow Mode
        const res = await processDomainEvent(job);

        assert.equal(res.status, 'SHADOW_COMPLETE');
        assert.equal(executeActionCalls.length, 0, 'executeAction must not be called in shadow');
        assert.equal(findByIdCalls.length, 0, 'findById must NOT be called in shadow mode');
        assert.equal(res.executionResults[0].decision, 'SHADOW_SUPPRESSED');
    });

    // ── Test 5: Unknown entity type is safely rejected ─────────
    it('HYD-5: Unknown entityType is rejected without throwing unhandled exceptions', async () => {
        triggersStore.push({
            _id: 'trg-hyd-5', module: 'deals', event: 'deal_created', isActive: true,
            actions: [{ type: 'send_communication' }]
        });

        const job = createJob('job-h5', 'DealCreated', 'MaliciousModel', 'id-bad');
        const res = await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(res.status, 'REJECTED');
        assert.ok(res.reason.includes('Unknown entityType for hydration'));
        assert.equal(executeActionCalls.length, 0);
    });

    // ── Test 6: Deleted entity handling marks claim failed ──────
    it('HYD-6: Deleted entity (missing in DB) marks claim failed and does not throw poison retry', async () => {
        triggersStore.push({
            _id: 'trg-hyd-6', module: 'deals', event: 'deal_created', isActive: true,
            actions: [{ type: 'send_communication' }]
        });
        // mockEntities does NOT have Deal:deleted-deal (simulate deleted)

        const job = createJob('job-h6', 'DealCreated', 'Deal', 'deleted-deal');
        const res = await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(executeActionCalls.length, 0);
        assert.equal(res.executionResults[0].decision, 'HYDRATION_FAILED');
        assert.equal(res.executionResults[0].status, 'failed');

        const log = autoLogStore.get('outbox-job-h6-trg-hyd-6-0');
        assert.equal(log.status, 'failed');
        assert.ok(log.details.error.includes('Entity not found at hydration time'));
    });

    // ── Test 7: Transient DB failure propagates for BullMQ retry ─
    it('HYD-7: Transient database failure during findById propagates for BullMQ retry', async () => {
        triggersStore.push({
            _id: 'trg-hyd-7', module: 'deals', event: 'deal_created', isActive: true,
            actions: [{ type: 'send_communication' }]
        });

        mongoose.model = (name) => ({
            findById: () => {
                throw new Error('MongoNetworkTimeoutException: connection timed out');
            }
        });

        const job = createJob('job-h7', 'DealCreated', 'Deal', 'deal-transient');

        await assert.rejects(
            processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true }),
            /MongoNetworkTimeoutException/
        );
        assert.equal(executeActionCalls.length, 0);
    });

    // ── Test 8: .lean() object structure compatibility ──────────
    it('HYD-8: .lean() plain JavaScript object is compatible with executeAction', async () => {
        triggersStore.push({
            _id: 'trg-hyd-8', module: 'deals', event: 'deal_created', isActive: true,
            actions: [{ type: 'update_field', field: 'isHydrated', value: true }]
        });

        const plainObject = {
            _id: 'deal-plain-1',
            dealId: 'D-PLAIN',
            stage: 'Open',
            location: 'Sector 57, Gurgaon',
            budget: '1.25 Cr.'
        };
        mockEntities.set('Deal:deal-plain-1', plainObject);

        const job = createJob('job-h8', 'DealCreated', 'Deal', 'deal-plain-1');
        await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(executeActionCalls.length, 1);
        const received = executeActionCalls[0].entityData;
        assert.equal(typeof received, 'object');
        assert.equal(received.constructor.name, 'Object', 'Must be a plain Object (.lean)');
        assert.equal(received._id, 'deal-plain-1');
    });

    // ── Test 9: Durable and Shadow idempotency namespaces remain isolated ─
    it('HYD-9: Durable idempotency keys and shadow namespace remain isolated', async () => {
        triggersStore.push({
            _id: 'trg-hyd-9', module: 'deals', event: 'deal_created', isActive: true,
            actions: [{ type: 'send_communication' }]
        });
        mockEntities.set('Deal:deal-ns', { _id: 'deal-ns', stage: 'Open' });

        // 1. Shadow run
        const job = createJob('job-ns', 'DealCreated', 'Deal', 'deal-ns');
        await processDomainEvent(job);
        assert.ok(autoLogStore.has('shadow-job-ns-trg-hyd-9-0'), 'Shadow key format verified');
        assert.equal(autoLogStore.has('outbox-job-ns-trg-hyd-9-0'), false);

        // 2. Real test run
        await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        assert.ok(autoLogStore.has('outbox-job-ns-trg-hyd-9-0'), 'Outbox key format verified');
    });

    // ── Test 10: Invariants Check ──────────────────────────────
    it('HYD-10: Legacy fireEvent caller in deal.controller.js remains active and untouched', () => {
        const getBackendPath = (rel) => (process.cwd().endsWith('/backend') ? path.join(process.cwd(), rel) : path.join(process.cwd(), 'backend', rel));
        const dealControllerPath = getBackendPath('controllers/deal.controller.js');
        const dealControllerStr = fs.readFileSync(dealControllerPath, 'utf8');

        assert.ok(
            dealControllerStr.includes("WorkflowEngine.fireEvent('deals', 'deal_created', deal, deal.companyId);"),
            'Legacy fireEvent call in deal.controller.js must NOT be removed in this gate'
        );
    });
});
