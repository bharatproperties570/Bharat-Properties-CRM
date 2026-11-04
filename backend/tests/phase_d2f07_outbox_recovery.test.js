/**
 * Phase D.2-F07 — Outbox Failed Event Recovery Tests
 *
 * Test Specifications (F07-01 to F07-12):
 *   F07-01: FAILED event can be selected for retry (atomic transition to PENDING, attempts reset to 0, lastError cleared).
 *   F07-02: Only FAILED → PENDING is allowed ($set restricted to mutable lifecycle fields).
 *   F07-03: PUBLISHED event cannot be retried (rejected with 400).
 *   F07-04: PENDING event cannot be retried (rejected with 400).
 *   F07-05: Unknown event returns safe not-found response (404, no stack leak).
 *   F07-06: Simultaneous retry race condition handling (atomic findOneAndUpdate returns null → 409 conflict).
 *   F07-07: availableAt becomes immediately eligible for OutboxPublisher polling.
 *   F07-08: Immutable identity fields (eventId, eventType, entityType, entityId) remain unchanged.
 *   F07-09: payload remains untouched and is excluded from getFailedEvents listing.
 *   F07-10: Non-admin users are rejected by authorization guard (403).
 *   F07-11: Retry action records an audit trail in AuditLog using canonical pattern.
 *   F07-12: Outbox stats endpoint aggregates status counts correctly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    getOutboxStats,
    getFailedEvents,
    retryFailedEvent
} from '../controllers/outbox.controller.js';
import OutboxEvent from '../models/OutboxEvent.js';
import AuditLog from '../models/AuditLog.js';
import { authorize } from '../src/middlewares/auth.middleware.js';

// ─── Minimal Mock Response Helper ─────────────────────────────────────────────

function createMockRes() {
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
}

describe('Phase D.2-F07 — Outbox Failed Event Recovery', () => {

    // ─── F07-01: FAILED event retry transition ───────────────────────────────
    it('F07-01: FAILED event can be selected for retry (transitions to PENDING, attempts reset to 0)', async () => {
        const origFindOne = OutboxEvent.findOne;
        const origFindOneAndUpdate = OutboxEvent.findOneAndUpdate;
        const origAuditCreate = AuditLog.create;

        try {
            const mockEventId = 'test-failed-event-01';
            let updateFilter = null;
            let updatePayload = null;

            OutboxEvent.findOne = () => ({
                select: () => ({
                    lean: async () => ({
                        _id: 'mongo-id-01',
                        eventId: mockEventId,
                        eventType: 'DealCreated',
                        entityType: 'Deal',
                        entityId: 'deal-01',
                        attempts: 5,
                        lastError: 'Redis connection timed out',
                        status: 'FAILED'
                    })
                })
            });

            OutboxEvent.findOneAndUpdate = (filter, update) => {
                updateFilter = filter;
                updatePayload = update;
                return {
                    eventId: mockEventId,
                    eventType: 'DealCreated',
                    entityType: 'Deal',
                    entityId: 'deal-01',
                    status: 'PENDING',
                    availableAt: update.$set.availableAt
                };
            };

            AuditLog.create = async () => [{ _id: 'audit-log-01' }];

            const req = {
                params: { eventId: mockEventId },
                body: { reason: 'Manual recovery test' },
                user: { _id: 'admin-01', fullName: 'Test Admin', email: 'admin@bharatproperties.com' },
                ip: '127.0.0.1',
                get: () => 'NodeTestRunner',
                originalUrl: `/api/outbox/${mockEventId}/retry`,
                method: 'PATCH'
            };
            const res = createMockRes();

            await retryFailedEvent(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.success, true);
            assert.equal(res.body.data.status, 'PENDING');
            assert.equal(updateFilter.eventId, mockEventId);
            assert.equal(updateFilter.status, 'FAILED');
            assert.equal(updatePayload.$set.status, 'PENDING');
            assert.equal(updatePayload.$set.attempts, 0, 'attempts must be reset to 0');
            assert.equal(updatePayload.$set.lastError, null, 'lastError must be cleared to null');
        } finally {
            OutboxEvent.findOne = origFindOne;
            OutboxEvent.findOneAndUpdate = origFindOneAndUpdate;
            AuditLog.create = origAuditCreate;
        }
    });

    // ─── F07-02: Only approved fields in $set ──────────────────────────────────
    it('F07-02: Only FAILED → PENDING is allowed ($set restricted to mutable lifecycle fields)', async () => {
        const origFindOne = OutboxEvent.findOne;
        const origFindOneAndUpdate = OutboxEvent.findOneAndUpdate;
        const origAuditCreate = AuditLog.create;

        try {
            let capturedUpdate = null;
            OutboxEvent.findOne = () => ({
                select: () => ({
                    lean: async () => ({
                        _id: 'mongo-id-02',
                        eventId: 'test-event-02',
                        eventType: 'BookingCreated',
                        entityType: 'Booking',
                        entityId: 'booking-02',
                        attempts: 5,
                        status: 'FAILED'
                    })
                })
            });

            OutboxEvent.findOneAndUpdate = (filter, update) => {
                capturedUpdate = update;
                return {
                    eventId: 'test-event-02',
                    status: 'PENDING',
                    availableAt: new Date()
                };
            };
            AuditLog.create = async () => [];

            const req = {
                params: { eventId: 'test-event-02' },
                body: { payload: { corrupted: true }, eventType: 'MaliciousEvent' }, // Attempted forbidden payload mutation
                user: { _id: 'admin-01', email: 'admin@crm.local' }
            };
            const res = createMockRes();

            await retryFailedEvent(req, res);

            assert.ok(capturedUpdate.$set, 'update must contain $set');
            const allowedKeys = ['status', 'availableAt', 'attempts', 'lastError'];
            const actualKeys = Object.keys(capturedUpdate.$set);
            for (const key of actualKeys) {
                assert.ok(allowedKeys.includes(key), `Field ${key} must not be mutated during recovery`);
            }
            assert.equal(capturedUpdate.$set.payload, undefined, 'payload must be strictly immutable');
            assert.equal(capturedUpdate.$set.eventType, undefined, 'eventType must be strictly immutable');
        } finally {
            OutboxEvent.findOne = origFindOne;
            OutboxEvent.findOneAndUpdate = origFindOneAndUpdate;
            AuditLog.create = origAuditCreate;
        }
    });

    // ─── F07-03: PUBLISHED event cannot be retried ────────────────────────────
    it('F07-03: PUBLISHED event cannot be retried (rejected with 400)', async () => {
        const origFindOne = OutboxEvent.findOne;
        try {
            OutboxEvent.findOne = () => ({
                select: () => ({
                    lean: async () => ({
                        eventId: 'pub-event-03',
                        status: 'PUBLISHED'
                    })
                })
            });

            const req = { params: { eventId: 'pub-event-03' } };
            const res = createMockRes();

            await retryFailedEvent(req, res);

            assert.equal(res.statusCode, 400);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /not in FAILED state/i);
        } finally {
            OutboxEvent.findOne = origFindOne;
        }
    });

    // ─── F07-04: PENDING event cannot be retried ──────────────────────────────
    it('F07-04: PENDING event cannot be retried (rejected with 400)', async () => {
        const origFindOne = OutboxEvent.findOne;
        try {
            OutboxEvent.findOne = () => ({
                select: () => ({
                    lean: async () => ({
                        eventId: 'pend-event-04',
                        status: 'PENDING'
                    })
                })
            });

            const req = { params: { eventId: 'pend-event-04' } };
            const res = createMockRes();

            await retryFailedEvent(req, res);

            assert.equal(res.statusCode, 400);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /not in FAILED state/i);
        } finally {
            OutboxEvent.findOne = origFindOne;
        }
    });

    // ─── F07-05: Unknown event returns safe 404 response ──────────────────────
    it('F07-05: Unknown event returns safe not-found response (404, no stack leak)', async () => {
        const origFindOne = OutboxEvent.findOne;
        try {
            OutboxEvent.findOne = () => ({
                select: () => ({
                    lean: async () => null // Not found
                })
            });

            const req = { params: { eventId: 'nonexistent-uuid' } };
            const res = createMockRes();

            await retryFailedEvent(req, res);

            assert.equal(res.statusCode, 404);
            assert.equal(res.body.success, false);
            assert.equal(res.body.message, 'Outbox event not found');
            assert.equal(res.body.stack, undefined, 'Stack trace must not be leaked');
        } finally {
            OutboxEvent.findOne = origFindOne;
        }
    });

    // ─── F07-06: Simultaneous retry race condition handling ───────────────────
    it('F07-06: Simultaneous retry race condition handling (atomic findOneAndUpdate returns null → 409 conflict)', async () => {
        const origFindOne = OutboxEvent.findOne;
        const origFindOneAndUpdate = OutboxEvent.findOneAndUpdate;
        try {
            // First read sees FAILED...
            OutboxEvent.findOne = () => ({
                select: () => ({
                    lean: async () => ({
                        eventId: 'race-event-06',
                        status: 'FAILED',
                        attempts: 5
                    })
                })
            });
            // ...but another request already updated it right before findOneAndUpdate executed!
            OutboxEvent.findOneAndUpdate = () => null;

            const req = { params: { eventId: 'race-event-06' } };
            const res = createMockRes();

            await retryFailedEvent(req, res);

            assert.equal(res.statusCode, 409, 'Concurrent update must return 409 Conflict');
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /state changed concurrently/i);
        } finally {
            OutboxEvent.findOne = origFindOne;
            OutboxEvent.findOneAndUpdate = origFindOneAndUpdate;
        }
    });

    // ─── F07-07: availableAt becomes immediately eligible ─────────────────────
    it('F07-07: availableAt becomes immediately eligible for OutboxPublisher polling', async () => {
        const origFindOne = OutboxEvent.findOne;
        const origFindOneAndUpdate = OutboxEvent.findOneAndUpdate;
        const origAuditCreate = AuditLog.create;

        try {
            let capturedAvailableAt = null;
            OutboxEvent.findOne = () => ({
                select: () => ({
                    lean: async () => ({
                        eventId: 'avail-event-07',
                        status: 'FAILED',
                        attempts: 5
                    })
                })
            });
            OutboxEvent.findOneAndUpdate = (filter, update) => {
                capturedAvailableAt = update.$set.availableAt;
                return {
                    eventId: 'avail-event-07',
                    status: 'PENDING',
                    availableAt: capturedAvailableAt
                };
            };
            AuditLog.create = async () => [];

            const req = { params: { eventId: 'avail-event-07' }, user: { email: 'admin@crm.local' } };
            const res = createMockRes();

            const beforeCall = new Date();
            await retryFailedEvent(req, res);
            const afterCall = new Date();

            assert.ok(capturedAvailableAt instanceof Date, 'availableAt must be a Date');
            assert.ok(capturedAvailableAt >= beforeCall && capturedAvailableAt <= afterCall,
                'availableAt must be set to current wall-clock time');
        } finally {
            OutboxEvent.findOne = origFindOne;
            OutboxEvent.findOneAndUpdate = origFindOneAndUpdate;
            AuditLog.create = origAuditCreate;
        }
    });

    // ─── F07-08: Immutable identity fields ────────────────────────────────────
    it('F07-08: Immutable identity fields remain unchanged during retry', async () => {
        const origFindOne = OutboxEvent.findOne;
        const origFindOneAndUpdate = OutboxEvent.findOneAndUpdate;
        const origAuditCreate = AuditLog.create;

        try {
            const originalEvent = {
                _id: 'mongo-id-08',
                eventId: 'uuid-08',
                eventType: 'DealCreated',
                entityType: 'Deal',
                entityId: 'deal-id-08',
                occurredAt: new Date('2026-10-01T12:00:00Z'),
                correlationId: 'corr-08',
                status: 'FAILED',
                attempts: 5
            };

            OutboxEvent.findOne = () => ({
                select: () => ({
                    lean: async () => originalEvent
                })
            });

            let appliedUpdate = null;
            OutboxEvent.findOneAndUpdate = (filter, update) => {
                appliedUpdate = update;
                return {
                    ...originalEvent,
                    status: 'PENDING',
                    attempts: 0,
                    availableAt: update.$set.availableAt
                };
            };
            AuditLog.create = async () => [];

            const req = { params: { eventId: 'uuid-08' }, user: { email: 'admin@crm.local' } };
            const res = createMockRes();

            await retryFailedEvent(req, res);

            assert.equal(res.body.data.eventId, originalEvent.eventId);
            assert.equal(res.body.data.eventType, originalEvent.eventType);
            assert.equal(res.body.data.entityType, originalEvent.entityType);
            assert.equal(res.body.data.entityId, originalEvent.entityId);
            assert.equal(appliedUpdate.$set.eventId, undefined);
            assert.equal(appliedUpdate.$set.entityId, undefined);
        } finally {
            OutboxEvent.findOne = origFindOne;
            OutboxEvent.findOneAndUpdate = origFindOneAndUpdate;
            AuditLog.create = origAuditCreate;
        }
    });

    // ─── F07-09: payload remains untouched and excluded from getFailedEvents ──
    it('F07-09: payload remains untouched and is excluded from getFailedEvents listing', async () => {
        const origFind = OutboxEvent.find;
        const origCount = OutboxEvent.countDocuments;

        try {
            let selectedProjection = '';
            OutboxEvent.find = () => ({
                sort: () => ({
                    skip: () => ({
                        limit: () => ({
                            select: (proj) => {
                                selectedProjection = proj;
                                return {
                                    lean: async () => [
                                        {
                                            eventId: 'fail-09',
                                            eventType: 'DealCreated',
                                            status: 'FAILED',
                                            attempts: 5,
                                            // Notice: payload is deliberately absent
                                            createdAt: new Date()
                                        }
                                    ]
                                };
                            }
                        })
                    })
                })
            });
            OutboxEvent.countDocuments = async () => 1;

            const req = { query: { page: '1', limit: '10' } };
            const res = createMockRes();

            await getFailedEvents(req, res);

            assert.equal(res.statusCode, 200);
            assert.ok(!selectedProjection.includes('payload'),
                'Projection must deliberately exclude payload from listing');
            assert.equal(res.body.data[0].payload, undefined,
                'Event listing must not expose payload object');
        } finally {
            OutboxEvent.find = origFind;
            OutboxEvent.countDocuments = origCount;
        }
    });

    // ─── F07-10: Non-admin users are rejected by authorization guard ──────────
    it('F07-10: Non-admin users are rejected by authorization guard (403)', () => {
        const guard = authorize('admin', 'super admin');

        // Test non-admin role: 'sales agent'
        const reqUser = { user: { role: { name: 'Sales Agent' } } };
        let passedError = null;
        const next = (err) => { passedError = err; };

        guard(reqUser, {}, next);

        assert.ok(passedError, 'Non-admin user must trigger an AppError');
        assert.equal(passedError.statusCode, 403, 'Must return 403 Forbidden');
        assert.match(passedError.message, /Access denied/i);

        // Test authorized role: 'admin'
        let adminPassed = false;
        const reqAdmin = { user: { role: { name: 'Admin' } } };
        guard(reqAdmin, {}, () => { adminPassed = true; });
        assert.equal(adminPassed, true, 'Admin role must pass authorization guard');
    });

    // ─── F07-11: Retry action records an audit trail in AuditLog ───────────────
    it('F07-11: Retry action records an audit trail in AuditLog using canonical pattern', async () => {
        const origFindOne = OutboxEvent.findOne;
        const origFindOneAndUpdate = OutboxEvent.findOneAndUpdate;
        const origAuditCreate = AuditLog.create;

        try {
            let capturedAuditDoc = null;
            OutboxEvent.findOne = () => ({
                select: () => ({
                    lean: async () => ({
                        _id: 'mongo-id-11',
                        eventId: 'audit-event-11',
                        eventType: 'DealCreated',
                        entityType: 'Deal',
                        entityId: 'deal-11',
                        attempts: 5,
                        lastError: 'Kafka/Redis down',
                        status: 'FAILED'
                    })
                })
            });
            OutboxEvent.findOneAndUpdate = () => ({
                eventId: 'audit-event-11',
                status: 'PENDING',
                availableAt: new Date()
            });
            AuditLog.create = async (docs) => {
                capturedAuditDoc = docs[0];
                return docs;
            };

            const req = {
                params: { eventId: 'audit-event-11' },
                body: { reason: 'Network restored' },
                user: { _id: 'admin-id-11', fullName: 'Auditor User', email: 'auditor@crm.local' },
                ip: '10.0.0.1',
                get: () => 'TestAgent',
                originalUrl: '/api/outbox/audit-event-11/retry',
                method: 'PATCH'
            };
            const res = createMockRes();

            await retryFailedEvent(req, res);

            assert.ok(capturedAuditDoc, 'AuditLog.create must be called');
            assert.equal(capturedAuditDoc.eventType, 'rule_modified', 'eventType must use canonical valid enum value');
            assert.equal(capturedAuditDoc.targetType, 'other', 'targetType must be other');
            assert.equal(capturedAuditDoc.metadata.outboxRecovery, true, 'metadata.outboxRecovery must be true');
            assert.equal(capturedAuditDoc.metadata.previousStatus, 'FAILED');
            assert.equal(capturedAuditDoc.metadata.newStatus, 'PENDING');
            assert.equal(capturedAuditDoc.metadata.previousAttempts, 5);
            assert.equal(capturedAuditDoc.metadata.reason, 'Network restored');
        } finally {
            OutboxEvent.findOne = origFindOne;
            OutboxEvent.findOneAndUpdate = origFindOneAndUpdate;
            AuditLog.create = origAuditCreate;
        }
    });

    // ─── F07-12: Outbox stats endpoint aggregates status counts correctly ─────
    it('F07-12: Outbox stats endpoint aggregates status counts correctly', async () => {
        const origCount = OutboxEvent.countDocuments;
        const origFindOne = OutboxEvent.findOne;

        try {
            OutboxEvent.countDocuments = async ({ status }) => {
                if (status === 'PENDING') return 12;
                if (status === 'PUBLISHED') return 150;
                if (status === 'FAILED') return 3;
                return 0;
            };

            const oldestDate = new Date('2026-10-02T08:00:00Z');
            OutboxEvent.findOne = () => ({
                sort: () => ({
                    select: () => ({
                        lean: async () => ({ createdAt: oldestDate })
                    })
                })
            });

            const req = { user: { email: 'admin@crm.local' } };
            const res = createMockRes();

            await getOutboxStats(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.success, true);
            assert.equal(res.body.data.pending, 12);
            assert.equal(res.body.data.published, 150);
            assert.equal(res.body.data.failed, 3);
            assert.equal(res.body.data.oldestFailedAt, oldestDate);
        } finally {
            OutboxEvent.countDocuments = origCount;
            OutboxEvent.findOne = origFindOne;
        }
    });

});
