# STEP_15_R20_DURABLE_DISTRIBUTION_RECONCILIATION_DESIGN

## 1. Executive Summary
This read-only audit evaluated the proposed Phase 5.2 Durable Distribution Infrastructure against the current Production baseline (`9b0ddc19f3d91bc236a6f36c7174bd282f65a675`). The findings reveal severe idempotency flaws in the proposed baseline integration. `AutomationEngine` currently lacks idempotency guards for external actions, meaning the proposed cron stale recovery mechanism will deterministically cause duplicate side-effects (e.g., sending duplicate WhatsApps) if a worker legitimately stalls. The architecture requires refinement before the outbox consumer can be implemented.

## 2. Artifact Provenance

| Component | Baseline | Phase 5 Dirty Worktree | Status |
|-----------|----------|-------------------------|--------|
| `AutomationLog.js` | R14 Patched | Matches R14 | Safe |
| `distributionWorker.js` | Legacy `distributeEntity` only | Adds `process_domain_event` | Needs refinement |
| `cronWorker.js` | Legacy sweeps | Adds `sweepPendingDistributionEvents` | Needs refinement |
| `AutomationEngine.js` | Synchronous `EventBus` | Modified to accept `idempotencyKey` | Missing idempotency |
| `DealCreationEngine.js` | Absent | Present | Dependent on outbox |
| `LeadCreationEngine.js` | Absent | Present | Dependent on outbox |

## 3. DomainEvent Lifecycle
Intended Flow:
1. **Transaction:** `AutomationLog.create({ ruleType: 'DomainEvent', status: 'pending' })`
2. **Post-Commit Dispatch:** `distributionQueue.add('process_domain_event', ...)`
3. **Worker Claim:** `findOneAndUpdate({ status: 'processing', executedAt: new Date() })`
4. **Processing:** `AutomationEngine.processEvent()`
5. **Completion:** `findByIdAndUpdate({ status: 'success' })`
*Missing Transition:* If `processEvent` partially succeeds but the worker crashes, there is no sub-state tracking to prevent re-running already completed synchronous Actions (e.g., SMS dispatch).

## 4. Transactional Outbox Analysis
**Property Verified:** The system enforces standard Transactional Outbox properties. If the DB commits, the event is persisted. If it aborts, it vanishes. Queue dispatch occurs asynchronously post-commit.
**Crash Windows:**
- **CASE 1 (Crash post-commit, pre-enqueue):** Redis misses job. MongoDB has `pending`. **Safe**. Cron sweep recovers and queues after 5 minutes.
- **CASE 2 (Crash post-enqueue, pre-worker):** BullMQ retains job. **Safe**.
- **CASE 3 (Crash mid-processing):** Mongo holds `processing`. Job drops. Cron sweep reverts to `pending` after 5m. **Duplicate Risk** (see Stale Recovery).
- **CASE 4 (Crash post-processing, pre-success):** Mongo holds `processing`. Cron reverts to `pending`. **High Duplicate Risk**.

## 5. DistributionWorker Audit
The baseline `distributionWorker.js` solely handles `distributeEntity`. 
The Phase 5 code introduces `process_domain_event` onto the SAME queue (`distributionQueue`). 
- **Routing:** Job isolation relies on `job.name`. Malformed legacy jobs without a name could potentially clash.
- **Interference:** If `process_domain_event` consumes the queue concurrency, legacy `distributeEntity` (which routes leads to agents) will experience latency.

## 6. AutomationEngine Audit
Baseline `AutomationEngine.js` processes triggers synchronously in memory or pushes `process-automation-event` to `marketingQueue`. 
- **Critical Flaw:** It does **NOT** propagate an idempotency key to `marketingQueue.add()`.
- **Critical Flaw:** `executeAction` (which dispatches emails/SMS) operates synchronously in a loop without checking an idempotency lock for the specific action.

## 7. Idempotency Analysis
- **Current Guarantee:** UNPROVEN / UNSAFE. 
- **Details:** Re-executing a `DomainEvent` through `AutomationEngine` will blindly re-trigger `executeAction`. This guarantees duplicate side effects (SMS/Email) on any worker retry or stale recovery sweep. The system provides AT-LEAST-ONCE delivery but lacks the EXACTLY-ONCE idempotency guards necessary for external communications.

## 8. Stale Recovery Analysis
- **Mechanism:** Cron finds `status: 'processing', executedAt < Date.now() - 5m`, sets to `pending`, and re-queues.
- **Safety Classification:** UNSAFE. 
- **Reason:** Node.js workers do not renew leases. A legitimate webhook bottleneck could stall a worker for >5 minutes. Cron will re-queue the event. A second worker will claim it. Both workers will synchronously execute `AutomationEngine`, resulting in concurrent duplicate side-effects. 5 minutes is a heuristic, not an architectural guarantee.

## 9. Cron Compatibility
Phase 5 dirty worktree ported a `sweepPendingDistributionEvents` block into `cronWorker.js`. 
- **Difference:** Baseline contains standard daily sweeps. Phase 5 adds a 5-minute interval sweep. 
- **Compatibility:** It is syntactically compatible, but conceptually unsafe due to the idempotency flaws described above.

## 10. AutomationLog Compatibility
The R14 schema natively supports the enums (`DomainEvent`, `LeadCreationRequest`, `processing`) and conditionally bypasses `ruleId`. The schema is **100% compatible** with the proposed worker operations (`updateMany`, `findOneAndUpdate`).

## 11. Queue Failure Recovery
- **Survival:** YES. 
- **Mechanism:** Cron scans for `status: 'pending'` older than 5 minutes. 
- **Deduplication:** Cron uses `{ jobId: event.idempotencyKey }` which utilizes BullMQ's native deduplication to prevent double-enqueuing an event already waiting in Redis.
- **Gap:** Introduces a 5-minute SLA latency for failed enqueues, but guarantees eventual delivery.

## 12. EventBus Coexistence Analysis
- **Current Baseline:** Heavily utilizes `EventBus.on('LEAD_CREATED')`.
- **Coexistence:** Safe. The new Outbox architecture (`DomainEvent`) can operate in parallel, provided the new Phase 5 Engines (`LeadCreationEngine`) do **NOT** emit legacy `EventBus` signals. Existing legacy controllers will continue firing `EventBus`, while the new Engines will write `DomainEvent` logs.

## 13. Production Reconciliation Design
To safely reconcile the outbox infrastructure, the design must change:
1. **Idempotency Propagation:** `AutomationEngine` must enforce idempotency on individual Actions, OR the `marketingQueue` must inherit the `DomainEvent`'s `idempotencyKey` as its `jobId`.
2. **Worker Concurrency:** `distributionWorker` should ideally be split, or concurrency carefully managed so `process_domain_event` doesn't block `distributeEntity`.

## 14. Implementation Order
1. **Gate A:** R14 Schema Compatibility (COMPLETE).
2. **Gate B:** AutomationEngine Idempotency & Decoupling (Required to prevent duplicate side effects).
3. **Gate C:** Queue/Worker Infrastructure (`process_domain_event` logic).
4. **Gate D:** Stale Recovery (`cronWorker` sweep).
5. **Gate E:** Engine Migrations (Lead/Deal Creation).

## 15. Backward Compatibility Test Plan
- Verify legacy `distributeEntity` jobs are processed normally.
- Verify `process_domain_event` jobs without valid entities fail gracefully and transition to `failed`.
- Verify `AutomationEngine` processes `EventBus` signals identical to baseline.

## 16. Exact Files To Modify (For Future Implementation)
- `backend/src/workers/distributionWorker.js`
- `backend/src/workers/cronWorker.js`
- `backend/services/AutomationEngine.js`

## 17. Exact Files NOT To Modify
- Any Fat Controller (`deal.controller.js`, `lead.controller.js`).
- `backend/models/AutomationLog.js` (Already handled in R14).

========================================================
FINAL VERDICT
========================================================
R20_REQUIRES_DESIGN_REFINEMENT
