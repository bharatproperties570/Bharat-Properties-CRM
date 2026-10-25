/**
 * Phase E.3-C — Domain Event Consumer Integration Verification
 *
 * Tests the real processDomainEvent function in execution mode
 * using global Mongoose mocking to ensure atomic idempotency constraints
 * across the integration boundary.
 *
 * Mocked integration via node:test.
 * No live Mongo, no live Redis (uses MockRedis fallback).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import mongoose from 'mongoose';

// Import models and dependencies to be mocked globally
import AutomationLog from '../models/AutomationLog.js';
import Trigger from '../models/Trigger.js';
import { WorkflowEngine } from '../src/utils/WorkflowEngine.js';

// Import the real worker implementation
import { processDomainEvent, default as worker } from '../src/workers/domainEventWorker.js';

describe('Phase E.3-C — Domain Event Consumer Integration Verification', () => {
    // Original methods to restore later
    const origMongooseModel = mongoose.model;
    const origCreate = AutomationLog.create;
    const origFindOne = AutomationLog.findOne;
    const origUpdateOne = AutomationLog.updateOne;
    const origTriggerFind = Trigger.find;
    const origExecuteAction = WorkflowEngine.executeAction;
    const origEvaluateRules = WorkflowEngine.evaluateRules;

    // Mock State
    let autoLogStore = new Map();
    let triggersStore = [];
    let executeActionCalls = [];
    let customCreateError = null;

    beforeEach(() => {
        autoLogStore.clear();
        triggersStore = [];
        executeActionCalls = [];
        customCreateError = null;

        // --- Mock Mongoose Model Hydration (E.3-D Contract) ---
        mongoose.model = (name) => ({
            findById: (id) => ({
                lean: async () => ({
                    _id: id,
                    id: id,
                    name: `Mock ${name}`,
                    title: `Mock ${name}`,
                    stage: 'Open',
                    status: 'Open',
                    dealValue: 50000,
                    entityId: id,
                    metadata: {},
                }),
                select: () => ({
                    lean: async () => ({
                        _id: id,
                        id: id,
                        name: `Mock ${name}`,
                        title: `Mock ${name}`,
                        stage: 'Open',
                        status: 'Open',
                        dealValue: 50000,
                        entityId: id,
                        metadata: {},
                    })
                })
            }),
            findByIdAndUpdate: async (id, update) => ({
                _id: id,
                id: id,
                ...(update.$set || update)
            })
        });

        // --- Mock AutomationLog ---
        AutomationLog.create = async (doc) => {
            if (customCreateError) throw customCreateError;

            // Simulate atomic DB insert synchronously to avoid JS-level race condition in mock
            const key = doc.idempotencyKey;

            if (autoLogStore.has(key)) {
                // Simulate atomic duplicate key rejection
                const err = new Error('E11000 duplicate key error');
                err.code = 11000;
                throw err;
            }

            // Atomically acquire the lock in our mock store
            autoLogStore.set(key, { ...doc });

            // A tiny async delay to simulate DB write time
            await new Promise(r => setTimeout(r, 5));

            return doc;
        };

        AutomationLog.findOne = (query) => {
            return {
                lean: async () => {
                    await new Promise(r => setTimeout(r, 1));
                    return autoLogStore.get(query.idempotencyKey) || null;
                }
            };
        };


        AutomationLog.findOneAndUpdate = async (query, update, options) => {
            const existing = autoLogStore.get(query.idempotencyKey);
            if (!existing) return null;
            if (query.status && existing.status !== query.status) return null;
            if (query.leaseUntil && query.leaseUntil.$lte) {
                if (existing.leaseUntil > query.leaseUntil.$lte) return null;
            }
            const updated = { ...existing };
            if (update.$set) Object.assign(updated, update.$set);
            autoLogStore.set(query.idempotencyKey, updated);
            return updated;
        };

        AutomationLog.updateOne = async (query, update) => {
            await new Promise(r => setTimeout(r, 1));
            const key = query.idempotencyKey;
            if (autoLogStore.has(key)) {
                const doc = autoLogStore.get(key);
                if (update.$set) {
                    Object.assign(doc, update.$set);
                }
            }
            return { modifiedCount: 1 };
        };

        // --- Mock Trigger ---
        Trigger.find = (query) => {
            return {
                sort: () => {
                    return triggersStore.filter(t =>
                        t.module === query.module &&
                        t.event === query.event &&
                        t.isActive === query.isActive
                    ).sort((a, b) => (a.priority || 5) - (b.priority || 5));
                }
            };
        };

        // --- Mock WorkflowEngine ---
        WorkflowEngine.executeAction = async (action, entityData, trigger, companyId) => {
            await new Promise(r => setTimeout(r, 5)); // simulate execution time
            executeActionCalls.push({ action, entityData, trigger, companyId });
        };

        // We use a simplified mock for evaluateRules to keep tests focused on the claim flow
        WorkflowEngine.evaluateRules = (conditions, payload) => {
            if (conditions === 'force-fail') return false;
            return true;
        };
    });

    afterEach(async () => {
        mongoose.model = origMongooseModel;
        AutomationLog.create = origCreate;
        AutomationLog.findOne = origFindOne;
        AutomationLog.updateOne = origUpdateOne;
        Trigger.find = origTriggerFind;
        WorkflowEngine.executeAction = origExecuteAction;
        WorkflowEngine.evaluateRules = origEvaluateRules;
        await worker.close();
    });

    // Helpers
    const makeJob = (overrides = {}) => ({
        id: `job-${Math.random()}`,
        data: {
            eventId: 'evt-100',
            eventType: 'DealCreated',
            entityType: 'Deal',
            entityId: 'deal-123',
            occurredAt: new Date().toISOString(),
            payload: { dealId: 'deal-123' },
            ...overrides
        }
    });

    const makeTrigger = (overrides = {}) => ({
        _id: `trg-${Math.random().toString(36).substr(2, 6)}`,
        name: 'Test Trigger',
        module: 'deals',
        event: 'deal_created',
        isActive: true,
        priority: 1,
        conditions: {},
        actions: [{ type: 'fire_automated_action' }],
        companyId: null,
        ...overrides
    });


    // E3C-01 — First successful execution
    it('E3C-01 — First successful execution', async () => {
        const trigger = makeTrigger();
        triggersStore.push(trigger);

        const result = await processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(result.status, 'EXECUTION_COMPLETE');
        assert.equal(executeActionCalls.length, 1);

        const claimKey = `outbox-evt-100-${trigger._id}-0`;
        const claim = autoLogStore.get(claimKey);
        assert.ok(claim);
        assert.equal(claim.status, 'success');
    });

    // E3C-02 — Same event delivered twice
    it('E3C-02 — Same event delivered twice', async () => {
        const trigger = makeTrigger();
        triggersStore.push(trigger);

        await processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true }); // Delivery 1
        await processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true }); // Delivery 2

        assert.equal(executeActionCalls.length, 1, 'Action should only execute once');
        const claim = autoLogStore.get(`outbox-evt-100-${trigger._id}-0`);
        assert.equal(claim.status, 'success');
    });

    // E3C-03 — Same event with two actions
    it('E3C-03 — Same event with two actions', async () => {
        const trigger = makeTrigger({
            actions: [{ type: 'action1' }, { type: 'action2' }]
        });
        triggersStore.push(trigger);

        await processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(executeActionCalls.length, 2);
        assert.ok(autoLogStore.has(`outbox-evt-100-${trigger._id}-0`));
        assert.ok(autoLogStore.has(`outbox-evt-100-${trigger._id}-1`));
    });

    // E3C-04 — Same event with two matching triggers
    it('E3C-04 — Same event with two matching triggers', async () => {
        const t1 = makeTrigger({ _id: 'trg-A' });
        const t2 = makeTrigger({ _id: 'trg-B' });
        triggersStore.push(t1, t2);

        await processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(executeActionCalls.length, 2);
        assert.ok(autoLogStore.has(`outbox-evt-100-trg-A-0`));
        assert.ok(autoLogStore.has(`outbox-evt-100-trg-B-0`));
    });

    // E3C-05 — Concurrent duplicate execution (Promise.all)
    it('E3C-05 — Concurrent duplicate execution (Real Concurrency Proof)', async () => {
        const trigger = makeTrigger();
        triggersStore.push(trigger);

        const [r1, r2] = await Promise.allSettled([
            processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true }),
            processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true })
        ]);

        // FORENSIC FINDING:
        // With the Lease Ownership (E.3-C.1-I), Worker 2 now sees the active lease and rejects,
        // throwing an error so BullMQ retries. Both NO LONGER execute.
        assert.equal(executeActionCalls.length, 1, 'Race condition FIXED: only one executes');

        const fulfilled = [r1, r2].filter(r => r.status === 'fulfilled');
        const rejected = [r1, r2].filter(r => r.status === 'rejected');

        assert.equal(fulfilled.length, 1);
        assert.equal(rejected.length, 1);
        assert.match(rejected[0].reason.message, /Active lease held/);
    });

    // E3C-06 — Pending recovery
    it('E3C-06 — Pending recovery (Stale Lease)', async () => {
        const trigger = makeTrigger({ _id: 'trg-pend' });
        triggersStore.push(trigger);

        // Seed a pending claim with an expired lease
        autoLogStore.set(`outbox-evt-100-trg-pend-0`, {
            status: 'pending',
            idempotencyKey: `outbox-evt-100-trg-pend-0`,
            leaseUntil: new Date(Date.now() - 10000)
        });

        const res = await processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        assert.equal(executeActionCalls.length, 1);
        assert.equal(res.executionResults[0].decision, 'EXECUTED');
    });

    // E3C-07 — Existing success
    it('E3C-07 — Existing success', async () => {
        const trigger = makeTrigger({ _id: 'trg-succ' });
        triggersStore.push(trigger);
        autoLogStore.set(`outbox-evt-100-trg-succ-0`, { status: 'success' });

        await processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(executeActionCalls.length, 0);
    });

    // E3C-08 — Existing failed
    it('E3C-08 — Existing failed', async () => {
        const trigger = makeTrigger({ _id: 'trg-fail' });
        triggersStore.push(trigger);
        autoLogStore.set(`outbox-evt-100-trg-fail-0`, { status: 'failed' });

        await processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(executeActionCalls.length, 0);
    });

    // E3C-09 — Rule mismatch
    it('E3C-09 — Rule mismatch', async () => {
        const trigger = makeTrigger({ conditions: 'force-fail' });
        triggersStore.push(trigger);

        const result = await processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(result.executionResults[0].decision, 'CONDITION_NOT_MATCHED');
        assert.equal(executeActionCalls.length, 0);
        assert.equal(autoLogStore.size, 0);
    });

    // E3C-10 — Unknown event
    it('E3C-10 — Unknown event', async () => {
        const result = await processDomainEvent(makeJob({ eventType: 'RandomEvent' }), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        assert.equal(result.status, 'SKIPPED');
        assert.equal(executeActionCalls.length, 0);
    });

    // E3C-11 — Malformed envelope
    it('E3C-11 — Malformed envelope', async () => {
        const result = await processDomainEvent({ id: '1', data: { eventType: 'DealCreated' } });
        assert.equal(result.status, 'REJECTED');
        assert.equal(executeActionCalls.length, 0);
    });

    // E3C-12 — Deal entity mapping
    it('E3C-12 — Deal entity mapping', async () => {
        const trigger = makeTrigger();
        triggersStore.push(trigger);

        await processDomainEvent(makeJob({
            payload: { dealId: 'deal-999' }
        }), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        const claim = autoLogStore.get(`outbox-evt-100-${trigger._id}-0`);
        assert.equal(claim.targetEntityId, 'deal-999');
        assert.equal(claim.targetModule, 'deals');
    });

    // E3C-13 — Booking entity mapping
    it('E3C-13 — Booking entity mapping', async () => {
        const trigger = makeTrigger({ module: 'post_sale', event: 'booking_created' });
        triggersStore.push(trigger);

        await processDomainEvent(makeJob({
            eventType: 'BookingCreated',
            entityType: 'Booking',
            payload: { bookingId: 'book-999' }
        }), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        const claim = autoLogStore.get(`outbox-evt-100-${trigger._id}-0`);
        assert.equal(claim.targetEntityId, 'book-999');
        assert.equal(claim.targetModule, 'post_sale');
    });

    // E3C-14 — Non-E11000 claim error
    it('E3C-14 — Non-E11000 claim error propagates', async () => {
        const trigger = makeTrigger();
        triggersStore.push(trigger);
        customCreateError = new Error('MongoDB Disconnected');

        await assert.rejects(
            processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true }),
            /MongoDB Disconnected/
        );
        assert.equal(executeActionCalls.length, 0);
    });

    // E3C-15 — Claim update infrastructure failure
    it('E3C-15 — Claim update infrastructure failure', async () => {
        const trigger = makeTrigger();
        triggersStore.push(trigger);

        // Mock updateOne to throw an error
        AutomationLog.updateOne = async () => { throw new Error('Update Failed'); };

        await assert.rejects(
            processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true }),
            /Update Failed/
        );

        // executeAction WAS called, but the claim is now 'failed' or stays 'pending'
        // depending on the infra catch block (in domainEventWorker it attempts to set 'failed')
        assert.equal(executeActionCalls.length, 1);
    });

    // E3C-16 — Three actions, middle duplicate
    it('E3C-16 — Three actions, middle duplicate', async () => {
        const trigger = makeTrigger({
            actions: [{ type: 'act0' }, { type: 'act1' }, { type: 'act2' }]
        });
        triggersStore.push(trigger);

        // Seed middle action as success
        autoLogStore.set(`outbox-evt-100-${trigger._id}-1`, { status: 'success' });

        const result = await processDomainEvent(makeJob(), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(executeActionCalls.length, 2);

        const dec = result.executionResults.map(r => r.decision);
        assert.deepEqual(dec, ['EXECUTED', 'SKIPPED_DUPLICATE', 'EXECUTED']);
    });

    // E3C-17 — Deterministic replay
    it('E3C-17 — Deterministic replay', async () => {
        const trigger = makeTrigger();
        triggersStore.push(trigger);

        await processDomainEvent(makeJob({ eventId: 'deterministic-123' }), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        assert.ok(autoLogStore.has(`outbox-deterministic-123-${trigger._id}-0`));
    });

    // E3C-18 — Multiple events, same trigger
    it('E3C-18 — Multiple events, same trigger', async () => {
        const trigger = makeTrigger();
        triggersStore.push(trigger);

        await processDomainEvent(makeJob({ eventId: 'evt-A', entityId: 'deal-A', payload: { dealId: 'deal-A' } }), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });
        await processDomainEvent(makeJob({ eventId: 'evt-B', entityId: 'deal-B', payload: { dealId: 'deal-B' } }), { TEST_MODE_REAL_EXECUTION_OVERRIDE: true });

        assert.equal(executeActionCalls.length, 2);
        assert.ok(autoLogStore.has(`outbox-evt-A-${trigger._id}-0`));
        assert.ok(autoLogStore.has(`outbox-evt-B-${trigger._id}-0`));
    });
});
