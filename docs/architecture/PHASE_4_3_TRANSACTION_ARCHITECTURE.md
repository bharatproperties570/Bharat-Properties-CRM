# PHASE 4.3 — TRANSACTION & CONSISTENCY ARCHITECTURE

## 1. CURRENT TRANSACTION MAP & AUDIT
An extensive codebase audit reveals the following current state of transactions:

| WORKFLOW | MULTI-DOC WRITE? | CURRENT TRANSACTION? | ROLLBACK SAFE? | RISK |
|---|---|---|---|---|
| Lead Creation | Yes (Lead + LeadForm + Activity) | **NO** | **NO** | HIGH |
| Deal Creation | Yes (Deal + Activity) | **NO** | **NO** | HIGH |
| Deal Stage Change | Yes (Deal + Activity) | **NO** | **NO** | HIGH |
| Inventory Creation| Yes (Inventory + Assignment) | **NO** | **NO** | HIGH |
| Booking Creation | Yes (Booking + Deal + Activity)| **NO** | **NO** | CRITICAL |
| Contact Merge | Yes (Contacts + Deals + Bookings)| **YES** | YES | LOW |
| Bulk Import | Yes (Bulk Leads/Contacts) | **NO** (ordered: false) | **NO** | HIGH |
| Role/User Sync | Yes (Roles + Users) | **YES** | YES | LOW |

*Finding*: Transactions exist ONLY in `role.controller`, `user.controller`, `contact.controller` and `contactMerge.service`. The core CRM business logic (Leads, Deals, Bookings, Inventory) currently relies on non-transactional sequential promises.

## 2. EXISTING TRANSACTION WEAKNESSES
The existing implementations in `role/user/contactMerge` correctly use `startSession` and `withTransaction`. However, they suffer from:
1. **Boilerplate Duplication**: Controller logic repeats the session startup, commit, abort, and `endSession` logic.
2. **Missing Retry Logic**: There is no automatic retry handling for `TransientTransactionError` (MongoDB write conflicts).

## 3. CANONICAL TRANSACTION DESIGN
Created `backend/utils/withMongoTransaction.js`.
This utility abstracts:
- `startSession()` initialization.
- Automatic retry on `TransientTransactionError` or `UnknownTransactionCommitResult`.
- Ensures `session.endSession()` runs in a `finally` block preventing connection leaks.
- Supports exponential backoff.

## 4. SESSION PROPAGATION MODEL
**Phase 5 Standard**:
- Transactions MUST begin in the **Service** layer, not the router/controller.
- Controllers extract `req.body`, pass it to a Service.
- The Service calls `withMongoTransaction`, generating a `session`.
- The Service passes `{ session }` as the last parameter to any internal Repository or Mongoose model calls (e.g., `Deal.create([data], { session })`).

## 5. EXTERNAL SIDE-EFFECT STRATEGY
**CRITICAL**: `sendEmail` and `sendWhatsAppMessage` currently exist inside the request lifecycle.
If placed inside a transaction block, an email could be dispatched before the transaction commits. If the transaction fails and rolls back, the user still receives the email.
- **Rule**: External APIs MUST NEVER be called inside `withMongoTransaction`.
- **Pattern**: 
  1. Commit the transaction.
  2. Emit an asynchronous event (e.g., `eventEmitter.emit('deal.created', deal)`).
  3. Send email/WhatsApp inside the event listener.

## 6. IDEMPOTENCY ARCHITECTURE
Incoming webhooks (WhatsApp, Meta Leads, Exotel) currently write to MongoDB without strict transaction locks or idempotency keys.
- **Future State**: Webhook models must contain a unique `externalId` (e.g., `message_id`).
- DB indexes must enforce unique `externalId` to reject duplicate webhook deliveries natively without application-level race conditions.

## 7. IMPORT TRANSACTION STRATEGY
Existing `Contact.bulkWrite(..., { ordered: false })` is non-transactional and causes partial failure data corruption.
- **Enterprise Strategy**: Do not wrap a 50,000-row import in one transaction.
- Instead, batch the import into chunks of `100`. Wrap each chunk in `withMongoTransaction`. If a chunk fails, record the chunk offset in an `ImportJob` document and resume later.

## 8. CONCURRENCY & BOOKING CONSISTENCY
A real-estate CRM cannot allow two users to simultaneously book the same Inventory.
- **Requirement**: `Booking.create` MUST include a transactional lock or optimistic concurrency check:
  `Inventory.findOneAndUpdate({ _id: invId, status: 'Available' }, { status: 'Booked' }, { session })`
  If this returns null, the transaction immediately aborts because the inventory was claimed by another concurrent request.

## 9. DEAL OWNERSHIP BLOCKER
Phase 4.2 found 74 Deal records where `owner != assignedTo`. 
- **STATUS**: BLOCKED FOR BACKFILL. 
- **Resolution**: Business logic must determine ownership precedence for Deals before physical migration. This does not block the architectural development of the transaction utility.

## 10. CONTACT IDENTITY
- **STATUS**: STRICT HOLD. 
- Identity unique indexing cannot proceed until the Contact Deduplication Engine runs in Phase 5/6.

## 11. IMPLEMENTATION FILES
- `backend/utils/withMongoTransaction.js`
- `backend/tests/utils/withMongoTransaction.test.js`
- `docs/architecture/TRANSACTION_DEVELOPER_GUIDE.md`
