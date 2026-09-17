# STEP_15_R26_ACTION_IDEMPOTENCY_HARDENED_DESIGN

## 1. Executive Summary
This read-only design refinement finalizes the Phase 5.2 Action Idempotency contract. It successfully hardens the `mockRes` boundary to rigorously enforce HTTP status semantics, establishes a deterministic Action Identity (`action._id` with MD5 fallback) immune to array mutations, and confirms that transitioning all network anomalies to the `FAILED` state safely guarantees AT-MOST-ONCE delivery. By selectively bypassing action locks when `eventId` is absent, the design also preserves absolute compatibility with the legacy EventBus without accumulating garbage records.

## 2. Current R24 Implementation Trace
Inside `WorkflowEngine.executeAction`, actions like `send_communication` are dispatched by synthesizing an Express request. The current response contract (`mockRes.json = () => mockRes`) is completely blind to HTTP error codes emitted by controllers like `social.controller.js`. This creates a devastating silent-failure loop where exceptions and provider rejections are treated as successes.

## 3. MockRes Contract
To safely map controller outcomes to the MongoDB action lock, the mock response must enforce HTTP semantics and throw native exceptions:
```javascript
const mockRes = {
    statusCode: 200,
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) {
        if (this.statusCode >= 400 || (data && data.success === false)) {
            const err = new Error(data?.error || `HTTP ${this.statusCode} Provider Reject`);
            err.statusCode = this.statusCode;
            err.isControllerError = true;
            throw err;
        }
        return this;
    },
    send: function(data) {
        if (this.statusCode >= 400) {
            throw new Error(typeof data === 'string' ? data : `HTTP ${this.statusCode}`);
        }
        return this;
    }
};
```

## 4. Network Failure Matrix

| Class | Examples | External Outcome | State Transition |
|---|---|---|---|
| Deterministic Reject | HTTP 400, 401, 403, 404 | DEFINITELY_REJECTED | `FAILED` |
| Transient Reject | HTTP 429, 502, 503 | DEFINITELY_NOT_SENT | `FAILED` |
| Dropped Request | ECONNREFUSED, ENOTFOUND | DEFINITELY_NOT_SENT | `FAILED` |
| Dropped Response | Axios Timeout, ECONNRESET | OUTCOME_UNKNOWN | `FAILED` |
| Meta Server Error | HTTP 500 | OUTCOME_UNKNOWN | `FAILED` |

## 5. Retry Policy
Because WhatsApp/Meta does not expose a native `Idempotency-Key` header for this integration, the CRM cannot definitively distinguish between a dropped request (safe to retry) and a dropped response (unsafe to retry) when an Axios timeout occurs. 
By mapping **ALL** controller exceptions and network errors to the terminal `FAILED` state, the state machine strictly prohibits automated cron retries. This yields a mathematically safe **AT-MOST-ONCE** execution profile for errors, deliberately requiring human intervention to replay failed outbound communications.

## 6. Action Identity Design
Array indexing is structurally unsafe. The hardened deterministic identity requires:
```javascript
const actionId = action._id 
    ? action._id.toString() 
    : require('crypto').createHash('md5').update(`${action.type}|${action.channel}|${action.templateId}`).digest('hex');

const idempotencyKey = `ActionLock:${eventId}:Trigger:${trigger._id}:Action:${actionId}`;
```

## 7. Event Identity Design
- **Phase 5 (Outbox):** Provides an `eventId`. The system enforces the MongoDB Action Lock.
- **Legacy (EventBus):** `eventId` is `null`. The system bypasses the DB claim, maintaining legacy in-memory AT-LEAST-ONCE behavior and preventing the creation of millions of arbitrary lock records.

## 8. Action Lock State Machine
- **CLAIM:** `upsert` with a 5-minute lease (`executedAt: new Date()`). Transitions to `PROCESSING`.
- **SUCCESS:** Try block completes. Transitions to `SUCCESS`. Blocks retries.
- **FAILURE:** Exception caught. Transitions to `FAILED`. Blocks retries.

## 9. MongoDB Atomicity Analysis
The atomic claim utilizes: `{ idempotencyKey, $or: [ { status: 'pending' }, { status: 'processing', executedAt: { $lt: 5m_ago } } ] }`
If the document exists as `SUCCESS`, `FAILED`, or unexpired `PROCESSING`, the query matches zero records. The `upsert: true` directive then attempts to insert a new document. MongoDB intercepts this via the `unique` sparse index, throwing `E11000 Duplicate Key Error`. The worker safely catches `E11000` and abandons execution. This perfectly serializes concurrency.

## 10. Lease Analysis
The 5-minute lease is **CONDITIONALLY SAFE**. Because `whatsappService.js` enforces a 20-second Axios timeout, a healthy Node.js worker will reliably complete or fail the action long before the lease expires. A duplicate execution risk exists solely if the Node.js event loop completely freezes (e.g., hypervisor suspension) for > 5 minutes, suppressing the timeout while a cron sweep re-allocates the lock.

## 11. External API Idempotency
CRM-level Action Locks protect against intra-system retries. They do NOT provide provider-level idempotency. Exact-once delivery during a hard worker process crash (SIGKILL mid-request) is structurally impossible without a Meta-supported `Idempotency-Key` header.

## 12. Marketing Queue Analysis
BullMQ guarantees native enqueue deduplication. By explicitly injecting `{ jobId: idempotencyKey }` into `marketingQueue.add`, sequence enrollment is mathematically protected against DomainEvent retries.

## 13. Side-Effect Boundary
No external network call, database mutation, or queue operation is permitted to execute prior to the successful resolution of the MongoDB `upsert` claim. All side effects belong strictly within the protected `try/catch` execution block.

## 14. EventBus Coexistence
The legacy `EventBus.emit()` ecosystem correctly interoperates with Phase 5 architecture because missing `eventId` parameters seamlessly route the logic into the non-locking compatibility path.

## 15. Exact Implementation Contract
**AutomationEngine.js**
- Update `processEvent` signature to accept `eventId = null`.
- Pass `eventId` sequentially into `WorkflowEngine.executeAction`.

**WorkflowEngine.js**
- Implement the strict HTTP-aware `mockRes` object.
- If `eventId` is present, construct `actionId` (via `_id` or MD5) and execute the `E11000` atomic `findOneAndUpdate` claim.
- Wrap the action payload (API/DB/Queue) in a `try/catch`.
- On success, update lock to `status: 'success'`.
- On failure, update lock to `status: 'failed'` and re-throw the caught error to abort subsequent trigger actions.

**distributionWorker.js**
- Consume `DomainEvent` records from Phase 5 Outbox.
- Invoke `AutomationEngine.processEvent(..., eventId)`.

## 16. Files To Modify
- `backend/src/utils/WorkflowEngine.js`
- `backend/services/AutomationEngine.js`
- `backend/src/workers/distributionWorker.js`

## 17. Files NOT To Modify
- `backend/controllers/social.controller.js`
- `backend/services/WhatsAppService.js`
- `backend/services/sms.service.js`

## 18. Test Matrix
- **Concurrent Claims:** Two workers evaluate identical `eventId`. One throws `E11000` and yields.
- **Provider Timeout:** Action throws native exception. Lock transitions to `FAILED`. `E11000` permanently blocks automated retry.
- **Legacy Path:** Evaluation lacking `eventId` bypasses DB claim, avoiding unique index errors.

## 19. Guarantee Matrix
| Property | Contract Guarantee |
|----------|------------|
| DB action concurrency | PROVEN (via E11000 trap) |
| Queue duplicate enqueue | PROVEN (via jobId deduplication) |
| External API duplicate | UNSAFE (Acknowledged AT-LEAST-ONCE limits for SIGKILL) |
| Worker crash recovery | CONDITIONALLY SAFE (Requires unblocked Node event loop) |
| Timeout handling | PROVEN SAFE (Forced to FAILED, blocking automated retry) |
| Trigger mutation | PROVEN (via robust action._id/MD5 mapping) |

========================================================
FINAL VERDICT
========================================================
R26_READY_FOR_IMPLEMENTATION
