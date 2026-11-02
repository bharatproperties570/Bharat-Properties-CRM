# Migration 004: Contact Phone Active Unique Index — DBA Runbook

## Document Overview
- **Migration Script:** `backend/migrations/004-contact-phone-unique-index-migration.js`
- **Target Collection:** `contacts`
- **Target Index Name:** `contacts_phones_number_active_unique`
- **Target Index Spec:** `{ "phones.number": 1 }`
- **Partial Filter:** `{ "phones.number": { "$type": "string" }, "isDeleted": false, "isMerged": false }`
- **Phase:** Phase 4.6 Enterprise Contact Deduplication & Data Integrity

---

## 1. Safety Guarantees & Operating Invariants

1. **Dual Approval Guard for Production:**
   - Any execution (`--execute`) or rollback (`--rollback`) against production (`bharatproperties1`) is strictly blocked unless **BOTH** environment variables are explicitly exported:
     ```bash
     ALLOW_PRODUCTION_MIGRATION=true
     DBA_APPROVED_INDEX_MIGRATION=true
     ```
   - If either flag is missing or false, execution halts immediately with exit code 1.

2. **Fail-Closed Database Identity:**
   - The migration verifies database connectivity and database name before performing any check.
   - If the database identity cannot be positively resolved, the migration immediately aborts without executing any command.

3. **Strict Mode Whitelist:**
   - Only `dry-run`, `execute`, and `rollback` are permitted. Any unknown or malformed parameter is rejected.

4. **Zero Mutation on Preflight & Dry-Run:**
   - Preflight analysis is strictly read-only.
   - The migration NEVER alters, normalizes, truncates, or deletes stored phone numbers or contact records.

5. **Legacy Index Protection:**
   - The existing non-unique index `phones.number_1` is preserved during execution and rollback to ensure zero regression for queries that do not match the partial filter.

6. **Race-Condition & Controlled Abort Handling:**
   - A successful preflight scan does not guarantee an uninterrupted build if concurrent writes insert duplicate phone numbers between the scan and index creation.
   - If a duplicate is inserted concurrently, MongoDB raises `E11000` (code 11000). The migration intercepts this error, logs a detailed controlled abort diagnosis (`E11000_CONCURRENT_INSERT`), and terminates safely without partial index corruption.

---

## 2. Technical Distinctions: Exact String vs. Business Duplicates

MongoDB unique indexes enforce **byte-for-byte exact string equality**.

### Exact-String Duplicates (E11000 Blocker)
- Examples: `"9811122233"` vs `"9811122233"` across two active contacts (`isDeleted: false, isMerged: false`).
- Impact: MongoDB **will reject index creation** with `E11000 duplicate key error collection`.
- Resolution: **Must be merged** via the Contact Merge API (`/api/contacts/merge`) before running `--execute`.

### Intra-Contact Duplicates (Permitted by MongoDB)
- Example: Single contact document has `phones: [{ number: "9811122233" }, { number: "9811122233" }]`.
- Impact: MongoDB multikey unique indexes allow a document to refer to itself multiple times with the same value. This does **not** fail the index build.
- Recommendation: Clean up duplicate phone entries within the same contact for data hygiene.

### Normalized Business Duplicates (Non-Blocking)
- Examples:
  - Whitespace: `" 9811122233 "` vs `"9811122233"`
  - Country code prefix: `"+919811122233"` vs `"9811122233"`
  - Trunk zero prefix: `"09811122233"` vs `"9811122233"`
- Impact: MongoDB exact-string unique index does **NOT** block these. They will coexist in the database.
- Reporting: The preflight scan detects and reports all normalized variants under `normalizedVariantsAcrossContacts` so DBAs and Operations can queue them for Contact Merge review. The script will never silently mutate or rewrite production phone strings.

### Missing or Null Lifecycle Flags
- MongoDB partial filter `{ isDeleted: false, isMerged: false }` requires fields to explicitly match boolean `false`.
- Documents where `isDeleted` or `isMerged` is missing (`$exists: false`) or `null` are **excluded** from the partial index.
- The preflight scan reports `totalLifecycleFlagGaps` so DBAs can verify if legacy records need lifecycle flag normalization.

---

## 3. Step-by-Step Execution Runbook

### Step 1: Pre-Flight Scan (Dry Run)
Execute dry-run to inspect the database without modifying any index:

```bash
NODE_ENV=production node backend/migrations/004-contact-phone-unique-index-migration.js
```
*(Default mode is dry-run. Alternatively: `--dry-run`)*

**Examine Output:**
- `buildFeasible`: Must be `true`.
- `crossContactExactDuplicates`: Must be `0`.
- Review `normalizedVariantsAcrossContacts` for business duplicate candidates.
- Review `totalLifecycleFlagGaps` for unindexed legacy contacts.

---

### Step 2: Remediating Conflicts Prior to Index Build
If `crossContactExactDuplicates > 0`:
1. Use the Contact Merge API to reconcile duplicates:
   ```http
   POST /api/contacts/merge
   Content-Type: application/json
   Authorization: Bearer <TOKEN>

   {
     "canonicalId": "<MASTER_CONTACT_ID>",
     "duplicateId": "<DUPLICATE_CONTACT_ID>",
     "strategy": "master_wins",
     "customFieldValues": {}
   }
   ```
2. Merging flags the duplicate contact as `isMerged: true`, immediately removing it from the partial filter expression without data loss.
3. Re-run Step 1 until `crossContactExactDuplicates === 0`.

---

### Step 3: Index Build Execution
Once preflight is clean:

```bash
NODE_ENV=production \
ALLOW_PRODUCTION_MIGRATION=true \
DBA_APPROVED_INDEX_MIGRATION=true \
node backend/migrations/004-contact-phone-unique-index-migration.js --execute
```

**Automated Post-Build Verification Performed:**
1. Confirms `contacts_phones_number_active_unique` exists in `collection.indexes()`.
2. Validates exact key pattern: `{ 'phones.number': 1 }`.
3. Validates unique flag: `unique: true`.
4. Validates partial filter: `isDeleted: false, isMerged: false`.
5. Confirms legacy index `phones.number_1` remains present.

---

### Step 4: Emergency Rollback Procedure
If production issues arise or index requires removal:

```bash
NODE_ENV=production \
ALLOW_PRODUCTION_MIGRATION=true \
DBA_APPROVED_INDEX_MIGRATION=true \
node backend/migrations/004-contact-phone-unique-index-migration.js --rollback
```

**Verification:**
- Script drops `contacts_phones_number_active_unique`.
- Script verifies `phones.number_1` is preserved.
- Output confirms `status: 'ROLLED_BACK'`.
