# PHASE 4.3 — ENTERPRISE TRANSACTION ARCHITECTURE (DESIGN & AUDIT)

## 1. EXISTING TRANSACTION INFRASTRUCTURE
A codebase scan for `startSession` and `withTransaction` reveals an inconsistent transaction implementation:
- **`backend/src/utils/intakeEngine.js`**: Utilizes `startSession` and `session.withTransaction` for incoming external integrations.
- **`backend/utils/withMongoTransaction.js`**: A centralized utility wrapper introduced previously, but currently unused by core CRM controllers.
- **`backend/services/contactMerge.service.js`**: Uses `session.withTransaction` for deduplication.
- **RBAC Controllers (`user.controller.js`, `role.controller.js`)**: Manually call `session.startTransaction()` and `session.commitTransaction()` without the MongoDB Native Driver's auto-retry wrapper.
- **Core CRM Controllers (`deal`, `lead`, `inventory`, `contact`)**: Do **NOT** use transactions for standard CRUD operations.

## 2. CURRENT TRANSACTION GAPS
Because Core CRM endpoints do not use transactions, the system is exposed to:
- **Orphaned Records**: Creating a Deal but failing to write the `Timeline` activity.
- **Partial Updates**: A Booking is created but the Deal state fails to update.
- **Transient Network Failures**: Lack of retry logic for `MongoNetworkError` or `TransientTransactionError` in manual `startTransaction` implementations.

## 3. CORE WORKFLOW ANALYSIS

| Entity | Operation | Documents Written | Transaction? | Partial Failure Risk |
|---|---|---|---|---|
| **Contact** | CREATE | `Contact`, `Activity` (System Log) | NO | Orphaned Contact without initial audit trail. |
| **Lead** | CREATE | `Lead`, `Contact` (Link/Create), `Activity` | NO | Lead created, but Contact linkage fails. |
| **Deal** | CREATE | `Deal`, `Inventory` (State), `Timeline` | NO | Deal created, but Inventory status out-of-sync. |
| **Inventory**| CREATE | `Inventory`, `History` (Owner Link) | NO | Inventory created, but history log lost. |
| **Booking** | CREATE | `Booking`, `Deal` (Stage), `Ledger` | NO | Severe: Financial data misaligned with Deal stage. |
| **Import** | CREATE | Batch entities (Contacts/Leads) | NO | Partial imports, duplication on manual retry. |

## 4. ATOMIC BOUNDARY DEFINITIONS
To avoid long-running lock contention, transactions must be scoped strictly to the minimum business requirement.
- **Lead Creation**: `Lead` doc + `Contact` association/creation + Initial `Activity` log.
- **Deal Creation**: `Deal` doc + `Inventory` status change (e.g., locking unit) + `Timeline` event.
- **Booking Creation**: `Booking` doc + `Deal` stage update (to "Booked") + `Ledger`/Payment entry.
- **Contact Creation**: `Contact` doc + Lookup associations (if nested creation occurs).
*Note: Read-only lookups (e.g., verifying a Team ID) can happen outside the transaction to reduce lock duration.*

## 5. EXTERNAL SIDE-EFFECT STRATEGY
**Problem**: Sending an SMS/Email inside a MongoDB transaction is an anti-pattern. If the transaction aborts after the email is sent, the email cannot be "un-sent." Conversely, if the SMS API hangs, the database lock is held open indefinitely.
**Enterprise Pattern**:
1. Open Transaction.
2. Write Business Entities (`Deal`, etc.).
3. Write an Outbox/Event record (`EventLog` collection).
4. Commit Transaction.
5. (Post-Transaction) Event worker picks up `EventLog` and executes external side-effects (WhatsApp, SMS, Webhooks).

## 6. IMPORT TRANSACTION STRATEGY
**Problem**: Wrapping a 10,000-row CSV import into a single transaction will exceed the 16MB oplog limit or cause massive lock contention (WiredTiger cache pressure).
**Enterprise Pattern**:
- Validate file structure (No Transaction).
- Chunk into batches of 100-500 records.
- For each batch, use `bulkWrite` wrapped in a single transaction.
- If a batch fails, record the batch failure in an `ImportJob` document (outside the transaction) and continue to the next batch.
- This ensures resumability and idempotency.

## 7. SOFT-DELETE TRANSACTION STRATEGY
Currently, `softDelete.plugin.js` modifies records but has no built-in transaction session propagation awareness.
**Safe Design**:
- **Normal Delete**: Controllers must pass the `session` object into `.softDelete(userId, session)`.
- **Hard Delete**: Explicit elevated endpoints only, requiring an audit log written in the *same* transaction.
- **Bulk Delete**: Convert to `updateMany({ $set: { isDeleted: true } }, { session })`.

## 8. RETRY & IDEMPOTENCY
- **Transaction Retry**: Native driver handles `TransientTransactionError` natively via `withTransaction()`. This retries the *database commit*, not the business logic.
- **Business Idempotency**: APIs must accept an `Idempotency-Key` header (especially for integrations/webhooks). If a webhook retries a Lead creation, the system must recognize the key and return the existing Lead without duplicating it.

## 9. SESSION PROPAGATION CONTRACT
Sessions must not be hidden in global scopes.
**Rule**:
- The **Controller** instantiates the session via the wrapper.
- The **Service** accepts `(data, { session })`.
- The **Repository/Model** receives the session directly: `Deal.create([data], { session })`. Note the array syntax required by Mongoose for creating docs inside a session.

## 10. STANDARD TRANSACTION UTILITY DESIGN
The existing `backend/utils/withMongoTransaction.js` should be the unified standard:
```javascript
// Conceptual implementation
export const withTransaction = async (operation) => {
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async (txnSession) => {
            result = await operation(txnSession);
        });
        return result;
    } finally {
        await session.endSession();
    }
};
```

## 11. MIGRATION & IMPLEMENTATION SEQUENCE
1. Apply `withTransaction` wrapper to `Deal` and `Booking` (Highest risk).
2. Apply `withTransaction` to `Lead` and `Inventory`.
3. Refactor existing manual RBAC transactions (`startTransaction` / `commitTransaction`) to use the wrapper for automated retries.
4. Implement Outbox pattern for external services (SMS/Email).

## 12. RISKS & TESTING REQUIREMENTS
- **Risk**: Mongoose requires arrays for `.create(docs, { session })`. Forgetting the array syntax bypasses the session.
- **Risk**: Missing indexes on fields heavily queried inside transactions can cause collection scans under lock.
- **Testing**: Requires automated concurrency tests simulating transient network drops during a transaction commit.
