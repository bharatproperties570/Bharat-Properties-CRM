/**
 * outbox.controller.js
 *
 * Phase D.2-F07 — Outbox Failed Event Recovery
 *
 * Administrative endpoints for monitoring and recovering FAILED OutboxEvent
 * documents. All endpoints require admin or super admin role.
 *
 * ═══════════════════════════════════════════════════════════════════
 * SCOPE
 * ═══════════════════════════════════════════════════════════════════
 * This controller ONLY manages OutboxEvent publisher lifecycle state.
 * It does NOT:
 *   ✗ call WorkflowEngine.fireEvent()
 *   ✗ add jobs to domain-event-queue directly
 *   ✗ evaluate Triggers or execute AutomatedActions
 *   ✗ call queue.add() directly
 *   ✗ modify Deal, Booking, or any CRM entity
 *   ✗ mutate payload, eventId, eventType, entityId, entityType,
 *     occurredAt, correlationId, causationId, or actor
 *
 * Recovery path:
 *   FAILED → PENDING (this controller)
 *       ↓
 *   OutboxPublisher (existing 10s poll in cronWorker)
 *       ↓
 *   domain-event-queue
 *       ↓
 *   [Phase E] TriggerEvaluationConsumer (not yet implemented)
 *
 * ═══════════════════════════════════════════════════════════════════
 * CONCURRENCY SAFETY
 * ═══════════════════════════════════════════════════════════════════
 * All mutations use:
 *   OutboxEvent.findOneAndUpdate({ eventId, status: 'FAILED' }, ...)
 *
 * The atomic { status: 'FAILED' } condition ensures:
 *   - Only one concurrent retry can succeed for a given event
 *   - PUBLISHED events cannot be retried
 *   - PENDING events cannot be retried (wrong state)
 *   - Unknown events return null → 404
 *
 * ═══════════════════════════════════════════════════════════════════
 * D.2-F07 DESIGN DECISION: attempts reset
 * ═══════════════════════════════════════════════════════════════════
 * attempts is RESET to 0 on recovery (not preserved).
 *
 * Rationale: OutboxPublisher.publishPendingEvents() calculates:
 *   nextAttempt = (event.attempts || 0) + 1
 *   isPermanentlyFailed = nextAttempt >= MAX_PUBLISH_ATTEMPTS (5)
 *
 * A FAILED event has attempts = 5. If preserved, nextAttempt = 6 >= 5
 * → immediately re-fails on the first publisher error after recovery.
 * Historical attempts count is preserved in AuditLog.metadata.
 */

import OutboxEvent from '../models/OutboxEvent.js';
import AuditLog   from '../models/AuditLog.js';

// ─── GET /api/outbox/stats ────────────────────────────────────────────────────

/**
 * getOutboxStats
 *
 * Returns publisher lifecycle counts for operational monitoring.
 * Admin-only.
 */
export const getOutboxStats = async (req, res) => {
    try {
        const [pending, published, failed] = await Promise.all([
            OutboxEvent.countDocuments({ status: 'PENDING' }),
            OutboxEvent.countDocuments({ status: 'PUBLISHED' }),
            OutboxEvent.countDocuments({ status: 'FAILED' })
        ]);

        // Oldest FAILED event for SLA awareness
        let oldestFailedAt = null;
        if (failed > 0) {
            const oldest = await OutboxEvent
                .findOne({ status: 'FAILED' })
                .sort({ createdAt: 1 })
                .select('createdAt')
                .lean();
            oldestFailedAt = oldest?.createdAt ?? null;
        }

        console.log(
            `[OutboxAdmin] Stats requested by ${req.user?.email}: ` +
            `pending=${pending}, published=${published}, failed=${failed}`
        );

        return res.json({
            success: true,
            data: { pending, published, failed, oldestFailedAt }
        });
    } catch (err) {
        console.error('[OutboxAdmin] getOutboxStats error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to retrieve Outbox stats' });
    }
};

// ─── GET /api/outbox/failed ───────────────────────────────────────────────────

/**
 * getFailedEvents
 *
 * Returns a paginated list of FAILED OutboxEvent documents.
 * Payload is EXCLUDED from response — admin needs only the envelope.
 * Admin-only.
 */
export const getFailedEvents = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const skip  = (page - 1) * limit;

        const [events, total] = await Promise.all([
            OutboxEvent
                .find({ status: 'FAILED' })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                // payload intentionally OMITTED — reduces exposure surface
                // actor (User ref) intentionally OMITTED — internal ID only
                .select('eventId eventType entityType entityId occurredAt attempts lastError correlationId createdAt updatedAt')
                .lean(),
            OutboxEvent.countDocuments({ status: 'FAILED' })
        ]);

        return res.json({
            success: true,
            data:  events,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error('[OutboxAdmin] getFailedEvents error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to retrieve failed events' });
    }
};

// ─── PATCH /api/outbox/:eventId/retry ────────────────────────────────────────

/**
 * retryFailedEvent
 *
 * Transitions a specific FAILED OutboxEvent → PENDING so the existing
 * OutboxPublisher can pick it up on the next 10s poll cycle.
 *
 * ATOMIC CONDITION: { eventId, status: 'FAILED' }
 *   → If already PENDING or PUBLISHED, returns null → 404
 *   → Concurrent calls: only one can win the race → second gets 404
 *
 * MUTATIONS (and ONLY these):
 *   status      = 'PENDING'
 *   availableAt = now          (immediately eligible for publisher)
 *   attempts    = 0            (reset — see design rationale in header)
 *   lastError   = null         (clear stale error; history in AuditLog)
 *
 * IMMUTABLE (never touched):
 *   eventId, eventType, entityType, entityId, payload,
 *   occurredAt, correlationId, causationId, actor, publishedAt
 *
 * Admin-only.
 */
export const retryFailedEvent = async (req, res) => {
    const { eventId } = req.params;

    // Optional audit annotation — never used for mutation
    const reason = typeof req.body?.reason === 'string'
        ? req.body.reason.substring(0, 200)
        : null;

    try {
        // ── Read current state (for AuditLog before snapshot) ────────────────
        // We need attempts + lastError for audit record before the update.
        const current = await OutboxEvent
            .findOne({ eventId })
            .select('_id eventId eventType entityType entityId attempts lastError status')
            .lean();

        if (!current) {
            return res.status(404).json({
                success: false,
                message: 'Outbox event not found'
            });
        }

        if (current.status !== 'FAILED') {
            return res.status(400).json({
                success: false,
                message: `Event is not in FAILED state (current status: ${current.status}). Only FAILED events can be retried.`
            });
        }

        // ── Atomic state transition ───────────────────────────────────────────
        // Condition: { eventId, status: 'FAILED' } ensures:
        //   - Only FAILED events transition
        //   - Concurrent retries: only one wins; second sees null
        const recovered = await OutboxEvent.findOneAndUpdate(
            { eventId, status: 'FAILED' },
            {
                $set: {
                    status:      'PENDING',
                    availableAt: new Date(),   // immediately eligible for publisher
                    attempts:    0,            // reset — see D2-F07 design decision
                    lastError:   null          // clear stale error; history in AuditLog
                }
            },
            { new: true }
        );

        if (!recovered) {
            // Race condition: event was updated by a concurrent request between the read and the update
            console.warn(
                `[OutboxAdmin] ⚠️ Retry race condition for event ${eventId} ` +
                `(admin: ${req.user?.email}) — event no longer in FAILED state`
            );
            return res.status(409).json({
                success: false,
                message: 'Event could not be retried — state changed concurrently. Please refresh and try again.'
            });
        }

        console.log(
            `[OutboxAdmin] ✅ Admin ${req.user?.email} manually retried FAILED event ` +
            `${eventId} (${current.eventType}, ${current.entityType} ${current.entityId}). ` +
            `Previous attempts: ${current.attempts}. Now PENDING.`
        );

        // ── AuditLog record ───────────────────────────────────────────────────
        // eventType 'rule_modified' is the closest valid enum value.
        // targetType 'other' — 'outbox' is not in the enum.
        // Full context captured in metadata for queryability:
        //   AuditLog.find({ 'metadata.outboxRecovery': true })
        try {
            await AuditLog.create([{
                eventType:   'rule_modified',
                userId:      req.user?._id,
                userName:    req.user?.fullName,
                userEmail:   req.user?.email,
                actorId:     req.user?._id,
                actorName:   req.user?.fullName,
                actorEmail:  req.user?.email,
                targetType:  'other',
                targetId:    current._id,
                targetName:  `${current.eventType}:${current.eventId}`,
                description: `Admin manually retried FAILED OutboxEvent ${current.eventId} ` +
                             `(${current.eventType} for ${current.entityType} ${current.entityId})`,
                changes: {
                    before: { status: 'FAILED',   attempts: current.attempts, lastError: current.lastError },
                    after:  { status: 'PENDING',  attempts: 0,                lastError: null }
                },
                metadata: {
                    outboxRecovery:   true,                   // queryable: AuditLog.find({ 'metadata.outboxRecovery': true })
                    eventId:          current.eventId,
                    eventType:        current.eventType,
                    entityType:       current.entityType,
                    entityId:         String(current.entityId),
                    previousStatus:   'FAILED',
                    newStatus:        'PENDING',
                    previousAttempts: current.attempts,
                    reason:           reason
                },
                ipAddress:     req.ip,
                userAgent:     typeof req.get === 'function' ? req.get('user-agent') : (req.headers?.['user-agent'] || null),
                requestUrl:    req.originalUrl,
                requestMethod: req.method,
                status:        'success'
            }]);
        } catch (auditErr) {
            // Audit failure must NOT roll back the recovery — the event is already PENDING
            // and the OutboxPublisher will process it. Log the audit failure separately.
            console.error('[OutboxAdmin] ⚠️ AuditLog write failed (recovery succeeded):', auditErr.message);
        }

        return res.json({
            success: true,
            message: 'Event queued for retry. Publisher will pick it up within 10 seconds.',
            data: {
                eventId:    recovered.eventId,
                eventType:  recovered.eventType,
                entityType: recovered.entityType,
                entityId:   String(recovered.entityId),
                status:     recovered.status,      // 'PENDING'
                availableAt: recovered.availableAt
            }
        });

    } catch (err) {
        console.error(`[OutboxAdmin] retryFailedEvent error for ${eventId}:`, err.message);
        return res.status(500).json({ success: false, message: 'Internal server error during event retry' });
    }
};
