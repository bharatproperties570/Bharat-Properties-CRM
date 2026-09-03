# PHASE 4.1 — DATABASE ARCHITECTURE CODE AUDIT

## 1. MIGRATION FILE PATHS
- **Core Template**: `backend/migrations/001-template.js`
- **Soft Delete & Ownership Backfill**: `backend/migrations/002-soft-delete-ownership-backfill.js`
- **Staging Preflight**: `backend/migrations/preflight-staging.js`

## 2. AUDITED GIT STATE
- **Commit SHA**: `4b0090ac3ad04b55cba78088374225ae3dfff5c7`
- **Branch**: `enterprise/phase-2.0-A-safety`

## 3. DEAL OWNERSHIP SEMANTICS
Based on `backend/models/Deal.js`:
- `owner`: `{ type: Mixed, ref: 'Contact' }` — Represents the external Property Owner / Seller.
- `assignedTo`: `{ type: ObjectId, ref: 'User' }` — Represents the internal CRM User / Relationship Manager.
- **Population**: They populate from completely different collections.

## 4. INVENTORY OWNERSHIP SEMANTICS
Based on `backend/models/Inventory.js`:
- `owners`: `[{ type: ObjectId, ref: 'Contact' }]` — Array of external Property Owners.
- `assignedTo`: `{ type: ObjectId, ref: 'User' }` — Internal CRM User.

## 5. OWNER VS ASSIGNED TO DISTINCTION
The `owner` and `assignedTo` fields are fundamentally distinct business entities. 
- `owner` = External Contact/Client.
- `assignedTo` = Internal Staff/User.
They must **never** be merged or treated as interchangeable fallback fields.

## 6. PHASE 4.4G CONFLICT ALGORITHM
The migration algorithm in `002-soft-delete-ownership-backfill.js` used:
`$expr: { $ne: ["$owner", "$assignedTo"] }`
And attempted to consolidate them:
`canonicalOwner = doc.owner || doc.assignedTo;`
**Critical Flaw**: This algorithm structurally conflated Property Owners (`Contact`) with Internal Users (`User`). It attempted to collapse two separate relationships into a single `ownerId` column.

## 7. CLASSIFICATION OF THE 75 BLOCKED RECORDS
- **A. Genuine Property Owner Conflicts**: 0
- **B. Internal User Assignment Conflicts**: 0
- **C. BSON/Type Normalization Issues**: 1 (Deal ID `6a3322abd9dc119278626f61` had the exact same string value injected into both fields, but one was `String` and the other `ObjectId`, triggering the `$ne` operator).
- **F. Incorrect Migration Classification**: 75. All 75 records were falsely flagged as "conflicts" because comparing a `Contact` ID to a `User` ID will always result in inequality. The premise of the conflict check was invalid.

## 8. SOFT-DELETE IMPLEMENTATION
- **Path**: `backend/plugins/softDelete.plugin.js`
- **Fields added**: `isDeleted` (Boolean), `deletedAt` (Date), `deletedBy` (ObjectId ref User).
- **Hooks**: Successfully overrides `find`, `findOne`, `count`, `countDocuments`, and `aggregate` to exclude `isDeleted: true`.
- **Physical Deletion**: `deleteOne` and `deleteMany` are **NOT** overridden and will continue to physically delete records if called directly.

## 9. OWNERSHIP MODEL GAPS
- **Current State**: Models heavily overload terms (`owner`, `assignedTo`, `teams`, `partyStructure.owner`).
- **Missing Enterprise Fields**: `organizationId`, `branchId`, `createdBy`, `updatedBy`.
- **Future Migration**: A dedicated separation between `contactOwnerId` (Seller) and `internalOwnerId` (RM) is required to fix the Phase 4.4G flaw.

## 10. TRANSACTION GAPS
- **Usage**: `startSession` and `withTransaction` are completely absent from core controllers (`Deal`, `Contact`, `Inventory`, `Lead`). They only exist in an isolated `backend/src/utils/intakeEngine.js` script.
- **Risk**: 100% vulnerability to partial writes and orphaned records during multi-document creations.

## 11. IDENTITY & DUPLICATE-PREVENTION ARCHITECTURE
- **Database Constraints**: `backend/models/Contact.js` lacks any `unique` indexes on `phone`, `email`, or composite identities.
- **Application Logic**: `backend/controllers/contact.controller.js` (`createContact`) lacks explicit query-locking or transactional deduplication checks before `Contact.save()`.
- **Status**: Duplicate prevention is purely reactive/manual, leading directly to the 338 duplicates identified in earlier phases.

## 12. RISKS
1. **Schema Degradation**: Consolidating `Contact` and `User` references into a single column.
2. **Data Loss**: `deleteOne` physically bypassing the soft-delete plugin.
3. **Orphaned Records**: Lack of transactions across relational entity creation.

## 13. RECOMMENDED PHASE 4 IMPLEMENTATION SEQUENCE
1. Immediately abandon the flawed `ownerId` consolidation approach from Phase 4.4.
2. Implement Global Transactions across core controllers (Phase 4.5).
3. Implement Contact Deduplication and apply `unique` indexing safely.
