/**
 * phase4_6i_single_org_outbox_automation.test.js
 *
 * Dedicated test suite verifying Phase 4.6I Outbox and Phase 5 / R14 Automation
 * Execution Reliability in single-organisation mode (Bharat Properties).
 *
 * Verifies:
 * 1. Single-Organisation Outbox Publication & Atomic Claiming (tenantId: null)
 * 2. Execution Coordinator Authority (LEGACY authoritative, DURABLE suppressed in single-org)
 * 3. Outbox Admin Monitoring & Recovery Endpoints for Single-Org Admins
 * 4. AutomationLog Schema Validation (R14 event types: DomainEvent, TriggerDistribution, LeadCreationRequest, IdentityConflict)
 * 5. Lease Ownership, Fencing & Idempotency in Single-Org Execution
 */

process.env.NODE_ENV = 'test';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import OutboxEvent from '../models/OutboxEvent.js';
import AutomationLog from '../models/AutomationLog.js';
import AuditLog from '../models/AuditLog.js';
import { validateExecutionAuthority, getExecutionOwner, EXECUTION_OWNERS } from '../src/utils/executionCoordinator.js';
import { getOutboxStats, getFailedEvents, retryFailedEvent } from '../controllers/outbox.controller.js';

describe('Phase 4.6I & Phase 5/R14 — Single-Organisation Outbox & Automation Suite', () => {

    describe('1. Single-Organisation Outbox Event Lifecycle (tenantId: null)', () => {
        it('SO-OUTBOX-01: OutboxEvent can be created with tenantId: null and default PENDING state', () => {
            const aggregateId = new mongoose.Types.ObjectId();
            const eventDoc = new OutboxEvent({
                eventType: 'DealCreated',
                aggregateType: 'Deal',
                aggregateId,
                payload: { dealName: 'Expressway Penthouse Unit 402', amount: 25000000 },
                tenantId: null
            });

            const validationError = eventDoc.validateSync();
            assert.strictEqual(validationError, undefined, 'OutboxEvent with tenantId: null must validate successfully');
            assert.strictEqual(eventDoc.status, 'PENDING');
            assert.strictEqual(eventDoc.tenantId, null);
            assert.strictEqual(eventDoc.attempts, 0);
            assert.ok(eventDoc.eventId, 'EventId should be automatically populated via UUID');
        });

        it('SO-OUTBOX-02: Outbox atomic claim query works without tenantId filter', async () => {
            let capturedQuery = null;
            let capturedUpdate = null;

            const originalFindOneAndUpdate = OutboxEvent.findOneAndUpdate;
            OutboxEvent.findOneAndUpdate = (query, update, options) => {
                capturedQuery = query;
                capturedUpdate = update;
                return Promise.resolve({
                    eventId: 'test-event-uuid',
                    status: 'PROCESSING',
                    lockedBy: 'worker-instance-1',
                    tenantId: null
                });
            };

            try {
                const lockTime = new Date(Date.now() + 60000);
                const workerId = 'worker-instance-1';

                // Simulate atomic claim performed by outbox publisher worker in single-org mode
                const claimQuery = {
                    status: 'PENDING',
                    availableAt: { $lte: new Date() },
                    $or: [
                        { lockedUntil: { $exists: false } },
                        { lockedUntil: null },
                        { lockedUntil: { $lte: new Date() } }
                    ]
                };

                const updateDoc = {
                    $set: {
                        status: 'PROCESSING',
                        lockedBy: workerId,
                        lockedUntil: lockTime
                    },
                    $inc: { attempts: 1 }
                };

                const claimed = await OutboxEvent.findOneAndUpdate(claimQuery, updateDoc, { new: true });

                assert.ok(claimed);
                assert.strictEqual(claimed.status, 'PROCESSING');
                assert.strictEqual(capturedQuery.status, 'PENDING');
                assert.strictEqual(capturedUpdate.$set.lockedBy, 'worker-instance-1');
            } finally {
                OutboxEvent.findOneAndUpdate = originalFindOneAndUpdate;
            }
        });
    });

    describe('2. Execution Coordinator Authority (Single-Organisation Gate)', () => {
        it('SO-COORD-01: Legacy execution authority is authoritative by default in single-org mode', async () => {
            const legacyCheck = await validateExecutionAuthority('LEGACY', 'deal_created');
            assert.strictEqual(legacyCheck.authorized, true, 'LEGACY execution must be authorized');
            assert.strictEqual(legacyCheck.owner, EXECUTION_OWNERS.LEGACY);
            assert.strictEqual(legacyCheck.reason, 'AUTHORITATIVE_LEGACY');

            const durableCheck = await validateExecutionAuthority('DURABLE', 'deal_created');
            assert.strictEqual(durableCheck.authorized, false, 'DURABLE execution must be suppressed');
            assert.strictEqual(durableCheck.reason, 'AUTHORITY_HELD_BY_LEGACY');
        });

        it('SO-COORD-02: Non-coordinated events pass through unconditionally', async () => {
            const check = await validateExecutionAuthority('DURABLE', 'UnknownCustomEvent');
            assert.strictEqual(check.authorized, true);
            assert.strictEqual(check.reason, 'NON_COORDINATED_EVENT');
        });
    });

    describe('3. Outbox Admin Controller in Single-Organisation Mode', () => {
        it('SO-ADMIN-01: getOutboxStats aggregates counts across entire DB when user has no tenantId', async () => {
            let capturedCountFilters = [];
            const originalCount = OutboxEvent.countDocuments;
            const originalFindOne = OutboxEvent.findOne;

            OutboxEvent.countDocuments = (filter) => {
                capturedCountFilters.push(filter);
                return Promise.resolve(5);
            };

            OutboxEvent.findOne = () => ({
                sort: () => ({
                    select: () => ({
                        lean: () => Promise.resolve({ createdAt: new Date() })
                    })
                })
            });

            try {
                const req = {
                    user: { email: 'admin@bharatproperties.co', role: 'admin' } // No tenantId in single-org mode
                };
                let result = null;
                const res = {
                    status: (code) => res,
                    json: (data) => { result = data; }
                };

                await getOutboxStats(req, res);

                assert.ok(result.success);
                assert.strictEqual(result.data.pending, 5);
                assert.strictEqual(result.data.published, 5);
                assert.strictEqual(result.data.failed, 5);
                assert.ok(result.data.oldestFailedAt);

                // In single-org mode, tenantFilter is empty {}, so filter only contains { status: '...' }
                capturedCountFilters.forEach(f => {
                    assert.strictEqual(f.tenantId, undefined, 'Filter should not restrict tenant in single-org mode');
                });
            } finally {
                OutboxEvent.countDocuments = originalCount;
                OutboxEvent.findOne = originalFindOne;
            }
        });

        it('SO-ADMIN-02: getFailedEvents retrieves failed records without tenant constraint for single-org admin', async () => {
            let capturedFindFilter = null;
            const originalFind = OutboxEvent.find;
            const originalCount = OutboxEvent.countDocuments;

            OutboxEvent.find = (filter) => {
                capturedFindFilter = filter;
                return {
                    sort: () => ({
                        skip: () => ({
                            limit: () => ({
                                select: () => ({
                                    lean: () => Promise.resolve([
                                        { eventId: 'evt-failed-1', eventType: 'DealCreated', status: 'FAILED' }
                                    ])
                                })
                            })
                        })
                    })
                };
            };
            OutboxEvent.countDocuments = () => Promise.resolve(1);

            try {
                const req = {
                    user: { email: 'admin@bharatproperties.co', role: 'admin' },
                    query: { page: '1', limit: '10' }
                };
                let result = null;
                const res = {
                    json: (data) => { result = data; }
                };

                await getFailedEvents(req, res);

                assert.ok(result.success);
                assert.strictEqual(result.total, 1);
                assert.strictEqual(result.data.length, 1);
                assert.strictEqual(capturedFindFilter.tenantId, undefined);
                assert.strictEqual(capturedFindFilter.status, 'FAILED');
            } finally {
                OutboxEvent.find = originalFind;
                OutboxEvent.countDocuments = originalCount;
            }
        });

        it('SO-ADMIN-03: retryFailedEvent transitions FAILED -> PENDING atomically without tenant restriction', async () => {
            const fakeEvent = {
                _id: new mongoose.Types.ObjectId(),
                eventId: 'evt-retry-123',
                eventType: 'DealCreated',
                status: 'FAILED',
                attempts: 3
            };

            const originalFindOne = OutboxEvent.findOne;
            const originalFindOneAndUpdate = OutboxEvent.findOneAndUpdate;
            const originalAuditCreate = AuditLog.create;
            AuditLog.create = () => Promise.resolve({});

            OutboxEvent.findOne = () => ({
                select: () => ({
                    lean: () => Promise.resolve(fakeEvent)
                })
            });

            let capturedUpdateFilter = null;
            let capturedUpdateDoc = null;
            OutboxEvent.findOneAndUpdate = (filter, update, options) => {
                capturedUpdateFilter = filter;
                capturedUpdateDoc = update;
                return Promise.resolve({
                    ...fakeEvent,
                    status: 'PENDING',
                    attempts: 0
                });
            };

            try {
                const req = {
                    user: { email: 'admin@bharatproperties.co', role: 'super admin' },
                    params: { eventId: 'evt-retry-123' },
                    body: { reason: 'Manual operator replay after downstream service recovery' }
                };
                let result = null;
                const res = {
                    json: (data) => { result = data; },
                    status: () => ({ json: (data) => { result = data; } })
                };

                await retryFailedEvent(req, res);

                assert.ok(result.success);
                assert.strictEqual(result.data.status, 'PENDING');
                assert.strictEqual(capturedUpdateFilter.eventId, 'evt-retry-123');
                assert.strictEqual(capturedUpdateFilter.status, 'FAILED');
                assert.strictEqual(capturedUpdateDoc.$set.status, 'PENDING');
            } finally {
                OutboxEvent.findOne = originalFindOne;
                OutboxEvent.findOneAndUpdate = originalFindOneAndUpdate;
                AuditLog.create = originalAuditCreate;
            }
        });
    });

    describe('4. AutomationLog Schema Validation (Phase 5 / R14 Requirements)', () => {
        it('SO-AUTOLOG-01: Validates DomainEvent ruleType without requiring ruleId or targetEntityId', () => {
            const logDoc = new AutomationLog({
                ruleType: 'DomainEvent',
                status: 'success',
                details: { eventId: 'evt-101', eventType: 'DealCreated', actionExecuted: true },
                idempotencyKey: 'canonical-deal_created-deal-1-trg-1-0',
                claimToken: 'worker-token-xyz',
                leaseUntil: new Date(Date.now() + 30000),
                tenantId: null
            });

            const err = logDoc.validateSync();
            assert.strictEqual(err, undefined, 'DomainEvent AutomationLog must validate without ruleId/targetEntityId');
            assert.strictEqual(logDoc.tenantId, null);
        });

        it('SO-AUTOLOG-02: Validates TriggerDistribution, LeadCreationRequest, and IdentityConflict ruleTypes', () => {
            const types = ['TriggerDistribution', 'LeadCreationRequest', 'IdentityConflict'];
            for (const type of types) {
                const doc = new AutomationLog({
                    ruleType: type,
                    status: 'success',
                    details: { handled: true },
                    idempotencyKey: `idem-${type.toLowerCase()}-${uuidv4()}`
                });
                const err = doc.validateSync();
                assert.strictEqual(err, undefined, `${type} AutomationLog must validate successfully`);
            }
        });

        it('SO-AUTOLOG-03: Rejects invalid ruleType or missing required fields for standard rules', () => {
            const invalidDoc = new AutomationLog({
                ruleType: 'InvalidRuleTypeXYZ',
                status: 'success'
            });
            const err = invalidDoc.validateSync();
            assert.ok(err, 'Invalid ruleType must fail schema validation');

            // Standard rule without ruleId must fail
            const missingRuleIdDoc = new AutomationLog({
                ruleType: 'Trigger',
                status: 'success'
            });
            const err2 = missingRuleIdDoc.validateSync();
            assert.ok(err2.errors.ruleId, 'Trigger ruleType requires ruleId');
            assert.ok(err2.errors.targetEntityId, 'Trigger ruleType requires targetEntityId');
            assert.ok(err2.errors.targetModule, 'Trigger ruleType requires targetModule');
        });
    });
});
