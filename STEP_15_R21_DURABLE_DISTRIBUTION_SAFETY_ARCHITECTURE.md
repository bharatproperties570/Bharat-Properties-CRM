# STEP_15_R21_DURABLE_DISTRIBUTION_SAFETY_ARCHITECTURE

## 1. Executive Summary
This design-only architecture audit evaluates the safety requirements for implementing Phase 5.2 Durable Distribution (DomainEvents). The current baseline lacks the necessary idempotency, dual-dispatch prevention, and queue isolation to safely process asynchronous, retryable DomainEvents. This document defines the required safeguards, including an `ActionLock` idempotency model, a dedicated `domainEventQueue`, and a lease-based recovery mechanism, paving the way for safe enterprise engine migrations.

## 2. Action Inventory
Supported actions inside `WorkflowEngine.executeAction`:
- `fire_automated_action`: Dispatches to `auto-match-dispatch` or `process-automation-event`.
- `send_communication` (WhatsApp/SMS): Synchronous Meta API or SMS provider execution.
- `start_sequence`: Enqueues to `marketingQueue` (drip).
- `send_notification`: Synchronous DB write to create internal notification.
- `update_field`: Synchronous DB write (Mongoose `findByIdAndUpdate`).

## 3. Action Idempotency Audit
- `fire_automated_action`: **UNPROTECTED**. May enqueue multiple jobs if retried.
- `send_communication`: **UNPROTECTED**. Blind HTTP POST. Re-execution guarantees duplicate external messaging.
- `start_sequence`: **PARTIALLY_PROTECTED**. Depends on whether `marketingQueue` enforces unique job IDs.
- `send_notification`: **UNPROTECTED**. Will create duplicate DB notification records.
- `update_field`: **PROTECTED (Conceptually)**. Overwriting a field with the same value is inherently idempotent, though it generates unnecessary DB load.

## 4. ActionLock Analysis
`ActionLock` does **not** currently exist in the baseline (no MongoDB/Redis schema supports it). 
**Design:** It must be a **MongoDB durable state** to ensure persistence across worker restarts and crashes. 
The canonical key must be deterministic: `ActionLock:Event:${eventId}:Trigger:${triggerId}:Action:${actionId}`. 
A `LOCK` prevents concurrent execution (acquired via `upsert` atomic claims). An `IDEMPOTENCY RECORD` prevents repeated execution (retaining a `success` state indefinitely). The ActionLock must serve as both: atomic claim on insertion, and permanent idempotency record on success.

## 5. Crash Consistency Analysis
**Scenario:** Action starts -> API succeeds -> Process crashes -> DomainEvent retried.
Without provider-side idempotency keys (e.g., passing a UUID header to the Meta API), the system **cannot** know the external side effect succeeded. The retry will attempt to re-acquire the `ActionLock`. Since the lock was left in a `processing` state by the dead worker, the recovery mechanism will eventually release it, leading to **duplicate external side-effects**. 
**Actual Guarantee:** **AT-LEAST-ONCE**. The system cannot guarantee exactly-once delivery for external HTTP calls that lack idempotency headers.

## 6. Dual Dispatch Analysis
**Current Baseline:** `backend/models/Deal.js` and `Lead.js` execute `eventBus.emit('DEAL_CREATED', doc)` directly inside `schema.post('save')` hooks. `AutomationEngine` listens to these signals synchronously.
**Dual Dispatch Risk:** If an Enterprise Engine creates a Lead and dispatches a DomainEvent, the `save()` operation will inherently trigger the Mongoose post-save hook, resulting in two independent automation executions (EventBus + DomainEvent).
**Prevention Design:** Introduce `$locals.skipEventBus` in the Mongoose hook:
```javascript
schema.post('save', function(doc) {
    if (doc.$locals && doc.$locals.skipEventBus) return;
    eventBus.emit('LEAD_CREATED', doc);
});
```

## 7. EventBus Migration Boundary
EventBus **can** remain active for legacy fat controllers. The architectural boundary is drawn at the **Business Transaction level**. 
- **Legacy Controllers** save documents normally (triggering EventBus).
- **Enterprise Engines** (e.g., `LeadCreationEngine`) inject `$locals.skipEventBus = true` into the document before saving, and explicitly write a `DomainEvent` outbox record instead. This guarantees strict mutually exclusive execution paths.

## 8. Queue Isolation Analysis
**OPTION A:** Reuse `distributionQueue`.
**OPTION B:** Dedicated `domainEventQueue`.
**Evaluation:** `distributionQueue` manages `distributeEntity`, which routes high-priority incoming leads to agents with strict latency SLAs. `DomainEvents` (bulk imports, trigger evaluations) are high-volume and bursty. Mixing them guarantees severe SLA degradation for lead distribution during bulk operations.
**Decision:** A dedicated `domainEventQueue` is an architectural **MUST HAVE**.

## 9. Lease/Ownership Design
A static 5-minute timeout is fundamentally **UNSAFE** because a legitimately blocked Node.js worker might resume execution after the cron re-queues its job.
**Design:** 
- **State:** Add `leaseUntil` (Date) and `workerToken` (UUID) to `AutomationLog`.
- **Acquisition:** `findOneAndUpdate({ status: 'pending' }, { status: 'processing', leaseUntil: Date.now() + 30000, workerToken })`.
- **Heartbeat:** Worker periodically updates `leaseUntil` while active.
- **Safety Check:** Before executing critical external side-effects, the worker must locally verify its lease has not expired.

## 10. Stale Recovery Design
- **Mechanism:** Cron sweep polling for `status: 'processing', leaseUntil: { $lt: Date.now() }`.
- **Action:** Transition back to `status: 'pending'` (or `failed` if retries exhausted).
- **Classification:** **CONDITIONALLY_SAFE**. It relies on the worker strictly honoring its lease expiration internally (checking the clock before API calls), which is challenging in single-threaded Node.js without pre-flight DB checks.

## 11. DomainEvent State Machine
- `pending`: Ready for queue consumption.
- `processing`: Claimed by a worker (protected by `leaseUntil`).
- `success`: Terminal successful state.
- `failed`: Terminal failure (requires manual intervention or specialized dead-letter retry).
Transitions are atomic via MongoDB `$set` and `$lt` operators on timestamps.

## 12. AutomationLog Role
`AutomationLog` must represent **both**. 
1. **DomainEvent Outbox Record:** `ruleType: 'DomainEvent'` tracking the overarching business event.
2. **Action Execution Record:** `ruleType: 'Trigger'` or `ruleType: 'ActionLock'` tracking the granular execution of specific side-effects within that event.
This prevents state duplication while providing granular auditability.

## 13. Legacy Compatibility
- `distributeEntity` on `distributionQueue` must remain untouched.
- `EventBus` synchronous execution must continue functioning for unmodified legacy controllers.
- Mongoose hook modifications must default to `false` (executing EventBus) to preserve legacy workflows safely.

## 14. Production Reconciliation Boundary (Implementation Order)
The audit derives this strict dependency order:
1. **GATE 1: Dual Dispatch Prevention** (Mongoose `$locals.skipEventBus`).
2. **GATE 2: Queue Isolation** (Establish `domainEventQueue`).
3. **GATE 3: Action Idempotency** (ActionLock in `WorkflowEngine`).
4. **GATE 4: DomainEvent Worker & Lease Recovery** (Worker claim logic & Cron sweep).
5. **GATE 5: Engine Migration** (Migrating specific business flows to use DomainEvents).

## 15. Minimum Safe Architecture
The smallest architecture requires:
- `$locals.skipEventBus` in Mongoose hooks.
- A new `domainEventQueue` in Redis.
- `ActionLock` MongoDB unique-index protection in `WorkflowEngine.executeAction`.
- Explicit `leaseUntil` state transitions in `AutomationEngine`.

## 16. Implementation Dependency Graph
`Mongoose Hooks` <- `Dual Dispatch` <- `DomainEvent Enqueue`
`WorkflowEngine` <- `ActionLock` <- `DomainEvent Processing`
*(Action Idempotency must precede Worker implementation).*

## 17. First Implementation Gate
**Scope:** GATE 1 & GATE 2 (Dual Dispatch + Queue Setup).
- **Exact Files:** `backend/models/Deal.js`, `backend/models/Lead.js`, `backend/src/config/queues.js` (or equivalent queue initialization).
- **Action:** Implement `$locals.skipEventBus` early returns. Initialize `domainEventQueue`.
- **Validation:** Offline Node script tests confirming EventBus suppression when flag is set.

## 18. Exact Files
No files modified in this phase.

## 19. Acceptance Criteria
- DomainEvents must not fire EventBus synchronously.
- Retries must not trigger duplicate WhatsApp/SMS messages.
- Lead distribution SLAs must not be impacted by DomainEvent volume.

## 20. Final Verdict
**R21_READY_FOR_IMPLEMENTATION**
