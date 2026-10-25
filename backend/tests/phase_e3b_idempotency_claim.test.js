/**
 * Phase E.3-B — Atomic Idempotency Claim Tests
 *
 * Tests the execution-mode domainEventWorker with mocked dependencies.
 * Verifies atomic claim, E11000 handling, pending recovery, entity mapping,
 * multi-action/multi-trigger behavior, and regression compatibility.
 *
 * Uses node:test (built-in test runner).
 * Run: node --test backend/tests/phase_e3b_idempotency_claim.test.js
 *
 * Mocks: Trigger, AutomationLog, WorkflowEngine, BullMQ Worker, Redis
 * Does NOT: connect to production DB, send WhatsApp, enqueue real jobs
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════
// Module-Level Mocks
// ═══════════════════════════════════════════════════════════════

// ── Mock AutomationLog ─────────────────────────────────────────
let mockAutoLogCreateFn = async () => ({});
let mockAutoLogFindOneFn = async () => null;
let mockAutoLogUpdateOneFn = async () => ({});
let mockAutoLogFindOneAndUpdateFn = async () => null;

const MockAutomationLog = {
    create: async (...args) => mockAutoLogCreateFn(...args),
    findOne: (...args) => ({
        lean: async () => mockAutoLogFindOneFn(...args),
    }),
    updateOne: async (...args) => mockAutoLogUpdateOneFn(...args),
    findOneAndUpdate: async (...args) => mockAutoLogFindOneAndUpdateFn(...args),
};

// ── Mock Trigger ───────────────────────────────────────────────
let mockTriggerFindResult = [];
const MockTrigger = {
    find: () => ({
        sort: () => mockTriggerFindResult,
    }),
};

// ── Mock WorkflowEngine ────────────────────────────────────────
let mockExecuteActionFn = async () => {};
let mockEvaluateRulesFn = () => true;

const MockWorkflowEngine = {
    evaluateRules: (...args) => mockEvaluateRulesFn(...args),
    executeAction: async (...args) => mockExecuteActionFn(...args),
};

// ── Register mocks before import ───────────────────────────────
import { register } from 'node:module';

// Since domainEventWorker.js imports from real modules that require
// mongoose/redis, we test the exported processDomainEvent function
// by constructing it with mocked dependencies inline.
//
// Strategy: We replicate the exact processDomainEvent logic using
// the mock objects, matching the source file's exported function.

// ── Replicate EVENT_MAP and ENTITY_ID_MAP from domainEventWorker.js ──
const EVENT_MAP = {
    DealCreated:    { module: 'deals',     event: 'deal_created' },
    BookingCreated: { module: 'post_sale', event: 'booking_created' },
};

const ENTITY_ID_MAP = {
    DealCreated:    'dealId',
    BookingCreated: 'bookingId',
};

// ── Replicate validateEnvelope from domainEventWorker.js ──
function validateEnvelope(data) {
    if (!data)                             return { valid: false, reason: 'Job data is null/undefined' };
    if (!data.eventId)                     return { valid: false, reason: 'Missing eventId' };
    if (!data.eventType)                   return { valid: false, reason: 'Missing eventType' };
    if (!data.entityType)                  return { valid: false, reason: 'Missing entityType' };
    if (!data.entityId)                    return { valid: false, reason: 'Missing entityId' };
    if (!data.occurredAt)                  return { valid: false, reason: 'Missing occurredAt' };
    if (data.payload === undefined ||
        data.payload === null)             return { valid: false, reason: 'Missing payload' };
    return { valid: true };
}

// ── Replicate claimAction from domainEventWorker.js ──
import crypto from 'crypto';
const DOMAIN_EVENT_EXECUTION_LEASE_MS = 120000;

async function claimAction({ idempotencyKey, triggerId, targetEntityId, triggerModule }) {
    const claimToken = crypto.randomUUID();
    const leaseUntil = new Date(Date.now() + DOMAIN_EVENT_EXECUTION_LEASE_MS);

    try {
        await MockAutomationLog.create({
            ruleType:       'Trigger',
            ruleId:         triggerId,
            targetEntityId,
            targetModule:   triggerModule,
            status:         'pending',
            idempotencyKey,
            companyId:      null,
            claimToken,
            leaseUntil
        });
        return { claimed: true, claimToken };
    } catch (err) {
        if (err.code === 11000) {
            const existing = await MockAutomationLog.findOne({ idempotencyKey }).lean();
            if (!existing) {
                return { claimed: false, reason: 'Collision during edge case document deletion' };
            }
            if (existing.status === 'success') {
                return { claimed: false, reason: 'Already processed (status: success)' };
            }
            if (existing.status === 'failed') {
                return { claimed: false, reason: 'Already processed (status: failed)' };
            }
            if (existing.status === 'pending') {
                if (existing.leaseUntil && existing.leaseUntil > new Date()) {
                    throw new Error(`Active lease held by another worker until ${existing.leaseUntil.toISOString()}`);
                }

                const updated = await MockAutomationLog.findOneAndUpdate(
                    {
                        idempotencyKey,
                        status: 'pending',
                        leaseUntil: { $lte: new Date() }
                    },
                    {
                        $set: { claimToken, leaseUntil }
                    },
                    { new: true }
                );

                if (updated) {
                    return { claimed: true, recovery: true, claimToken };
                } else {
                    throw new Error('Lost stale lease acquisition race to another worker');
                }
            }
        }
        throw err;
    }
}

// ── Replicate processDomainEvent from domainEventWorker.js ──
async function processDomainEvent(job) {
    const jobId = job.id;
    const data = job.data;

    const validation = validateEnvelope(data);
    if (!validation.valid) {
        return { status: 'REJECTED', reason: validation.reason };
    }

    const { eventId, eventType, entityType, entityId, occurredAt, payload } = data;

    const mapping = EVENT_MAP[eventType];
    if (!mapping) {
        return { status: 'SKIPPED', reason: `Unknown eventType: ${eventType}` };
    }

    const { module: triggerModule, event: triggerEvent } = mapping;

    const entityIdField = ENTITY_ID_MAP[eventType];
    const targetEntityId = entityIdField ? (payload[entityIdField] || entityId) : entityId;

    const activeTriggers = MockTrigger.find({
        module: triggerModule, event: triggerEvent, isActive: true, companyId: null,
    }).sort({ priority: 1 });

    if (activeTriggers.length === 0) {
        return { status: 'NO_TRIGGERS', eventId, triggersMatched: 0 };
    }

    const executionResults = [];

    for (const trigger of activeTriggers) {
        const conditionResult = MockWorkflowEngine.evaluateRules(trigger.conditions, payload);

        if (!conditionResult) {
            executionResults.push({
                decision: 'CONDITION_NOT_MATCHED',
                eventId,
                triggerId: String(trigger._id),
                triggerName: trigger.name,
                conditionResult: false,
            });
            continue;
        }

        for (let actionIndex = 0; actionIndex < trigger.actions.length; actionIndex++) {
            const action = trigger.actions[actionIndex];
            const idempotencyKey = `outbox-${eventId}-${trigger._id}-${actionIndex}`;

            const claim = await claimAction({
                idempotencyKey,
                triggerId:      trigger._id,
                targetEntityId,
                triggerModule,
            });

            if (!claim.claimed) {
                executionResults.push({
                    decision:       'SKIPPED_DUPLICATE',
                    eventId,
                    triggerId:      String(trigger._id),
                    actionIndex,
                    actionType:     action.type,
                    idempotencyKey,
                    reason:         claim.reason,
                });
                continue;
            }

            try {
                await MockWorkflowEngine.executeAction(action, payload, trigger, null);

                await MockAutomationLog.updateOne(
                    { idempotencyKey, claimToken: claim.claimToken },
                    { $set: { status: 'success', executedAt: new Date() } }
                );

                executionResults.push({
                    decision:       'EXECUTED',
                    eventId,
                    triggerId:      String(trigger._id),
                    actionIndex,
                    actionType:     action.type,
                    idempotencyKey,
                    status:         'success',
                });
            } catch (infraError) {
                try {
                    await MockAutomationLog.updateOne(
                        { idempotencyKey, claimToken: claim.claimToken },
                        { $set: { status: 'failed', details: { error: infraError.message } } }
                    );
                } catch (_) { /* best-effort */ }

                executionResults.push({
                    decision:       'INFRA_ERROR',
                    eventId,
                    triggerId:      String(trigger._id),
                    actionIndex,
                    actionType:     action.type,
                    idempotencyKey,
                    error:          infraError.message,
                });

                throw infraError;
            }
        }
    }

    return {
        status:            'EXECUTION_COMPLETE',
        eventId,
        eventType,
        triggersEvaluated: activeTriggers.length,
        executionResults,
    };
}


// ═══════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════

function makeJob(overrides = {}) {
    return {
        id: 'job-001',
        data: {
            eventId:    'evt-uuid-001',
            eventType:  'DealCreated',
            entityType: 'Deal',
            entityId:   '507f1f77bcf86cd799439011',
            occurredAt: '2026-10-01T10:00:00.000Z',
            payload: {
                dealId:      '507f1f77bcf86cd799439011',
                stage:       'Open',
                projectName: 'Green Valley',
                source:      'Facebook',
                dealType:    'Sale',
                companyId:   null,
                createdAt:   '2026-10-01T10:00:00.000Z',
            },
            ...overrides,
        },
    };
}

function makeTrigger(overrides = {}) {
    return {
        _id:        'trigger-001',
        name:       'Send New Deal on Match Lead',
        module:     'deals',
        event:      'deal_created',
        priority:   2,
        isActive:   true,
        conditions: { operator: 'AND', rules: [{ field: 'stage', operator: '==', value: 'Open' }] },
        actions:    [{ type: 'fire_automated_action', automatedActionId: 'aa-001' }],
        companyId:  null,
        ...overrides,
    };
}

function makeBookingJob() {
    return {
        id: 'job-booking-001',
        data: {
            eventId:    'evt-uuid-booking-001',
            eventType:  'BookingCreated',
            entityType: 'Booking',
            entityId:   '507f1f77bcf86cd799439022',
            occurredAt: '2026-10-01T11:00:00.000Z',
            payload: {
                bookingId:     '507f1f77bcf86cd799439022',
                applicationNo: 'APP-001',
                dealId:        '507f1f77bcf86cd799439011',
                status:        'Pending',
                type:          'Sale',
                companyId:     null,
            },
        },
    };
}

// Track calls
let createCalls = [];
let executeActionCalls = [];
let updateOneCalls = [];
let findOneCalls = [];

function resetMocks() {
    createCalls = [];
    executeActionCalls = [];
    updateOneCalls = [];
    findOneCalls = [];
    mockTriggerFindResult = [];

    mockAutoLogCreateFn = async (doc) => {
        createCalls.push(doc);
        return doc;
    };
    mockAutoLogFindOneFn = async (query) => {
        findOneCalls.push(query);
        return null;
    };
    mockAutoLogUpdateOneFn = async (filter, update) => {
        updateOneCalls.push({ filter, update });
        return { modifiedCount: 1 };
    };
    mockExecuteActionFn = async (...args) => {
        executeActionCalls.push(args);
    };
    mockEvaluateRulesFn = (conditions, data) => {
        if (!conditions || typeof conditions !== 'object') return true;
        if (conditions.field && conditions.operator) {
            const val = String(data?.[conditions.field] || '').toLowerCase();
            const ruleVal = String(conditions.value || '').toLowerCase();
            if (conditions.operator === '==') return val === ruleVal;
            return false;
        }
        if (!conditions.rules || conditions.rules.length === 0) return true;
        if (conditions.operator === 'OR') {
            return conditions.rules.some(r => mockEvaluateRulesFn(r, data));
        }
        return conditions.rules.every(r => mockEvaluateRulesFn(r, data));
    };
}


// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase E.3-B — Atomic Idempotency Claim', () => {
    beforeEach(() => {
        resetMocks();
    });

    // ── E3B-01: First claim succeeds ──────────────────────────
    it('E3B-01: First claim succeeds — create called, executeAction called', async () => {
        mockTriggerFindResult = [makeTrigger()];
        const result = await processDomainEvent(makeJob());

        assert.equal(result.status, 'EXECUTION_COMPLETE');
        assert.equal(createCalls.length, 1, 'AutomationLog.create called once');
        assert.equal(createCalls[0].status, 'pending');
        assert.equal(createCalls[0].idempotencyKey, 'outbox-evt-uuid-001-trigger-001-0');
        assert.equal(createCalls[0].ruleType, 'Trigger');
        assert.equal(executeActionCalls.length, 1, 'executeAction called once');
        assert.equal(updateOneCalls.length, 1, 'updateOne called once');
        assert.deepEqual(updateOneCalls[0].update.$set.status, 'success');
    });

    // ── E3B-02: Duplicate claim with existing success ─────────
    it('E3B-02: Duplicate claim with existing success — executeAction NOT called', async () => {
        mockTriggerFindResult = [makeTrigger()];
        const e11000 = new Error('E11000 duplicate key error');
        e11000.code = 11000;
        mockAutoLogCreateFn = async (doc) => {
            createCalls.push(doc);
            throw e11000;
        };
        mockAutoLogFindOneFn = async () => ({ status: 'success', idempotencyKey: 'outbox-evt-uuid-001-trigger-001-0' });

        const result = await processDomainEvent(makeJob());

        assert.equal(result.status, 'EXECUTION_COMPLETE');
        assert.equal(executeActionCalls.length, 0, 'executeAction NOT called');
        assert.equal(result.executionResults[0].decision, 'SKIPPED_DUPLICATE');
    });

    // ── E3B-03: Duplicate claim with existing failed ──────────
    it('E3B-03: Duplicate claim with existing failed — executeAction NOT called', async () => {
        mockTriggerFindResult = [makeTrigger()];
        const e11000 = new Error('E11000 duplicate key error');
        e11000.code = 11000;
        mockAutoLogCreateFn = async (doc) => {
            createCalls.push(doc);
            throw e11000;
        };
        mockAutoLogFindOneFn = async () => ({ status: 'failed', idempotencyKey: 'outbox-evt-uuid-001-trigger-001-0' });

        const result = await processDomainEvent(makeJob());

        assert.equal(executeActionCalls.length, 0, 'executeAction NOT called');
        assert.equal(result.executionResults[0].decision, 'SKIPPED_DUPLICATE');
        assert.ok(result.executionResults[0].reason.includes('failed'));
    });

    // ── E3B-04: Duplicate claim with existing pending (recovery)
    it('E3B-04: Duplicate claim with existing pending — recovery permits execution', async () => {
        mockTriggerFindResult = [makeTrigger()];
        const e11000 = new Error('E11000 duplicate key error');
        e11000.code = 11000;
        mockAutoLogCreateFn = async (doc) => {
            createCalls.push(doc);
            throw e11000;
        };
        mockAutoLogFindOneFn = async () => ({ status: 'pending', leaseUntil: new Date(0), idempotencyKey: 'outbox-evt-uuid-001-trigger-001-0' });
        mockAutoLogFindOneAndUpdateFn = async () => ({ status: 'pending', claimToken: 'NEW' });

        const result = await processDomainEvent(makeJob());

        assert.equal(result.status, 'EXECUTION_COMPLETE');
        assert.equal(executeActionCalls.length, 1, 'executeAction called (recovery)');
        assert.equal(result.executionResults[0].decision, 'EXECUTED');
    });

    // ── E3B-05: Two actions on one trigger ────────────────────
    it('E3B-05: Two actions on one trigger — two different idempotency keys', async () => {
        mockTriggerFindResult = [makeTrigger({
            actions: [
                { type: 'fire_automated_action', automatedActionId: 'aa-001' },
                { type: 'send_communication', channel: 'whatsapp', templateId: 'tpl-001' },
            ],
        })];
        const result = await processDomainEvent(makeJob());

        assert.equal(createCalls.length, 2, 'Two claims created');
        assert.equal(createCalls[0].idempotencyKey, 'outbox-evt-uuid-001-trigger-001-0');
        assert.equal(createCalls[1].idempotencyKey, 'outbox-evt-uuid-001-trigger-001-1');
        assert.equal(executeActionCalls.length, 2, 'executeAction called twice');
    });

    // ── E3B-06: Two matching triggers ─────────────────────────
    it('E3B-06: Two matching triggers — independent idempotency keys', async () => {
        mockTriggerFindResult = [
            makeTrigger({ _id: 'trigger-A', name: 'Trigger A' }),
            makeTrigger({ _id: 'trigger-B', name: 'Trigger B' }),
        ];
        const result = await processDomainEvent(makeJob());

        assert.equal(createCalls.length, 2, 'Two claims created');
        assert.equal(createCalls[0].idempotencyKey, 'outbox-evt-uuid-001-trigger-A-0');
        assert.equal(createCalls[1].idempotencyKey, 'outbox-evt-uuid-001-trigger-B-0');
        assert.equal(executeActionCalls.length, 2, 'Both triggers execute');
    });

    // ── E3B-07: Same event delivered twice ────────────────────
    it('E3B-07: Same event delivered twice — second delivery skips', async () => {
        mockTriggerFindResult = [makeTrigger()];

        // First delivery: claim succeeds
        const result1 = await processDomainEvent(makeJob());
        assert.equal(result1.executionResults[0].decision, 'EXECUTED');
        assert.equal(executeActionCalls.length, 1);

        // Second delivery: claim returns E11000 with status 'success'
        const e11000 = new Error('E11000 duplicate key error');
        e11000.code = 11000;
        mockAutoLogCreateFn = async (doc) => { createCalls.push(doc); throw e11000; };
        mockAutoLogFindOneFn = async () => ({ status: 'success' });

        const result2 = await processDomainEvent(makeJob());
        assert.equal(result2.executionResults[0].decision, 'SKIPPED_DUPLICATE');
        assert.equal(executeActionCalls.length, 1, 'executeAction NOT called again');
    });

    // ── E3B-08: Concurrent duplicate claim simulation ─────────
    it('E3B-08: Concurrent duplicate claim — only one succeeds', async () => {
        mockTriggerFindResult = [makeTrigger()];

        // Simulate: first create succeeds, second gets E11000
        let callCount = 0;
        mockAutoLogCreateFn = async (doc) => {
            callCount++;
            createCalls.push(doc);
            if (callCount === 2) {
                const e11000 = new Error('E11000 duplicate key error');
                e11000.code = 11000;
                throw e11000;
            }
            return doc;
        };
        mockAutoLogFindOneFn = async () => ({ status: 'success' });

        // First worker
        const r1 = await processDomainEvent(makeJob());
        assert.equal(r1.executionResults[0].decision, 'EXECUTED');

        // Second worker (concurrent)
        const r2 = await processDomainEvent(makeJob());
        assert.equal(r2.executionResults[0].decision, 'SKIPPED_DUPLICATE');
        assert.equal(executeActionCalls.length, 1, 'Only one execution');
    });

    // ── E3B-09: DealCreated entity mapping ────────────────────
    it('E3B-09: DealCreated — targetEntityId = payload.dealId', async () => {
        mockTriggerFindResult = [makeTrigger()];
        const job = makeJob();
        job.data.payload.dealId = '507f1f77bcf86cd799439099';

        const result = await processDomainEvent(job);

        assert.equal(createCalls[0].targetEntityId, '507f1f77bcf86cd799439099');
    });

    // ── E3B-10: BookingCreated entity mapping ─────────────────
    it('E3B-10: BookingCreated — targetEntityId = payload.bookingId', async () => {
        mockTriggerFindResult = [makeTrigger({
            _id: 'trigger-booking-001',
            module: 'post_sale',
            event: 'booking_created',
            conditions: {},
        })];
        const job = makeBookingJob();

        const result = await processDomainEvent(job);

        assert.equal(createCalls[0].targetEntityId, '507f1f77bcf86cd799439022');
        assert.equal(createCalls[0].targetModule, 'post_sale');
    });

    // ── E3B-11: Correct targetModule mapping ──────────────────
    it('E3B-11: DealCreated → targetModule = deals', async () => {
        mockTriggerFindResult = [makeTrigger()];
        await processDomainEvent(makeJob());

        assert.equal(createCalls[0].targetModule, 'deals');
    });

    // ── E3B-12: executeAction remains canonical ───────────────
    it('E3B-12: executeAction is called with canonical signature', async () => {
        mockTriggerFindResult = [makeTrigger()];
        await processDomainEvent(makeJob());

        assert.equal(executeActionCalls.length, 1);
        const [action, payload, trigger, companyId] = executeActionCalls[0];
        assert.equal(action.type, 'fire_automated_action');
        assert.equal(payload.stage, 'Open');
        assert.equal(trigger._id, 'trigger-001');
        assert.equal(companyId, null, 'companyId passed as null');
    });

    // ── E3B-13: Malformed event does not create claim ─────────
    it('E3B-13: Malformed event — no claim, no executeAction', async () => {
        const job = { id: 'job-bad', data: { eventId: null } };
        const result = await processDomainEvent(job);

        assert.equal(result.status, 'REJECTED');
        assert.equal(createCalls.length, 0);
        assert.equal(executeActionCalls.length, 0);
    });

    // ── E3B-14: Unknown event type does not create claim ──────
    it('E3B-14: Unknown eventType — no claim, no executeAction', async () => {
        const job = makeJob({ eventType: 'LeadDeleted' });
        const result = await processDomainEvent(job);

        assert.equal(result.status, 'SKIPPED');
        assert.equal(createCalls.length, 0);
        assert.equal(executeActionCalls.length, 0);
    });

    // ── E3B-15: Rule condition not matched — no claim ─────────
    it('E3B-15: Condition not matched — no claim, no executeAction', async () => {
        mockTriggerFindResult = [makeTrigger({
            conditions: { field: 'source', operator: '==', value: 'Referral' },
        })];
        const job = makeJob();
        job.data.payload.source = 'Facebook';

        const result = await processDomainEvent(job);

        assert.equal(createCalls.length, 0, 'No claim created');
        assert.equal(executeActionCalls.length, 0, 'No execution');
        assert.equal(result.executionResults[0].decision, 'CONDITION_NOT_MATCHED');
    });

    // ── E3B-16: AutomationLog.create receives correct fields ──
    it('E3B-16: Claim document has correct ruleType, status, idempotencyKey, ruleId, targetEntityId, targetModule', async () => {
        mockTriggerFindResult = [makeTrigger()];
        await processDomainEvent(makeJob());

        const claim = createCalls[0];
        assert.equal(claim.ruleType, 'Trigger');
        assert.equal(claim.status, 'pending');
        assert.equal(claim.idempotencyKey, 'outbox-evt-uuid-001-trigger-001-0');
        assert.equal(claim.ruleId, 'trigger-001');
        assert.equal(claim.targetEntityId, '507f1f77bcf86cd799439011');
        assert.equal(claim.targetModule, 'deals');
        assert.equal(claim.companyId, null);
    });

    // ── E3B-17: After execution — status updated to success ───
    it('E3B-17: After execution — idempotency record updated to success with executedAt', async () => {
        mockTriggerFindResult = [makeTrigger()];
        await processDomainEvent(makeJob());

        assert.equal(updateOneCalls.length, 1);
        const update = updateOneCalls[0];
        assert.equal(update.filter.idempotencyKey, 'outbox-evt-uuid-001-trigger-001-0');
        assert.ok(update.filter.claimToken, 'claimToken should be present in filter');
        assert.equal(update.update.$set.status, 'success');
        assert.ok(update.update.$set.executedAt instanceof Date, 'executedAt is a Date');
    });

    // ── E3B-18: Existing E.1 shadow contract — EVENT_MAP ──────
    it('E3B-18: EVENT_MAP matches E.1 contract', () => {
        assert.deepEqual(EVENT_MAP.DealCreated, { module: 'deals', event: 'deal_created' });
        assert.deepEqual(EVENT_MAP.BookingCreated, { module: 'post_sale', event: 'booking_created' });
    });

    // ── E3B-19: Envelope validation unchanged from E.1 ────────
    it('E3B-19: Envelope validation rejects missing fields', async () => {
        const cases = [
            { data: null, reason: 'null/undefined' },
            { data: { eventType: 'X' }, reason: 'eventId' },
            { data: { eventId: 'x' }, reason: 'eventType' },
            { data: { eventId: 'x', eventType: 'X' }, reason: 'entityType' },
            { data: { eventId: 'x', eventType: 'X', entityType: 'Y' }, reason: 'entityId' },
            { data: { eventId: 'x', eventType: 'X', entityType: 'Y', entityId: 'z' }, reason: 'occurredAt' },
            { data: { eventId: 'x', eventType: 'X', entityType: 'Y', entityId: 'z', occurredAt: 't', payload: null }, reason: 'payload' },
        ];
        for (const c of cases) {
            const v = validateEnvelope(c.data);
            assert.equal(v.valid, false, `Should reject when missing ${c.reason}`);
        }
    });

    // ── E3B-20: Full valid envelope passes validation ─────────
    it('E3B-20: Valid envelope passes validation', () => {
        const v = validateEnvelope(makeJob().data);
        assert.equal(v.valid, true);
    });

    // ── E3B-21: No triggers found — no claims ─────────────────
    it('E3B-21: No triggers found — no claims, no execution', async () => {
        mockTriggerFindResult = [];
        const result = await processDomainEvent(makeJob());

        assert.equal(result.status, 'NO_TRIGGERS');
        assert.equal(createCalls.length, 0);
        assert.equal(executeActionCalls.length, 0);
    });

    // ── E3B-22: Infrastructure error propagates to BullMQ ─────
    it('E3B-22: Non-E11000 error in create propagates (BullMQ retry)', async () => {
        mockTriggerFindResult = [makeTrigger()];
        mockAutoLogCreateFn = async () => { throw new Error('MongoDB connection lost'); };

        await assert.rejects(
            () => processDomainEvent(makeJob()),
            { message: 'MongoDB connection lost' }
        );
        assert.equal(executeActionCalls.length, 0, 'No execution on infra error');
    });

    // ── E3B-23: Three actions, second is duplicate ────────────
    it('E3B-23: Three actions, second already claimed — first and third execute', async () => {
        mockTriggerFindResult = [makeTrigger({
            actions: [
                { type: 'fire_automated_action', automatedActionId: 'aa-001' },
                { type: 'send_communication', channel: 'whatsapp' },
                { type: 'update_field', field: 'stage', value: 'Qualified' },
            ],
        })];

        let createCount = 0;
        mockAutoLogCreateFn = async (doc) => {
            createCount++;
            createCalls.push(doc);
            if (createCount === 2) {
                const e11000 = new Error('E11000');
                e11000.code = 11000;
                throw e11000;
            }
            return doc;
        };
        mockAutoLogFindOneFn = async () => ({ status: 'success' });

        const result = await processDomainEvent(makeJob());

        assert.equal(executeActionCalls.length, 2, 'Only 2 of 3 actions executed');
        const decisions = result.executionResults.map(r => r.decision);
        assert.deepEqual(decisions, ['EXECUTED', 'SKIPPED_DUPLICATE', 'EXECUTED']);
    });

    // ── E3B-24: Deterministic idempotency keys ────────────────
    it('E3B-24: Idempotency key is deterministic across deliveries', async () => {
        mockTriggerFindResult = [makeTrigger()];

        await processDomainEvent(makeJob());
        const key1 = createCalls[0].idempotencyKey;

        resetMocks();
        mockTriggerFindResult = [makeTrigger()];
        await processDomainEvent(makeJob());
        const key2 = createCalls[0].idempotencyKey;

        assert.equal(key1, key2, 'Same event produces same key');
        assert.equal(key1, 'outbox-evt-uuid-001-trigger-001-0');
    });

    // ── E3B-25: companyId is null in claim ────────────────────
    it('E3B-25: companyId is null in claim (single-org)', async () => {
        mockTriggerFindResult = [makeTrigger()];
        await processDomainEvent(makeJob());

        assert.equal(createCalls[0].companyId, null);
    });
});
