# STEP_15_R22_R21_CONTRADICTION_AUDIT

## 1. Executive Summary
This read-only audit resolves contradictions between earlier reports and the R21 Durable Distribution architecture. By verifying actual code rather than assumptions, this audit confirms that `EventBus` dual-dispatch is a real threat, but completely rejects R21's custom processing lease and heartbeat model. Because the system utilizes BullMQ, native queue locking provides worker crash recovery, making custom MongoDB processing leases and cron stale-recovery sweeps both redundant and unsafe.

## 2. EventBus Verification
**Finding:** EVENTBUS_ACTIVE
**Evidence:** `backend/models/Deal.js` (lines 472-481) and `backend/models/Lead.js` (lines 494-508) explicitly execute `eventBus.emit` inside `post('save')` and `post('findOneAndUpdate')` middleware. `AutomationEngine.js` explicitly imports `EventBus` and listens to these signals synchronously.
**Conclusion:** The earlier enterprise claim ("Deal.js imports eventBus but does not use it") was factually incorrect. R21 was correct: any Enterprise Engine saving these documents will trigger legacy automation synchronously.

## 3. $locals.skipEventBus Assessment
**Classification:** REQUIRED
Adding `if (doc.$locals && doc.$locals.skipEventBus) return;` to Mongoose post-save hooks is strictly necessary to prevent Enterprise Engines (which write `DomainEvents`) from simultaneously triggering legacy `EventBus` automation. It introduces zero overhead, relies on standard Mongoose context propagation, and guarantees single-dispatch execution.

## 4. ActionLock Assessment
**Finding:** No dedicated ActionLock exists, but `AutomationLog` contains `idempotencyKey` with a unique, sparse index.
`WorkflowEngine.js` currently uses this only for `fire_automated_action` via a non-atomic `findOne` read-before-write, which is unsafe under concurrency. Native actions (`send_communication`, etc.) lack this completely.
**Conclusion:** A new `ActionLock` collection is UNNECESSARY. Existing `AutomationLog` uniquely supports atomic upserts (`findOneAndUpdate`) on `idempotencyKey`, which perfectly satisfies the idempotency requirement without schema bloat.

## 5. External Side-Effect Idempotency
- **WhatsApp (Meta API):** UNPROTECTED. The provider lacks a native idempotency header for generic dispatches.
- **SMS:** UNPROTECTED.
- **Sequence (marketingQueue):** PROTECTED (Potentially). BullMQ supports `jobId` deduplication on enqueue.
- **Notification:** UNPROTECTED.
- **Update Field:** PROTECTED. Overwriting DB state is inherently idempotent.
**Conclusion:** Because external HTTP APIs lack idempotency, duplicate prevention MUST occur locally via MongoDB `AutomationLog` before the HTTP POST.

## 6. DomainEvent Identity
The canonical identity of a specific action attempt is:
`ActionLock:Event:${eventId}:Trigger:${triggerId}:Action:${actionId}`
This string serves as the `idempotencyKey` for the atomic `AutomationLog` claim.

## 7. Queue Isolation
**Finding:** Dedicated Queue is a MUST HAVE.
**Evidence:** `distributionQueue` exclusively handles `distributeEntity` (Lead routing to Agents) which has strict latency requirements. BullMQ concurrency limits apply per worker. Flooding `distributionQueue` with thousands of bulk `DomainEvents` will block lead assignments, causing critical operational delays. A separate `domainEventQueue` with its own `Worker` concurrency pool is mandatory.

## 8. Lease/Recovery Analysis
**Finding:** R21's custom lease/heartbeat model is REJECTED.
**Evidence:** The system uses **BullMQ**. BullMQ natively manages `lockDuration` (default 30s) and background lock renewal via Redis. If a Node worker crashes, BullMQ's stalled job checker automatically re-enqueues the job. 
**Conclusion:** Building a custom MongoDB `leaseUntil` and heartbeat for worker processing is an anti-pattern. BullMQ provides this out-of-the-box. The only custom recovery needed is a cron sweep for `status: 'pending'` events that crashed *before* reaching BullMQ.

## 9. Crash-Window Matrix
- **CASE A (Mongo commit -> process crash -> queue not enqueued):** 
  - **Durable State:** `pending` in Mongo. 
  - **Recovery:** Cron sweep of `pending` logs older than 5m enqueues them. **RECOVERED**.
- **CASE B (queue enqueue -> worker crash):** 
  - **Durable State:** Job in Redis. 
  - **Recovery:** BullMQ native stall recovery. **RECOVERED**.
- **CASE C (worker claim -> external API succeeds -> worker crashes):** 
  - **Recovery:** BullMQ retries the job. The worker attempts to acquire `ActionLock` via `idempotencyKey`. Since the lock is stuck in `processing`, it must timeout. If ActionLock allows claiming `processing` locks older than 5m, the lock is acquired, and the API is called again. **DUPLICATE POSSIBLE** (AT-LEAST-ONCE).
- **CASE D (worker claim -> external API fails -> worker crashes):** 
  - Same as C. **RECOVERED**.

## 10. Minimum Safe Architecture
**MUST HAVE:**
1. `$locals.skipEventBus` in Mongoose models.
2. Dedicated `domainEventQueue` BullMQ instance.
3. `ActionLock` idempotency in `WorkflowEngine.executeAction` using `AutomationLog.findOneAndUpdate`.
4. BullMQ native retry handling (No custom Mongo processing sweeps).
5. Cron enqueue-sweep strictly limited to `status: 'pending'`.

**REJECTED (DO NOT BUILD):**
- Custom worker heartbeat.
- Custom `leaseUntil` processing sweeps.
- Dedicated `ActionLock` MongoDB schema.

## 11. Production Reconciliation
- `AutomationLog.js`: R14 modifications completely preserved.
- `cronWorker.js`: Keep baseline. Add a simple `pending` outbox sweep (no `processing` sweeps).
- `WorkflowEngine.js`: Baseline requires injection of `ActionLock` atomic claims around side-effects.

## 12. Scope Boundary
The exact boundary eliminates custom worker leases and utilizes native BullMQ safety, drastically reducing complexity.

## 13. Single Next Implementation Gate
**OBJECTIVE:** GATE 1: Idempotency & Workflow Hardening
- **Exact Files:** `backend/src/utils/WorkflowEngine.js`, `backend/services/AutomationEngine.js`
- **Change Boundary:** Wrap `WorkflowEngine.executeAction` in `AutomationLog` upsert lock. Inject `eventId` propagation from `AutomationEngine`. Pass `jobId` to `marketingQueue.add`.
- **Things explicitly NOT to change:** Mongoose models, Queues, Workers.

## 14. Final Verdict
**R22_REFINES_R21**
