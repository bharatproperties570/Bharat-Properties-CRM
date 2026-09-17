# STEP 15 R23 — AUTOMATIONLOG RULETYPE CONTRADICTION AUDIT

## 1. Executive Summary
A comprehensive read-only forensic audit of the CRM backend has resolved the `AutomationLog` validation failure for `ruleType: 'TriggerDistribution'`. 
The core issue is **Schema/Architecture Overloading**: `AutomationLog` was originally designed to log Business Rule executions (Triggers, Sequences). During Enterprise Phase 5, the model was co-opted to serve as a **Transactional Outbox** for background jobs (`DomainEvent`, `LeadCreationRequest`, `TriggerDistribution`). The `LeadCreationEngine` transaction explicitly creates `TriggerDistribution` records without a `ruleId`, violating the strict R14 schema contract.

Additionally, a silent production bug was discovered in the baseline (`9b0ddc1`) where `cronWorker.js` attempts to write `ruleType: 'TimeBasedTrigger'`, which was never included in the baseline enum.

## 2. Complete ruleType Inventory
| ruleType | Producer | Consumer | Purpose | Runtime Path |
|---|---|---|---|---|
| `Trigger` | `WorkflowEngine` | Audit UI | Logs business trigger execution | `WorkflowEngine.executeAction()` |
| `AutomatedAction` | `WorkflowEngine` | Audit UI | Logs direct automated action execution | `WorkflowEngine.executeAction()` |
| `Sequence` | `SequenceEngine` | Audit UI | Logs sequence enrollments | `SequenceEngine` |
| `ScoringRule` | `ScoringEngine` | Audit UI | Logs score computations | Implicit |
| `TimeBasedTrigger` | `cronWorker` | Audit UI | **BROKEN in Baseline**. Logs cron triggers | `cronWorker.js:284` |
| `LeadCreationRequest`| `LeadCreationEngine` | Inbox Worker | Transactional Inbox pattern | `LeadCreationEngine.js` |
| `DomainEvent` | Enterprise workers | Outbox Worker | Transactional Outbox pattern | Enterprise patches |
| `TriggerDistribution`| `LeadCreationEngine` | Queue Worker | **NEW (Phase 5)**: Outbox pattern for queueing | `LeadCreationEngine.js:102` |

## 3. Trace TriggerDistribution
- **Exact File:** `backend/src/modules/lead/LeadCreationEngine.js` (Enterprise Phase 5 worktree).
- **Exact Function:** `withMongoTransaction` during Lead creation.
- **Trace:** CRM UI -> `POST /api/leads` -> `LeadCreationEngine` -> `new AutomationLog({ ruleType: 'TriggerDistribution', targetModule: 'LeadDistribution', status: 'pending', idempotencyKey: 'PendingDistribution:{id}' })`.
- **ruleId Availability:** `ruleId` is NOT provided because this is a system-level outbox queue event, not a user-defined business rule.

## 4. Business Rule Architecture
The literal terms `Trigger`, `Sequence`, `AutomatedAction`, and `ScoringRule` represent distinct Business Rule execution categories. 
However, `TriggerDistribution`, `DomainEvent`, `LeadCreationRequest`, and `TimeBasedTrigger` represent **internal system events and outbox patterns** that have been improperly forced into the Business Rule audit log model.

## 5. Automation Functionality Matrix
| Rule Type | Status | Failure Handling |
|---|---|---|
| `Trigger` | WORKING | Standard WorkflowEngine catch block |
| `Sequence` | WORKING | Handled by SequenceEngine |
| `AutomatedAction` | WORKING | Standard WorkflowEngine catch block |
| `ScoringRule` | UNKNOWN | Depends on scoring implementation |
| `TimeBasedTrigger` | **FAILING** | Fails Mongoose validation natively in baseline |
| `TriggerDistribution` | **FAILING** | Fails Mongoose validation (missing enum & ruleId) |

## 6. ruleId Semantics
- For Business Rules (`Trigger`, `Sequence`, `AutomatedAction`), `ruleId` points to the `_id` of the respective MongoDB model. It is required and available.
- For Outbox Events (`TriggerDistribution`, `DomainEvent`, `LeadCreationRequest`), there is no defining rule document. `ruleId` cannot exist.
- **Architectural Conclusion:** Forcing `ruleId` to be required for all `AutomationLog` documents is fundamentally incompatible with using it as a Transactional Outbox. Making it optional for outbox types is structurally correct until a dedicated `OutboxLog` model is created.

## 7. AutomationLog Baseline Comparison
- **Baseline (`9b0ddc1`):** `enum` only contained `['Trigger', 'Sequence', 'AutomatedAction', 'ScoringRule']`. `TriggerDistribution` did not exist.
- **Phase 5 Worktrees:** `LeadCreationEngine.js` introduced `TriggerDistribution` as an Outbox tracking mechanism.
- **R14 Patch:** Added `DomainEvent` and `LeadCreationRequest` but missed `TriggerDistribution` and `TimeBasedTrigger`.

## 8. EventBus Verification
- **Status:** `EVENTBUS_ACTIVE`
- **Actual Emitters:** `Deal.js` and `Lead.js` explicitly execute `eventBus.emit` in their Mongoose `post-save` and `post-findOneAndUpdate` hooks.
- **Actual Listeners:** `AutomationEngine.js` synchronously listens via `initializeListeners()`.
- **Finding:** R22 was correct. `$locals.skipEventBus` MUST be used by new Enterprise engines to prevent dual-dispatch, as the legacy Mongoose hooks fire unconditionally.

## 9. Sequence Verification
- `SequenceEngine.js` successfully triggers and persists sequences using `WorkflowEngine.executeAction`.
- The failure of `TriggerDistribution` does not break core Sequence execution, as they are separate pathways (Sequences use `ruleType: 'AutomatedAction'` internally).

## 10. Contradiction Analysis
- **Contradiction A (R14 vs Runtime):** Resolved. The UI hits the newly ported Enterprise `LeadCreationEngine`, which writes `TriggerDistribution`. The R14 schema patch is incomplete.
- **Contradiction B (ruleId required):** Resolved. `TriggerDistribution` genuinely has no `ruleId` because it is an outbox record, not a rule log.
- **Contradiction C (Architecture mismatch):** Resolved. `AutomationLog` is suffering from "God Object" anti-pattern, acting as both User Audit Log and System Outbox.
- **Contradiction D (EventBus):** Resolved. EventBus is highly active in baseline.

## 11. Root Cause
The root cause is the overloading of `AutomationLog.js` during Enterprise Phase 5 to act as a Transactional Outbox for `LeadCreationEngine` without fully patching the schema's `enum` and conditional `ruleId` validation logic to accommodate new system event types. Additionally, `TimeBasedTrigger` has been failing silently since baseline.

## 12. Exact Next Gate
**GATE 1: AutomationLog Schema Remediation**
(Schema-only patch to unblock runtime before attempting Queue/Idempotency hardening).

## 13. Files Likely Requiring Modification
- `backend/models/AutomationLog.js`

## 14. Files that MUST NOT be Modified Yet
- `backend/src/utils/WorkflowEngine.js`
- `backend/services/AutomationEngine.js`
- `backend/src/modules/lead/LeadCreationEngine.js`
- Any Worker or Queue files.

## 15. Acceptance Criteria
- `AutomationLog.js` schema updated to include `TriggerDistribution` and `TimeBasedTrigger` in the `ruleType` enum.
- `ruleId` conditional validation updated to skip requirement for `TriggerDistribution` and `TimeBasedTrigger`.
- No runtime controllers or workers are modified.
