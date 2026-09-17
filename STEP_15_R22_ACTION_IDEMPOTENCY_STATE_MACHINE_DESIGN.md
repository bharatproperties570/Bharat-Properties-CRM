# STEP_15_R22_ACTION_IDEMPOTENCY_STATE_MACHINE_DESIGN

## 1. Executive Summary
This read-only architecture gate evaluated the crash-safety and state machine behavior of Phase 5.2 action dispatchers. The current `AutomationEngine` and `WorkflowEngine` implementations provide **zero** action-level concurrency protection for external APIs and rely on unsafe non-atomic reads for DB mutations. Furthermore, because external providers (WhatsApp/SMS) do not utilize idempotency keys in this repository, any mid-flight worker crash guarantees a duplicate message upon retry. 
This document defines the strict atomic claim contract required before `distributionWorker` or `cronWorker` recovery can safely enter the runtime.

## 2. Complete Action Inventory

| Action | Dispatcher | External Side Effect | Current Idempotency | Retry Behavior |
|---|---|---|---|---|
| `send_communication` | `whatsappService.js` | Meta API POST | ABSENT | Unsafe Duplicate |
| `send_communication` | `sms.service.js` | SMS API POST | ABSENT | Unsafe Duplicate |
| `auto_match_dispatch`| `marketingQueue.js` | BullMQ Enqueue | ABSENT | Duplicate Job Enqueue |
| `fire_automated_action`| Mongoose `Model` | DB Mutation | WEAK (non-atomic) | Race-condition Duplicate |
| `start_sequence` | `marketingQueue.js` | BullMQ Enqueue | ABSENT | Duplicate Job Enqueue |

## 3. Provider Idempotency Audit
- **Meta (WhatsApp API):** UNKNOWN. `whatsappService.js` uses `axios` and `axios-retry` but does not pass an `idempotency_key` header or payload field.
- **SMS API:** UNKNOWN.
- **BullMQ:** SUPPORTED natively via `jobId`, but the Phase 5 code fails to propagate the DomainEvent identity into `marketingQueue.add()`.

## 4. Crash Window Analysis
- **CASE A (Worker claims action, API succeeds, crashes before marking DB success):** 
  - *Current State:* Remains `processing`.
  - *Recovery Risk:* When cron reverts to `pending` and retries, the worker will send a **duplicate** WhatsApp message.
  - *Conclusion:* Because providers lack idempotency, AT-LEAST-ONCE delivery is the mathematically unavoidable ceiling for external communications during hard process crashes.
- **CASE B (Worker claims action, API times out, CRM is left waiting):**
  - *Conclusion:* The exact state of the provider is UNKNOWN. Retrying automatically is dangerous.

## 5. Action State Machine
1. **PENDING:** Action is ready (implicit, or explicitly stored).
2. **PROCESSING:** Atomic `findOneAndUpdate` lock acquired. Execution begins.
3. **SUCCESS:** External API responded 2xx. Lock updated to `success`.
4. **FAILED:** External API responded 4xx (deterministic reject). Lock updated to `failed`.
5. **UNKNOWN:** External API network timeout (5xx / ECONNRESET). Lock updated to `failed` with detail `NETWORK_TIMEOUT`. Must NOT auto-retry external actions to avoid blind duplication.

## 6. Action Identity Design
The precise deterministic identity required to prevent intra-event duplication is:
`ActionLock:${event.idempotencyKey}:Trigger:${trigger._id}:ActionIndex:${index}`
- Distinguishes exact actions within a specific trigger.
- Survives worker retries (a retry will evaluate the trigger, construct the identity, and discover the action is already `success`).

## 7. AutomationLog Assessment
The R14 `AutomationLog` schema is structurally perfect for this state machine. It contains:
- `idempotencyKey` (Unique Sparse Index)
- `status` (`pending`, `processing`, `success`, `failed`)
- `executedAt` (Lease timestamp)
- `ruleId` / `ruleType`
No schema migrations are required.

## 8. Atomic Claim Design
Action dispatch MUST be wrapped in this atomic Mongoose lock:
```javascript
try {
  const claim = await AutomationLog.findOneAndUpdate(
    { idempotencyKey: actionIdentity, status: { $ne: 'success' } },
    { 
      $set: { status: 'processing', executedAt: new Date() },
      $setOnInsert: { ruleType: 'Trigger', ruleId: trigger._id, targetModule: trigger.module } 
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // Proceed with execution
} catch (err) {
  if (err.code === 11000) return; // Concurrent worker won the race, safe to skip
  throw err;
}
```

## 9. Stale Recovery Analysis
The `processing` → `pending` cron sweep is **CONDITIONALLY SAFE**.
It requires strict client-side timeouts. If `axios` hangs infinitely, a cron recovery at the 5-minute mark will spawn a second worker while the first is still active, causing a dual-execution race.
**Mandatory rule:** All external API calls (`whatsappService.js`) MUST enforce a hard timeout (e.g., 60s) strictly shorter than the cron recovery window (5m).

## 10. Unknown Provider Outcome Analysis
Without provider-supported idempotency, a network timeout means the message *might* have been sent. 
The worker must transition the action to `FAILED` (not `pending`) to require human/admin intervention, explicitly preventing an automated retry from spamming the customer.

## 11. MarketingQueue Analysis
`marketingQueue.add()` MUST be updated to pass the Action Identity as `jobId`:
```javascript
marketingQueue.add('auto-match-dispatch', payload, { jobId: actionIdentity })
```
This offloads idempotency directly to BullMQ, guaranteeing EXACTLY-ONCE enqueuing regardless of worker retries.

## 12. EventBus Coexistence Analysis
- **Phase 5 Engines** emit `DomainEvent` outbox logs. The `distributionWorker` feeds the Event ID to `AutomationEngine`, activating the strict atomic claims.
- **Legacy Controllers** emit `EventBus` signals. `AutomationEngine` receives these with no Event ID. It can cleanly fall back to legacy, non-idempotent in-memory execution to preserve exact backward compatibility. Coexistence is completely safe.

## 13. AutomatedAction DB Mutation Analysis
While some DB mutations (`$set: { status: 'Locked' }`) are naturally idempotent, executing them redundantly wastes DB throughput and triggers unnecessary Mongoose hooks. The Atomic Claim design will wrap these mutations to guarantee EXACTLY-ONCE execution.

## 14. Design Options
- **DESIGN B (AutomationLog atomic claim + processing state):** Chosen implementation. Relies on MongoDB unique indexes (`upsert`) to serialize concurrent worker execution and track completion. Acknowledges AT-LEAST-ONCE limits for external providers.

## 15. Minimum Safe Contract
**MANDATORY:**
1. `WorkflowEngine.executeAction` implements the Atomic Claim `findOneAndUpdate` lock for ALL actions.
2. `marketingQueue.add` injects the `jobId` parameter.
3. External API calls implement hard timeouts (< 5m).

## 16. Implementation Boundary
- `backend/services/AutomationEngine.js`
- `backend/src/utils/WorkflowEngine.js`
- `backend/src/workers/distributionWorker.js`

## 17. Test Matrix
1. **Concurrent Race Test:** Two promises call `executeAction` simultaneously with the same Event ID. Verify `AutomationLog.findOneAndUpdate` prevents dual-dispatch.
2. **Crash Re-entry Test:** Run Action 1, simulate crash. Rerun Trigger. Verify Action 1 is skipped, Action 2 executes.
3. **Legacy Fallback Test:** Run Trigger with `eventId = null`. Verify it processes normally without blocking.

========================================================
FINAL VERDICT
========================================================
R22_READY_FOR_IMPLEMENTATION
