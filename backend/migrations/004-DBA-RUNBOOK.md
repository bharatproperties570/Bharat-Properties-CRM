# Migration 004: Contact Phone Active Unique Index — DBA Runbook

## Document Overview
- **Migration Script:** `backend/migrations/004-contact-phone-unique-index-migration.js`
- **Target Collection:** `contacts`
- **Target Index Name:** `contacts_phones_number_active_unique`
- **Target Index Spec:** `{ "phones.number": 1 }`
- **Partial Filter:** `{ "phones.number": { "$type": "string" }, "isDeleted": false, "isMerged": false }`
- **Phase:** Phase 4.6 Enterprise Contact Deduplication & Data Integrity
- **Production Cluster Identifier:** `production-atlas-7dehanz`
- **Production Host Fingerprints:** `7dehanz.mongodb.net`, `cluster0.7dehanz.mongodb.net`, `atlas-145yac-shard-0`

---

## 1. Safety Guarantees & Operating Invariants

1. **Trusted Cluster Identity Validation (Host-Level Fingerprinting):**
   - The migration validates the physical MongoDB topology and host fingerprint.
   - **Database name alone is NOT sufficient:** A connection to the production Atlas cluster under an alternate database name (e.g. `dev`, `staging`) cannot bypass production protection.
   - Any connection matching the Atlas production fingerprint (`*.mongodb.net`, `7dehanz`, `atlas-145yac-shard-0`) is permanently classified as a **PRODUCTION CLUSTER**.

2. **Controlled Runtime Operator Approval (No Static `.env` Bypass):**
   - **Persistent `.env` values or shell profile environment variables strictly DO NOT authorize production index operations.**
   - In addition to baseline flags (`ALLOW_PRODUCTION_MIGRATION=true` and `DBA_APPROVED_INDEX_MIGRATION=true`), execution (`--execute`) and rollback (`--rollback`) strictly require an explicit runtime confirmation token passed via CLI argument (`--confirm-dba-approval=...`) or programmatic options (`runtimeDbaConfirmation`), bound to:
     1. Exact migration name: `004-contact-phone-unique-index-migration`
     2. Exact operation: `EXECUTE` or `ROLLBACK`
     3. Exact target cluster: `production-atlas-7dehanz`
     4. Current timestamp (epoch ms) with a maximum validity window of 5 minutes (`MAX_APPROVAL_TOKEN_AGE_MS = 300000`)
     5. Cryptographic nonce (minimum 16 characters) ensuring single-use replay protection
   - Token format: `<migrationName>:<OPERATION>:<clusterId>:<issuedAtEpochMs>:<nonce>`
   - A stale, expired, replayed, or mismatched token causes an immediate fatal abort. Tokens stored in `.env` are completely ignored and rejected.

3. **Safe Handling of Non-Production Clusters with Production Database Name:**
   - When connected to a local test host (`127.0.0.1`, `localhost`, `::1`) with database name `bharatproperties1`, the migration classifies the target as `NON_PROD_CLUSTER_WITH_PROD_DB_NAME`.
   - Execution is halted unless explicitly authorized for local simulation via `ALLOW_NON_PROD_SIMULATED_PROD=true` or `--allow-non-prod-simulated-prod`, preventing accidental confusion.

4. **Fail-Closed on Unknown / Unverified Clusters:**
   - Any remote host not matching the verified production allowlist or local test fingerprints fails closed immediately with `isValid: false`.

5. **Credential Masking in Logs & Errors:**
   - All connection URIs, hosts, and error messages are sanitized with `sanitizeMongoUri()`.
   - Passwords and connection secrets are NEVER logged.

6. **Zero Mutation on Preflight & Dry-Run:**
   - Preflight analysis is strictly read-only.
   - The migration NEVER alters, normalizes, truncates, or deletes stored phone numbers or contact records.

7. **Legacy Index Protection:**
   - The existing non-unique index `phones.number_1` is preserved during execution and rollback to ensure zero query regressions.

8. **Race-Condition & Controlled Abort Handling:**
   - Preflight duplicate scans do not guarantee build success if concurrent writes insert duplicates during index creation.
   - If a concurrent collision occurs, MongoDB raises `E11000`. The migration catches this error cleanly and logs a controlled abort (`E11000_CONCURRENT_INSERT`), leaving database state uncorrupted.

---

## 2. Technical Distinctions: Exact String vs. Business Duplicates

MongoDB unique indexes enforce **byte-for-byte exact string equality**.

### Exact-String Duplicates (E11000 Blocker)
- Examples: `"9811122233"` vs `"9811122233"` across distinct active contacts (`isDeleted: false, isMerged: false`).
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

### Step 3: Production Index Build Execution
Once preflight is clean, generate a single-use runtime approval token (valid for 5 minutes):

```bash
# Generate single-use approval token
OP_TOKEN=$(node -e 'console.log(`004-contact-phone-unique-index-migration:EXECUTE:production-atlas-7dehanz:${Date.now()}:${require("crypto").randomBytes(16).toString("hex")}`)')

# Execute with explicit runtime token argument
NODE_ENV=production \
ALLOW_PRODUCTION_MIGRATION=true \
DBA_APPROVED_INDEX_MIGRATION=true \
node backend/migrations/004-contact-phone-unique-index-migration.js --execute --confirm-dba-approval="$OP_TOKEN"
```

**Automated Post-Build Verification Performed:**
1. Confirms `contacts_phones_number_active_unique` exists in `collection.indexes()`.
2. Validates exact key pattern: `{ 'phones.number': 1 }`.
3. Validates unique flag: `unique: true`.
4. Validates partial filter: `isDeleted: false, isMerged: false`.
5. Confirms legacy index `phones.number_1` remains present.

---

### Step 4: Emergency Rollback Procedure
If production issues arise or index requires removal, generate a rollback token and execute:

```bash
# Generate single-use rollback token
RB_TOKEN=$(node -e 'console.log(`004-contact-phone-unique-index-migration:ROLLBACK:production-atlas-7dehanz:${Date.now()}:${require("crypto").randomBytes(16).toString("hex")}`)')

NODE_ENV=production \
ALLOW_PRODUCTION_MIGRATION=true \
DBA_APPROVED_INDEX_MIGRATION=true \
node backend/migrations/004-contact-phone-unique-index-migration.js --rollback --confirm-dba-approval="$RB_TOKEN"
```

**Verification:**
- Script drops `contacts_phones_number_active_unique`.
- Script verifies `phones.number_1` is preserved.
- Output confirms `status: 'ROLLED_BACK'`.
