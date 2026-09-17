# STEP 15 R26 — AUTOMATIONLOG RUNTIME CONTRACT FORENSIC

## 1. Executive Summary
A comprehensive read-only forensic trace has established the complete `AutomationLog` runtime contract. The findings confirm that the baseline runtime genuinely relies on `TimeBasedTrigger` and that its omission causes a P0 bug where Native Actions execute infinitely. Separately, Phase 5 introduces `DomainEvent`, `LeadCreationRequest`, and `TriggerDistribution` as system-level outbox events. Because the baseline bug and the Phase 5 architectural patterns represent entirely different ownership boundaries, they must be separated rather than conflated into a single schema patch.

## 2. Complete AutomationLog Write Inventory
| File | Function | ruleType | status | idempotencyKey | Runtime/Phase5 |
|---|---|---|---|---|---|
| `WorkflowEngine.js` | `executeAction` | `AutomatedAction` | `success`/`failed` | `imm-{id}`/`delay-{id}` | Baseline |
| `WorkflowEngine.js` | `executeAction` | `Trigger` | `success`/`failed` | none (Native Actions) | Baseline |
| `cronWorker.js` | `evaluateTimeBasedTriggers` | `TimeBasedTrigger` | `success` | `time-trigger-{id}` | Baseline |
| `automationQueue.js`| queue processor | `Trigger` | `success`/`failed` | `domain-event-{id}` | Baseline |
| `deal.controller.js`| `createDeal` | N/A (lock) | `success` | `we-{hash}` | Baseline |
| `booking.controller.js`| `createBooking` | N/A (lock) | `success` | `we-{hash}` | Baseline |
| `LeadCreationEngine.js`| `createLead` | `LeadCreationRequest` | `success` | `WebhookLead:{id}` | Phase 5 |
| `LeadCreationEngine.js`| `createLead` | `TriggerDistribution` | `pending` | `PendingDist:{id}` | Phase 5 |
| `LeadCreationEngine.js`| `createLead` | `DomainEvent` | `pending` | `DomainEvent:{id}` | Phase 5 |

## 3. ruleType Inventory
| ruleType | Source | Baseline or Phase5 | Has ruleId? | Purpose |
|---|---|---|---|---|
| `Trigger` | `WorkflowEngine` | Baseline | Yes | Business rule log |
| `Sequence` | `SequenceEngine` | Baseline | Yes | Business rule log |
| `AutomatedAction` | `WorkflowEngine` | Baseline | Yes | Business rule log |
| `ScoringRule` | `ScoringEngine` | Baseline | Yes | Business rule log |
| `TimeBasedTrigger` | `cronWorker` | Baseline | Yes | Cron rule log |
| `DomainEvent` | `LeadCreationEngine` | Phase 5 | No | Outbox event |
| `LeadCreationRequest`| `LeadCreationEngine` | Phase 5 | No | Inbox lock |
| `TriggerDistribution`| `LeadCreationEngine` | Phase 5 | No | Assignment outbox |

## 4. status Inventory
| status | Source | Baseline/Phase5 | Lifecycle |
|---|---|---|---|
| `success` | `WorkflowEngine`, Controllers | Baseline | Completed execution/lock |
| `failed` | `WorkflowEngine` | Baseline | Failed execution |
| `pending` | `LeadCreationEngine` | Phase 5 | Awaiting worker processing |
| `processing` | `distributionWorker`, `cronWorker` | Phase 5 | Active worker lease |
*(Note: `processing` exists in baseline only within a maintenance script `update_workflow.cjs`, not in runtime application code).*

## 5. TimeBasedTrigger Trace
- **Sequence:** `evaluateTimeBasedTriggers` matches inactive leads -> checks `AutomationLog.exists({ idempotencyKey })` -> executes `WorkflowEngine.executeAction` -> attempts `AutomationLog.create({ ruleType: 'TimeBasedTrigger', ruleId: trigger._id })`.
- **Validation:** Throws synchronously because `TimeBasedTrigger` is not in the baseline schema enum.
- **Handling:** Wrapped in `try/catch`. Exception is swallowed and logged. Cron loop continues to the next lead. 
- **Result:** The `idempotencyKey` is never saved.

## 6. P0/P1 Impact Determination (Infinite Execution Validation)
- **Automated Actions (Safe):** `WorkflowEngine.executeAction` internally generates `imm-{id}` idempotency keys and successfully writes `ruleType: 'AutomatedAction'` before returning. These are protected from duplicate cron execution.
- **Native Actions (Vulnerable):** For `send_communication` (WhatsApp/Email) and `update_field`, `WorkflowEngine` does **not** check or persist an internal `idempotencyKey`. It relies entirely on the outer cron loop's `AutomationLog.create({ ruleType: 'TimeBasedTrigger' })`. 
- **Severity (P0):** Because the cron log fails validation, Native Actions execute repeatedly on every cron tick (e.g., every 5-15 minutes) for the exact same records, causing infinite duplicate WhatsApp/SMS dispatch.

## 7. TriggerDistribution Trace
- **Occurrence:** Exists strictly in Phase 5 (`LeadCreationEngine.js`). Not present in Baseline.
- **Code:** `const pendingDistributionLog = new AutomationLog({ ruleType: 'TriggerDistribution', ... })`
- **Consumer:** Phase 5 background workers (e.g., `distributionWorker.js`).
- **Semantics:** Acts purely as a `PendingDistribution` outbox event queue marker.
- **ruleId:** Legitimately absent by design, as there is no associated rule document.

## 8. DomainEvent Trace
- **Producer:** Phase 5 `LeadCreationEngine`, `DealCreationEngine`.
- **Consumer:** Phase 5 background workers (triggering webhooks, sequences, API sync).
- **Semantics:** Transactional outbox event.
- **ruleId:** Absent by design.

## 9. LeadCreationRequest Trace
- **Producer:** Phase 5 `LeadCreationEngine`.
- **Consumer:** None (used as a static idempotency lock).
- **Semantics:** Inbox idempotency guard to prevent duplicate API/Webhook lead insertion.
- **ruleId:** Absent by design.

## 10. Baseline Schema Contract
**Requires:**
- `ruleType`: `Trigger`, `Sequence`, `AutomatedAction`, `ScoringRule`, **`TimeBasedTrigger`**.
- `status`: `success`, `failed`.
- `ruleId`: **Required for all.**

## 11. Phase 5 Schema Contract
**Requires Additional:**
- `ruleType`: `DomainEvent`, `LeadCreationRequest`, `TriggerDistribution`.
- `status`: `pending`, `processing`.
- `ruleId`: **Not required** for these three outbox types.

## 12. R14/R14B Boundary Analysis
While it is technically possible to patch all values at once (Option C), architecturally, they represent entirely distinct concerns.
- `TimeBasedTrigger` is a severe **baseline production defect**. It requires an immediate backportable hotfix.
- `TriggerDistribution` et al. are **future Phase 5 architectural patterns**.
Combining them artificially obfuscates the provenance of the changes. They must be separated.

## 13. Production Impact
- Adding `TimeBasedTrigger` to the baseline schema is 100% backward compatible (schema widening). It will change runtime behavior by allowing logs to persist, thereby fixing the P0 spam bug.
- Adding Phase 5 types to R14 is also schema-safe but only practically impacts the Enterprise branch.

## 14. Recommended Separation/Ownership
The architectural boundary mandates separating the baseline bug fix from the Phase 5 schema definition contract.

## 15. Exact Next Gate
**GATE 1: Baseline Hotfix (TimeBasedTrigger)**
- Update enum in baseline.
**GATE 2: Phase 5 Schema Contract (R14)**
- Update enum for outbox types and implement conditional `ruleId`.

## 16. Final Verdict
R26_REQUIRES_SEPARATE_BASELINE_FIX
