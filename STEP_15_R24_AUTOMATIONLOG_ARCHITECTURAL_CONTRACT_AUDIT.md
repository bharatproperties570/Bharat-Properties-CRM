# STEP 15 R24 — AUTOMATIONLOG ARCHITECTURAL CONTRACT AUDIT

## 1. Executive Summary
This read-only audit finalizes the `AutomationLog` architectural boundary. `AutomationLog` currently suffers from "God Object" overloading, acting simultaneously as a Business Rule Execution Log and a Transactional Outbox for queue workers. The Enterprise Phase 5 work introduced `TriggerDistribution`, a valid transactional outbox event, which broke the schema because it was not added to the `ruleType` enum. 

Additionally, a severe baseline bug was discovered: `TimeBasedTrigger` is absent from the baseline enum. Because `cronWorker.js` wraps this in a `try/catch`, it fails silently without crashing the worker. However, because the log fails to save, the idempotency lock is never established, causing time-based triggers to execute infinitely on the same records. 

Extending `AutomationLog` (Design A) is the safest immediate remediation to stabilize Phase 5 and fix the baseline cron anomaly without invasive refactoring.

## 2. Complete ruleType Inventory
| ruleType | Producer | Consumer | Purpose | ruleId Required? |
|---|---|---|---|---|
| `Trigger` | `WorkflowEngine` | Audit UI | Logs synchronous trigger execution | **Yes** (`Trigger._id`) |
| `Sequence` | `SequenceEngine` | Audit UI | Logs sequence enrollments/exits | **Yes** (`Sequence._id`) |
| `AutomatedAction` | `WorkflowEngine` | Audit UI | Logs direct automated actions | **Yes** (`AutomatedAction._id`) |
| `ScoringRule` | `ScoringEngine` | Audit UI | Logs score evaluations | **Yes** (`ScoringRule._id`) |
| `TimeBasedTrigger` | `cronWorker` | Audit UI | Logs cron-based trigger execution | **Yes** (`Trigger._id`) |
| `DomainEvent` | Phase 5 Engines | Outbox Worker | Background worker payload | No (System Event) |
| `LeadCreationRequest`| `LeadCreationEngine` | Inbox Worker | Idempotency lock for webhook/API | No (System Event) |
| `TriggerDistribution`| `LeadCreationEngine` | Distribution Worker | Pending distribution outbox | No (System Event) |

## 3. Producer/Consumer Matrix
See Section 2.

## 4. Business Rule vs Outbox Separation
The model is currently serving two distinct architectural roles:
1. **BUSINESS RULE EXECUTION LOG:** `Trigger`, `Sequence`, `AutomatedAction`, `ScoringRule`, `TimeBasedTrigger`. These represent actual business logic executions requested by the user. They have a concrete `ruleId` mapping to a user-defined configuration.
2. **TRANSACTIONAL OUTBOX:** `DomainEvent`, `LeadCreationRequest`, `TriggerDistribution`. These are infrastructure-level lifecycle events used strictly by backend queue workers for reliable state transfer. They have no mapping to a user configuration.

## 5. TriggerDistribution Trace
- **Code Path:** `LeadCreationEngine` -> `PendingDistribution Outbox Record`
- **Payload:** `{ ruleType: 'TriggerDistribution', targetModule: 'LeadDistribution', status: 'pending', idempotencyKey: 'PendingDistribution:{id}' }`
- **Purpose:** Acts as a queue marker for the Distribution Worker to eventually assign the Lead.
- **Classification:** It is a **LeadDistribution outbox event**. It is structurally sound within the Phase 5 architecture, but incompatible with the strict baseline R14 schema.

## 6. TimeBasedTrigger Trace
- **Code Path:** `backend/src/workers/cronWorker.js` (Lines 284, 315, 346)
- **Behavior:** The worker successfully executes time-based actions via `WorkflowEngine`, then attempts to save `TimeBasedTrigger` to `AutomationLog`.
- **Severity:** **P0/P1**. The validation failure is caught by a `try/catch`. Consequently, the idempotency lock (`AutomationLog.exists({ idempotencyKey })`) is never created. The same inactive leads/deals will infinitely trigger actions (e.g., duplicate emails) every time the cron runs.

## 7. ruleId Semantics
- **Meaningful and Required:** `Trigger`, `Sequence`, `AutomatedAction`, `ScoringRule`, `TimeBasedTrigger`.
- **Legitimately Absent:** `DomainEvent`, `LeadCreationRequest`, `TriggerDistribution`.
- **Conclusion:** `ruleId` cannot be universally required. Conditional validation is architecturally mandatory as long as outbox events share this model.

## 8. AutomationLog Overloading Analysis
The "God Object" characterization is **acceptable transitional architecture**. In a pure DDD (Domain-Driven Design) microservices architecture, Business Rule Logs and Outbox Logs would be strictly separate tables. However, separating them now (Phase 5 Stabilization) would require rewriting core querying, reporting, and dashboard UI logic, introducing massive regression risk. Extending the model is the correct pragmatic choice.

## 9. Design A Analysis (Extend AutomationLog)
- **Action:** Add `TriggerDistribution` and `TimeBasedTrigger` to the enum. Make `ruleId` conditionally required.
- **Pros:** Zero data migration. Immediately unblocks Phase 5. Immediately patches the P0 cron idempotency bug.
- **Cons:** Perpetuates the God Object design temporarily.

## 10. Design B Analysis (Split Models)
- **Action:** Create `OutboxLog` for system events.
- **Pros:** Architecturally pure.
- **Cons:** High risk. Requires migrating existing `DomainEvent` records, refactoring `LeadCreationEngine`, rewriting worker queries, and testing extensive edge cases.

## 11. Design C Analysis (Hybrid)
- **Action:** Extend `AutomationLog` now, define a migration boundary for later.
- **Pros:** Achieves both immediate stability and long-term purity.

## 12. Production Compatibility
Design A is 100% backward compatible. It is a schema-only change (widening constraints) that requires no data migration, no index rebuilds, and poses zero deployment risk.

## 13. R14 Correction Decision
R14 must become **R14B**: 
A unified schema patch including `DomainEvent`, `LeadCreationRequest`, `TriggerDistribution`, `TimeBasedTrigger`, `processing`, and conditional `ruleId`.

## 14. TimeBasedTrigger Boundary Decision
Because `TimeBasedTrigger` requires exactly the same fix (an enum addition in `AutomationLog.js`), splitting it into a separate deployment would introduce unnecessary race conditions and merge conflicts on the schema file. It must be included in the primary schema patch.

## 15. Primary Enterprise Action
**Extend AutomationLog Schema** to support Phase 5 outbox patterns.

## 16. Separate Baseline Action
**Patch TimeBasedTrigger** enum inclusion to stop the infinite cron execution bug. (Bundled logically into the Primary Action).

## 17. Next Gate
**GATE: AutomationLog Schema Remediation**
- **Objective:** Apply R14B contract.
- **Files:** `backend/models/AutomationLog.js`
- **Allowed:** Modify `ruleType` enum and `ruleId` required function.
- **Prohibited:** Modifying workers, engines, or other schemas.
- **Validation:** Mongoose schema compilation succeeds.
- **Rollback:** Revert schema file.

## 18. Acceptance Criteria
- `AutomationLog.js` must accept all 8 identified rule types.
- `ruleId` must be correctly bypassed for outbox patterns.

## 19. Final Verdict
R24_EXTEND_AUTOMATIONLOG
