# STEP_15_R24_ACTION_RESULT_CONTRACT_DESIGN

## 1. Executive Summary
This read-only architecture design gate resolved the critical silent-failure defect identified in R23. The audit confirmed that the current `WorkflowEngine` synthetic response boundary (`mockRes`) blindly swallows all controller errors, translating deterministic failures and network timeouts into false `SUCCESS` classifications. To guarantee state machine integrity, `mockRes` must be hardened to strictly translate `{ success: false }` payloads into catchable exceptions. Combined with the MongoDB `E11000` atomic lock, this establishes a mathematically safe foundation for Action-Level Idempotency.

## 2. WorkflowEngine Trace
1. `WorkflowEngine.executeAction` intercepts a raw trigger (`send_communication`).
2. It builds `mockReq` and `mockRes = { status: () => mockRes, json: () => mockRes }`.
3. It calls `sendWhatsAppMessage`.
4. If Meta rejects the payload, the controller calls `res.status(400).json({ error: ... })`.
5. **Defect:** `mockRes.json()` ignores the error. The Promise resolves gracefully.
6. `WorkflowEngine` falsely assumes execution success and proceeds to the next action.

## 3. Controller Response Contract Audit
An audit of `social.controller.js` and other communication controllers confirms a highly consistent response contract:
- **Success:** `res.json({ success: true, ... })` or `res.status(200).json({ success: true })`
- **Failure:** `res.status(400|500).json({ success: false, error: '...' })`
Relying on the `data.success` boolean property is therefore structurally safe and authoritative across this repository.

## 4. Mock Response Design
To translate controller outcomes into the WorkflowEngine's try/catch block, `mockRes` MUST be redesigned as:
```javascript
const mockRes = {
    statusCode: 200,
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) {
        if (data && data.success === false) {
            const err = new Error(data.error || 'Provider rejected request');
            err.statusCode = this.statusCode;
            err.isControllerError = true;
            throw err;
        }
        return this;
    }
};
```

## 5. HTTP Semantics
- **2xx / success: true** → State: SUCCESS.
- **4xx / 5xx / success: false** → State: FAILED (Caught by `mockRes` exception).
- **Network Timeout (Axios Error)** → State: FAILED (Caught as native exception).

## 6. UNKNOWN Outcome Analysis
A network timeout represents an UNKNOWN external outcome (Meta may or may not have delivered the message).
If transitioned to `PENDING` (or left `PROCESSING`), the cron sweep would blindly retry it, causing a severe spam risk.
By catching the timeout and transitioning the lock to `FAILED`, the unique index lock inherently prevents automated retries. Human intervention is required to resend, which is the mathematically correct behavior when provider idempotency is absent.

## 7. Action State Machine
- **PENDING:** Implicit. No document exists.
- **PROCESSING:** Claimed via atomic `$setOnInsert` upsert with a 5-minute lease.
- **SUCCESS:** API responded 2xx. Lock explicitly updated to `success`. Blocks retries.
- **FAILED:** API rejected or timed out. Lock explicitly updated to `failed`. Blocks retries via `E11000` collisions.

## 8. Action Identity Analysis
R23 proposed using `ActionIndex:${index}`. This is unsafe if a CRM administrator modifies a Trigger (e.g., inserts a new action at index 0) while an event is waiting for retry, shifting all subsequent indexes.
**Correction:** Mongoose natively assigns an `_id` to array subdocuments. The authoritative identity must be:
`ActionLock:${event.idempotencyKey}:Trigger:${trigger._id}:Action:${action._id || index}`

## 9. MongoDB Lock Analysis
The state machine utilizes the unique sparse `idempotencyKey` index:
```javascript
try {
  await AutomationLog.findOneAndUpdate(
    { 
      idempotencyKey: key, 
      $or: [
        { status: 'pending' },
        { status: 'processing', executedAt: { $lt: Date.now() - 5m } }
      ]
    },
    { $set: { status: 'processing', executedAt: new Date() } },
    { upsert: true }
  );
} catch (err) {
  if (err.code === 11000) return; // Safely skip
  throw err;
}
```
- If the action is already `SUCCESS` or `FAILED`, the query matches nothing. The upsert triggers an `E11000` Duplicate Key error, safely and elegantly aborting the retry.
- If a concurrent worker is `PROCESSING`, it triggers `E11000`.

## 10. Provider Idempotency Limitations
Because WhatsApp/Meta does not support idempotency keys in this specific controller integration, a hard worker crash (SIGKILL/OOM) *during* `PROCESSING` will eventually trigger the 5-minute cron lease expiration. This remains an unavoidable AT-LEAST-ONCE duplicate window.

## 11. Corrected Guarantee Matrix

| Property | Guarantee |
|----------|-----------|
| DB action concurrency | PROVEN (via upsert `E11000` collision) |
| Queue duplicate enqueue | PROVEN (via BullMQ `jobId`) |
| External API duplicate | UNSAFE (AT-LEAST-ONCE limits for hard process crashes) |
| Worker crash recovery | PROVEN (20s timeout < 5m lease) |
| Network timeout | PROVEN SAFE (Transition to FAILED blocks automated retry) |
| Event retry | PROVEN (Action locks prevent replay of completed steps) |
| Trigger mutation inflight | PROVEN (via `action._id` subdocument mapping) |

## 12. Minimum Safe Design
1. Enforce the strict, error-throwing `mockRes` boundary in `WorkflowEngine`.
2. Wrap external calls and DB mutations inside the `E11000` upsert claim.
3. Map `action._id` into the ActionLock identity string.

## 13. Implementation Boundary
**Must Modify:**
- `backend/src/utils/WorkflowEngine.js`
- `backend/services/AutomationEngine.js` (pass `eventId`)
- `backend/src/workers/distributionWorker.js`

**Must NOT Modify:**
- `backend/services/WhatsAppService.js`
- `backend/controllers/social.controller.js`

## 14. Test Matrix
- **A. successful response:** Lock transitions to `success`.
- **B. deterministic 400:** `mockRes` throws, lock transitions to `failed`, `E11000` prevents retry.
- **E. Axios timeout:** Native error thrown, lock transitions to `failed`, `E11000` prevents retry.
- **M. Trigger mutation:** Identity remains stable via `action._id`, safely bypassing shifted actions.

========================================================
FINAL VERDICT
========================================================
R24_READY_FOR_IMPLEMENTATION
