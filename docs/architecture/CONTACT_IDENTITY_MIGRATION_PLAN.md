# CONTACT IDENTITY MIGRATION PLAN
*Status: Architecture Corrected. Ready for Fresh Readiness Audit.*

## 1. Legacy BSON Normalization (Pre-Index Gate)
Before duplicate discovery or index creation, the database must be normalized to ensure all active contacts possess the physical BSON fields required by the MongoDB partial filter expression. Missing fields evaluate to `null` and bypass the index constraint.
- **Action**: Execute an idempotent update across the `contacts` collection: 
  `db.contacts.updateMany({ isDeleted: { $exists: false } }, { $set: { isDeleted: false } })`
  `db.contacts.updateMany({ isMerged: { $exists: false } }, { $set: { isMerged: false } })`
- **Verification**: Ensure `db.contacts.countDocuments({ isDeleted: { $exists: false } }) === 0`.

## 2. Active Duplicate Discovery
Run read-only aggregations grouping by normalized phone numbers (strip spaces, dashes, +91) and emails (lowercase, trimmed).
- Group strictly among records where `isDeleted: false` and `isMerged: false`.
- Filter out cases where phone numbers are missing, `null`, or empty strings.
- Historical (merged/soft-deleted) Contacts are explicitly EXCLUDED.

## 3. Canonical Survivor Selection
For each discovered active duplicate group:
- Select the earliest created `Contact` as the canonical survivor.
- Internal Contact Consolidation: Migrate distinct array elements (tags, alternate phones, addresses, documents) from duplicates into the survivor in-memory.

## 4. Complete Reference Graph Migration (19 Paths)
Before the duplicate becomes inactive, all external dependencies MUST be atomically remapped.

**Singular References (`$set` operation):**
1. `Lead.contactDetails`
2. `Booking.lead`
3. `Booking.seller`
4. `Booking.channelPartner`
5. `Conversation.contact`
6. `Deal.partyStructure.owner`
7. `Deal.partyStructure.buyer`
8. `Deal.partyStructure.channelPartner`
9. `Deal.owner`
10. `Deal.associatedContact`

**Polymorphic References (`$set` and `arrayFilters` operation):**
11. `Activity.entityId` (where `entityType: 'Contact'`)
12. `Activity.relatedTo.id` (where `relatedTo.model: 'Contact'`)

**Array References (`$addToSet` followed by `$pullAll`):**
13. `Inventory.owners`
14. `Company.employees`

**Nested Array References (`arrayFilters` operation):**
15. `Inventory.associates[].contact`
16. `Inventory.ownerHistory[].contactId`

**Lineage & Audit References:**
17. `Contact.mergedInto`
18. `MergeAudit.masterContactId`
19. `MergeAudit.duplicateContactId`

## 5. Specific Migration Patterns
- **Company Employees & Inventory Owners (Arrays)**: 
  Executed via `$addToSet` (to prevent duplicates) followed by `$pullAll` to remove the old duplicate ID.
- **Inventory Associates & OwnerHistory (Nested Arrays)**:
  Migrated securely using MongoDB `arrayFilters`.
  `db.inventories.updateMany({ "associates.contact": duplicateId }, { $set: { "associates.$[elem].contact": masterId } }, { arrayFilters: [{ "elem.contact": duplicateId }] })`. This avoids duplicating nested objects or mutating unrelated array elements.
- **Activity (Polymorphic)**:
  Must NOT use a fictional `Activity.contact` field.
  Must query `entityId` strictly where `entityType === 'Contact'`.
  Must query `relatedTo.id` strictly where `relatedTo.model === 'Contact'` using `arrayFilters`.
- **Contact.mergedInto (Historical Lineage)**:
  If `Contact A` was previously merged into `Contact B`, and `Contact B` is now merging into `Master C`, `Contact A.mergedInto` is updated to point directly to `Master C`. This safely flattens lineage chains to 1 hop.
- **MergeAudit (Historical Semantic Integrity)**:
  `MergeAudit.masterContactId` and `duplicateContactId` represent literal historical events at a fixed point in time. The migration MUST NOT mutate existing MergeAudit records. Changing them would destructively rewrite history. They are intentionally preserved exactly as-is.

## 6. Complete mergeContacts Requirements
The future `mergeContacts` controller MUST satisfy all of the above:
- Handle all 19 paths across 7 models (`Lead`, `Booking`, `Conversation`, `Deal`, `Activity`, `Inventory`, `Company`).
- Utilize `$addToSet`/`$pullAll` and `arrayFilters` to prevent data corruption.
- Flatten `mergedInto` lineage dynamically.
- Emit a new `MergeAudit` record without mutating old ones.
- Wrap the entire operation in a single `mongoose.startSession()` transaction.

## 7. Migration Sequence & Transaction Boundaries
1. **BSON backup** (Full database snapshot).
2. **Legacy BSON normalization** (Apply `isDeleted`/`isMerged` fields).
3. **Active duplicate discovery**.
4. **Canonical survivor selection**.
5. **Internal Contact consolidation**.
6. **Complete 19+ path reference migration** (Wrapped in atomic Transaction).
7. **Duplicate state transition** (`isMerged: true`) (Wrapped in atomic Transaction).
8. **Reference-integrity verification**.
9. **Idempotency verification**.
10. **Unique partial-index creation**.
11. **Post-index verification**.

## 8. Rollback Strategy
If reference migration fails midway, `session.abortTransaction()` reverts all in-flight reference modifications and state transitions safely. If an unexpected index corruption occurs, the pre-migration BSON backup is restored, completely overwriting the database state and returning all nested arrays, lineages, and audit logs to their exact pre-migration state.

## 9. Pre-Migration Test Requirements
1. Legacy Contact missing `isDeleted`/`isMerged` (BSON normalization).
2. Active duplicate detection explicitly after normalization.
3. Merged Contact sharing phone number (verifies unique index evasion).
4. Soft-deleted Contact sharing phone number.
5. `Conversation.contact` migration.
6. `Company.employees[]` array remapping without duplicate IDs.
7. `Deal` reference migration.
8. `Booking.channelPartner` migration.
9. `Inventory.associates[].contact` nested `arrayFilters` update.
10. `Inventory.ownerHistory[].contactId` nested `arrayFilters` update.
11. `Activity` polymorphic migration (`entityId` + `relatedTo`).
12. `Contact.mergedInto` lineage flattening.
13. `MergeAudit` historical semantics preservation.
14. Idempotent rerun verification.
15. Rollback recovery (BSON restore behavior).
16. Concurrent duplicate creation rejection (HTTP 409).
