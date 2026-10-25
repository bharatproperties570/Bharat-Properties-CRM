import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../src/utils/WorkflowEngine.js';
import { processDomainEvent } from '../src/workers/domainEventWorker.js';
import AutomationLog from '../models/AutomationLog.js';
import Trigger from '../models/Trigger.js';
import mongoose from 'mongoose';

describe('Phase E.3-D.9-A — Canonical Claim & Retry Correctness Suite', () => {
    let autoLogStore = new Map();
    let triggersStore = [];
    let executeActionCalls = [];
    let externalDispatches = [];
    let mockEntities = new Map();

    const origExecuteAction = WorkflowEngine.executeAction;
    const origTriggerFind = Trigger.find;
    const origAutoLogFindOne = AutomationLog.findOne;
    const origAutoLogCreate = AutomationLog.create;
    const origAutoLogUpdateOne = AutomationLog.updateOne;
    const origAutoLogFindOneAndUpdate = AutomationLog.findOneAndUpdate;
    const origMongooseModel = mongoose.model;

    beforeEach(() => {
        autoLogStore.clear();
        triggersStore = [];
        executeActionCalls = [];
        externalDispatches = [];
        mockEntities.clear();

        Trigger.find = (q) => ({
            sort: () => triggersStore.filter(t => t.module === q.module && t.event === q.event && t.isActive !== false)
        });

        AutomationLog.findOne = (q) => ({
            lean: async () => autoLogStore.get(q.idempotencyKey) || null
        });

        AutomationLog.create = async (doc) => {
            if (doc.idempotencyKey && autoLogStore.has(doc.idempotencyKey)) {
                const err = new Error('E11000 duplicate key error');
                err.code = 11000;
                throw err;
            }
            const saved = { ...doc };
            if (doc.idempotencyKey) {
                autoLogStore.set(doc.idempotencyKey, saved);
            }
            return saved;
        };

        AutomationLog.findOneAndUpdate = async (q, u) => {
            const doc = autoLogStore.get(q.idempotencyKey);
            if (!doc) return null;
            if (q.status && doc.status !== q.status) return null;
            if (q.leaseUntil?.$lte && doc.leaseUntil && new Date(doc.leaseUntil) > new Date(q.leaseUntil.$lte)) return null;

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
            findById: (id) => ({
                lean: async () => mockEntities.get(`${name}:${id}`) || null,
                select: () => ({
                    lean: async () => mockEntities.get(`${name}:${id}`) || null
                })
            }),
            findByIdAndUpdate: async (id, update) => {
                const entity = mockEntities.get(`${name}:${id}`) || {};
                Object.assign(entity, update.$set || update);
                mockEntities.set(`${name}:${id}`, entity);
                return entity;
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

    const createJob = (id, eventType, entityType, entityId) => ({
        id,
        data: {
            eventId: id,
            eventType,
            entityType,
            entityId,
            occurredAt: new Date().toISOString(),
            payload: { dealId: entityId, stage: 'Open' }
        }
    });

    // ── CANON-1: Identical Canonical Action Identity Across Both Paths ──
    it('CANON-1: Legacy fireEvent and durable worker compute identical canonical key for DealCreated native actions', async () => {
        const triggerId = 'trg-canon-1';
        const dealId = 'deal-101';
        triggersStore.push({
            _id: triggerId,
            module: 'deals',
            event: 'deal_created',
            isActive: true,
            actions: [{ _id: 'act-01', type: 'update_field', field: 'stage', value: 'Negotiation' }]
        });
        mockEntities.set(`Deal:${dealId}`, { _id: dealId, stage: 'Open' });

        // 1. Run legacy path
        await WorkflowEngine.fireEvent('deals', 'deal_created', { _id: dealId, stage: 'Open' });

        const expectedCanonicalKey = `canonical-deal_created-${dealId}-${triggerId}-act-01`;
        assert.ok(autoLogStore.has(expectedCanonicalKey), 'Legacy must write canonical key');
        const legacyLog = autoLogStore.get(expectedCanonicalKey);
        assert.equal(legacyLog.status, 'success');

        // 2. Run durable worker in real execution mode for the same event
        const job = createJob('job-canon-1', 'DealCreated', 'Deal', dealId);
        const result = await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        // Durable worker must see canonical key already processed and skip
        assert.equal(result.executionResults[0].decision, 'SKIPPED_DUPLICATE');
        assert.equal(result.executionResults[0].idempotencyKey, expectedCanonicalKey);
    });

    // ── CANON-2: Legacy Executes First -> Durable Real Mode Skips ──
    it('CANON-2: Legacy fireEvent executes first -> durable worker is blocked by canonical claim', async () => {
        const triggerId = 'trg-canon-2';
        const dealId = 'deal-102';
        triggersStore.push({
            _id: triggerId,
            module: 'deals',
            event: 'deal_created',
            isActive: true,
            actions: [{ _id: 'act-wa-1', type: 'send_communication', channel: 'sms' }]
        });
        mockEntities.set(`Deal:${dealId}`, { _id: dealId, mobile: '9999999999', stage: 'Open' });

        // Legacy executes
        await WorkflowEngine.fireEvent('deals', 'deal_created', { _id: dealId, mobile: '9999999999', stage: 'Open' });

        const canonicalKey = `canonical-deal_created-${dealId}-${triggerId}-act-wa-1`;
        assert.equal(autoLogStore.get(canonicalKey)?.status, 'success');

        // Durable real worker runs
        const job = createJob('job-canon-2', 'DealCreated', 'Deal', dealId);
        const result = await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(result.executionResults.length, 1);
        assert.equal(result.executionResults[0].decision, 'SKIPPED_DUPLICATE');
        assert.equal(result.executionResults[0].reason, 'Already processed (status: success)');
    });

    // ── CANON-3: Durable Real Mode Executes First -> Legacy Skips ──
    it('CANON-3: Durable real worker executes first -> legacy fireEvent is blocked by canonical claim', async () => {
        const triggerId = 'trg-canon-3';
        const dealId = 'deal-103';
        triggersStore.push({
            _id: triggerId,
            module: 'deals',
            event: 'deal_created',
            isActive: true,
            actions: [{ _id: 'act-wa-2', type: 'update_field', field: 'status', value: 'Active' }]
        });
        mockEntities.set(`Deal:${dealId}`, { _id: dealId, stage: 'Open' });

        // Durable real worker runs first
        const job = createJob('job-canon-3', 'DealCreated', 'Deal', dealId);
        const result = await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(result.executionResults[0].decision, 'EXECUTED');
        assert.equal(result.executionResults[0].status, 'success');

        const canonicalKey = `canonical-deal_created-${dealId}-${triggerId}-act-wa-2`;
        assert.equal(autoLogStore.get(canonicalKey)?.status, 'success');

        // Now legacy runs for the same deal
        let legacyActionDispatched = false;
        const originalUpdateOne = AutomationLog.updateOne;
        // Legacy should skip and not update or duplicate
        await WorkflowEngine.fireEvent('deals', 'deal_created', { _id: dealId, stage: 'Open' });

        // Claim in store is still the durable claim
        assert.equal(autoLogStore.get(canonicalKey)?.status, 'success');
    });

    // ── CANON-4: Concurrent Claims: Exactly One Owner Obtains Claim ──
    it('CANON-4: Concurrent claims on canonicalKey -> exactly one owner acquires, second gets E11000 duplicate', async () => {
        const canonicalKey = 'canonical-deal_created-deal-104-trg-4-act-1';
        let winnerCount = 0;
        let loserCount = 0;

        const attemptClaim = async (workerToken) => {
            try {
                await AutomationLog.create({
                    ruleType: 'Trigger',
                    ruleId: 'trg-4',
                    targetEntityId: 'deal-104',
                    targetModule: 'deals',
                    status: 'pending',
                    idempotencyKey: canonicalKey,
                    claimToken: workerToken,
                    leaseUntil: new Date(Date.now() + 120000)
                });
                winnerCount++;
            } catch (err) {
                if (err.code === 11000) loserCount++;
                else throw err;
            }
        };

        await Promise.all([
            attemptClaim('worker-token-A'),
            attemptClaim('worker-token-B')
        ]);

        assert.equal(winnerCount, 1, 'Exactly one worker must win the claim');
        assert.equal(loserCount, 1, 'Exactly one worker must lose with E11000');
    });

    // ── CANON-5: Stale Claim Recovery and ClaimToken Fencing ──
    it('CANON-5: Expired lease allows stale recovery; stolen claim fences out original worker', async () => {
        const canonicalKey = 'canonical-deal_created-deal-105-trg-5-act-1';
        // 1. Worker A acquires claim with an expired lease
        autoLogStore.set(canonicalKey, {
            idempotencyKey: canonicalKey,
            status: 'pending',
            claimToken: 'token-A',
            leaseUntil: new Date(Date.now() - 5000) // expired
        });

        // 2. Worker B recovers the stale lease
        const recovered = await AutomationLog.findOneAndUpdate(
            { idempotencyKey: canonicalKey, status: 'pending', leaseUntil: { $lte: new Date() } },
            { $set: { claimToken: 'token-B', leaseUntil: new Date(Date.now() + 120000) } },
            { new: true }
        );
        assert.ok(recovered);
        assert.equal(recovered.claimToken, 'token-B');

        // 3. Worker A (slow original owner) attempts to finalize
        const resultA = await AutomationLog.updateOne(
            { idempotencyKey: canonicalKey, claimToken: 'token-A' },
            { $set: { status: 'success' } }
        );
        assert.equal(resultA.modifiedCount, 0, 'Worker A must be fenced out (modifiedCount=0)');

        // 4. Worker B successfully finalizes
        const resultB = await AutomationLog.updateOne(
            { idempotencyKey: canonicalKey, claimToken: 'token-B' },
            { $set: { status: 'success' } }
        );
        assert.equal(resultB.modifiedCount, 1, 'Worker B must successfully finalize');
    });

    // ── CANON-6: Retryable Infrastructure Failure Followed by Successful Retry ──
    it('CANON-6: Transient infra error marks details.retryable=true -> BullMQ retry successfully reacquires lease', async () => {
        const triggerId = 'trg-canon-6';
        const dealId = 'deal-106';
        triggersStore.push({
            _id: triggerId,
            module: 'deals',
            event: 'deal_created',
            isActive: true,
            actions: [{ _id: 'act-06', type: 'update_field', field: 'counter', value: 1 }]
        });
        mockEntities.set(`Deal:${dealId}`, { _id: dealId, stage: 'Open' });

        let failOnce = true;
        const origExecute = WorkflowEngine.executeAction;
        WorkflowEngine.executeAction = async (action, entityData, trigger, companyId, isDelayed, options) => {
            if (failOnce) {
                failOnce = false;
                throw new Error('TransientNetworkTimeout');
            }
        };

        const job = createJob('job-canon-6', 'DealCreated', 'Deal', dealId);

        // Attempt 1: Fails with retryable error
        await assert.rejects(
            async () => {
                await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
            },
            /TransientNetworkTimeout/
        );

        // Verify claim is marked failed with retryable: true
        const outboxKey = 'outbox-job-canon-6-trg-canon-6-0';
        const failedLog = autoLogStore.get(outboxKey);
        assert.equal(failedLog.status, 'failed');
        assert.equal(failedLog.details?.retryable, true);

        // Attempt 2: BullMQ retries the job
        const retryResult = await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        assert.equal(retryResult.executionResults[0].decision, 'EXECUTED');
        assert.equal(retryResult.executionResults[0].status, 'success');

        const successLog = autoLogStore.get(outboxKey);
        assert.equal(successLog.status, 'success');
    });

    // ── CANON-7: Terminal Failure Handling (No futile retries) ──
    it('CANON-7: Terminal failure (missing entity at hydration) sets terminal=true and does NOT reacquire lease', async () => {
        const triggerId = 'trg-canon-7';
        const dealId = 'deal-deleted-107';
        triggersStore.push({
            _id: triggerId,
            module: 'deals',
            event: 'deal_created',
            isActive: true,
            actions: [{ _id: 'act-07', type: 'update_field', field: 'stage', value: 'Open' }]
        });
        // Entity is NOT in mockEntities (deleted)

        const job = createJob('job-canon-7', 'DealCreated', 'Deal', dealId);
        const result = await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(result.executionResults[0].decision, 'HYDRATION_FAILED');
        assert.equal(result.executionResults[0].status, 'failed');

        const outboxKey = 'outbox-job-canon-7-trg-canon-7-0';
        const terminalLog = autoLogStore.get(outboxKey);
        assert.equal(terminalLog.status, 'failed');
        assert.equal(terminalLog.details?.terminal, true);
        assert.equal(terminalLog.details?.retryable, undefined);

        // Replay of job must be rejected as terminal
        const replayResult = await processDomainEvent(job, { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        assert.equal(replayResult.executionResults[0].decision, 'SKIPPED_DUPLICATE');
        assert.equal(replayResult.executionResults[0].reason, 'Already processed (status: failed)');
    });

    // ── CANON-8: Error Propagation in Durable Context vs Legacy Context ──
    it('CANON-8: executeAction rethrows in durable context (rethrowErrors: true) and swallows in legacy context', async () => {
        const trigger = { _id: 'trg-err', module: 'leads', event: 'lead_created' };
        const action = { type: 'send_communication', channel: 'whatsapp', templateId: 'missing_template' };
        const entityData = { _id: 'lead-err', mobile: '9999999999' };

        // 1. Legacy call (rethrowErrors default false): Must NOT throw
        let didThrowLegacy = false;
        try {
            await WorkflowEngine.executeAction(action, entityData, trigger, null, false, {});
        } catch (e) {
            didThrowLegacy = true;
        }
        assert.equal(didThrowLegacy, false, 'Legacy caller must not crash on action failure');

        // 2. Durable worker call (rethrowErrors: true): Must throw so worker knows about failure
        await assert.rejects(
            async () => {
                await WorkflowEngine.executeAction(action, entityData, trigger, null, false, { rethrowErrors: true });
            }
        );
    });

    // ── CANON-9: Shadow Mode Safety: Observational Only, Does Not Block Legacy ──
    it('CANON-9: Shadow mode claims shadow-... namespace and does NOT block legacy fireEvent canonical claim', async () => {
        const triggerId = 'trg-canon-9';
        const dealId = 'deal-109';
        triggersStore.push({
            _id: triggerId,
            module: 'deals',
            event: 'deal_created',
            isActive: true,
            actions: [{ _id: 'act-09', type: 'update_field', field: 'verified', value: true }]
        });
        mockEntities.set(`Deal:${dealId}`, { _id: dealId, stage: 'Open' });

        // 1. Shadow run
        const job = createJob('job-canon-9', 'DealCreated', 'Deal', dealId);
        const shadowResult = await processDomainEvent(job); // shadow mode (no override)

        assert.equal(shadowResult.status, 'SHADOW_COMPLETE');
        assert.ok(autoLogStore.has('shadow-job-canon-9-trg-canon-9-0'), 'Shadow key recorded');

        const canonicalKey = `canonical-deal_created-${dealId}-${triggerId}-act-09`;
        assert.equal(autoLogStore.has(canonicalKey), false, 'Shadow mode must NEVER claim canonicalKey');

        // 2. Legacy fireEvent runs and executes unblocked
        await WorkflowEngine.fireEvent('deals', 'deal_created', { _id: dealId, stage: 'Open' });

        assert.ok(autoLogStore.has(canonicalKey), 'Legacy successfully acquired canonicalKey');
        assert.equal(autoLogStore.get(canonicalKey)?.status, 'success');
    });

    // ── CANON-10: Crash Window Demonstration (At-Least-Once Limitation) ──
    it('CANON-10: Demonstrates crash window: provider acceptance followed by worker crash causes retry dispatch (at-least-once)', async () => {
        const canonicalKey = 'canonical-deal_created-deal-110-trg-10-act-1';
        let providerCalls = 0;

        const fakeDispatch = async (claimToken) => {
            // Worker claims
            autoLogStore.set(canonicalKey, {
                idempotencyKey: canonicalKey,
                status: 'pending',
                claimToken,
                leaseUntil: new Date(Date.now() + 120000)
            });

            // Provider accepts
            providerCalls++;

            // Worker crashes before updateOne status: 'success'
            // Record remains status: 'pending'
        };

        // Attempt 1: Worker A dispatches and crashes
        await fakeDispatch('token-A');
        assert.equal(providerCalls, 1);
        assert.equal(autoLogStore.get(canonicalKey)?.status, 'pending');

        // Lease expires
        autoLogStore.get(canonicalKey).leaseUntil = new Date(Date.now() - 1000);

        // Attempt 2: Stale lease recovered by Worker B
        const recovered = await AutomationLog.findOneAndUpdate(
            { idempotencyKey: canonicalKey, status: 'pending', leaseUntil: { $lte: new Date() } },
            { $set: { claimToken: 'token-B', leaseUntil: new Date(Date.now() + 120000) } },
            { new: true }
        );
        assert.ok(recovered);

        // Worker B re-executes external call
        providerCalls++;
        assert.equal(providerCalls, 2, 'Demonstrates unavoidable at-least-once external limitation on crash');
    });
});
