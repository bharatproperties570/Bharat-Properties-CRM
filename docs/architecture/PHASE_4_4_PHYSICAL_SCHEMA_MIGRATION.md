# PHASE 4.4: PHYSICAL SCHEMA MIGRATION 

## 1. MIGRATION SCOPE
- **Included Models**: Contacts, Leads, Inventories, Deals, Bookings, Projects, Users, Teams (Tier 1). Conversations, Forms (Tier 2).
- **Excluded Models**: Activities, AuditLogs (Append-Only logs).
- **Excluded Features**: Contact deduplication, Contact Unique Index, Deal conflict resolution.

## 2. BACKFILL RULES
- **Soft Delete**: Added `isDeleted: false` selectively ONLY where `isDeleted` does not exist via bulk updates. Existing deletion semantics (if any) are strictly preserved.
- **Ownership Mapping**: For Tier 1 records missing `ownerId`, the canonical value is deterministically backfilled using fallback arrays (`owner || assignedTo`). If both exist and contradict, the record is deliberately SKIPPED.

## 3. DEAL CONFLICTS
- 74 Deals contain conflicting `owner` and `assignedTo` fields.
- These records were structurally parsed and dumped to `PHASE_4_4_DEAL_OWNERSHIP_REVIEW.md`.
- No database update was attempted on these records.

## 4. CONTACT IDENTITY
- **STRICT HOLD**. No unique indexes were created. Phone deduplication engine is deferred to Phase 4.5/5.

## 5. MIGRATION FRAMEWORK VALIDATION
- Script created at `backend/migrations/002-soft-delete-ownership-backfill.js`.
- Implements `--dry-run`.
- Implements `ALLOW_PRODUCTION_MIGRATION` guard rails against `bharatproperties1`.
- Cursor batching implemented for Ownership updates (size: 500).

## 6. ROLLBACK STRATEGY
A deterministic rollback targets exactly the `_migrationRef: "MIG_P4.4_001"`:
```javascript
// Reverse Soft-Delete Additions
db.collection.updateMany(
  { _migrationRef: "MIG_P4.4_001" },
  { $unset: { isDeleted: "", _migrationRef: "" } }
);

// Reverse Ownership Backfills
db.collection.updateMany(
  { _ownershipMigrationRef: "MIG_P4.4_001" },
  { $unset: { ownerId: "", _ownershipMigrationRef: "" } }
);
```
No existing pre-migration legacy ownership fields (`owner`, `assignedTo`) were dropped or modified, ensuring application backward compatibility.

## 7. EXECUTION STATUS
- **Dry-Run**: PASSED
- **Staging Migration**: NOT EXECUTED (Staging cluster unavailable due to network issues; dry run performed via BSON).
- **Production Migration**: 0 WRITES. (Explicit block per requirement).
