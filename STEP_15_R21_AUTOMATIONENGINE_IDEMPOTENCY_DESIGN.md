# STEP_15_R21_AUTOMATIONENGINE_IDEMPOTENCY_DESIGN

## 1. Executive Summary
This architectural read-only audit traced the idempotency boundary of the proposed Phase 5 DomainEvent Outbox mechanism. The audit conclusively proved that the current `AutomationEngine` and `WorkflowEngine` action dispatchers are fundamentally **non-idempotent**. Retrying a `DomainEvent` or triggering a stale recovery sweep will deterministically result in duplicate external side effects (e.g., duplicate WhatsApps). The proposed `cronWorker` recovery mechanism is therefore a P1 architectural hazard until Action-Level idempotency is structurally integrated into the engine.

## 2. AutomationEngine Execution Graph
```
DomainEvent / EventBus 
  │
  ├─> checkRecursionGuard() 
  │
  ├─> marketingQueue.add('process-automation-event')  [NO JOB ID PASSED]
  │
  └─> Trigger Evaluation (Synchronous)
        │
        └─> WorkflowEngine.executeAction()
              │
              ├─> AutomatedAction rules (Checks AutomationLog via non-atomic findOne)
              │
              └─> send_communication (No checks, directly fires Meta API)
```

## 3. External Side-Effect Inventory

| Action | Side Effect | Current Idempotency | Retry | Risk |
|---|---|---|---|---|
| `sendWhatsAppMessage` | Meta API POST | ABSENT | Re-sends | HIGH (Duplicate msg) |
| `sendSms` | SMS API POST | ABSENT | Re-sends | HIGH (Duplicate msg) |
| `marketingQueue.add` | Sequence Enum | ABSENT | Re-enqueues | LOW (Sequence engine handles it downstream) |
| `AutomatedAction` | DB Mutation | Non-atomic `findOne` | Skips if lucky | HIGH (Concurrent race risk) |

## 4. Current Idempotency Mechanisms
- **Event-Level:** The DomainEvent has an `idempotencyKey`, which protects against duplicate outbox persistence and duplicate BullMQ enqueuing (if `jobId` is set).
- **Action-Level:** **ABSENT** for raw triggers (WhatsApp/SMS). Weakly present for `AutomatedAction` via a non-atomic `AutomationLog.findOne` query that is vulnerable to concurrent worker races.
- **Queue-Level:** BullMQ `jobId` is **lost** when crossing into `marketingQueue`.

## 5. Event vs Action Idempotency Analysis
If an event triggers 3 WhatsApp actions, and crashes on the 3rd, the entire `DomainEvent` remains at `status: 'processing'`. 
When the event is retried (via cron recovery), the worker will re-evaluate the Triggers and execute Action 1, Action 2, and Action 3 again.
Because there is no sub-state tracking (Action-Level Idempotency), Action 1 and Action 2 will fire duplicates.

## 6. Partial Failure Analysis
- **CASE A (Action succeeds, worker crashes before event success):** High Duplicate Risk. Next retry will blindly execute the action again.
- **CASE B (Worker timeout, cron reverts to pending, second worker claims):** High Duplicate Risk. Since Node.js does not kill the stalled thread, the first worker continues executing. The second worker executes concurrently. Since `AutomatedAction` uses a non-atomic `findOne` read-before-write, BOTH workers will execute the side effect.
- **CASE C (Two workers execute same event concurrently):** Total duplication of all side effects.

## 7. Provider Semantics
The existing external dispatchers (`whatsappService.js`, `sms.service.js`) do NOT accept or forward an idempotency token to their respective upstream APIs. Provider semantics are entirely **UNKNOWN** and unutilized.

## 8. MarketingQueue Analysis
- **Routing:** `marketingQueue.add('process-automation-event')`
- **Flaw:** It does not inherit the `idempotencyKey` from the `DomainEvent`. 
- **Consequence:** If `AutomationEngine.processEvent()` is invoked a second time on retry, a duplicate `process-automation-event` job is silently enqueued.

## 9. EventBus Analysis
- **Legacy Paths:** `deal.controller.js` and `lead.controller.js` actively emit `EventBus` signals.
- **New Phase 5 Paths:** `DealCreationEngine` and `LeadCreationEngine` will write `DomainEvent` logs and bypass `EventBus`.
- **Coexistence:** Safe. A single business transaction strictly flows through *either* the legacy controller (emitting EventBus) *or* the new Engine (emitting DomainEvent). They do not cross over, eliminating the risk of dual-triggering from a single request.

## 10. Design Options
- **DESIGN A (Event-level only):** Unacceptable. Crashes mid-execution cause duplicate actions.
- **DESIGN B (Action-level idempotency):** **REQUIRED.** Every external action must claim an atomic lock before executing.
- **DESIGN E (Layered event + action + queue):** Target architecture. BullMQ prevents duplicate starts, Action-Locks prevent duplicate steps, and Event-Locks prevent duplicate outbox claims.

## 11. Required Idempotency Identity
To achieve safe Action-Level Idempotency, the identity key must deterministically represent the unique step.
**Format:** `ActionLock:${event.idempotencyKey}:Trigger:${trigger._id}:ActionIndex:${index}`
This guarantees that if the event is retried, the system knows exactly which actions within the trigger have already fired.

## 12. Stale Recovery Prerequisites
The `processing` → `pending` cron sweep must **NOT** be merged into production until Action-Level Idempotency is implemented. A stale recovery without action-locks is fundamentally a duplicate-execution engine.

## 13. Legacy Compatibility
`AutomationEngine.processEvent` must be upgraded to accept an optional `eventId` parameter. 
- If called by `distributionWorker` (DomainEvent), it passes the `idempotencyKey`. Action-Level locks are utilized.
- If called by `EventBus` (Legacy), it passes `null`. It behaves dynamically as it does today.

## 14. Minimal Implementation Boundary
**MUST MODIFY:**
- `backend/services/AutomationEngine.js` (Pass `eventId` to execution pathways).
- `backend/src/utils/WorkflowEngine.js` (Wrap `send_communication` and `AutomatedAction` inside an atomic `AutomationLog.findOneAndUpdate(..., { upsert: true })` check).
- `backend/src/workers/distributionWorker.js` (Inject `eventId` when calling AutomationEngine).

**MUST NOT MODIFY YET:**
- `cronWorker.js` (Do not introduce the recovery sweep until the locks are proven).
- Phase 5 Engines.

## 15. Offline Test Plan
1. **Partial Crash Re-entry:** Call `processEvent` twice. Prove Action 1 does not fire the second time, but Action 2 (which previously crashed) does.
2. **Concurrent Race:** Fire `processEvent` concurrently via `Promise.all`. Prove `AutomatedAction` executes exactly once.
3. **Legacy Fallback:** Call `processEvent` with no `eventId`. Prove it executes normally.
4. **Queue Propagation:** Prove `marketingQueue.add` respects `jobId` deduplication.

========================================================
FINAL VERDICT
========================================================
R21_REQUIRES_DESIGN_REFINEMENT
