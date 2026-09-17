# STEP_15_R14_R15_ARCHITECTURAL_BOUNDARY_REVIEW

## 1. DEFINE R14 CONTRACT
- **Failure Mode Addressed:** Mongoose `ValidationError` triggered when Phase 5 engines (e.g., `DealCreationEngine`) attempt to insert `AutomationLog` documents with `ruleType: 'DomainEvent'` or `ruleType: 'LeadCreationRequest'` without a `ruleId`.
- **Scope:** R14 is primarily a schema contract compatibility fix to unblock the Phase 5 Transactional Outbox pattern. 
- **Recovery Obligation:** While crash recovery (`processing` -> `pending`) is necessary for the outbox pattern to be completely durable, it is a feature of the *distribution architecture* (Phase 5). 

## 2. TRACE DOMAIN EVENT LIFECYCLE
- **Creation:** `DealCreationEngine` creates the `AutomationLog` as `pending` alongside the entity in a MongoDB transaction.
- **Dispatch:** A cron sweep or a post-commit hook adds it to `distributionQueue`.
- **Processing:** `distributionWorker` claims the job and updates the DB status to `processing`.
- **Completion:** Worker successfully dispatches to `eventBus` / downstream and marks as `success`, or fails and marks as `failed`.
- **Stale:** If the worker crashes mid-execution (OOM/kill), the DB remains stuck in `processing`.

## 3. SEPARATE TWO CONCERNS
- **A. CRASH RECOVERY:** `AutomationLog.updateMany` (reverting `processing` -> `pending`). This is a pure data-integrity cleanup. It can execute independently.
- **B. DISTRIBUTION SWEEP:** `AutomationLog.find` (sweeping `pending`) and `distributionQueue.add`. 
- **Separation:** Recovering a record to `pending` does not inherently require sweeping it immediately in the same block. They are independent concerns.

## 4. BASELINE ANALYSIS
- **Baseline:** `9b0ddc19f3d91bc236a6f36c7174bd282f65a675`
- **Findings:** The baseline `cronWorker.js` contains jobs for `dailyInactivityCheck` and `evaluateTimeBasedTriggers`. It does **NOT** contain `sweepPendingDistributionEvents`.
- **Eventing:** The baseline `AutomationEngine.js` relies on synchronous `eventBus` memory emissions, not the durable `AutomationLog` outbox pattern. 
- **Feasibility:** A minimal recovery block (`updateMany`) *can* be safely inserted into the baseline cron without crashing, but it will essentially act on data that the baseline architecture doesn't generate.

## 5. SWEEP_PENDING_DISTRIBUTION_EVENTS
- **Records Processed:** `LeadDistribution` and `DomainEvent`.
- **Action:** Issues `distributionQueue.add()`.
- **Consumers:** Baseline `distributionWorker` is ONLY programmed to handle `distributeEntity` logic. It does **not** possess the Phase 5 handlers for `process_domain_event`.
- **Conclusion:** Importing the sweep function implicitly imports the entire Phase 5 outbox architecture. If run against the baseline, sweeping a `DomainEvent` into the baseline `distributionWorker` would cause runtime crashes because the worker lacks the corresponding handler.

## 6. MINIMAL R14 DESIGN
**DESIGN D: Phase 5 distribution durability is an explicit prerequisite; R14 itself contains only the schema contract and minimal compatibility.**
- **Required Files:** `backend/models/AutomationLog.js` (Schema fix), `backend/src/workers/cronWorker.js` (`updateMany` recovery logic ONLY).
- **Dependencies:** Phase 5 Distribution Architecture.
- **Risk:** Zero risk. If the data doesn't exist, the `updateMany` affects 0 documents.
- **Rollback:** Trivial schema/query revert.
- **Production Safety:** 100% safe to deploy to the current baseline because it does not invoke `distributionQueue.add` on unsupported event names.

## 7. LEADCREATIONREQUEST
- **Validity:** It is an API request idempotency lock, not a background distribution event.
- **Recovery Semantics:** If an API process crashes while holding the `processing` lock, subsequent client retries will throw `IdempotencyError` permanently. Recovering it from `processing` to `pending` allows a subsequent client API retry to successfully re-acquire the lock. 
- **Conclusion:** Stale recovery for `LeadCreationRequest` is semantically correct and necessary, but it must strictly be excluded from the distribution sweep (which it is, since the sweep queries `ruleType: 'DomainEvent'`).

## 8. FIVE-MINUTE TIMEOUT
- **Classification:** **CONDITIONALLY SAFE**
- **Rationale:** Node.js offers no hard architectural guarantee that a task cannot exceed 5 minutes. If a worker gets CPU-starved or an external API hangs indefinitely without timeouts, execution could surpass 5 minutes. The cron would forcefully revert it, leading to a concurrent queue dispatch and potential duplicate execution. Safety relies entirely on downstream idempotency matrices (which Phase 5 implements), making it conditionally safe rather than mathematically proven.

## 9. PRODUCTION BASELINE COMPATIBILITY
- **Schema Only:** Fully compatible.
- **Minimal Recovery (`updateMany`):** Fully compatible.
- **Distribution Sweep (`queue.add`):** **INCOMPATIBLE**. Baseline `distributionWorker` cannot process `DomainEvent`.

========================================================
10. FINAL ARCHITECTURAL DECISION
========================================================
R14_REQUIRES_PHASE5_PREREQUISITE

**Evidence:** The R14 reconstruction inappropriately copied Phase 5's `sweepPendingDistributionEvents` into `cronWorker.js`. The baseline does not support background `DomainEvent` outbox processing. Delivering the sweep logic silently absorbs an incomplete Phase 5 feature, which would crash the baseline worker. R14 must be reduced to schema definitions and non-dispatching data cleanup.

========================================================
11. IMPLEMENTATION RECOMMENDATION
========================================================
- **Files to Modify:**
  1. `backend/models/AutomationLog.js` (Add `DomainEvent`, `LeadCreationRequest`, `processing`, and conditional `ruleId`).
  2. `backend/src/workers/cronWorker.js` (Add a new cron block strictly executing the `updateMany` recovery for stale `processing` records. Do NOT add `find` or `distributionQueue.add`).
- **Do NOT Copy:** `sweepPendingDistributionEvents` dispatch logic, `DealCreationEngine.js`, or any worker handlers.
- **Dependency Prerequisites:** Phase 5 distribution architecture must be handled in its own dedicated PR.
- **Tests Required:** Static schema validation; unit tests confirming `updateMany` executes without syntax errors.
- **Runtime Tests:** Local in-memory MongoDB tests verifying the `ruleId` conditional requirement. Do NOT use Production.
- **Final Acceptance Criteria:** The baseline codebase boots successfully, the schema accepts `DomainEvent` without `ruleId`, and the cron worker boots without reference errors.
