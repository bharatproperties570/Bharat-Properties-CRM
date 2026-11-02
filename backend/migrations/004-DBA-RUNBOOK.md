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
   - The migration validates physical MongoDB topology and replica set host fingerprints.
   - **Database name alone is NOT sufficient:** A connection to the production Atlas cluster under an alternate database name (e.g. `dev`, `staging`) cannot bypass production protection.
   - Any connection matching the Atlas production fingerprint (`*.mongodb.net`, `7dehanz`, `atlas-145yac-shard-0`) is permanently classified as a **PRODUCTION CLUSTER**.

2. **Asymmetric Digital Signature Verification (Separation of Issuance & Verification):**
   - **Zero Shared Secrets:** Symmetric HMAC secrets and shared signing keys are strictly forbidden. The migration runner holds ONLY trusted public verification keys (Ed25519 SPKI PEM).
   - **Zero Signing Capability in Migration Runner:** The migration script contains no signing routines or token minting tools (`signDbaApprovalToken` removed from migration runner).
   - **External Signing Authority:** Private signing keys reside strictly inside protected hardware/KMS/HashiCorp Vault security boundaries accessible only to authorized DBAs.
   - **Zero Secret Exposure:** Passing private keys or `--dba-approval-secret` is strictly prohibited and immediately aborted by the runner. No secrets or tokens are read from `.env` or persistent shell configuration.

3. **Nine-Parameter Cryptographic Binding:**
   The asymmetric approval envelope (`<encodedPayload>.<encodedSignature>`) binds 9 mandatory parameters:
   1. `migration`: Exact identifier (`004-contact-phone-unique-index-migration`).
   2. `operation`: Exact operation (`EXECUTE` or `ROLLBACK`).
   3. `clusterId`: Exact target cluster (`production-atlas-7dehanz`).
   4. `approver`: Authenticated identity from `AUTHORIZED_DBA_APPROVERS` (`dba.lead@bharatproperties.in`, `chief.architect@bharatproperties.in`, `security.admin@bharatproperties.in`).
   5. `approvalId`: Cryptographically random UUID v4 / unique token nonce ($\ge 16$ chars).
   6. `issuedAt`: Issuance timestamp.
   7. `expiresAt`: Expiration timestamp ($\le 5$ minutes TTL).
   8. `purpose`: Operational rationale (e.g. `PRODUCTION_UNIQUE_PHONE_INDEX_CREATION`).
   9. `auditRef`: Change-management RFC/ticket reference (e.g. `RFC-2026-004-EXECUTE`).

4. **Durable Anti-Replay Ledger with Cross-Process Concurrency Protection:**
   - **Atomic POSIX Exclusive Locking:** Single-use consumption is enforced across concurrent worker processes using POSIX exclusive lockfiles (`O_CREAT | O_EXCL` via `wx` flag).
   - **Atomic Check-and-Consume:** Replay checks and persistent write operations execute within a single atomic critical section, eliminating race conditions.
   - **Strict Permission Masking:** Ledger and lock files enforce owner-only read/write (`0o600`), failing closed if group/other permissions (`0o077`) are detected.
   - **Durable Disk Flush:** Every consumed approval record is committed to disk using synchronous `fs.fsyncSync(fd)`.
   - **Crash Recovery & Stale Lock Breaking:** Lockfiles record process PID and creation timestamp; locks older than 15s or owned by deceased PIDs (`process.kill(pid, 0)` throwing `ESRCH`) are safely pruned.
   - **Fail-Closed on Corruption:** Any malformed or corrupted record in the ledger file causes immediate fatal termination to prevent replay bypass.

5. **Safe Handling of Non-Production Clusters with Production Database Name:**
   - When connected to a local test host (`127.0.0.1`, `localhost`, `::1`) with database name `bharatproperties1`, the migration classifies the target as `NON_PROD_CLUSTER_WITH_PROD_DB_NAME`.
   - Execution is halted unless explicitly authorized for local simulation via `ALLOW_NON_PROD_SIMULATED_PROD=true` or `--allow-non-prod-simulated-prod`.

6. **Credential Masking in Logs & Errors:**
   - All connection URIs, hosts, and error messages are sanitized with `sanitizeMongoUri()`.
   - Credentials and tokens are NEVER printed in logs.

7. **Zero Mutation on Preflight & Dry-Run:**
   - Preflight duplicate scans are read-only.
   - Stored contact phones are NEVER mutated, normalized, or deleted by this migration.

8. **Legacy Index Protection:**
   - The existing non-unique index `phones.number_1` is preserved during execution and rollback to ensure zero query regressions.

9. **Concurrent Collision & Controlled Abort:**
   - If a concurrent insert creates a duplicate during `collection.createIndex()`, MongoDB returns `E11000`. The migration catches this cleanly and logs a controlled abort (`E11000_CONCURRENT_INSERT`), leaving database state uncorrupted.

---

## 2. Technical Distinctions: Exact String vs. Business Duplicates

MongoDB unique indexes enforce **byte-for-byte exact string equality**.

### Exact-String Duplicates (E11000 Blocker)
- Examples: `"9811122233"` vs `"9811122233"` across distinct active contacts (`isDeleted: false, isMerged: false`).
- Impact: MongoDB **will reject index creation** with `E11000 duplicate key error collection`.
- Resolution: **Must be merged** via the Contact Merge API (`/api/contacts/merge`) before running `--execute`.

### Intra-Contact Duplicates (Permitted by MongoDB)
- Example: Single contact document has `phones: [{ number: "9811122233" }, { number: "9811122233" }]`.
- Impact: MongoDB multikey unique indexes allow a document to refer to itself multiple times with the same value without violating uniqueness.

### Normalized Business Duplicates (Non-Blocking)
- Examples:
  - Whitespace: `" 9811122233 "` vs `"9811122233"`
  - Country code prefix: `"+919811122233"` vs `"9811122233"`
  - Trunk zero prefix: `"09811122233"` vs `"9811122233"`
- Impact: MongoDB exact-string unique index does **NOT** block these. They coexist in the database.
- Reporting: Reported in preflight scans for separate Contact Merge review. The script NEVER modifies data.

### Missing or Null Lifecycle Flags
- Partial filter `{ isDeleted: false, isMerged: false }` requires fields to explicitly match boolean `false`.
- Documents missing these flags are reported under `totalLifecycleFlagGaps` and excluded from the index.

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
- Review `normalizedVariantsAcrossContacts` and `totalLifecycleFlagGaps`.

---

## Step 2: Remediating Conflicts Prior to Index Build
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

## Step 3: Production Index Build Execution
Once preflight is clean, an authorized DBA requests a signed approval token from the external signing authority (KMS/Vault) using their personal credentials:

1. **Obtain Signed Approval Token from External Authority:**
   ```bash
   # External KMS/Vault CLI produces the asymmetric Ed25519 envelope:
   # <base64url(payload)>.<base64url(signature)>
   OP_TOKEN="<SIGNED_ENVELOPE_FROM_KMS>"
   ```

2. **Supply Trusted Public Verification Key:**
   Store the DBA authority public key (Ed25519 SPKI PEM) in a protected location (e.g. `/etc/ssl/dba_keys/dba_lead.pub` with mode `0644`).

3. **Execute Production Migration:**
   ```bash
   NODE_ENV=production \
   ALLOW_PRODUCTION_MIGRATION=true \
   DBA_APPROVED_INDEX_MIGRATION=true \
   node backend/migrations/004-contact-phone-unique-index-migration.js \
     --execute \
     --confirm-dba-approval="$OP_TOKEN" \
     --dba-public-key-file="/etc/ssl/dba_keys/dba_lead.pub" \
     --approval-ledger-path="/var/log/bharat-crm/.dba_approval_ledger.jsonl"
   ```

**Automated Post-Build Verification Performed:**
1. Confirms `contacts_phones_number_active_unique` exists in `collection.indexes()`.
2. Validates exact key pattern: `{ 'phones.number': 1 }`.
3. Validates unique flag: `unique: true`.
4. Validates partial filter: `isDeleted: false, isMerged: false`.
5. Confirms legacy index `phones.number_1` remains present.

---

## Step 4: Emergency Rollback Procedure
If production issues arise or index requires removal, request a cryptographically signed rollback token from the external authority and execute:

```bash
NODE_ENV=production \
ALLOW_PRODUCTION_MIGRATION=true \
DBA_APPROVED_INDEX_MIGRATION=true \
node backend/migrations/004-contact-phone-unique-index-migration.js \
  --rollback \
  --confirm-dba-approval="$RB_TOKEN" \
  --dba-public-key-file="/etc/ssl/dba_keys/chief_architect.pub" \
  --approval-ledger-path="/var/log/bharat-crm/.dba_approval_ledger.jsonl"
```

**Verification:**
- Script drops `contacts_phones_number_active_unique`.
- Script verifies `phones.number_1` is preserved.
- Durable anti-replay ledger records the rollback approval ID as consumed.
- Output confirms `status: 'ROLLED_BACK'`.

---

## 4. Replay Ledger Retention & Backup Architecture
- **Location:** Dedicated persistent volume `/var/log/bharat-crm/.dba_approval_ledger.jsonl`.
- **Permissions:** Strictly `0o600` (owned by service runtime user).
- **Retention:** Permanent append-only audit trail. Records are immutable and never deleted.
- **Backup:** Backed up alongside application audit logs during standard backup intervals.
- **Disaster Recovery:** In event of host migration, the ledger file must be synced to the standby host before migration execution to prevent token replay across host failovers.
