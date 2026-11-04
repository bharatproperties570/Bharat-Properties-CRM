/**
 * Phase E.2 — Shadow Comparison Tests
 *
 * Test Specifications (E2-01 to E2-20):
 *   E2-01: DealCreated legacy/shadow equivalent — no trigger
 *   E2-02: DealCreated equivalent — matching trigger, identical condition result
 *   E2-03: DealCreated equivalent — nonmatching condition (both paths skip)
 *   E2-04: DealCreated multiple triggers — same order, same results
 *   E2-05: DealCreated priority ordering preserved (ascending)
 *   E2-06: DealCreated multiple actions enumerated identically
 *   E2-07: BookingCreated equivalent — no trigger
 *   E2-08: BookingCreated matching trigger
 *   E2-09: BookingCreated nonmatching condition
 *   E2-10: BookingCreated multiple triggers
 *   E2-11: companyId null/undefined compatibility (single-org equivalence)
 *   E2-12: Snapshot/live field comparison — outbox fields match entity
 *   E2-13: Missing snapshot field detected as classification C
 *   E2-14: Changed/divergent field detected as classification B
 *   E2-15: action execution NEVER occurs (no executeAction import)
 *   E2-16: fireEvent NEVER called (no fireEvent import)
 *   E2-17: AutomationLog is NEVER written
 *   E2-18: CRM entities are NEVER mutated
 *   E2-19: Condition on outbox-absent field → DIVERGENCE detected
 *   E2-20: BookingCreated has NO legacy fireEvent path (outbox-only)
 *
 * Test Type: Mocked behavioral tests using node:test
 * Framework: node:test + node:assert/strict
 * No live MongoDB. No live Redis. No production writes.
 *
 * CRITICAL KNOWN FINDING:
 *   DealCreated legacy path receives a FULL Deal Mongoose document (~50+ fields)
 *   DealCreated shadow path receives OutboxEvent.payload (10 fields)
 *   If Trigger conditions reference fields NOT in the Outbox payload
 *   (e.g. price, dealProbability, tags, location, etc.), the shadow path
 *   evaluateRules() result MAY differ because the field is absent/undefined.
 *   This is a DOCUMENTED MIGRATION RISK, not a bug.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Read source for static verification ─────────────────────────
const comparisonPath = resolve(import.meta.dirname, '../src/utils/shadowComparison.js');
const comparisonSource = readFileSync(comparisonPath, 'utf-8');
const workerPath = resolve(import.meta.dirname, '../src/workers/domainEventWorker.js');
const workerSource = readFileSync(workerPath, 'utf-8');

// ── Import comparison functions ─────────────────────────────────
import {
    evaluateLegacyPath,
    evaluateShadowPath,
    compareAutomationDecisions,
    buildDealOutboxPayload,
    buildBookingOutboxPayload,
    compareEntityFields,
} from '../src/utils/shadowComparison.js';

// ── Test Fixtures ───────────────────────────────────────────────

// Full Deal entity (simulates createdDeals[0] from Deal.create at L2125)
const fullDealEntity = {
    _id:            '507f1f77bcf86cd799439011',
    dealId:         'SELL-101-2026',
    stage:          'Open',
    projectName:    'Green Valley',
    block:          'A',
    unitNo:         '101',
    unitType:       '3BHK',
    propertyType:   'Apartment',
    location:       'Sector 45, Gurgaon',
    category:       'Residential',
    size:           1500,
    sizeUnit:       'sq.ft',
    price:          7500000,
    quotePrice:     7800000,
    inventoryId:    '507f1f77bcf86cd799439099',
    assignedTo:     '507f1f77bcf86cd799439055',
    source:         'Website',
    dealType:       'Registry case',
    dealProbability: 50,
    dealScore:       0,
    tags:           ['premium', 'corner'],
    isQualified:    null,
    status:         null,
    // companyId is NOT in Deal schema — undefined
    createdAt:      new Date('2026-10-03T01:30:00.000Z'),
};

// Outbox payload (replicates deal.controller.js L2203-2215)
const dealOutboxPayload = buildDealOutboxPayload(fullDealEntity);

// Full Booking entity (simulates savedBooking from Booking.create)
const fullBookingEntity = {
    _id:            '507f1f77bcf86cd799439022',
    applicationNo:  'BK-2026-001',
    dealId:         '507f1f77bcf86cd799439011',
    property:       '507f1f77bcf86cd799439099',
    lead:           '507f1f77bcf86cd799439033',
    salesAgent:     '507f1f77bcf86cd799439055',
    bookingDate:    new Date('2026-10-03T02:00:00.000Z'),
    status:         'Pending',
    type:           'Sale',
    totalDealAmount: 7500000,
    tokenAmount:    100000,
    // companyId NOT in Booking schema — undefined
    createdAt:      new Date('2026-10-03T02:00:00.000Z'),
};

const bookingOutboxPayload = buildBookingOutboxPayload(fullBookingEntity);

// ── Mock Trigger Factory ────────────────────────────────────────
function makeTrigger(overrides = {}) {
    return {
        _id:        'trigger-001',
        name:       'DealCreated Welcome',
        module:     'deals',
        event:      'deal_created',
        priority:   5,
        isActive:   true,
        conditions: {},  // empty = always matches
        actions:    [{ type: 'send_communication', channel: 'whatsapp' }],
        companyId:  null,
        ...overrides,
    };
}

function makeBookingTrigger(overrides = {}) {
    return {
        _id:        'trigger-booking-001',
        name:       'BookingCreated Welcome',
        module:     'post_sale',
        event:      'booking_created',
        priority:   5,
        isActive:   true,
        conditions: {},
        actions:    [{ type: 'send_communication', channel: 'whatsapp' }],
        companyId:  null,
        ...overrides,
    };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('Phase E.2 — Shadow Comparison (Legacy vs Domain Event)', () => {

    // ── E2-01: No triggers — both sides equivalent ──────────────
    it('E2-01: DealCreated — no triggers → legacy and shadow both produce empty results', () => {
        const triggers = [];
        const legacy = evaluateLegacyPath({
            moduleName: 'deals', eventName: 'deal_created',
            entityData: fullDealEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'DealCreated', outboxPayload: dealOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'DealCreated', eventId: 'evt-001', entityType: 'Deal',
            entityId: fullDealEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, true);
        assert.equal(cmp.differences.length, 0);
        assert.equal(legacy.totalTriggers, 0);
        assert.equal(shadow.totalTriggers, 0);
    });

    // ── E2-02: Matching trigger — equivalent ────────────────────
    it('E2-02: DealCreated — matching trigger with empty conditions → both paths fire', () => {
        const triggers = [makeTrigger()];
        const legacy = evaluateLegacyPath({
            moduleName: 'deals', eventName: 'deal_created',
            entityData: fullDealEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'DealCreated', outboxPayload: dealOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'DealCreated', eventId: 'evt-002', entityType: 'Deal',
            entityId: fullDealEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, true);
        assert.equal(legacy.triggers[0].conditionResult, true);
        assert.equal(shadow.triggers[0].conditionResult, true);
        assert.equal(legacy.triggers[0].decision, 'FIRE');
        assert.equal(shadow.triggers[0].decision, 'FIRE');
    });

    // ── E2-03: Non-matching condition — both skip ───────────────
    it('E2-03: DealCreated — condition on shared field (source != "Facebook") → both paths skip', () => {
        const triggers = [makeTrigger({
            conditions: { field: 'source', operator: '==', value: 'Facebook' },
        })];
        const legacy = evaluateLegacyPath({
            moduleName: 'deals', eventName: 'deal_created',
            entityData: fullDealEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'DealCreated', outboxPayload: dealOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'DealCreated', eventId: 'evt-003', entityType: 'Deal',
            entityId: fullDealEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, true);
        assert.equal(legacy.triggers[0].conditionResult, false);
        assert.equal(shadow.triggers[0].conditionResult, false);
    });

    // ── E2-04: Multiple triggers — same results ─────────────────
    it('E2-04: DealCreated — multiple triggers evaluated identically', () => {
        const triggers = [
            makeTrigger({ _id: 'trig-A', name: 'Trigger A', priority: 1 }),
            makeTrigger({ _id: 'trig-B', name: 'Trigger B', priority: 5,
                conditions: { field: 'source', operator: '==', value: 'Website' },
            }),
            makeTrigger({ _id: 'trig-C', name: 'Trigger C', priority: 10,
                conditions: { field: 'source', operator: '==', value: 'Referral' },
            }),
        ];
        const legacy = evaluateLegacyPath({
            moduleName: 'deals', eventName: 'deal_created',
            entityData: fullDealEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'DealCreated', outboxPayload: dealOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'DealCreated', eventId: 'evt-004', entityType: 'Deal',
            entityId: fullDealEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, true);
        // A: matches (empty conditions), B: matches (source=Website), C: skips (source≠Referral)
        assert.equal(legacy.triggers[0].decision, 'FIRE');
        assert.equal(legacy.triggers[1].decision, 'FIRE');
        assert.equal(legacy.triggers[2].decision, 'SKIP');
        assert.equal(shadow.triggers[2].decision, 'SKIP');
    });

    // ── E2-05: Priority ordering preserved ──────────────────────
    it('E2-05: DealCreated — priority ordering is preserved (ascending)', () => {
        const triggers = [
            makeTrigger({ _id: 'trig-low', name: 'Low Priority', priority: 1 }),
            makeTrigger({ _id: 'trig-mid', name: 'Mid Priority', priority: 5 }),
            makeTrigger({ _id: 'trig-high', name: 'High Priority', priority: 10 }),
        ];
        const legacy = evaluateLegacyPath({
            moduleName: 'deals', eventName: 'deal_created',
            entityData: fullDealEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'DealCreated', outboxPayload: dealOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'DealCreated', eventId: 'evt-005', entityType: 'Deal',
            entityId: fullDealEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, true);
        assert.equal(cmp.legacy.triggers[0].triggerId, 'trig-low');
        assert.equal(cmp.legacy.triggers[1].triggerId, 'trig-mid');
        assert.equal(cmp.legacy.triggers[2].triggerId, 'trig-high');
    });

    // ── E2-06: Multiple actions enumerated ──────────────────────
    it('E2-06: DealCreated — multiple actions are enumerated identically', () => {
        const triggers = [makeTrigger({
            actions: [
                { type: 'send_communication', channel: 'whatsapp' },
                { type: 'start_sequence', sequenceId: 'seq-001' },
                { type: 'send_notification', target: 'owner' },
            ],
        })];
        const legacy = evaluateLegacyPath({
            moduleName: 'deals', eventName: 'deal_created',
            entityData: fullDealEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'DealCreated', outboxPayload: dealOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'DealCreated', eventId: 'evt-006', entityType: 'Deal',
            entityId: fullDealEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, true);
        assert.equal(legacy.totalActions, 3);
        assert.equal(shadow.totalActions, 3);
        assert.deepStrictEqual(
            cmp.legacy.triggers[0].actionTypes,
            ['send_communication', 'start_sequence', 'send_notification']
        );
        assert.deepStrictEqual(
            cmp.shadow.triggers[0].actionTypes,
            cmp.legacy.triggers[0].actionTypes
        );
    });

    // ── E2-07: BookingCreated no triggers ────────────────────────
    it('E2-07: BookingCreated — no triggers → both sides equivalent', () => {
        const triggers = [];
        const legacy = evaluateLegacyPath({
            moduleName: 'post_sale', eventName: 'booking_created',
            entityData: fullBookingEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'BookingCreated', outboxPayload: bookingOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'BookingCreated', eventId: 'evt-007', entityType: 'Booking',
            entityId: fullBookingEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, true);
    });

    // ── E2-08: BookingCreated matching trigger ──────────────────
    it('E2-08: BookingCreated — matching trigger → equivalent', () => {
        const triggers = [makeBookingTrigger()];
        const legacy = evaluateLegacyPath({
            moduleName: 'post_sale', eventName: 'booking_created',
            entityData: fullBookingEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'BookingCreated', outboxPayload: bookingOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'BookingCreated', eventId: 'evt-008', entityType: 'Booking',
            entityId: fullBookingEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, true);
        assert.equal(legacy.triggers[0].decision, 'FIRE');
        assert.equal(shadow.triggers[0].decision, 'FIRE');
    });

    // ── E2-09: BookingCreated nonmatching condition ──────────────
    it('E2-09: BookingCreated — condition on shared field (status != "Confirmed") → both skip', () => {
        const triggers = [makeBookingTrigger({
            conditions: { field: 'status', operator: '==', value: 'Confirmed' },
        })];
        const legacy = evaluateLegacyPath({
            moduleName: 'post_sale', eventName: 'booking_created',
            entityData: fullBookingEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'BookingCreated', outboxPayload: bookingOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'BookingCreated', eventId: 'evt-009', entityType: 'Booking',
            entityId: fullBookingEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, true);
        assert.equal(legacy.triggers[0].conditionResult, false);
        assert.equal(shadow.triggers[0].conditionResult, false);
    });

    // ── E2-10: BookingCreated multiple triggers ─────────────────
    it('E2-10: BookingCreated — multiple triggers evaluated identically', () => {
        const triggers = [
            makeBookingTrigger({ _id: 'bt-A', name: 'Booking A', priority: 1 }),
            makeBookingTrigger({ _id: 'bt-B', name: 'Booking B', priority: 5,
                conditions: { field: 'type', operator: '==', value: 'Sale' },
            }),
        ];
        const legacy = evaluateLegacyPath({
            moduleName: 'post_sale', eventName: 'booking_created',
            entityData: fullBookingEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'BookingCreated', outboxPayload: bookingOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'BookingCreated', eventId: 'evt-010', entityType: 'Booking',
            entityId: fullBookingEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, true);
        assert.equal(legacy.triggers[0].decision, 'FIRE');
        assert.equal(legacy.triggers[1].decision, 'FIRE');
    });

    // ── E2-11: companyId null/undefined compatibility ───────────
    it('E2-11: companyId undefined (legacy) vs null (shadow) is NOT flagged as difference', () => {
        const triggers = [makeTrigger()];
        const legacy = evaluateLegacyPath({
            moduleName: 'deals', eventName: 'deal_created',
            entityData: fullDealEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'DealCreated', outboxPayload: dealOutboxPayload, triggers,
        });
        const cmp = compareAutomationDecisions({
            eventType: 'DealCreated', eventId: 'evt-011', entityType: 'Deal',
            entityId: fullDealEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        // undefined (legacy) and null (shadow) are treated as equivalent in single-org
        const companyIdDiff = cmp.differences.find(d => d.type === 'COMPANY_ID_MISMATCH');
        assert.equal(companyIdDiff, undefined, 'No companyId mismatch for undefined vs null');
        assert.ok(cmp.companyIdNote.includes('single-org'));
    });

    // ── E2-12: Snapshot/live field comparison — matching fields ──
    it('E2-12: Fields present in BOTH entity and outbox match (classification A)', () => {
        const sharedFields = ['dealId', 'stage', 'projectName', 'block', 'unitNo', 'source', 'dealType'];
        const fieldComparison = compareEntityFields(fullDealEntity, dealOutboxPayload, sharedFields);

        for (const result of fieldComparison) {
            assert.equal(result.classification, 'A',
                `Field "${result.field}" should be classification A (present identically)`);
            assert.equal(result.inOutbox, true);
            assert.equal(result.risk, 'NONE');
        }
    });

    // ── E2-13: Missing snapshot field — classification C ─────────
    it('E2-13: Field on live entity but NOT in outbox → classification C, HIGH risk', () => {
        const liveOnlyFields = ['price', 'location', 'dealProbability', 'tags', 'unitType'];
        const fieldComparison = compareEntityFields(fullDealEntity, dealOutboxPayload, liveOnlyFields);

        for (const result of fieldComparison) {
            assert.equal(result.classification, 'C',
                `Field "${result.field}" should be classification C (live-only)`);
            assert.equal(result.inOutbox, false);
            assert.equal(result.risk, 'HIGH');
        }
    });

    // ── E2-14: Structurally different field — classification B ───
    it('E2-14: Field present in both but with different values → classification B', () => {
        // Simulate a field that changes after creation (e.g., stage changed post-creation)
        const modifiedEntity = { ...fullDealEntity, stage: 'Negotiation' };
        const fieldComparison = compareEntityFields(modifiedEntity, dealOutboxPayload, ['stage']);

        assert.equal(fieldComparison[0].classification, 'B');
        assert.equal(fieldComparison[0].risk, 'MEDIUM');
        assert.equal(fieldComparison[0].liveValue, 'Negotiation');
        assert.equal(fieldComparison[0].snapshotValue, 'Open');
    });

    // ── E2-15: executeAction NEVER called ────────────────────────
    it('E2-15: shadowComparison.js does NOT import or call executeAction', () => {
        // The comparison utility must never execute actions
        const lines = comparisonSource.split('\n');
        const callLines = lines.filter(l =>
            l.includes('executeAction(') &&
            !l.trim().startsWith('*') &&
            !l.trim().startsWith('//') &&
            !l.trim().startsWith('/**')
        );
        assert.equal(callLines.length, 0,
            'No non-comment line in shadowComparison.js should invoke executeAction()');
        // It uses evaluateRules for condition evaluation
        assert.ok(comparisonSource.includes('evaluateRules'),
            'Must use evaluateRules for condition evaluation');
    });

    // ── E2-16: fireEvent NEVER called ───────────────────────────
    it('E2-16: Neither shadowComparison.js nor domainEventWorker.js call fireEvent', () => {
        const compLines = comparisonSource.split('\n');
        const workerLines = workerSource.split('\n');

        const compFireEvent = compLines.filter(l =>
            l.includes('fireEvent(') &&
            !l.trim().startsWith('*') && !l.trim().startsWith('//'));
        const workerFireEvent = workerLines.filter(l =>
            l.includes('fireEvent(') &&
            !l.trim().startsWith('*') && !l.trim().startsWith('//'));

        assert.equal(compFireEvent.length, 0, 'shadowComparison must not call fireEvent');
        assert.equal(workerFireEvent.length, 0, 'domainEventWorker must not call fireEvent');
    });

    // ── E2-17: shadowComparison untouched, worker upgraded (E.3-B) ──
    it('E2-17: shadowComparison does not import AutomationLog; worker imports it (Phase E.3-B)', () => {
        assert.ok(!comparisonSource.includes('import AutomationLog'),
            'shadowComparison must not import AutomationLog');
        assert.ok(!comparisonSource.includes('AutomationLog.create'),
            'shadowComparison must not write AutomationLog');
        // Phase E.3-B graduated domainEventWorker to execution mode with atomic claims.
        assert.ok(workerSource.includes('import AutomationLog'),
            'domainEventWorker must import AutomationLog (Phase E.3-B atomic claim)');
    });

    // ── E2-18: CRM entities untouched ───────────────────────────
    it('E2-18: Comparison utility does not import CRM entity models', () => {
        const forbidden = ['import Deal ', 'import Booking ', 'import Lead ',
            'import Inventory ', 'import Activity ', 'import Contact '];
        for (const pat of forbidden) {
            assert.ok(!comparisonSource.includes(pat),
                `shadowComparison.js must not contain "${pat}"`);
        }
    });

    // ── E2-19: Condition on outbox-absent field → DIVERGENCE ────
    it('E2-19: Trigger condition on live-only field (price) → legacy matches, shadow does not', () => {
        // This is the CRITICAL migration risk test
        const triggers = [makeTrigger({
            // Condition: price > 5000000 — "price" is NOT in the Outbox payload
            conditions: { field: 'price', operator: '>', value: 5000000 },
        })];

        const legacy = evaluateLegacyPath({
            moduleName: 'deals', eventName: 'deal_created',
            entityData: fullDealEntity, companyId: undefined, triggers,
        });
        const shadow = evaluateShadowPath({
            eventType: 'DealCreated', outboxPayload: dealOutboxPayload, triggers,
        });

        // Legacy has price=7500000, so condition matches
        // Shadow has no price field, so evaluateRules returns false
        // This is a KNOWN DIVERGENCE — not a bug, but a migration risk.
        assert.equal(legacy.triggers[0].conditionResult, true,
            'Legacy path sees price=7500000 > 5000000 → true');
        assert.equal(shadow.triggers[0].conditionResult, false,
            'Shadow path has no price field → evaluateRules returns false');

        const cmp = compareAutomationDecisions({
            eventType: 'DealCreated', eventId: 'evt-019', entityType: 'Deal',
            entityId: fullDealEntity._id, legacyResult: legacy, shadowResult: shadow,
        });

        assert.equal(cmp.equivalent, false, 'Divergence must be detected');
        const condDiff = cmp.differences.find(d => d.type === 'CONDITION_RESULT_MISMATCH');
        assert.ok(condDiff, 'CONDITION_RESULT_MISMATCH must be present');
        assert.equal(condDiff.legacy, true);
        assert.equal(condDiff.shadow, false);
    });

    // ── E2-20: BookingCreated has NO legacy fireEvent ───────────
    it('E2-20: BookingCreated has NO legacy fireEvent() call — documented as outbox-only event', () => {
        // Static verification of booking.controller.js
        const bookingCtrlPath = resolve(import.meta.dirname, '../controllers/booking.controller.js');
        const bookingSource = readFileSync(bookingCtrlPath, 'utf-8');

        // Find non-comment fireEvent calls
        const lines = bookingSource.split('\n');
        const fireEventCalls = lines.filter(l =>
            l.includes('fireEvent(') &&
            !l.trim().startsWith('*') &&
            !l.trim().startsWith('//') &&
            !l.includes('// ') // skip inline comments that mention fireEvent
        );

        assert.equal(fireEventCalls.length, 0,
            'booking.controller.js has NO active fireEvent() call — BookingCreated is outbox-only');
    });
});
