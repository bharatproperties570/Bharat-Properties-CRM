import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import AutomationLog from '../models/AutomationLog.js';
import Trigger from '../models/Trigger.js';
import { WorkflowEngine } from '../src/utils/WorkflowEngine.js';

import { processDomainEvent, default as worker } from '../src/workers/domainEventWorker.js';

describe('Phase E.3-C.1-I — Lease Ownership Implementation', () => {
    const origCreate = AutomationLog.create;
    const origFindOne = AutomationLog.findOne;
    const origFindOneAndUpdate = AutomationLog.findOneAndUpdate;
    const origUpdateOne = AutomationLog.updateOne;
    const origTriggerFind = Trigger.find;
    const origExecuteAction = WorkflowEngine.executeAction;
    const origEvaluateRules = WorkflowEngine.evaluateRules;
    const origMongooseModel = mongoose.model;

    let autoLogStore = new Map();
    let triggersStore = [];
    let executeActionCalls = [];
    let updateOneCalls = [];

    beforeEach(() => {
        autoLogStore.clear();
        triggersStore = [];
        executeActionCalls = [];
        updateOneCalls = [];

        AutomationLog.create = async (doc) => {
            const key = doc.idempotencyKey;

            // Synchronous map check simulates atomic MongoDB uniqueness
            if (autoLogStore.has(key)) {
                const err = new Error('E11000 duplicate key');
                err.code = 11000;
                throw err;
            }

            const savedDoc = { ...doc };
            autoLogStore.set(key, savedDoc);

            // Introduce slight async delay to allow concurrent racers to hit the E11000 block
            await new Promise(r => setTimeout(r, 10));
            return savedDoc;
        };

        AutomationLog.findOne = (query) => {
            return {
                lean: async () => {
                    await new Promise(r => setTimeout(r, 5));
                    return autoLogStore.get(query.idempotencyKey) || null;
                }
            };
        };

        AutomationLog.findOneAndUpdate = async (query, update, options) => {
            await new Promise(r => setTimeout(r, 5));
            const existing = autoLogStore.get(query.idempotencyKey);
            if (!existing) return null;

            // Match criteria
            if (query.status && existing.status !== query.status) return null;
            if (query.leaseUntil && query.leaseUntil.$lte) {
                if (existing.leaseUntil > query.leaseUntil.$lte) return null;
            }

            // Apply update
            const updated = { ...existing };
            if (update.$set) {
                Object.assign(updated, update.$set);
            }

            // Atomic save in mock
            autoLogStore.set(query.idempotencyKey, updated);
            return updated;
        };

        AutomationLog.updateOne = async (query, update) => {
            await new Promise(r => setTimeout(r, 5));
            updateOneCalls.push({ query, update });
            const existing = autoLogStore.get(query.idempotencyKey);
            if (!existing) return { modifiedCount: 0 };

            if (query.claimToken && existing.claimToken !== query.claimToken) {
                return { modifiedCount: 0 }; // Fencing
            }

            const updated = { ...existing };
            if (update.$set) {
                Object.assign(updated, update.$set);
            }
            autoLogStore.set(query.idempotencyKey, updated);
            return { modifiedCount: 1 };
        };

        Trigger.find = () => ({
            sort: () => triggersStore
        });

        WorkflowEngine.evaluateRules = () => true;

        WorkflowEngine.executeAction = async (action, payload, trigger, companyId) => {
            executeActionCalls.push({ action, payload, trigger });
            // Simulate network delay for execution
            await new Promise(r => setTimeout(r, 20));
        };

        mongoose.model = (name) => ({
            findById: (id) => ({
                lean: async () => ({ _id: id, id, name: `Mock ${name}`, stage: 'Open' }),
                select: () => ({
                    lean: async () => ({ _id: id, id, name: `Mock ${name}`, stage: 'Open' })
                })
            }),
            findByIdAndUpdate: async (id, update) => ({ _id: id, id, ...(update.$set || update) })
        });
    });

    afterEach(async () => {
        AutomationLog.create = origCreate;
        AutomationLog.findOne = origFindOne;
        AutomationLog.findOneAndUpdate = origFindOneAndUpdate;
        AutomationLog.updateOne = origUpdateOne;
        Trigger.find = origTriggerFind;
        WorkflowEngine.executeAction = origExecuteAction;
        WorkflowEngine.evaluateRules = origEvaluateRules;
        mongoose.model = origMongooseModel;
        await worker.close();
    });

    const createJob = (id, eventId = 'evt-123') => ({
        id,
        data: {
            eventId,
            eventType: 'DealCreated',
            entityType: 'deal',
            entityId: 'deal-1',
            occurredAt: new Date().toISOString(),
            payload: { dealId: 'deal-1', amount: 5000 }
        }
    });

    it('Test 1: First worker claims successfully', async () => {
        triggersStore.push({
            _id: 'trg-1',
            name: 'Test Trigger',
            module: 'deals',
            event: 'deal_created',
            actions: [{ type: 'send_communication' }]
        });

        const result = await processDomainEvent(createJob('job-1'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(result.status, 'EXECUTION_COMPLETE');
        assert.equal(executeActionCalls.length, 1);

        const key = 'outbox-evt-123-trg-1-0';
        const logEntry = autoLogStore.get(key);
        assert.ok(logEntry);
        assert.equal(logEntry.status, 'success');
        assert.ok(logEntry.claimToken);
        assert.ok(logEntry.leaseUntil);

        // Lease should be ~120s in the future
        const timeDiff = logEntry.leaseUntil.getTime() - Date.now();
        assert.ok(timeDiff > 115000 && timeDiff <= 120000);
    });

    it('Test 2 & 3: Concurrent workers - exactly one executes', async () => {
        triggersStore.push({
            _id: 'trg-1',
            name: 'Test Trigger',
            module: 'deals',
            event: 'deal_created',
            actions: [{ type: 'send_communication' }]
        });

        // Run concurrently
        const [res1, res2] = await Promise.allSettled([
            processDomainEvent(createJob('job-A', 'evt-concurrent'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true }),
            processDomainEvent(createJob('job-B', 'evt-concurrent'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true })
        ]);

        // One should succeed, one should reject with Active lease error
        const results = [res1, res2];
        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        assert.equal(fulfilled.length, 1, 'Exactly one worker should succeed');
        assert.equal(rejected.length, 1, 'Exactly one worker should reject');
        assert.match(rejected[0].reason.message, /Active lease held/);

        // executeAction called exactly once
        assert.equal(executeActionCalls.length, 1);
    });

    it('Test 4 & 5: Expired lease reacquisition + concurrent stale acquisition race', async () => {
        triggersStore.push({
            _id: 'trg-1',
            actions: [{ type: 'send_communication' }]
        });

        const key = 'outbox-evt-stale-trg-1-0';
        autoLogStore.set(key, {
            status: 'pending',
            idempotencyKey: key,
            claimToken: 'OLD-TOKEN',
            leaseUntil: new Date(Date.now() - 10000) // 10 seconds expired
        });

        // Run concurrently
        const [res1, res2] = await Promise.allSettled([
            processDomainEvent(createJob('job-C', 'evt-stale'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true }),
            processDomainEvent(createJob('job-D', 'evt-stale'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true })
        ]);

        const fulfilled = [res1, res2].filter(r => r.status === 'fulfilled');
        const rejected = [res1, res2].filter(r => r.status === 'rejected');

        assert.equal(fulfilled.length, 1, 'Exactly one worker acquires the stale lease');
        assert.equal(rejected.length, 1, 'Exactly one worker loses the stale lease race');
        assert.match(rejected[0].reason.message, /Lost stale lease acquisition/);

        assert.equal(executeActionCalls.length, 1);

        const logEntry = autoLogStore.get(key);
        assert.notEqual(logEntry.claimToken, 'OLD-TOKEN');
        assert.equal(logEntry.status, 'success');
    });

    it('Test 6 & 7: Old owner cannot finalize after ownership transfer (Fencing)', async () => {
        triggersStore.push({
            _id: 'trg-1',
            actions: [{ type: 'send_communication' }]
        });

        const key = 'outbox-evt-fence-trg-1-0';

        // 1. Worker A claims it and starts executing (mock executeAction blocks for 100ms)
        let blocked = true;
        let workerAEntered = false;
        WorkflowEngine.executeAction = async () => {
            workerAEntered = true;
            while (blocked) {
                await new Promise(r => setTimeout(r, 10));
            }
        };

        const workerAPromise = processDomainEvent(createJob('job-A', 'evt-fence'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        // wait for Worker A to reach execution (claims acquired)
        while (!workerAEntered) {
            await new Promise(r => setTimeout(r, 5));
        }

        // 2. Lease expires
        const entry = autoLogStore.get(key);
        assert.ok(entry, 'Worker A should have claimed');
        const tokenA = entry.claimToken;
        for (const log of autoLogStore.values()) {
            log.leaseUntil = new Date(Date.now() - 5000); // Manually expire all active leases held by Worker A
        }

        // 3. Worker B acquires
        WorkflowEngine.executeAction = async () => {
            await new Promise(r => setTimeout(r, 10));
        };
        await processDomainEvent(createJob('job-B', 'evt-fence'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        const updatedEntry = autoLogStore.get(key);
        assert.notEqual(updatedEntry.claimToken, tokenA);
        const tokenB = updatedEntry.claimToken;
        assert.equal(updatedEntry.status, 'success');

        // 4. Worker A finishes
        blocked = false;
        try {
            await workerAPromise;
            assert.fail('Worker A should have thrown ownership loss error');
        } catch (err) {
            assert.match(err.message, /ownership lost during.*success finalization/);
        }

        // Worker A should have tried to update with token A, which fails.
        // The final DB state should still be success, and claimToken should still be tokenB.
        const finalEntry = autoLogStore.get(key);
        assert.equal(finalEntry.claimToken, tokenB);
        assert.equal(finalEntry.status, 'success');

        const aUpdate = updateOneCalls.find(call => call.query.claimToken === tokenA);
        assert.ok(aUpdate, 'Worker A should have attempted to update');
    });

    it('Test 8 & 9: Existing success/failed prevents execution', async () => {
        triggersStore.push({ _id: 'trg-1', actions: [{ type: 'send_communication' }] });

        autoLogStore.set('outbox-evt-done-trg-1-0', {
            status: 'success',
            idempotencyKey: 'outbox-evt-done-trg-1-0',
        });

        const res = await processDomainEvent(createJob('job-X', 'evt-done'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        assert.equal(executeActionCalls.length, 0);
        assert.equal(res.executionResults[0].decision, 'SKIPPED_DUPLICATE');

        autoLogStore.set('outbox-evt-fail-trg-1-0', {
            status: 'failed',
            idempotencyKey: 'outbox-evt-fail-trg-1-0',
        });

        const res2 = await processDomainEvent(createJob('job-Y', 'evt-fail'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        assert.equal(executeActionCalls.length, 0);
        assert.equal(res2.executionResults[0].decision, 'SKIPPED_DUPLICATE');
    });

    it('Test 10 & 11: Infra error preserves pending/failed correctly', async () => {
        triggersStore.push({ _id: 'trg-1', actions: [{ type: 'send_communication' }] });

        WorkflowEngine.executeAction = async () => {
            throw new Error('Some unexpected Infra Error escaping the swallow block');
        };

        try {
            await processDomainEvent(createJob('job-err', 'evt-err'), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
            assert.fail('Should have thrown infra error');
        } catch (e) {
            assert.match(e.message, /Infra Error/);
        }

        const logEntry = autoLogStore.get('outbox-evt-err-trg-1-0');
        assert.equal(logEntry.status, 'failed');
        assert.match(logEntry.details.error, /Infra Error/);
    });
});
