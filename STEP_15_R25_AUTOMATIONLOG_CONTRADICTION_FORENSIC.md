# STEP 15 R25 — AUTOMATIONLOG R14/R14B CONTRADICTION FORENSIC

## 1. TimeBasedTrigger Code Trace
- **File:** `backend/src/workers/cronWorker.js`
- **Location:** Inside `evaluateTimeBasedTriggers`, processing `inactiveLeadsCursor`, `inactiveDealsCursor`, and `overdueActivitiesCursor`.
- **Flow:** 
  1. Cron worker finds matching records (e.g., `lead`).
  2. Generates `idempotencyKey = time-trigger-${trigger._id}-${lead._id}`.
  3. Checks `AutomationLog.exists({ idempotencyKey })`.
  4. If false, executes actions via `WorkflowEngine.executeAction(action, lead, trigger, companyId, false)`.
  5. Attempts to persist the idempotency lock via `AutomationLog.create({ ruleType: 'TimeBasedTrigger', ruleId: trigger._id, idempotencyKey, ... })`.

## 2. Validation Failure Trace
- **File:** `backend/models/AutomationLog.js` (Baseline `9b0ddc1`)
- **Enum:** `['Trigger', 'Sequence', 'AutomatedAction', 'ScoringRule']`
- **Failure:** When `cronWorker` calls `AutomationLog.create({ ruleType: 'TimeBasedTrigger' })`, Mongoose synchronously throws a `ValidationError` because `TimeBasedTrigger` is absent from the schema's `ruleType` enum constraint.
- **Handling:** `cronWorker.js` wraps the `AutomationLog.create` inside a `try/catch` block. The exception is caught, logged to `console.error`, and execution continues to the next record. The `AutomationLog` document never reaches MongoDB.

## 3. Idempotency Trace
- **WorkflowEngine Defenses:** If the trigger action is `fire_automated_action`, `WorkflowEngine` generates its own internal `idempotencyKey` (using `entityUpdatedTime`) and successfully creates an `AutomationLog` with `ruleType: 'AutomatedAction'`. This protects `AutomatedAction` targets from infinite execution.
- **Native Action Vulnerability:** If the trigger action is `send_communication` or `update_field` (Native Raw Actions), `WorkflowEngine` executes the action *without* checking or generating an `idempotencyKey`.
- **Cron Defenses:** Because Native Actions lack internal idempotency, they rely entirely on the cron worker's `AutomationLog.create({ ruleType: 'TimeBasedTrigger', idempotencyKey })` to prevent duplicate execution. 
- **The Breakdown:** Because the cron worker's `create` fails validation and throws, the idempotency lock is **never persisted**. On the next cron loop, `hasFired` returns `false`, and the Native Actions are executed again.

## 4. Severity Determination
- **Severity: P0**
- **Reason:** For any time-based trigger using Native Actions (e.g., direct WhatsApp messages or emails for inactive leads), the system will re-execute the action infinitely on every cron tick (usually every 5-15 minutes) until the lead's status is manually changed to break the cron query conditions. This causes catastrophic spamming of end users.

## 5. TriggerDistribution Provenance
- **Origin:** Found strictly in the Enterprise Phase 5 worktree (`bharat-properties-crm`).
- **File:** `backend/src/modules/lead/LeadCreationEngine.js`
- **Baseline:** It is absent from the production baseline (`9b0ddc1`).
- **Usage:** Created explicitly during `withMongoTransaction` when a new Lead is saved. It acts as an outbox marker (`PendingDistribution Outbox Record`) with `status: 'pending'`.

## 6. TriggerDistribution Consumer Analysis
- **Consumer:** Distribution workers (e.g., `distributionQueue` processing `process_pending_distribution`).
- **Purpose:** Identifies that a Lead has been created but has not yet been assigned to an owner via round-robin or geography-based assignment rules. 

## 7. DomainEvent Comparison
- **DomainEvent:** Transactional outbox event denoting a business domain state change (e.g., `LEAD_CREATED`). Processed by `automationQueue` to trigger side-effects like webhook dispatches or Sequences. Does not have a `ruleId`.
- **TriggerDistribution:** Transactional outbox event denoting a pending assignment task. Also lacks a `ruleId`. Architecturally identical pattern to `DomainEvent`, just routed to a different background queue context.

## 8. LeadCreationRequest Comparison
- **LeadCreationRequest:** Transactional inbox event. Serves as a persistent idempotency lock to prevent duplicate webhook payloads from creating duplicate leads. Lacks a `ruleId`. 
- Architecturally, all three (`DomainEvent`, `LeadCreationRequest`, `TriggerDistribution`) are system-level queue/sync markers that have been overloaded into `AutomationLog`.

## 9. PendingDistribution Comparison
- The legacy distribution system often used an in-memory or separate flag, but Phase 5 standardized on writing a durable outbox record to guarantee assignment despite crashes. `TriggerDistribution` is the explicit string literal used to designate a `PendingDistribution` record inside the `AutomationLog` table.

## 10. R14 Boundary Reassessment
- `TimeBasedTrigger` is a severe baseline bug. While it could theoretically be patched separately, the fix requires touching the exact same schema enum in `AutomationLog.js` as the Phase 5 outbox patterns.
- `TriggerDistribution` is a mandatory structural requirement for the Enterprise Phase 5 `LeadCreationEngine` to commit successfully.
- Expanding R14 into R14B to encompass all identified rule types is the most pragmatic way to stabilize both the baseline cron and the Phase 5 enterprise rollout without creating merge conflicts on `AutomationLog.js`.

## 11. R24 Claim Verification
- *"Design A is 100% backward compatible"*: **PROVEN**. Adding string literals to a Mongoose enum and loosening a required constraint does not break any existing read queries or existing data.
- *"Zero deployment risk"*: **CONDITIONALLY TRUE**. The schema change itself has zero risk. The behavioral change (allowing cron workers to successfully persist logs) stops a P0 bug, but it does change runtime behavior.
- *"P0"*: **PROVEN**. Native actions fire infinitely due to the missing enum.
- *"Infinite execution"*: **PROVEN**. Verified via control flow trace of Native Actions inside `WorkflowEngine.executeAction`.

## 12. Production Compatibility
The schema-only patch is completely safe for production deployment. It requires no data migration and repairs the broken idempotency loop.

## 13. Exact Recommended Next Gate
**GATE: R14B Schema Expansion & Verification**
Objective: Apply the schema widening patch to `AutomationLog.js` and verify it enables `LeadCreationEngine` to commit.

## 14. Exact files that should eventually change
- `backend/models/AutomationLog.js`

## 15. Files that must NOT change yet
- `backend/src/workers/cronWorker.js`
- `backend/src/utils/WorkflowEngine.js`
- `backend/src/modules/lead/LeadCreationEngine.js`

## 16. Final Verdict
R25_EXPAND_R14_BOTH
