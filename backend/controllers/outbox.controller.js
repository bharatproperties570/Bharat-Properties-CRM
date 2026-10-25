/**
 * outbox.controller.js
 *
 * Phase D.2-F07 / Phase 4.6I — Outbox Failed Event Recovery
 *
 * Administrative endpoints for monitoring and recovering FAILED OutboxEvent
 * documents. All endpoints require admin or super admin role and respect multi-tenancy.
 */

import OutboxEvent from '../models/OutboxEvent.js';
import AuditLog   from '../models/AuditLog.js';

// ─── GET /api/outbox/stats ────────────────────────────────────────────────────
export const getOutboxStats = async (req, res) => {
    try {
        const rawTenantId = req.user?.tenantId || req.user?.tenant;
        const tenantFilter = rawTenantId ? { tenantId: rawTenantId } : {};

        const [pending, published, failed] = await Promise.all([
            OutboxEvent.countDocuments({ status: 'PENDING', ...tenantFilter }),
            OutboxEvent.countDocuments({ status: 'PUBLISHED', ...tenantFilter }),
            OutboxEvent.countDocuments({ status: 'FAILED', ...tenantFilter })
        ]);

        let oldestFailedAt = null;
        if (failed > 0) {
            const oldest = await OutboxEvent
                .findOne({ status: 'FAILED', ...tenantFilter })
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
export const getFailedEvents = async (req, res) => {
    try {
        const rawTenantId = req.user?.tenantId || req.user?.tenant;
        const tenantFilter = rawTenantId ? { tenantId: rawTenantId } : {};

        const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const skip  = (page - 1) * limit;

        const [events, total] = await Promise.all([
            OutboxEvent
                .find({ status: 'FAILED', ...tenantFilter })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('eventId eventType entityType entityId occurredAt attempts lastError correlationId tenantId createdAt updatedAt')
                .lean(),
            OutboxEvent.countDocuments({ status: 'FAILED', ...tenantFilter })
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
export const retryFailedEvent = async (req, res) => {
    const { eventId } = req.params;
    const rawTenantId = req.user?.tenantId || req.user?.tenant;
    const tenantFilter = rawTenantId ? { tenantId: rawTenantId } : {};

    const reason = typeof req.body?.reason === 'string'
        ? req.body.reason.substring(0, 200)
        : null;

    try {
        const current = await OutboxEvent
            .findOne({ eventId, ...tenantFilter })
            .select('_id eventId eventType entityType entityId attempts lastError status tenantId')
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

        const recovered = await OutboxEvent.findOneAndUpdate(
            { eventId, status: 'FAILED', ...tenantFilter },
            {
                $set: {
                    status:      'PENDING',
                    availableAt: new Date(),
                    attempts:    0,
                    lastError:   null
                }
            },
            { new: true }
        );

        if (!recovered) {
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
            `${eventId} (${current.eventType}, ${current.entityType} ${current.entityId}). Previous attempts: ${current.attempts}. Now PENDING.`
        );

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
                    outboxRecovery:   true,
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
                status:     recovered.status,
                availableAt: recovered.availableAt
            }
        });

    } catch (err) {
        console.error(`[OutboxAdmin] retryFailedEvent error for ${eventId}:`, err.message);
        return res.status(500).json({ success: false, message: 'Internal server error during event retry' });
    }
};
