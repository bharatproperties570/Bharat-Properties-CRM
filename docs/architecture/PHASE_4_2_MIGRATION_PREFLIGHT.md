# PHASE 4.2: PHYSICAL SCHEMA MIGRATION PREFLIGHT

## 1. ACTUAL MODEL COUNT & VALIDATION
- **Actual Models Audited**: 54 Mongoose models (Verified via code introspection).
- **Collections Analyzed**: 9 Core Collections via deep native BSON metrics extraction.
- **Phase 4.1 Contracts Verified**: `ownership.plugin.js`, `softDelete.plugin.js`, migration framework scaffolding all physically present and syntactically valid. `softDelete.test.js` passes structural validation.
- **Contracts Applied**: Currently 0% applied to running collections (as designed. Phase 4.1 was strictly code-definition only).

## 2. COLLECTION INVENTORY & SOFT-DELETE READINESS

| Collection | Total Docs | Missing `isDeleted` | Legacy `archived` | Soft-Delete Readiness |
|---|---|---|---|---|
| Contacts | 13,326 | 13,326 (100%) | 0 | **SAFE** |
| Leads | 145 | 145 (100%) | 0 | **SAFE** |
| Inventories | 19,817 | 19,817 (100%) | 0 | **SAFE** |
| Deals | 121 | 121 (100%) | 0 | **SAFE** |
| Bookings | 9 | 9 (100%) | 0 | **SAFE** |
| Activities | 26,239 | 26,239 (100%) | 0 | **SKIP (Tier 3 Append-Only)** |
| Projects | 29 | 29 (100%) | 0 | **SAFE** |
| Users | 9 | 9 (100%) | 0 | **SAFE** |
| Teams | 2 | 2 (100%) | 0 | **SAFE** |

*Conclusion*: Zero conflicts with existing deletion flags. Soft-delete backfill is **100% SAFE**.

## 3. LEGACY OWNERSHIP CONFLICT ANALYSIS

| Collection | Has `owner` | Has `assignedTo` | Has `teams` | `owner` vs `assignedTo` Conflicts | Readiness |
|---|---|---|---|---|---|
| Contacts | 13,326 | 13,326 | 13,325 | 0 | **SAFE** |
| Leads | 0 | 38 | 137 | 0 | **SAFE** |
| Inventories| 0 | 19,803 | 18,395 | 0 | **SAFE** |
| Deals | 77 | 118 | 120 | **74 (61%)** | **REVIEW REQUIRED** |
| Bookings | 0 | 0 | 2 | 0 | **SAFE** |

*Critical Finding*: In `deals`, 74 documents have contradicting `owner` and `assignedTo` values. A blind precedence rule (e.g. `ownerId = owner || assignedTo`) risks corrupting business intent. Manual review of `Deals` assignment semantics is explicitly required before ownership canonicalization.

## 4. CONTACT IDENTITY READINESS
- **Total Contacts**: 13,326
- **Duplicate Phone Groups**: 338
- **Blank Phones**: 3,787
- **Readiness**: **BLOCKED**. Cannot apply unique index on `phones.number`. Duplicate resolution engine must run first. 3,787 documents require sparse/null handling.

## 5. CROSS-COLLECTION IDENTITY ANALYSIS
- **Unique Lead Mobiles**: 144
- **Contacts sharing a Lead Mobile**: 122
- *Impact*: 84% of Leads exist as duplicate identities in the Contacts collection. Cross-collection polymorphism must be resolved before enterprise identity unification.

## 6. MIGRATION IMPACT MATRIX

| COLLECTION | TOTAL | SAFE | REVIEW | BLOCKED |
|---|---|---|---|---|
| Contacts | 13,326 | 13,326 | 0 | 0 |
| Leads | 145 | 145 | 0 | 0 |
| Inventories| 19,817 | 19,817 | 0 | 0 |
| Deals | 121 | 47 | 74 (Conflicts) | 0 |
| Bookings | 9 | 9 | 0 | 0 |

## 7. INDEX ANALYSIS (Proposed Only)
Do NOT execute these. Proposed for post-migration:
- `{ "isDeleted": 1 }` (Background: true) on all Tier 1 models.
- `{ "organizationId": 1, "isDeleted": 1 }` on all Tier 1 models for multi-tenant query routing.
- `{ "phones.number": 1 } (Unique, Sparse, PartialFilterExpression)` on Contacts (Only after Deduplication).

## 8. MIGRATION FRAMEWORK SAFETY CHECK
- Framework verified. `001-template.js` successfully implements `mongoose.connection.name` checks, enforces `--dry-run`, and aborts gracefully if `ALLOW_PRODUCTION_MIGRATION` is missing against `bharatproperties1`.
- Safe for production execution.

## 9. PERFORMANCE CONSIDERATIONS
- `Activities` (26K) and `Inventories` (19K) are moderately large.
- **Recommendation**: Cursor batching with `bulkWrite(ops, { ordered: false })` in chunks of 1000 is required to prevent oplog saturation during the `isDeleted: false` backfill.

## 10. RECOMMENDED MIGRATION ORDER
1. Execute Soft-Delete Backfill (100% Safe, zero conflicts).
2. Execute Ownership Backfill on Safe Collections (Contacts, Leads, Inventories, Bookings).
3. Conduct Business Review on Deals (resolve the 74 `owner` vs `assignedTo` conflicts).
4. Run Contact Deduplication Engine (Unblocks Identity Indexing).
5. Execute Identity Index Creation.
