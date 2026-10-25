/**
 * OutboxPublisher — Phase D.1 Durable Event Transport
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls the OutboxEvent collection for PENDING events and forwards them to
 * domain-event-queue. This is TRANSPORT ONLY — it does NOT execute automation.
 *
 * ═══════════════════════════════════════════════════════════════════
 * Publisher responsibilities (ONLY):
 *   1. Poll OutboxEvent.find({ status: 'PENDING', availableAt: { $lte: now } })
 *   2. Push each event to domain-event-queue (jobId = eventId for dedup)
 *   3. On success: update status → PUBLISHED, set publishedAt
 *   4. On failure: increment attempts, set availableAt = retry backoff
 *   5. On max failures: set status → FAILED (dead-letter)
 *
 * ═══════════════════════════════════════════════════════════════════
 * Publisher MUST NOT:
 *   ✗ call WorkflowEngine.fireEvent()
 *   ✗ send WhatsApp or SMS messages
 *   ✗ create CRM Activity records
 *   ✗ evaluate Trigger conditions
 *   ✗ execute AutomatedAction
 *   ✗ launch Campaign
 *   ✗ update Deal or Booking documents
 *   ✗ read or modify AutomationLog
 *
 * ═══════════════════════════════════════════════════════════════════
 * Duplicate delivery safety
 * ═══════════════════════════════════════════════════════════════════
 * BullMQ jobId = eventId (UUID v4) provides best-effort deduplication
 * for active/waiting jobs. Once a job is completed and removed from
 * the queue, the same jobId can be re-added. Therefore:
 *
 *   BullMQ jobId deduplication = publisher-level duplicate protection
 *   AutomationLog idempotencyKey = consumer action-level guarantee (Phase E)
 *
 * These are SEPARATE layers. BullMQ jobId alone is NOT the exactly-once guarantee.
 *
 * ═══════════════════════════════════════════════════════════════════
 * Phase D state
 * ═══════════════════════════════════════════════════════════════════
 * Phase D: Publisher pushes to domain-event-queue.
 *          NO consumer is attached yet.
 *          Jobs accumulate in the queue for Phase E consumer.
 *
 * Phase E: TriggerEvaluationConsumer is attached to domain-event-queue.
 *          WorkflowEngine.fireEvent('deals','deal_created') is removed
 *          ONLY after shadow-mode validation.
 */

import OutboxEvent from '../models/OutboxEvent.js';

// Max publish attempts before permanently failing an event
const MAX_PUBLISH_ATTEMPTS = 5;

// Retry backoff: exponential, base 5 seconds
const BACKOFF_BASE_MS = 5_000;

/**
 * publishPendingEvents
 *
 * Core publisher loop. Called by cronWorker on a polling interval.
 * Processes up to batchSize PENDING events per invocation.
 *
 * @param {Queue} queue     - BullMQ Queue instance for domain-event-queue
 * @param {number} batchSize - Max events to process per poll (default 50)
 * @returns {Promise<{ published: number, failed: number, errors: string[] }>}
 */
export async function publishPendingEvents(queue, batchSize = 50) {
    const stats = { published: 0, failed: 0, errors: [] };

    let pendingEvents;
    try {
        pendingEvents = await OutboxEvent.find({
            status:      'PENDING',
            availableAt: { $lte: new Date() }
        })
        .sort({ availableAt: 1 })  // oldest first
        .limit(batchSize)
        .lean();
    } catch (err) {
        console.error('[OutboxPublisher] Failed to query pending events:', err.message);
        stats.errors.push(`query: ${err.message}`);
        return stats;
    }

    if (pendingEvents.length === 0) return stats;

    console.log(`[OutboxPublisher] Processing ${pendingEvents.length} pending event(s)`);

    for (const event of pendingEvents) {
        try {
            // ─── Build lightweight queue job payload ─────────────────────────
            // Do NOT put the full Mongo document in Redis — lightweight reference only.
            // Consumer fetches additional data from DB if needed.
            const jobPayload = {
                eventId:    event.eventId,
                eventType:  event.eventType,
                entityType: event.entityType,
                entityId:   String(event.entityId),
                occurredAt: event.occurredAt?.toISOString(),
                payload:    event.payload
            };

            // ─── Push to domain-event-queue ───────────────────────────────────
            // jobId = eventId: BullMQ deduplicates within active/waiting set.
            // This prevents duplicate jobs when the publisher re-polls before
            // the previous publish is confirmed.
            await queue.add(event.eventType, jobPayload, {
                jobId: event.eventId   // UUID v4 — publisher-level dedup
            });

            // ─── Mark as PUBLISHED ────────────────────────────────────────────
            await OutboxEvent.findOneAndUpdate(
                { _id: event._id, status: 'PENDING' },  // optimistic: only update if still PENDING
                {
                    $set: {
                        status:      'PUBLISHED',
                        publishedAt: new Date()
                    }
                }
            );

            stats.published++;
            console.log(`[OutboxPublisher] ✅ Published ${event.eventType} (eventId=${event.eventId})`);

        } catch (err) {
            const nextAttempt = (event.attempts || 0) + 1;
            const isPermanentlyFailed = nextAttempt >= MAX_PUBLISH_ATTEMPTS;

            // ─── Exponential backoff ──────────────────────────────────────────
            const backoffMs     = BACKOFF_BASE_MS * Math.pow(2, nextAttempt);
            const nextAvailable = new Date(Date.now() + backoffMs);

            await OutboxEvent.findOneAndUpdate(
                { _id: event._id, status: 'PENDING' },
                {
                    $set: {
                        status:      isPermanentlyFailed ? 'FAILED' : 'PENDING',
                        attempts:    nextAttempt,
                        availableAt: nextAvailable,
                        lastError:   err.message?.substring(0, 500) || 'Unknown error'
                    }
                }
            );

            if (isPermanentlyFailed) {
                stats.failed++;
                console.error(
                    `[OutboxPublisher] ❌ PERMANENTLY FAILED ${event.eventType} ` +
                    `(eventId=${event.eventId}, attempts=${nextAttempt}): ${err.message}`
                );
            } else {
                console.warn(
                    `[OutboxPublisher] ⚠️ Retry ${nextAttempt}/${MAX_PUBLISH_ATTEMPTS} ` +
                    `for ${event.eventType} (eventId=${event.eventId}): ${err.message}. ` +
                    `Next attempt at ${nextAvailable.toISOString()}`
                );
            }

            stats.errors.push(`${event.eventId}: ${err.message}`);
        }
    }

    if (stats.published > 0 || stats.failed > 0) {
        console.log(`[OutboxPublisher] Batch complete — published=${stats.published} failed=${stats.failed}`);
    }

    return stats;
}

export default { publishPendingEvents, MAX_PUBLISH_ATTEMPTS };
