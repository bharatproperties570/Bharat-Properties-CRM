# STEP_15_R14_R16_RECOVERY_OWNERSHIP_REVIEW

## 1. TRACE LEADCREATIONREQUEST
- **A. Who creates LeadCreationRequest?** `LeadCreationEngine` and `DealCreationEngine` (Phase 5 files).
- **B. Initial status?** In `LeadCreationEngine`, it is created directly as `success`. In `DealCreationEngine`, it is created as `pending`.
- **C. Does any code set it to `processing`?** **NO.**
- **D. Does any code set it back to `pending`?** **NO.**
- **E. Does any retry path actually depend on stale recovery?** **NO.** In `DealCreationEngine`, the `pending` state only exists temporarily within an uncommitted MongoDB transaction. It is updated to `success` prior to commit.
- **F. What happens if a process crashes?** The MongoDB transaction aborts. The `pending` idempotency log is safely rolled back (deleted) via MVCC.
- **G. Can a stale request permanently block retries?** No. Since it rolls back, the key is freed.
- **H. Existing recovery?** Yes, MongoDB ACID Transaction Rollback natively handles it.
- **Conclusion:** Searching for and attempting to recover a `processing` `LeadCreationRequest` is semantically void. The state mathematically cannot exist in the database.

## 2. TRACE DOMAINEVENT
- **A. Who creates DomainEvent?** `DealCreationEngine` (Phase 5).
- **B. Who changes status to processing?** `distributionWorker` (Phase 5).
- **C. Who changes status to success?** `distributionWorker` (Phase 5).
- **D. Who changes status to failed?** `distributionWorker` (Phase 5).
- **E. Who recovers stale DomainEvents?** Phase 5's uncommitted `cronWorker.js` modifications.
- **F. Does Production generate DomainEvents?** **NO.**
- **G. Does baseline have a consumer?** **NO.** The baseline `distributionWorker` handles generic entity distribution, not `process_domain_event`.

## 3. CRASH RECOVERY OWNERSHIP
- **A. RECORD CONTRACT:** R14 purely owns the schema compatibility (`ruleType`, `status`, `ruleId`).
- **B. RECOVERY (`processing` -> `pending`):** Owned by Phase 5. The `processing` status itself does not even exist in the baseline schema, nor is it ever applied by any baseline worker. 
- **C. DISPATCH:** Owned by Phase 5.
- **Conclusion:** R14 does not own crash recovery. Crash recovery is an inseparable part of the Phase 5 outbox pattern.

## 4. PRODUCTION BASELINE TEST
- **Does baseline create DomainEvent?** No.
- **Does baseline create LeadCreationRequest?** No.
- **Does baseline use `processing`?** No.
- **Does baseline need stale recovery?** No.
- **Would it touch existing logs?** No.
- **Conclusion:** Adding recovery to R14 is operationally meaningless against the baseline and only serves to couple R14 tightly to Phase 5 architecture.

## 5. FIVE-MINUTE RECOVERY SAFETY
- **`executedAt` update:** Yes, `distributionWorker` updates it when claiming the job.
- **Lease/Heartbeat:** There is no active lock renewal/heartbeat.
- **Can work exceed 5 minutes?** Yes. Node.js lacks hard execution boundaries; external webhooks/DB congestion can extend processing arbitrarily.
- **Race Condition:** If a worker exceeds 5 minutes, cron reverts it, another worker claims it, resulting in dual concurrent execution.
- **Classification:** **CONDITIONALLY_SAFE**. It relies entirely on downstream `AutomationEngine` idempotency guards (60s Redis lock and Sequence matrices) to deduplicate the business effects. It is not formally mathematically proven safe at the infrastructure layer.

## 6. R14 DESIGN OPTIONS
- **Selected Design:** **DESIGN D: R14 = schema only; Phase 5 = stale recovery + distribution durability**
  - **Exact files:** `backend/models/AutomationLog.js` ONLY.
  - **Dependency requirements:** Phase 5 handles its own cron logic.
  - **Production compatibility:** 100% compatible.
  - **Risk:** Zero. No behavioral logic is introduced.
  - **Architectural coupling:** Completely decoupled. R14 acts solely as an infrastructure patch.

## 7. IMPORTANT LEADCREATIONREQUEST QUESTION
- **Necessity:** Fully unnecessary. It acts exclusively as a synchronous API idempotency lock secured by a MongoDB transaction. It is not an asynchronous distribution event and never enters the `processing` state.

## 8. MINIMUM SAFE R14
The minimum safe R14 contract consists solely of adding enum values (`DomainEvent`, `LeadCreationRequest`, `processing`) and dynamically unbinding the `ruleId` validation requirement for those specific types. 

========================================================
9. FINAL DECISION
========================================================
R14_SCHEMA_ONLY

**Evidence:** Detailed code tracing confirms that neither `DomainEvent` nor `LeadCreationRequest` are utilized by the baseline. Furthermore, `LeadCreationRequest` does not utilize the `processing` state at all. Recovery from `processing` to `pending` is a feature of the Phase 5 outbox consumer (`distributionWorker`). Assigning recovery logic to R14 falsely couples schema validation remediation with Phase 5 background durability architecture.

========================================================
10. IMPLEMENTATION PLAN
========================================================
- **Files to modify:** `backend/models/AutomationLog.js`
- **Exact responsibility:** Append enum values and implement dynamic `required` property for `ruleId`.
- **Code to remove:** Discard **all** modifications to `backend/src/workers/cronWorker.js` from the current R14 reconstruction (remove both the `updateMany` recovery and the `sweep` block).
- **Dependency Prerequisites:** Phase 5 must introduce its own recovery and dispatch cron logic when it introduces the durable worker consumers.
- **Tests required:** `node --check` and static schema initialization.
- **Runtime verification:** Start app locally to ensure schema loads without Mongoose crashes.
- **Production safety checks:** Ensure no cron worker behavior changes are deployed.
- **Rollback plan:** `git checkout HEAD^ backend/models/AutomationLog.js`
