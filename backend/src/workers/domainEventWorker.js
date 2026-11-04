/**
 * Phase E.3-B — Domain Event Consumer (Execution Mode)
 *
 * Consumes jobs from the existing domain-event-queue (populated by OutboxPublisher).
 * Performs trigger lookup, condition evaluation, and ACTION EXECUTION
 * with atomic idempotency claim protection.
 *
 * EXECUTION MODE means:
 *   ✓ Receives domain events from BullMQ
 *   ✓ Validates event envelope
 *   ✓ Maps eventType → { module, event } via static lookup table
 *   ✓ Queries Trigger model for matching active triggers
 *   ✓ Evaluates trigger conditions via WorkflowEngine.evaluateRules()
 *   ✓ Claims each action atomically via AutomationLog.idempotencyKey (unique index)
 *   ✓ Calls WorkflowEngine.executeAction() for claimed actions
 *   ✓ Updates claim status after execution
 *
 * Idempotency contract:
 *   Key format: outbox-{eventId}-{triggerId}-{actionIndex}
 *   Claim mechanism: AutomationLog.create({ status: 'pending' })
 *   Concurrency protection: MongoDB E11000 duplicate key rejection
 *   Crash recovery: 'pending' claims allow re-execution on retry
 *
 * IMPORTANT — executeAction() Limitation:
 *   WorkflowEngine.executeAction() NEVER throws to its caller.
 *   The consumer's claim status 'success' means "execution was attempted",
 *   NOT "external side effect definitely succeeded".
 *   This is the approved E.3-A Approach A semantic.
 *
 * Queue: domain-event-queue (existing — defined in queueManager.js)
 * Concurrency: 1 (deterministic execution order)
 *
 * NOT registered in server.js — activation is Phase E.3-E.
 * Legacy fireEvent() remains active — removal is Phase E.3-F.
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import { Worker } from '../config/redis.js';
import redisConnection from '../config/redis.js';
import Trigger from '../../models/Trigger.js';
import AutomationLog from '../../models/AutomationLog.js';
import { WorkflowEngine } from '../utils/WorkflowEngine.js';

// ── Entity Hydration Allowlist (E.3-D.5-A) ────────────────────
// Maps OutboxEvent.entityType enum → registered Mongoose model name.
// Defence-in-depth: OutboxEvent schema enum already restricts entityType to
// ['Deal', 'Booking']. This allowlist prevents model injection if the enum
// is expanded without a corresponding worker update.
const ALLOWED_ENTITY_MODELS = {
    Deal:    'Deal',
    deal:    'Deal',
    Booking: 'Booking',
    booking: 'Booking',
};

// ── Structured Logger ──────────────────────────────────────────
// Follows the same convention as automationWorker.js
const log = {
    info:  (jobId, msg, m = {}) => console.log(JSON.stringify({
        level: 'info', svc: 'DomainEventConsumer', jobId, msg, ...m,
        ts: new Date().toISOString()
    })),
    warn:  (jobId, msg, m = {}) => console.warn(JSON.stringify({
        level: 'warn', svc: 'DomainEventConsumer', jobId, msg, ...m,
        ts: new Date().toISOString()
    })),
    error: (jobId, msg, m = {}) => console.error(JSON.stringify({
        level: 'error', svc: 'DomainEventConsumer', jobId, msg, ...m,
        ts: new Date().toISOString()
    })),
};

// ── Static Event Mapping Table ─────────────────────────────────
// Maps OutboxEvent.eventType (PascalCase) → Trigger query params (snake_case).
// Explicit and auditable. Do NOT derive dynamically.
const EVENT_MAP = {
    DealCreated: {
        module: 'deals',
        event:  'deal_created',
    },
    BookingCreated: {
        module: 'post_sale',
        event:  'booking_created',
    },
};

// ── Entity ID Resolution ───────────────────────────────────────
// Maps eventType → payload field containing the canonical entity identifier.
// AutomationLog.targetEntityId requires an ObjectId-compatible value.
const ENTITY_ID_MAP = {
    DealCreated:    'dealId',
    BookingCreated: 'bookingId',
};

// ── Envelope Validation ────────────────────────────────────────
// Returns { valid: true } or { valid: false, reason: string }
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

// ── Atomic Idempotency Claim ───────────────────────────────────
// Attempts to atomically claim an action execution via AutomationLog unique index.
//
// Returns:
//   { claimed: true }                     — claim acquired, proceed to execute
//   { claimed: false, reason: string }    — already claimed, skip execution
//   { claimed: true, recovery: true }     — pending recovery, re-execute
//
// Throws on unexpected errors (non-E11000).
const DOMAIN_EVENT_EXECUTION_LEASE_MS = 120000;

async function claimAction({ idempotencyKey, triggerId, targetEntityId, triggerModule }) {
    const claimToken = crypto.randomUUID();
    const leaseUntil = new Date(Date.now() + DOMAIN_EVENT_EXECUTION_LEASE_MS);

    try {
        await AutomationLog.create({
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
        return { claimed: true, claimToken, leaseUntil };
    } catch (err) {
        if (err.code === 11000) {
            // Duplicate key — another worker already claimed this action.
            const existing = await AutomationLog.findOne({ idempotencyKey }).lean();
            if (!existing) {
                return { claimed: false, reason: 'Collision during edge case document deletion' };
            }
            if (existing.status === 'success') {
                return { claimed: false, reason: 'Already processed (status: success)' };
            }
            if (existing.status === 'failed') {
                if (existing.details?.retryable === true) {
                    const updated = await AutomationLog.findOneAndUpdate(
                        {
                            idempotencyKey,
                            status: 'failed',
                        },
                        {
                            $set: { status: 'pending', claimToken, leaseUntil }
                        },
                        { new: true }
                    );
                    if (updated) {
                        return { claimed: true, recovery: true, claimToken, leaseUntil };
                    } else {
                        throw new Error('Lost retry lease acquisition race to another worker');
                    }
                }
                return { claimed: false, reason: 'Already processed (status: failed)' };
            }
            if (existing.status === 'pending') {
                if (existing.leaseUntil && existing.leaseUntil > new Date()) {
                    // Lease is still active. The current owner is executing.
                    // Throw to trigger BullMQ retry (transient condition).
                    throw new Error(`Active lease held by another worker until ${existing.leaseUntil.toISOString()}`);
                }

                // Lease is stale. Attempt atomic acquisition.
                const updated = await AutomationLog.findOneAndUpdate(
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
                    return { claimed: true, recovery: true, claimToken, leaseUntil };
                } else {
                    // We lost the stale acquisition race to another concurrent worker.
                    throw new Error('Lost stale lease acquisition race to another worker');
                }
            }
        }
        // Non-duplicate error — rethrow for BullMQ retry
        throw err;
    }
}

// ── Execution-Mode Job Processor ───────────────────────────────
export async function processDomainEvent(job, testConfig = null) {
    const data = job?.data;

    // Bridge to domainEventWorkerLogic for legacy/aggregate domain events (Lead, Activity, Contact)
    if (data?.aggregateType || ['LeadCreated', 'ActivityCreated', 'ActivityUpdated', 'ActivityDeleted', 'ContactCreated', 'ContactUpdated', 'ManualEnrichmentRequested'].includes(data?.eventType)) {
        const { processDomainEventJob } = await import('./domainEventWorkerLogic.js');
        return await processDomainEventJob(job);
    }

    const isTestMode = testConfig && testConfig.TEST_MODE_REAL_EXECUTION_OVERRIDE === true;
    if (isTestMode && process.env.NODE_ENV !== 'test') {
        throw new Error("CRITICAL SECURITY VIOLATION: Test override attempted outside test environment");
    }
    const E3_D_SHADOW_EXECUTION_DISABLED = !isTestMode; // E.3-D Shadow Mode permanently enabled in production
    const jobId = job.id;

    log.info(jobId, E3_D_SHADOW_EXECUTION_DISABLED ? 'DOMAIN_EVENT_SHADOW_RECEIVED' : 'DOMAIN_EVENT_RECEIVED', {
        eventType:  data?.eventType,
        entityType: data?.entityType,
        entityId:   data?.entityId,
        eventId:    data?.eventId,
    });

    // ── Step 1: Envelope Validation ────────────────────────────
    const validation = validateEnvelope(data);
    if (!validation.valid) {
        log.error(jobId, 'DOMAIN_EVENT_REJECTED', {
            reason: validation.reason,
            eventId: data?.eventId,
        });
        // Malformed — do not retry. Return cleanly so BullMQ marks complete.
        return { status: 'REJECTED', reason: validation.reason };
    }

    const { eventId, eventType, entityType, entityId, occurredAt, payload } = data;

    // ── Step 2: Static Event Mapping ───────────────────────────
    const mapping = EVENT_MAP[eventType];
    if (!mapping) {
        log.warn(jobId, 'DOMAIN_EVENT_SKIPPED', {
            eventId,
            eventType,
            reason: `Unknown eventType: ${eventType}`,
        });
        // Unknown event — complete without retry (not a transient error)
        return { status: 'SKIPPED', reason: `Unknown eventType: ${eventType}` };
    }

    const { module: triggerModule, event: triggerEvent } = mapping;

    // ── Step 3: Resolve canonical entity ID ────────────────────
    // AutomationLog.targetEntityId requires the domain entity's ID.
    const entityIdField = ENTITY_ID_MAP[eventType];
    const targetEntityId = entityIdField ? (payload[entityIdField] || entityId) : entityId;

    // ── Step 4: Trigger Lookup ─────────────────────────────────
    // Replicates the exact query from WorkflowEngine.fireEvent() L703-708
    // companyId: null (not undefined) — prevents Mongoose stripping
    const activeTriggers = await Trigger.find({
        module:    triggerModule,
        event:     triggerEvent,
        isActive:  true,
        companyId: null,
    }).sort({ priority: 1 });

    if (activeTriggers.length === 0) {
        log.info(jobId, 'DOMAIN_EVENT_NO_TRIGGERS', {
            eventId,
            eventType,
            triggerModule,
            triggerEvent,
            reason: 'No active triggers found',
        });
        return { status: 'NO_TRIGGERS', eventId, triggersMatched: 0 };
    }

    // ── Step 4.5: Entity Hydration (E.3-D.5-A) ───────────────────
    // Condition evaluation uses the event-time payload (preserves creation semantics).
    // Action execution requires the full current entity document (_id, mobile,
    // assignedTo, template variables). Hydration provides this.
    //
    // Shadow mode skips hydration entirely — no DB read, no action execution.
    // Missing entity (deleted after creation) is a permanent failure — do not retry.
    // Transient DB errors (connection timeout) propagate to BullMQ for retry.
    let hydratedEntity = null;

    if (!E3_D_SHADOW_EXECUTION_DISABLED) {
        const modelName = ALLOWED_ENTITY_MODELS[entityType];
        if (!modelName) {
            log.error(jobId, 'DOMAIN_EVENT_UNKNOWN_ENTITY_TYPE', {
                eventId,
                entityType,
                reason: 'entityType not in hydration allowlist',
            });
            // Unknown entityType is a permanent configuration error — do not retry
            return { status: 'REJECTED', reason: `Unknown entityType for hydration: ${entityType}` };
        }

        // findById may throw on transient DB errors → let BullMQ retry
        const Model = mongoose.model(modelName);
        hydratedEntity = await Model.findById(entityId).lean();

        if (!hydratedEntity) {
            log.error(jobId, 'DOMAIN_EVENT_HYDRATION_FAILED', {
                eventId,
                entityType,
                entityId: String(entityId),
                reason: 'Entity not found — may have been deleted after creation',
            });
            // Entity deletion is permanent — do not retry.
            // Individual action claims will be marked failed below.
        }
    }

    // ── Step 5: Condition Evaluation + Execution ───────────────
    const executionResults = [];

    for (const trigger of activeTriggers) {
        const conditionResult = WorkflowEngine.evaluateRules(trigger.conditions, payload);

        if (!conditionResult) {
            log.info(jobId, 'DOMAIN_EVENT_CONDITION_NOT_MATCHED', {
                eventId,
                eventType,
                entityId,
                triggerId:     String(trigger._id),
                triggerName:   trigger.name,
            });

            executionResults.push({
                decision: 'CONDITION_NOT_MATCHED',
                eventId,
                triggerId:     String(trigger._id),
                triggerName:   trigger.name,
                conditionResult: false,
            });
            continue;
        }

        // Conditions matched — log shadow match
        if (E3_D_SHADOW_EXECUTION_DISABLED) {
            log.info(jobId, 'DOMAIN_EVENT_SHADOW_TRIGGER_MATCH', {
                eventId,
                triggerId: String(trigger._id),
                triggerPriority: trigger.priority,
                module: triggerModule,
                event: triggerEvent
            });
        }

        // claim and execute each action
        for (let actionIndex = 0; actionIndex < trigger.actions.length; actionIndex++) {
            const action = trigger.actions[actionIndex];
            const actionId = action._id ? String(action._id) : String(actionIndex);
            const isDealCreatedAction = triggerModule === 'deals' && (triggerEvent === 'deal_created' || triggerEvent === 'DealCreated');
            const canonicalKey = `canonical-deal_created-${targetEntityId}-${trigger._id}-${actionId}`;
            const idempotencyKey = E3_D_SHADOW_EXECUTION_DISABLED ? `shadow-${eventId}-${trigger._id}-${actionIndex}` : `outbox-${eventId}-${trigger._id}-${actionIndex}`;

            // ── Step 5a: Atomic Claim ──────────────────────────
            const claim = await claimAction({
                idempotencyKey,
                triggerId:      trigger._id,
                targetEntityId,
                triggerModule,
            });

            if (!claim.claimed) {
                log.info(jobId, 'DOMAIN_EVENT_ACTION_SKIPPED', {
                    eventId,
                    triggerId:      String(trigger._id),
                    actionIndex,
                    actionType:     action.type,
                    idempotencyKey,
                    reason:         claim.reason,
                });

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

            let canonicalClaim = null;
            if (!E3_D_SHADOW_EXECUTION_DISABLED && isDealCreatedAction) {
                // Phase E.3-D.9-B2-B: Check ExecutionCoordinator authority
                const { validateExecutionAuthority } = await import('../utils/executionCoordinator.js');
                const authority = await validateExecutionAuthority('DURABLE', 'deal_created', {
                    overrideOwner: testConfig?.COORDINATOR_OWNER_OVERRIDE || (isTestMode ? 'DURABLE' : undefined)
                });

                if (!authority.authorized) {
                    log.info(jobId, 'DOMAIN_EVENT_DURABLE_EXECUTION_SUPPRESSED', {
                        eventId,
                        triggerId: String(trigger._id),
                        actionIndex,
                        actionType: action.type,
                        reason: authority.reason,
                        coordinatorOwner: authority.owner,
                        epoch: authority.epoch
                    });

                    // Mark queue-level claim as success to avoid futile re-queues
                    await AutomationLog.updateOne(
                        { idempotencyKey, claimToken: claim.claimToken },
                        { $set: { status: 'success', executedAt: new Date(), details: { durableSuppressed: true, reason: authority.reason } } }
                    );

                    executionResults.push({
                        decision:       'SUPPRESSED_COORDINATOR',
                        eventId,
                        triggerId:      String(trigger._id),
                        actionIndex,
                        actionType:     action.type,
                        idempotencyKey,
                        reason:         authority.reason,
                    });
                    continue;
                }

                canonicalClaim = await claimAction({
                    idempotencyKey: canonicalKey,
                    triggerId:      trigger._id,
                    targetEntityId,
                    triggerModule,
                });

                if (!canonicalClaim.claimed) {
                    log.info(jobId, 'DOMAIN_EVENT_CANONICAL_ACTION_SKIPPED', {
                        eventId,
                        canonicalKey,
                        reason: canonicalClaim.reason,
                    });

                    // Mark queue-level claim as success to avoid futile re-queues
                    await AutomationLog.updateOne(
                        { idempotencyKey, claimToken: claim.claimToken },
                        { $set: { status: 'success', executedAt: new Date(), details: { canonicalSkipped: true, reason: canonicalClaim.reason } } }
                    );

                    executionResults.push({
                        decision:       'SKIPPED_DUPLICATE',
                        eventId,
                        triggerId:      String(trigger._id),
                        actionIndex,
                        actionType:     action.type,
                        idempotencyKey: canonicalKey,
                        reason:         canonicalClaim.reason,
                    });
                    continue;
                }
            }

            if (claim.recovery) {
                log.warn(jobId, 'DOMAIN_EVENT_ACTION_PENDING_RECOVERY', {
                    eventId,
                    triggerId:      String(trigger._id),
                    actionIndex,
                    actionType:     action.type,
                    idempotencyKey,
                });
            }

            // ── Step 5b: Execute Action ────────────────────────
            log.info(jobId, 'DOMAIN_EVENT_ACTION_EXECUTING', {
                eventId,
                triggerId:      String(trigger._id),
                triggerName:    trigger.name,
                actionIndex,
                actionType:     action.type,
                idempotencyKey,
            });

            try {
                if (E3_D_SHADOW_EXECUTION_DISABLED) {
                    log.info(jobId, 'DOMAIN_EVENT_SHADOW_ACTION_SUPPRESSED', {
                        eventId,
                        triggerId: String(trigger._id),
                        actionType: action.type,
                        reason: 'E3_D_SHADOW_MODE'
                    });

                    // Mark as success to satisfy claim state machine, with explicit shadow details
                    const result = await AutomationLog.updateOne(
                        { idempotencyKey, claimToken: claim.claimToken },
                        { $set: {
                            status: 'success',
                            executedAt: new Date(),
                            details: { shadowExecution: true, message: 'SHADOW_ACTION_SUPPRESSED' }
                        } }
                    );

                    if (result.modifiedCount !== 1) {
                        throw new Error(`Automation execution ownership lost during success finalization: ${idempotencyKey}`);
                    }

                    executionResults.push({
                        decision:       'SHADOW_SUPPRESSED',
                        eventId,
                        triggerId:      String(trigger._id),
                        actionIndex,
                        actionType:     action.type,
                        idempotencyKey,
                        status:         'success',
                    });
                } else {
                    if (!hydratedEntity) {
                        // Entity was deleted after creation — terminal failure, do not retry
                        const failResult = await AutomationLog.updateOne(
                            { idempotencyKey, claimToken: claim.claimToken },
                            { $set: { status: 'failed', details: { error: 'Entity not found at hydration time', terminal: true } } }
                        );

                        if (canonicalClaim && canonicalClaim.claimToken) {
                            await AutomationLog.updateOne(
                                { idempotencyKey: canonicalKey, claimToken: canonicalClaim.claimToken },
                                { $set: { status: 'failed', details: { error: 'Entity not found at hydration time', terminal: true } } }
                            );
                        }

                        if (failResult.modifiedCount !== 1) {
                            throw new Error(`Automation execution ownership lost during hydration failure finalization: ${idempotencyKey}`);
                        }

                        executionResults.push({
                            decision:       'HYDRATION_FAILED',
                            eventId,
                            triggerId:      String(trigger._id),
                            actionIndex,
                            actionType:     action.type,
                            idempotencyKey,
                            status:         'failed',
                        });
                        continue;
                    }

                    // WorkflowEngine.executeAction() is the canonical execution engine.
                    await WorkflowEngine.executeAction(action, hydratedEntity, trigger, null, false, {
                        callerManagedClaim: true,
                        canonicalClaimAcquired: Boolean(canonicalClaim && canonicalClaim.claimed),
                        idempotencyKey: canonicalKey,
                        claimToken: (canonicalClaim && canonicalClaim.claimToken) || claim.claimToken,
                        leaseUntil: (canonicalClaim && canonicalClaim.leaseUntil) || claim.leaseUntil,
                        actionIndex,
                        rethrowErrors: true
                    });

                    // ── Step 5c: Mark claim as success ─────────────
                    const result = await AutomationLog.updateOne(
                        { idempotencyKey, claimToken: claim.claimToken },
                        { $set: { status: 'success', executedAt: new Date() } }
                    );

                    if (canonicalClaim && canonicalClaim.claimToken) {
                        const canonResult = await AutomationLog.updateOne(
                            { idempotencyKey: canonicalKey, claimToken: canonicalClaim.claimToken },
                            { $set: { status: 'success', executedAt: new Date() } }
                        );
                        if (canonResult.modifiedCount !== 1) {
                            throw new Error(`Automation execution ownership lost during canonical success finalization: ${canonicalKey}`);
                        }
                    }

                    if (result.modifiedCount !== 1) {
                        throw new Error(`Automation execution ownership lost during success finalization: ${idempotencyKey}`);
                    }

                    log.info(jobId, 'DOMAIN_EVENT_ACTION_COMPLETED', {
                        eventId,
                        triggerId:      String(trigger._id),
                        triggerName:    trigger.name,
                        actionIndex,
                        actionType:     action.type,
                        idempotencyKey,
                    });

                    executionResults.push({
                        decision:       'EXECUTED',
                        eventId,
                        triggerId:      String(trigger._id),
                        actionIndex,
                        actionType:     action.type,
                        idempotencyKey,
                        status:         'success',
                    });
                }
            } catch (infraError) {
                // This catch handles infrastructure errors and action execution failures
                log.error(jobId, 'DOMAIN_EVENT_ACTION_INFRA_ERROR', {
                    eventId,
                    triggerId:      String(trigger._id),
                    actionIndex,
                    actionType:     action.type,
                    idempotencyKey,
                    error:          infraError.message,
                });

                // Attempt to mark claim as failed with retryable: true so BullMQ retries can re-acquire
                try {
                    const failResult = await AutomationLog.updateOne(
                        { idempotencyKey, claimToken: claim.claimToken },
                        { $set: { status: 'failed', details: { error: infraError.message, retryable: true } } }
                    );
                    if (canonicalClaim && canonicalClaim.claimToken) {
                        await AutomationLog.updateOne(
                            { idempotencyKey: canonicalKey, claimToken: canonicalClaim.claimToken },
                            { $set: { status: 'failed', details: { error: infraError.message, retryable: true } } }
                        );
                    }
                    if (failResult.modifiedCount !== 1) {
                        log.warn(jobId, 'DOMAIN_EVENT_OWNERSHIP_LOST_DURING_FAIL', {
                            idempotencyKey,
                            originalError: infraError.message
                        });
                    }
                } catch (updateErr) {
                    log.error(jobId, 'DOMAIN_EVENT_CLAIM_UPDATE_FAILED', {
                        idempotencyKey,
                        error: updateErr.message,
                    });
                }

                executionResults.push({
                    decision:       'INFRA_ERROR',
                    eventId,
                    triggerId:      String(trigger._id),
                    actionIndex,
                    actionType:     action.type,
                    idempotencyKey,
                    error:          infraError.message,
                });

                // Rethrow infrastructure errors so BullMQ can retry
                throw infraError;
            }
        }

        log.info(jobId, 'DOMAIN_EVENT_TRIGGER_PROCESSED', {
            eventId,
            eventType,
            triggerId:   String(trigger._id),
            triggerName: trigger.name,
            actionCount: trigger.actions.length,
        });
    }

    if (E3_D_SHADOW_EXECUTION_DISABLED) {
        let suppressedCount = 0;
        let matchedTriggerCount = 0;
        executionResults.forEach(r => {
            if (r.decision === 'SHADOW_SUPPRESSED') suppressedCount++;
        });
        // We log triggers where at least one action was evaluated or condition matched
        const uniqueTriggers = new Set(executionResults.map(r => r.triggerId));
        matchedTriggerCount = uniqueTriggers.size;

        log.info(jobId, 'DOMAIN_EVENT_SHADOW_COMPLETE', {
            eventId,
            triggerCount: activeTriggers.length,
            matchedTriggerCount,
            suppressedActionCount: suppressedCount
        });
    }

    return {
        status:            E3_D_SHADOW_EXECUTION_DISABLED ? 'SHADOW_COMPLETE' : 'EXECUTION_COMPLETE',
        eventId,
        eventType,
        triggersEvaluated: activeTriggers.length,
        executionResults,
    };
}

// ── Worker Construction ────────────────────────────────────────
// Queue name MUST match the existing domain-event-queue in queueManager.js.
// Concurrency = 1 for deterministic execution order.
const outboxWorker = new Worker('domain-event-queue', processDomainEvent, {
    connection:  redisConnection,
    concurrency: 1,
});

outboxWorker.on('completed', (job, result) => {
    log.info(job.id, 'Event processing completed', {
        eventId: job.data?.eventId,
        status:  result?.status,
    });
});

outboxWorker.on('failed', (job, err) => {
    log.error(job?.id, 'Event processing failed', {
        eventId: job?.data?.eventId,
        error:   err.message,
    });
});

outboxWorker.on('error', (err) => {
    // Suppress crash on Redis offline — follows existing convention (cronWorker L376-378)
    if (!err.message?.includes('ECONNREFUSED')) {
        log.error(null, 'Worker error', { error: err.message });
    }
});

let authorityWorker = null;
try {
    const authModule = await import('../../utils/ServerAuthorityProof.js');
    authorityWorker = authModule.domainEventWorker;
} catch (e) {
    // optional in isolated test environments
}

const domainEventWorker = {
    close: async () => {
        await Promise.allSettled([
            outboxWorker?.close?.(),
            authorityWorker?.close?.()
        ]);
    },
    on: (event, cb) => {
        outboxWorker?.on?.(event, cb);
        authorityWorker?.on?.(event, cb);
        return domainEventWorker;
    },
    removeListener: (event, cb) => {
        outboxWorker?.removeListener?.(event, cb);
        authorityWorker?.removeListener?.(event, cb);
        return domainEventWorker;
    }
};

export { domainEventWorker };
export default domainEventWorker;
