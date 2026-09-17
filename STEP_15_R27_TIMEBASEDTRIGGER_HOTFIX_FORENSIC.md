# STEP 15 R27 — TIMEBASEDTRIGGER HOTFIX FORENSIC

## 1. Executive Summary
This read-only forensic audit verifies the existence of a severe production defect in the baseline cron functionality. The `AutomationLog.ruleType` enum in the baseline schema correctly rejects `TimeBasedTrigger`. However, `cronWorker.js` relies on this exact rule type to persist idempotency keys. Because `cronWorker` catches the Mongoose validation error, the cron job does not crash, but the idempotency lock is never recorded. Consequently, native actions (like sending SMS/WhatsApp or updating fields) execute infinitely (every hour) for the same matching records. The hotfix consists of a minimal, schema-only enum addition.

## 2. Exact Schema Evidence
**Baseline Commit (`9b0ddc1`) `backend/models/AutomationLog.js`:**
```javascript
ruleType: { type: String, enum: ['Trigger', 'Sequence', 'AutomatedAction', 'ScoringRule'], required: true },
```
- **Validation:** Mongoose rejects `new AutomationLog({ ruleType: 'TimeBasedTrigger' })` synchronously before saving.

## 3. Exact Cron Execution Trace
**File:** `backend/src/workers/cronWorker.js`
- Retrieves matching inactive leads/deals.
- Generates `idempotencyKey = time-trigger-${trigger._id}-${entity._id}`.
- Checks `AutomationLog.exists({ idempotencyKey })`. Returns `false` for new matches.
- Executes the action via `WorkflowEngine.executeAction`.
- Attempts to save `AutomationLog.create({ ruleType: 'TimeBasedTrigger', idempotencyKey, ... })`.
- `AutomationLog.create` throws `ValidationError`.
- `try/catch` swallows the exception and logs it. The loop continues to the next entity.
- The `idempotencyKey` is never stored. Next execution, `hasFired` is `false` again.

## 4. Action Execution Order
**Order:**
1. Idempotency Check (Outer Cron)
2. Action Execution (`WorkflowEngine`)
3. Validation Failure (`AutomationLog.create`)
**Consequence:** Because the execution happens *before* the outer log write, the validation failure leaves the successfully executed action entirely unprotected for future runs.

## 5. Idempotency Analysis
- **Key Structure:** `time-trigger-{trigger_id}-{entity_id}`.
- **Uniqueness:** Unique per trigger and target entity.
- **Persistence:** Failed log creation leaves the action completely unprotected, as the idempotency check relies exclusively on the presence of this key.

## 6. Native Action Analysis
| Action | Internal idempotency | AutomationLog protection | Repeat risk |
|---|---|---|---|
| `fire_automated_action` | **YES** (`imm-{id}` generated) | Cron log (Broken) | Safe (Protected internally) |
| `send_communication` | **NO** (Blindly dispatches) | Cron log (Broken) | **HIGH (Infinite execution)** |
| `update_field` | **NO** (Blindly updates) | Cron log (Broken) | **HIGH (Infinite execution)** |

## 7. Cron Frequency
- **Scheduler:** `cronQueue.add('evaluateTimeBasedTriggers', {}, { repeat: { pattern: '0 * * * *' } })` (`backend/src/server.js:89`).
- **Frequency:** Executes exactly once every hour.
- **Repetition:** An inactive lead will receive the same Native Action (e.g., an SMS) 24 times a day until their status manually changes.

## 8. Production Impact
- **Severity: P0**
- **Impact:** Any user leveraging Time-Based Triggers with Native Actions (`send_communication`) is actively spamming their leads/customers via Meta APIs or Email providers. This creates massive API cost risks, spam complaints, and user trust degradation.

## 9. Minimal Hotfix Design
**Conceptual Change:**
Add `'TimeBasedTrigger'` to the `AutomationLog.ruleType` enum.
- **No status changes:** Not required.
- **No ruleId changes:** `TimeBasedTrigger` inherently possesses and supplies a `ruleId` (`trigger._id`), so it does not need to be exempted from the `ruleId` validation logic.
- **No code changes:** No modifications to `cronWorker` or `WorkflowEngine` are required. Adding the enum alone allows the idempotency lock to persist natively.

## 10. Backward Compatibility
- **Schema Widening:** Adding an enum value is 100% schema-compatible. Existing data is entirely unaffected.
- **Behavioral Change:** The only behavioral change is the correct persistence of idempotency logs, resolving the duplicate execution bug.
- **No migrations needed.** No indexes affected.

## 11. R14 Boundary
The R14 Phase 5 schema patch (`DomainEvent`, `LeadCreationRequest`, `TriggerDistribution`, conditional `ruleId`) is structurally distinct. This `TimeBasedTrigger` hotfix is a pure baseline bug fix and should be isolated from the Phase 5 enterprise rollout features.

## 12. Deployment/Rollback Design
- **Deployment:** Independently deployable to production by hotfixing `backend/models/AutomationLog.js`.
- **Rollback:** Reverting the schema file instantly restores previous behavior, although the cron spam would resume.

## 13. Test Plan
- **TimeBasedTrigger without ruleId:** Must fail validation (ruleId is correctly required).
- **TimeBasedTrigger with ruleId:** Must persist successfully and establish the idempotency lock.
- **Existing Rules:** `Trigger`, `Sequence`, `AutomatedAction`, `ScoringRule` remain unchanged.
- **Cron Behavior:** `evaluateTimeBasedTriggers` must skip records once the idempotency key is successfully persisted.

## 14. Exact Files To Modify
- `backend/models/AutomationLog.js` (Baseline only).

## 15. Exact Files NOT To Modify
- `backend/src/workers/cronWorker.js`
- `backend/src/utils/WorkflowEngine.js`
- Any Phase 5 controllers or workers.

## 16. Final Verdict
R27_HOTFIX_CONFIRMED_READY
