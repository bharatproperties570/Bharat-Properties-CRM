# PHASE 4.4 — ENTERPRISE SOFT DELETE ARCHITECTURE

## 1. CURRENT IMPLEMENTATION AUDIT
The current plugin (`backend/plugins/softDelete.plugin.js`) applies `isDeleted`, `deletedAt`, and `deletedBy` fields. 
**Hooked Operations (Excluded automatically):**
- `find`, `findOne`, `count`, `countDocuments`, `aggregate`
**Vulnerability:**
The plugin completely lacks hooks for deletion operations. It relies entirely on developers manually calling `doc.softDelete(userId)` instead of native mongoose methods.

## 2. DESTRUCTIVE OPERATION INVENTORY
A codebase scan reveals that core CRM controllers are completely bypassing the soft-delete plugin by utilizing native physical deletion methods.
**Critical Destructive Callers:**
- **Lead Controller**: `Lead.findByIdAndDelete()`, `Lead.deleteMany()`, `Contact.deleteMany({ 'phones.number': lead.mobile })`.
- **Contact Controller**: `Contact.findOneAndDelete()`, `Contact.deleteMany()`, `Lead.deleteMany()`, `Activity.deleteMany()`.
- **Deal Controller**: `Deal.findOneAndDelete()`, `Deal.deleteMany()`.
- **Booking Controller**: `Booking.findOneAndDelete()`.
- **Project/Company Controllers**: `Project.findOneAndDelete()`, `Company.findOneAndDelete()`.
**Business Impact**: Massive data loss. Deleting a Lead physically destroys the associated Contact and Activity history, completely violating enterprise CRM retention rules.

## 3. PLUGIN BYPASS MATRIX
| Mongoose Method | Excludes `isDeleted`? | Physically Deletes? | Can Bypass Plugin? |
|---|---|---|---|
| `find` / `findOne` | YES | NO | NO |
| `deleteOne` / `deleteMany` | NO | YES | YES |
| `findOneAndDelete` / `findByIdAndDelete` | NO | YES | YES |
| `updateOne` / `updateMany` | NO | NO | YES (Can resurrect) |
| `bulkWrite` | NO | YES/NO | YES |

## 4. ENTERPRISE DELETE CONTRACT
The repository layer must intercept all deletion attempts.
- **Normal Delete**: Must seamlessly convert to `$set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId }`.
- **Method Override**: The plugin must override `.deleteOne()`, `.deleteMany()`, `.findOneAndDelete()` to prevent accidental physical deletion.

## 5. RESTORE CONTRACT
- **Action**: `$set: { isDeleted: false, deletedAt: null, deletedBy: null }`.
- **Audit**: Must generate a `SystemEvent` / `Activity` log tracking the restoration.

## 6. HARD-DELETE CONTRACT
Hard deletion must be an explicit, privileged exception, NOT the default.
- **Service Layer**: A dedicated `hardDelete(id, { reason, userId, session })` method must be exposed.
- **RBAC**: Requires `ADMIN` or `SUPER_ADMIN` privileges.
- **Protection**: Native queries passing `{ hardDelete: true }` in the options object will be physically deleted; otherwise, the plugin intercepts and soft-deletes.

## 7. BULK-DELETE CONTRACT
- **Action**: Converts `Model.deleteMany(query)` into `Model.updateMany(query, { $set: { isDeleted: true, deletedAt: now, deletedBy: user } })`.
- **Batching**: If `query` targets > 10,000 records, the service layer must chunk the updates to prevent transaction oplog overflow and WiredTiger cache locking.

## 8. DELETED-RECORD VISIBILITY
- Normal queries automatically hide soft-deleted records.
- **Visibility Override**: Queries requiring deleted records (e.g., Trash Bin UI, Data Recovery APIs) must explicitly append a query option: `Model.find(query, null, { includeDeleted: true })`.

## 9. UNIQUE-INDEX INTERACTION
To prevent soft-deleted Contacts from blocking the ingestion of new Leads/Contacts with the same phone number:
- All future `unique: true` indexes on identity fields (`phone`, `email`) must be converted to **Partial Indexes**:
  ```javascript
  db.contacts.createIndex(
    { "phones.number": 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } }
  );
  ```

## 10. RESTORE CONFLICT STRATEGY
If a Contact (Phone: 123) is soft-deleted, and a NEW Contact (Phone: 123) is created, attempting to restore the original Contact will cause a unique index collision.
- **Strategy**: The `restore()` service must execute a `.findOne({ phone, isDeleted: false })` pre-check.
- **Conflict Resolution**: If a collision is detected, the restore must abort with a `409 Conflict` error, prompting the user to either merge the records or alter the phone number of the deleted record before restoration.

## 11. RELATIONSHIPS & CASCADING
**Current Behavior (Destructive):**
Deleting a Lead physically deletes the associated Contact and all Activities.
**Enterprise Behavior (Soft & Decoupled):**
- **Deal / Lead Deletion**: Soft-deletes the Deal/Lead ONLY. It does **NOT** cascade to the Contact. Contacts are independent identities.
- **Contact Deletion**: Soft-deletes the Contact. Related Deals/Leads are NOT deleted but visually flagged as "Orphaned/Missing Contact" in the UI.
- **Rule**: Cascading deletes must be strictly prohibited across primary entity boundaries.

## 12. TRANSACTION INTEGRATION
Soft deletion and restoration must participate in the Phase 4.3 transaction boundaries.
- **Signature**: `doc.softDelete({ userId, session, reason })`
- **Propagation**: The plugin must read `options.session` from `deleteOne(query, { session })` and pass it to the `$set` update payload to maintain ACID compliance.

## 13. AUDIT REQUIREMENTS
Every soft-delete, hard-delete, and restore operation must record:
`{ entity, entityId, action: 'SOFT_DELETE', userId, timestamp, reason, previousState, sessionId }`
- **Reuse**: The existing `Activity` or `History` models should be utilized for this audit log to avoid creating a redundant logging infrastructure.

## 14. IMPLEMENTATION SEQUENCE
1. Modify `softDelete.plugin.js` to intercept `deleteOne`/`deleteMany`/`findOneAndDelete`.
2. Refactor Core CRM Controllers (`Lead`, `Contact`, `Deal`) to remove aggressive cascading `.deleteMany()` calls.
3. Apply `{ includeDeleted: true }` to recovery/audit APIs.
4. Establish partial unique indexes for Contact deduplication.

## 15. TESTING STRATEGY
- **Bypass Testing**: Assert that `Lead.findByIdAndDelete(id)` results in `isDeleted: true` and the document remains in the database.
- **Cascade Testing**: Assert that deleting a Lead leaves the related Contact entirely untouched.

## 16. RISKS
- **Plugin Override Complexity**: Overriding Mongoose native delete methods can conflict with other middleware if not correctly positioned in the pre-hook execution chain.
- **Memory/Performance**: Over-reliance on soft deletes can bloat collections over time, requiring an archiving strategy (Phase 18) for records `deletedAt > 5 years`.
