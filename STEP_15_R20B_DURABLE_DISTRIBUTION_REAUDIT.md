# STEP_15_R20B_DURABLE_DISTRIBUTION_REAUDIT

## 1. Repository State
- **HEAD:** `9b0ddc19f3d91bc236a6f36c7174bd282f65a675`
- **Tracked Modifications:** `backend/models/AutomationLog.js` (Authorized R14 Schema patch).
- **Untracked Artifacts:** 16 markdown files.
- **Recovered Files:** `AutomationEngine.js`, `WorkflowEngine.js`, `distributionWorker.js`, and `cronWorker.js` are in their clean baseline state.

## 2. Artifact Provenance
- `backend/models/AutomationLog.js`: Contains R14 schema updates (`DomainEvent`, `processing` status, conditional `ruleId`).
- `backend/src/workers/distributionWorker.js`: Purely handles legacy `distributeEntity`.
- `backend/src/workers/cronWorker.js`: Purely handles legacy sweeps (`lead_inactivity`, `deal_inactivity`).
- `backend/services/AutomationEngine.js`: Contains legacy `eventBus` listeners and synchronous `executeAction` invocation without idempotency guards.
- `backend/src/utils/WorkflowEngine.js`: Direct legacy execution of triggers without ActionLock database states.

## 3. DomainEvent Lifecycle
The intended Phase 5 flow:
1. Business transaction -> `AutomationLog` DomainEvent (Unimplemented in baseline).
2. Transaction commit -> `distributionQueue` dispatch (Unimplemented in baseline).
3. Worker claim -> `findOneAndUpdate` to `processing` (Unimplemented in baseline).
4. Processing -> `AutomationEngine.processEvent` (Available, but inherently unsafe for retries).
5. Success/Failed -> `status` update (Unimplemented in baseline).
*Note: This transition logic exists only in uncommitted Phase 5 dirty worktrees and was reverted during the R20 recovery.*

## 4. DistributionWorker Audit
The baseline `distributionWorker.js` handles `distributeEntity` on `distributionQueue`.
Adding `process_domain_event` to the **same queue** introduces a resource contention risk. If domain events flood the queue, lead distribution latency will spike. While functionally possible, it violates isolation and changes the operational semantics of existing `distributeEntity` processing.

## 5. CronWorker Audit
Baseline `cronWorker` handles `deal_inactivity` and `activity_overdue`.
The proposed Phase 5 stale recovery sweep (`processing` -> `pending` after 5 minutes) is **UNSAFE**. Node.js workers do not renew leases. If a legitimately running worker processing a slow WhatsApp API call exceeds 5 minutes, cron will re-queue the event. A second worker will claim it, leading to a concurrent race condition and guaranteed duplicate side-effects.

## 6. AutomationEngine Audit
`AutomationEngine.processEvent()` is currently invoked synchronously via `eventBus`. 
It loops over actions and calls `WorkflowEngine.executeAction()`. 
**Conclusion:** It CANNOT safely provide retryable, idempotent processing for DomainEvents because it lacks action-level state tracking (ActionLock). Re-running a DomainEvent will blindly re-execute all network side effects.

## 7. Crash Window Analysis
- **CASE 1 (process crashes before queue enqueue):** Durable state is `pending`. Safe if sweep exists.
- **CASE 2 (process crashes before worker):** Durable state is in Redis. Safe.
- **CASE 3 (process crashes before completion):** Durable state is `processing`. Duplicate risk is HIGH on retry due to partial execution.
- **CASE 4 (worker crashes before marking success):** Durable state is `processing`. Guaranteed duplicate side effect on retry because external API calls cannot be rolled back.
- **CASE 5 (cron requeues legitimately running worker):** Guaranteed concurrent duplicate execution.

## 8. Idempotency Analysis
- `AutomationLog.idempotencyKey` exists in schema but is unused by the legacy engine for external actions.
- ActionLock logic does NOT exist in the baseline.
- **Actual Guarantees:** UNPROVEN / AT-LEAST-ONCE (at best) for DomainEvents. 

## 9. EventBus Coexistence
- **Mongoose `Deal.js` & `Lead.js`:** Directly emit `eventBus.emit('DEAL_CREATED')` and `LEAD_CREATED` via post-save middleware.
- **`AutomationEngine.js`:** Listens directly to these signals.
- **`$locals.skipEventBus`:** NOT implemented in Mongoose schemas.
- **Dual-Dispatch:** If a new Engine (e.g., `LeadCreationEngine`) emits a `DomainEvent`, the underlying `lead.save()` will STILL fire the Mongoose middleware. This creates a critical dual-dispatch path where BOTH the EventBus and DomainEvent trigger the AutomationEngine.

## 10. AutomationLog Compatibility
The R14 schema natively supports `DomainEvent`, `LeadCreationRequest`, and `processing` states. It relaxes `ruleId` validation correctly. It is fully compatible with intended Phase 5 operations.

## 11. Production Compatibility
Minimum regression matrix required before DomainEvent introduction:
- Verify legacy `distributeEntity` job throughput is unaffected.
- Verify `EventBus` synchronous execution is preserved.
- Verify Mongoose post-save hooks do not dual-dispatch if DomainEvents are used.
- Verify failed DomainEvent transitions to `failed` without crashing the worker process.

## 12. Minimum Reconciliation
**MUST HAVE:**
- Action Idempotency (`ActionLock`) in `WorkflowEngine`.
- Dual-dispatch suppression (e.g., `$locals.skipEventBus`) in Mongoose middleware.
- Dedicated queue (e.g., `domainEventQueue`) for DomainEvents to protect `distributionWorker`.

## 13. Dependency Graph & 14. Implementation Order
1. Action Idempotency Hardening (To make retries safe).
2. Dual-Dispatch Suppression (`skipEventBus`).
3. DomainEvent Queue & Worker logic.
4. Cron Stale Recovery (Only safe *after* ActionIdempotency).
5. Engine Migration (LeadCreationEngine / DealCreationEngine).

## 15. Acceptance Criteria
- No duplicate WhatsApp/SMS sent on worker crash/retry.
- Legacy `distributeEntity` SLA maintained.
- Zero dual-dispatch triggers.

## 16. Final Verdict
**R20B_REQUIRES_DESIGN_REFINEMENT**
