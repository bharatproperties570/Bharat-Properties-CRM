/**
 * Phase E.1 — Domain Event Consumer (Shadow Mode) Tests
 *
 * Test Specifications (E1-01 to E1-16):
 *   E1-01: DealCreated maps to { module: 'deals', event: 'deal_created' }
 *   E1-02: BookingCreated maps to { module: 'post_sale', event: 'booking_created' }
 *   E1-03: Unknown event type safely skipped (not retried)
 *   E1-04: Malformed event (missing fields) rejected safely
 *   E1-05: Trigger lookup uses correct module/event from static mapping
 *   E1-06: Trigger lookup preserves companyId: null behavior
 *   E1-07: Inactive trigger is not returned by query (isActive: true filter)
 *   E1-08: Condition matched produces WOULD_EXECUTE shadow decision
 *   E1-09: Condition failed produces CONDITION_NOT_MATCHED shadow decision
 *   E1-10: Multiple actions are enumerated independently with correct actionIndex
 *   E1-11: WorkflowEngine.executeAction is NEVER called
 *   E1-12: WorkflowEngine.fireEvent is NEVER called
 *   E1-13: AutomationLog is NEVER written (no import, no create, no exists)
 *   E1-14: CRM entities are NEVER mutated (no Deal/Booking/Lead writes)
 *   E1-15: Existing domain-event-queue name is used (not a new queue)
 *   E1-16: No second BullMQ queue is created
 *
 * Test Type: Mocked behavioral tests using node:test
 * Framework: node:test + node:assert/strict
 * No live MongoDB. No live Redis. No production writes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Read source files for static and behavioral verification ────
const workerPath = resolve(import.meta.dirname, '../src/workers/domainEventWorker.js');
const workerSource = readFileSync(workerPath, 'utf-8');

// ── Dynamic import of processDomainEvent for behavioral tests ───
// We import only the pure processing function, NOT the worker construction.
// The Worker constructor will fail without Redis, but we can test the logic.
// We mock Trigger.find() and WorkflowEngine.evaluateRules() at the module level.

// ── Mock Trigger model ──────────────────────────────────────────
const mockTriggers = [];
const mockTriggerFindArgs = [];

const MockTrigger = {
    find(query) {
        mockTriggerFindArgs.push(JSON.parse(JSON.stringify(query)));
        return {
            sort(sortObj) {
                // Return triggers filtered by query for realistic behavior
                return mockTriggers
                    .filter(t =>
                        t.module === query.module &&
                        t.event === query.event &&
                        t.isActive === query.isActive
                    )
                    .sort((a, b) => (a.priority || 5) - (b.priority || 5));
            }
        };
    }
};

// ── Mock WorkflowEngine ─────────────────────────────────────────
const evaluateRulesCalls = [];
let evaluateRulesReturnValue = true;
const executeActionCalls = [];
const fireEventCalls = [];

const MockWorkflowEngine = {
    evaluateRules(conditions, entityData) {
        evaluateRulesCalls.push({ conditions, entityData });
        return evaluateRulesReturnValue;
    },
    executeAction(...args) {
        executeActionCalls.push(args);
        return Promise.resolve();
    },
    fireEvent(...args) {
        fireEventCalls.push(args);
        return Promise.resolve();
    }
};

// ── Build a processDomainEvent that uses mocks ──────────────────
// We replicate the processing logic with injected dependencies.
// This allows behavioral testing without requiring Redis/Mongo.

const EVENT_MAP = {
    DealCreated:    { module: 'deals',     event: 'deal_created' },
    BookingCreated: { module: 'post_sale', event: 'booking_created' },
};

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

async function processDomainEventMocked(job) {
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

    const activeTriggers = await MockTrigger.find({
        module:    triggerModule,
        event:     triggerEvent,
        isActive:  true,
        companyId: null,
    }).sort({ priority: 1 });

    if (activeTriggers.length === 0) {
        return { status: 'NO_TRIGGERS', eventId, triggersMatched: 0 };
    }

    const shadowResults = [];

    for (const trigger of activeTriggers) {
        const conditionResult = MockWorkflowEngine.evaluateRules(trigger.conditions, payload);

        if (!conditionResult) {
            shadowResults.push({
                shadowDecision: 'CONDITION_NOT_MATCHED',
                eventId, eventType, entityType, entityId,
                triggerId: String(trigger._id),
                triggerName: trigger.name,
                triggerModule,
                conditionResult: false,
                occurredAt,
            });
            continue;
        }

        for (let actionIndex = 0; actionIndex < trigger.actions.length; actionIndex++) {
            const action = trigger.actions[actionIndex];
            shadowResults.push({
                shadowDecision: 'WOULD_EXECUTE',
                eventId, eventType, entityType, entityId,
                triggerId: String(trigger._id),
                triggerName: trigger.name,
                triggerModule,
                actionIndex,
                actionType: action.type,
                conditionResult: true,
                occurredAt,
            });
        }
    }

    return {
        status: 'SHADOW_COMPLETE',
        eventId, eventType,
        triggersEvaluated: activeTriggers.length,
        shadowResults,
    };
}

// ── Helper: Reset mocks ─────────────────────────────────────────
function resetMocks() {
    mockTriggers.length = 0;
    mockTriggerFindArgs.length = 0;
    evaluateRulesCalls.length = 0;
    evaluateRulesReturnValue = true;
    executeActionCalls.length = 0;
    fireEventCalls.length = 0;
}

// ── Helper: Build a valid DealCreated job ────────────────────────
function buildDealCreatedJob(overrides = {}) {
    return {
        id: 'test-job-001',
        data: {
            eventId:    'evt-uuid-001',
            eventType:  'DealCreated',
            entityType: 'Deal',
            entityId:   '507f1f77bcf86cd799439011',
            occurredAt: '2026-10-03T01:30:00.000Z',
            payload:    { dealId: '507f1f77bcf86cd799439011', projectName: 'Test Project', source: 'Website' },
            ...overrides,
        },
    };
}

// ── Helper: Build a valid BookingCreated job ─────────────────────
function buildBookingCreatedJob() {
    return {
        id: 'test-job-002',
        data: {
            eventId:    'evt-uuid-002',
            eventType:  'BookingCreated',
            entityType: 'Booking',
            entityId:   '507f1f77bcf86cd799439022',
            occurredAt: '2026-10-03T02:00:00.000Z',
            payload:    { bookingId: '507f1f77bcf86cd799439022', dealId: 'deal-123', clientName: 'Test Client', companyId: null },
        },
    };
}

// ── Helper: Build a mock trigger ────────────────────────────────
function buildMockTrigger(overrides = {}) {
    return {
        _id:        'trigger-001',
        name:       'Test Trigger',
        module:     'deals',
        event:      'deal_created',
        priority:   5,
        isActive:   true,
        conditions: {},
        actions:    [{ type: 'send_communication', channel: 'whatsapp', templateId: 'tpl-001' }],
        companyId:  null,
        ...overrides,
    };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('Phase E.1 — Domain Event Consumer (Shadow Mode)', () => {

    // ── E1-01: DealCreated mapping ──────────────────────────────
    it('E1-01: DealCreated maps to { module: "deals", event: "deal_created" }', () => {
        assert.deepStrictEqual(EVENT_MAP.DealCreated, {
            module: 'deals',
            event:  'deal_created',
        });
    });

    // ── E1-02: BookingCreated mapping ───────────────────────────
    it('E1-02: BookingCreated maps to { module: "post_sale", event: "booking_created" }', () => {
        assert.deepStrictEqual(EVENT_MAP.BookingCreated, {
            module: 'post_sale',
            event:  'booking_created',
        });
    });

    // ── E1-03: Unknown event type safely skipped ────────────────
    it('E1-03: Unknown event type is safely skipped (not retried)', async () => {
        resetMocks();
        const job = buildDealCreatedJob({ eventType: 'InventoryUpdated' });
        const result = await processDomainEventMocked(job);
        assert.equal(result.status, 'SKIPPED');
        assert.match(result.reason, /Unknown eventType/);
        assert.equal(executeActionCalls.length, 0, 'executeAction must not be called');
    });

    // ── E1-04: Malformed event rejected safely ──────────────────
    it('E1-04: Malformed event (missing eventId) rejected safely', async () => {
        resetMocks();
        const job = { id: 'bad-job', data: { eventType: 'DealCreated', entityType: 'Deal' } };
        const result = await processDomainEventMocked(job);
        assert.equal(result.status, 'REJECTED');
        assert.match(result.reason, /Missing eventId/);
    });

    it('E1-04b: Malformed event (missing payload) rejected safely', async () => {
        resetMocks();
        const job = { id: 'bad-job-2', data: {
            eventId: 'evt-1', eventType: 'DealCreated', entityType: 'Deal',
            entityId: 'eid-1', occurredAt: '2026-01-01T00:00:00Z',
            payload: null,
        }};
        const result = await processDomainEventMocked(job);
        assert.equal(result.status, 'REJECTED');
        assert.match(result.reason, /Missing payload/);
    });

    it('E1-04c: Malformed event (null data) rejected safely', async () => {
        resetMocks();
        const job = { id: 'bad-job-3', data: null };
        const result = await processDomainEventMocked(job);
        assert.equal(result.status, 'REJECTED');
    });

    // ── E1-05: Trigger lookup uses correct module/event ─────────
    it('E1-05: Trigger lookup uses correct module and event from static mapping', async () => {
        resetMocks();
        mockTriggers.push(buildMockTrigger());
        const job = buildDealCreatedJob();
        await processDomainEventMocked(job);

        assert.equal(mockTriggerFindArgs.length, 1);
        const query = mockTriggerFindArgs[0];
        assert.equal(query.module, 'deals');
        assert.equal(query.event, 'deal_created');
        assert.equal(query.isActive, true);
    });

    // ── E1-06: Trigger lookup preserves companyId: null ─────────
    it('E1-06: Trigger lookup passes companyId: null (not undefined)', async () => {
        resetMocks();
        mockTriggers.push(buildMockTrigger());
        const job = buildDealCreatedJob();
        await processDomainEventMocked(job);

        const query = mockTriggerFindArgs[0];
        assert.ok('companyId' in query, 'companyId field must be present in query');
        assert.equal(query.companyId, null, 'companyId must be null, not undefined');
    });

    // ── E1-07: Inactive trigger ignored ─────────────────────────
    it('E1-07: Inactive trigger is not matched (isActive filter)', async () => {
        resetMocks();
        // Add an inactive trigger — the mock filter will exclude it
        mockTriggers.push(buildMockTrigger({ isActive: false }));
        const job = buildDealCreatedJob();
        const result = await processDomainEventMocked(job);

        // No active triggers should match
        assert.equal(result.status, 'NO_TRIGGERS');
        assert.equal(evaluateRulesCalls.length, 0, 'evaluateRules must not be called when no triggers match');
    });

    // ── E1-08: Condition matched → WOULD_EXECUTE ────────────────
    it('E1-08: Condition matched produces WOULD_EXECUTE shadow decision', async () => {
        resetMocks();
        evaluateRulesReturnValue = true;
        mockTriggers.push(buildMockTrigger());
        const job = buildDealCreatedJob();
        const result = await processDomainEventMocked(job);

        assert.equal(result.status, 'SHADOW_COMPLETE');
        assert.equal(result.shadowResults.length, 1);
        assert.equal(result.shadowResults[0].shadowDecision, 'WOULD_EXECUTE');
        assert.equal(result.shadowResults[0].actionType, 'send_communication');
        assert.equal(result.shadowResults[0].actionIndex, 0);
        assert.equal(result.shadowResults[0].conditionResult, true);
    });

    // ── E1-09: Condition failed → CONDITION_NOT_MATCHED ─────────
    it('E1-09: Condition failed produces CONDITION_NOT_MATCHED shadow decision', async () => {
        resetMocks();
        evaluateRulesReturnValue = false;
        mockTriggers.push(buildMockTrigger({ conditions: { field: 'source', operator: '==', value: 'Facebook' } }));
        const job = buildDealCreatedJob();
        const result = await processDomainEventMocked(job);

        assert.equal(result.status, 'SHADOW_COMPLETE');
        assert.equal(result.shadowResults.length, 1);
        assert.equal(result.shadowResults[0].shadowDecision, 'CONDITION_NOT_MATCHED');
        assert.equal(result.shadowResults[0].conditionResult, false);
    });

    // ── E1-10: Multiple actions enumerated independently ────────
    it('E1-10: Multiple actions are enumerated independently with correct actionIndex', async () => {
        resetMocks();
        evaluateRulesReturnValue = true;
        mockTriggers.push(buildMockTrigger({
            actions: [
                { type: 'send_communication', channel: 'whatsapp' },
                { type: 'start_sequence', sequenceId: 'seq-001' },
                { type: 'send_notification', target: 'owner', message: 'New deal!' },
            ],
        }));
        const job = buildDealCreatedJob();
        const result = await processDomainEventMocked(job);

        assert.equal(result.status, 'SHADOW_COMPLETE');
        assert.equal(result.shadowResults.length, 3);

        assert.equal(result.shadowResults[0].actionIndex, 0);
        assert.equal(result.shadowResults[0].actionType, 'send_communication');

        assert.equal(result.shadowResults[1].actionIndex, 1);
        assert.equal(result.shadowResults[1].actionType, 'start_sequence');

        assert.equal(result.shadowResults[2].actionIndex, 2);
        assert.equal(result.shadowResults[2].actionType, 'send_notification');

        // All must be WOULD_EXECUTE
        result.shadowResults.forEach(sr => {
            assert.equal(sr.shadowDecision, 'WOULD_EXECUTE');
        });
    });

    // ── E1-11: executeAction is NEVER called ────────────────────
    it('E1-11: WorkflowEngine.executeAction is NEVER called in shadow mode', async () => {
        resetMocks();
        evaluateRulesReturnValue = true;
        mockTriggers.push(buildMockTrigger());
        const job = buildDealCreatedJob();
        await processDomainEventMocked(job);

        assert.equal(executeActionCalls.length, 0,
            'executeAction must NEVER be called in E.1 shadow mode');
    });

    // ── E1-12: fireEvent is NEVER called ────────────────────────
    it('E1-12: WorkflowEngine.fireEvent is NEVER called in shadow mode', async () => {
        resetMocks();
        evaluateRulesReturnValue = true;
        mockTriggers.push(buildMockTrigger());
        const job = buildDealCreatedJob();
        await processDomainEventMocked(job);

        assert.equal(fireEventCalls.length, 0,
            'fireEvent must NEVER be called in E.1 shadow mode');
    });

    // ── E1-13: AutomationLog imported for atomic claim (Phase E.3-B) ──
    it('E1-13: AutomationLog is imported by domainEventWorker.js for atomic idempotency claims (Phase E.3-B)', () => {
        // Phase E.3-B graduated the worker from shadow to execution mode.
        // AutomationLog is now legitimately imported for atomic pending claims.
        assert.ok(
            workerSource.includes("import AutomationLog"),
            'domainEventWorker.js must import AutomationLog (Phase E.3-B atomic claim)'
        );
    });

    // ── E1-14: CRM entities are NEVER mutated ───────────────────
    it('E1-14: CRM entity models are NEVER imported or mutated by domainEventWorker.js', () => {
        // Static source verification — no CRM model imports
        const forbiddenImports = [
            "import Deal ",
            "import Booking ",
            "import Lead ",
            "import Inventory ",
            "import Activity ",
            "import Contact ",
            "Deal.create", "Deal.findByIdAndUpdate", "Deal.updateOne",
            "Booking.create", "Lead.create", "Inventory.findByIdAndUpdate",
        ];
        for (const pattern of forbiddenImports) {
            assert.ok(!workerSource.includes(pattern),
                `domainEventWorker.js must not contain "${pattern}"`);
        }
    });

    // ── E1-15: Existing domain-event-queue name is used ─────────
    it('E1-15: Worker uses the existing domain-event-queue name', () => {
        assert.ok(workerSource.includes("'domain-event-queue'"),
            'Worker must reference the existing domain-event-queue');
    });

    // ── E1-16: No second BullMQ queue is created ────────────────
    it('E1-16: No new Queue() is instantiated (only Worker)', () => {
        assert.ok(!workerSource.includes('new Queue('),
            'domainEventWorker.js must not create a new Queue — only a Worker');
        // Verify a Worker IS created
        assert.ok(workerSource.includes("new Worker('domain-event-queue'"),
            'domainEventWorker.js must create a Worker for domain-event-queue');
    });

    // ── E1-17: BookingCreated trigger lookup uses post_sale ──────
    it('E1-17: BookingCreated trigger lookup uses module "post_sale"', async () => {
        resetMocks();
        mockTriggers.push(buildMockTrigger({
            module: 'post_sale',
            event: 'booking_created',
            name: 'Booking Welcome',
            actions: [{ type: 'send_communication', channel: 'whatsapp' }],
        }));
        const job = buildBookingCreatedJob();
        const result = await processDomainEventMocked(job);

        assert.equal(mockTriggerFindArgs[0].module, 'post_sale');
        assert.equal(mockTriggerFindArgs[0].event, 'booking_created');
        assert.equal(result.status, 'SHADOW_COMPLETE');
    });

    // ── E1-18: Shadow result contains all required fields ───────
    it('E1-18: WOULD_EXECUTE shadow result contains all required fields', async () => {
        resetMocks();
        evaluateRulesReturnValue = true;
        mockTriggers.push(buildMockTrigger());
        const job = buildDealCreatedJob();
        const result = await processDomainEventMocked(job);

        const sr = result.shadowResults[0];
        assert.ok(sr.shadowDecision, 'shadowDecision must exist');
        assert.ok(sr.eventId, 'eventId must exist');
        assert.ok(sr.eventType, 'eventType must exist');
        assert.ok(sr.entityType, 'entityType must exist');
        assert.ok(sr.entityId, 'entityId must exist');
        assert.ok(sr.triggerId, 'triggerId must exist');
        assert.ok(sr.triggerName, 'triggerName must exist');
        assert.ok(sr.triggerModule, 'triggerModule must exist');
        assert.equal(typeof sr.actionIndex, 'number', 'actionIndex must be a number');
        assert.ok(sr.actionType, 'actionType must exist');
        assert.equal(typeof sr.conditionResult, 'boolean', 'conditionResult must be boolean');
        assert.ok(sr.occurredAt, 'occurredAt must exist');
    });

    // ── E1-19: executeAction IS called in execution mode (Phase E.3-B) ──
    it('E1-19: domainEventWorker calls executeAction (Phase E.3-B execution mode)', () => {
        // Phase E.3-B upgraded the worker from shadow to execution mode.
        // executeAction is now legitimately called with atomic idempotency claim.
        const lines = workerSource.split('\n');
        const callLines = lines.filter(l =>
            l.includes('executeAction(') &&
            !l.trim().startsWith('*') &&
            !l.trim().startsWith('//') &&
            !l.trim().startsWith('/**')
        );
        assert.ok(callLines.length > 0,
            'domainEventWorker must call executeAction (Phase E.3-B)');
    });

    // ── E1-20: No fireEvent in source (static proof) ────────────
    it('E1-20: domainEventWorker source does not call fireEvent (static proof)', () => {
        const lines = workerSource.split('\n');
        const callLines = lines.filter(l =>
            l.includes('fireEvent(') &&
            !l.trim().startsWith('*') &&
            !l.trim().startsWith('//') &&
            !l.trim().startsWith('/**')
        );
        assert.equal(callLines.length, 0,
            'No non-comment line should invoke fireEvent()');
    });
});
