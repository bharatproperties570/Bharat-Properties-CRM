# PHASE 4.2 — ENTERPRISE OWNERSHIP CONTRACT & MIGRATION REDESIGN

## 1. CURRENT ARCHITECTURE & LOCKED SEMANTICS
Based on strict codebase analysis, the following enterprise semantics are fundamentally LOCKED:
- `Deal.owner` = External Contact (Property Owner / Seller)
- `Deal.assignedTo` = Internal User (CRM Relationship Manager)
- `Inventory.owners[]` = Array of External Contacts (Property Owners)
- `Inventory.assignedTo` = Internal User (CRM Relationship Manager)

These represent fundamentally distinct business relationships. `Contact` entities represent external parties, whereas `User` entities represent authenticated internal staff.

## 2. ABANDONED MIGRATION LOGIC
The previous logic utilized in Phase 4.4G (`002-soft-delete-ownership-backfill.js`) is formally marked as **INVALID**:
```javascript
$expr: { $ne: ["$owner", "$assignedTo"] }
canonicalOwner = doc.owner || doc.assignedTo;
```
**Why it is invalid:**
Because `Contact ≠ User`. The migration wrongly assumed that `owner` and `assignedTo` were functionally overlapping fields that could be safely collapsed into a single `ownerId`. By using `assignedTo` as a fallback for a missing `owner`, the script was actively injecting Internal CRM User IDs into external Property Owner fields, causing massive schema degradation and structural corruption.

## 3. CORRECT ENTERPRISE OWNERSHIP CONTRACT
The future canonical model must strictly separate these identities. 

**Proposed Separation:**
- `contactOwnerId` (Reference to `Contact`): The external party selling/owning the property.
- `internalOwnerId` / `assignedTo` (Reference to `User`): The RM responsible for the record.
- `teams` (Array of `Team`): Team-based visibility.
- `department` / `branchId`: Regional or organizational isolation.
- `createdBy` / `updatedBy`: System audit fields.

**Backward Compatibility:**
To maintain frontend and API compatibility without a massive breaking rewrite, the actual database fields should remain `owner` (for Contact) and `assignedTo` (for User) for the immediate future. The migration strategy must populate them accurately based on their original intent rather than merging them.

## 4. INVENTORY → DEAL OWNERSHIP FLOW
**The Correct Flow:**
- `Inventory.owners` (or the primary owner) must selectively flow into `Deal.owner` or `Deal.partyStructure.owner`.
- `Inventory.assignedTo` must flow into `Deal.assignedTo` and `Deal.partyStructure.internalRM`.

**Current Behavior:** 
The application controllers loosely copy these fields during creation. This flow must be strictly guarded in future updates so that an `assignedTo` (User) from Inventory never accidentally gets copied into the `owner` (Contact) field of a Deal.

## 5. RE-CLASSIFICATION OF THE 75 BLOCKED DEALS
Because the premise of the comparison (`owner` == `assignedTo`) was structurally invalid, the 75 blocked deals must be re-classified:
- **74 Records**: Invalidly classified. These are NOT genuine ownership conflicts. They merely contain both a `Contact` (Owner) and a `User` (RM), which is exactly how the system is supposed to function. They were blocked because the script erroneously expected them to match.
- **1 Record**: BSON Type anomaly (Deal `6a3322abd9dc119278626f61`). This record had the same hex string injected into both fields (one as String, one as ObjectId). This is a genuine data anomaly where a User ID or Contact ID was accidentally duplicated across both fields.

No "business owner" decision needs to be made for the 74 records. They should simply be left alone, as they are functioning correctly.

## 6. SOFT DELETE SAFETY DESIGN
**Current State (`backend/plugins/softDelete.plugin.js`):**
- Hooks applied: `find`, `findOne`, `count`, `countDocuments`, `aggregate`.
- **Bypass Vulnerabilities**: `deleteOne`, `deleteMany`, `findOneAndDelete`, `findByIdAndDelete`, `bulkWrite`, `replaceOne`.

**Safe Enterprise Policy (To be implemented later):**
- **Normal Delete**: Must trigger `.softDelete()` via plugin override for all delete operations.
- **Hard Delete**: Must be explicitly requested (e.g., `deleteOne({ _id: id }, { hardDelete: true })`) and require elevated RBAC privileges.
- **Bulk Operations**: Bulk operations must map deletes to `$set: { isDeleted: true }`.
- **Restore & Audit**: Must be fully supported and logged to the `history` or activity arrays.

## 7. TRANSACTION BOUNDARY DESIGN
To prevent orphaned records and partial writes, the following boundaries must be wrapped in `withMongoTransaction` in Phase 4.5+:
- **Contact Creation**: Bound with Address/Lookup creation.
- **Lead Creation**: Bound with Contact linkage and Activity logging.
- **Inventory Creation**: Bound with Property mapping and initial History logs.
- **Deal Creation**: Bound with Inventory association, Lead linking, and Timeline generation.
- **Import Operations**: Bound by batch chunks (e.g., commit every 100 records).

## 8. FUTURE IDENTITY ARCHITECTURE (DUPLICATE PREVENTION)
Currently, Contact creation lacks duplicate prevention (no unique indexes, no query-locking). 

**Future Architecture (To be implemented post-Phase 4):**
1. **Normalization**: Trim whitespace, lowercase emails, strip non-numeric characters from phone numbers (including country codes).
2. **Identity Resolution**: `Contact.findOne({ $or: [{ phone: normalizedPhone }, { email: normalizedEmail }] })`.
3. **Transaction Lock**: Perform the check and the creation within the same `withMongoTransaction` session to prevent race conditions during concurrent API/Webhook ingestion.
4. **Idempotency**: External ingestions (WhatsApp/Webhooks) must supply an Idempotency Key to prevent double-processing.
5. **Database Constraint**: A unique partial index on Phone/Email for `isDeleted: false` records.

## 9. RISKS & RECOMMENDED SEQUENCE
**Risks:**
- Data corruption if scripts continue attempting to merge `Contact` and `User` references.
- Orphaned documents due to lack of transactions.

**Implementation Sequence:**
1. Formally close the Phase 4.4 migration attempt.
2. Advance to **Phase 4.3/4.5 (Backend Architecture & Transactions)** to wrap core controllers in atomic sessions.
3. Advance to Contact Identity / Deduplication using the newly established transaction boundaries to safely merge the 338 known duplicate contacts.
