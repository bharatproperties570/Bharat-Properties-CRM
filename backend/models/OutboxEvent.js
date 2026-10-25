/**
 * OutboxEvent — Phase D.1 Durable Domain Event Transport
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements the Transactional Outbox Pattern for Bharat Properties CRM.
 *
 * An OutboxEvent is written INSIDE the same Mongo session as the business
 * mutation (Deal.create, Booking.create). If the transaction aborts, the
 * OutboxEvent is also rolled back — guaranteeing atomicity.
 *
 * The OutboxPublisher polls PENDING rows and forwards them to domain-event-queue.
 * Consumers of that queue perform trigger evaluation and downstream automation.
 *
 * ═══════════════════════════════════════════════════════════════════
 * IMPORTANT BOUNDARIES
 * ═══════════════════════════════════════════════════════════════════
 *
 * This collection is NOT:
 *   - AutomationLog (that is the workflow audit + idempotency ledger)
 *   - EventBus (that is the dead in-process Node EventEmitter)
 *   - WorkflowEngine.fireEvent (that is the synchronous trigger path)
 *
 * Outbox status tracks PUBLISHER LIFECYCLE ONLY.
 * It must never store: API keys, OAuth tokens, WhatsApp credentials,
 * bank account details, payment amounts, or KYC document URLs.
 *
 * ═══════════════════════════════════════════════════════════════════
 * Consumer idempotency contract
 * ═══════════════════════════════════════════════════════════════════
 * One Domain Event can legitimately cause multiple Trigger/Action executions.
 * Therefore consumer idempotency is NOT implemented as `outbox-{eventId}`.
 * It is implemented at action level:
 *
 *   AutomationLog idempotencyKey = `outbox-{eventId}-{triggerId}-{actionId}`
 *
 * This is enforced by TriggerEvaluationConsumer (Phase E), not by Phase D.
 * Phase D establishes the eventId contract that Phase E will consume.
 *
 * ═══════════════════════════════════════════════════════════════════
 * Single-organisation note
 * ═══════════════════════════════════════════════════════════════════
 * Current system is Bharat Properties — single organisation.
 * companyId is NOT a field on OutboxEvent. It is present in payload when
 * an authoritative source exists in the originating entity.
 * Do NOT add tenantId or global companyId to this schema.
 */

import mongoose from 'mongoose';

const OutboxEventSchema = new mongoose.Schema(
    {
        /**
         * eventId — UUID v4, globally unique event identity.
         * Generated before the transaction write, used for:
         *  1. BullMQ job deduplication (jobId = eventId)
         *  2. Consumer action-level idempotency key prefix
         *     (full key: `outbox-{eventId}-{triggerId}-{actionId}`)
         */
        eventId: {
            type:     String,
            required: true,
            unique:   true,
            index:    true
        },

        /**
         * eventType — canonical domain event name.
         * Phase D first-slice: 'DealCreated' | 'BookingCreated'
         * Future: 'DealStageChanged', 'LeadCreated', etc.
         */
        eventType: {
            type:     String,
            required: true,
            enum:     ['DealCreated', 'BookingCreated'],
            index:    true
        },

        /**
         * occurredAt — timestamp representing when the business mutation occurred.
         * Set to `new Date()` inside the transaction at Outbox write time.
         * This is NOT the exact Mongo commit timestamp (which is unavailable
         * inside the transaction when the document is created).
         * It is the closest approximation: the wall-clock time of the mutation
         * within the transaction, generated consistently before .create() is called.
         */
        occurredAt: {
            type:     Date,
            required: true
        },

        /**
         * entityType — the CRM entity that was mutated.
         * 'Deal' | 'Booking'
         */
        entityType: {
            type:     String,
            required: true,
            enum:     ['Deal', 'Booking'],
            index:    true
        },

        /**
         * entityId — ObjectId of the Deal or Booking document.
         * Used by consumers for deduplication and entity fetching.
         */
        entityId: {
            type:     mongoose.Schema.Types.ObjectId,
            required: true,
            index:    true
        },

        /**
         * payload — minimum consumer-required business state.
         * Must NEVER contain: API keys, tokens, bank details,
         * payment amounts, commission figures, or KYC URLs.
         * See Phase D forensic audit for exact approved field lists.
         */
        payload: {
            type:     mongoose.Schema.Types.Mixed,
            required: true
        },

        /**
         * status — publisher lifecycle state.
         * PENDING   = committed, awaiting publication to queue
         * PUBLISHED = successfully pushed to domain-event-queue
         * FAILED    = exceeded retry limit, requires manual intervention
         *
         * This status must NOT be confused with:
         *  - AutomationLog workflow status
         *  - Deal/Booking business status
         *  - Marketing engagement status
         */
        status: {
            type:    String,
            enum:    ['PENDING', 'PUBLISHED', 'FAILED'],
            default: 'PENDING',
            index:   true
        },

        /**
         * availableAt — when the publisher is next allowed to process this event.
         * Default: same as occurredAt (process immediately).
         * Set to future time during retry backoff.
         */
        availableAt: {
            type:    Date,
            default: Date.now,
            index:   true
        },

        /**
         * attempts — number of publisher delivery attempts.
         * Incremented on each failed publish attempt.
         * When attempts >= MAX_PUBLISH_ATTEMPTS, status → 'FAILED'.
         */
        attempts: {
            type:    Number,
            default: 0
        },

        /**
         * lastError — last publisher error message string.
         * For operational diagnosis only. Never contains credentials.
         */
        lastError: {
            type:    String,
            default: null
        },

        /**
         * publishedAt — when OutboxPublisher successfully pushed to queue.
         * Null until PUBLISHED.
         */
        publishedAt: {
            type:    Date,
            default: null
        },

        /**
         * correlationId — request-scoped tracing ID.
         * Sourced from req.headers['x-correlation-id'] or idempotency-key.
         * Enables request tracing across services.
         */
        correlationId: {
            type:    String,
            default: null
        },

        /**
         * causationId — ID of the event or action that caused this event.
         * Empty/null for first-order mutations (Deal.create, Booking.create).
         * Used when one event causes a downstream event.
         */
        causationId: {
            type:    String,
            default: null
        },

        /**
         * actor — User._id who triggered the mutation (req.user._id).
         * Used for audit and attribution.
         */
        actor: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     'User',
            default: null
        }

        // Explicitly NOT included:
        // previousState — CREATE events have no previous state
        // tenantId      — single-organisation system (Bharat Properties)
        // companyId     — not in OutboxEvent schema; included in payload when authoritative
        // schemaVersion — FUTURE: add before introducing breaking payload changes
    },
    {
        timestamps: true  // adds createdAt, updatedAt automatically
    }
);

// ─── Compound index for publisher poll query ─────────────────────────────────
// Query: { status: 'PENDING', availableAt: { $lte: now } } ORDER BY availableAt
OutboxEventSchema.index({ status: 1, availableAt: 1 });

// ─── Compound index for consumer deduplication by entity ─────────────────────
// Query: { entityType, entityId } — allows consumers to find all events for an entity
OutboxEventSchema.index({ entityType: 1, entityId: 1 });

// ─── createdAt index for retention/cleanup ───────────────────────────────────
OutboxEventSchema.index({ createdAt: 1 });

const OutboxEvent = mongoose.model('OutboxEvent', OutboxEventSchema);

export default OutboxEvent;
