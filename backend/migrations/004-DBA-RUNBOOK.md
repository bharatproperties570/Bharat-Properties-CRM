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

2. **Trusted Public-Key Pinning & Close Trust Registry Injection (DEF-01 & DEF-05):**
   - **Immutable Trust Anchors in Production:** Trust anchors reside solely in `PINNED_DBA_TRUST_STORE` (compiled into the migration runner).
   - **Zero Trust-Registry Overrides in Production:** In production execution (`clusterInfo.isProductionCluster`), the runner strictly rejects caller-supplied trust registries (`opts.trustedKeyRegistry`), custom public keys (`opts.trustedPublicKeys`), bypass flags (`opts.allowUnpinnedKey`, `opts.skipFingerprintCheck`, `--allow-unpinned`, `--skip-fingerprint`), and CLI trust-store path overrides (`opts.dbaTrustStorePath`, `--dba-trust-store=`). Any attempt immediately aborts with `SECURITY FATAL`.
   - **Filesystem Permissions Do Not Grant Trust:** Filesystem permissions (`0600` or `0644`) on caller-supplied files do NOT establish production trust. Custom trust-store files are allowed ONLY in non-production environments.
   - **Isolated Test Harness Strictly Confined to Non-Production Clusters (DEF-05):** Cryptographic dependency injection for automated testing is strictly confined to `__testOnly_verifyOperatorApproval`, which is stripped by `runMigration`, permanently disabled when `process.env.NODE_ENV === 'production'`, and strictly rejects `clusterInfo.isProductionCluster === true` across all environments (`NODE_ENV=test`, `development`, `staging`, `production`) with `SECURITY FATAL`. Direct calls to `verifyOperatorApproval` with test harness options on production clusters are rejected with `SECURITY FATAL`.
   - **Key Provenance & Fail-Closed Placeholders:** Pinned trust store entries are annotated with `provenance: 'UNPROVISIONED_PLACEHOLDER'`. In production execution, placeholder keys fail closed with fatal errors until real cryptographic verification keys minted via corporate KMS/Vault authority are provisioned.
   - **Key Status & Revocation Protocol:** Every pinned record includes `status` (`ACTIVE` or `REVOKED`), `validFrom`, `validUntil`, and `keyId`. Any key marked `REVOKED` or expired immediately halts migration execution with a fatal closed abort.

3. **Asymmetric Digital Signature Verification & Architecture Separation (DEF-04):**
   - **Zero Shared Secrets:** Symmetric HMAC secrets and shared signing keys are strictly forbidden. The migration runner holds ONLY trusted public verification keys or their pinned fingerprints.
   - **Zero Signing Capability in Migration Runner:** The migration script contains no private keys, signing routines, or token minting tools. Signing capability is completely removed from production runtime modules.
   - **External Signing Authority:** The external signing authority architecture requires private signing keys to be stored in hardware security modules, AWS KMS, or HashiCorp Vault accessible only via authenticated multi-party operator workflows. The codebase verifies signatures using standard asymmetric crypto; external KMS/Vault issuance is an operational infrastructure dependency. Placeholder fingerprints fail closed in production.
   - **Zero Secret Exposure:** Passing private keys or `--dba-approval-secret` is strictly prohibited and immediately aborted by the runner. No secrets or tokens are read from `.env` or persistent shell configuration.

4. **Nine-Parameter Cryptographic Binding:**
   The asymmetric approval envelope (`<encodedPayload>.<encodedSignature>`) binds 9 mandatory parameters:
   1. `migration`: Exact identifier (`004-contact-phone-unique-index-migration`).
   2. `operation`: Exact operation (`EXECUTE` or `ROLLBACK`).
   3. `clusterId`: Exact target cluster (`production-atlas-7dehanz`).
   4. `approver`: Authenticated identity from `AUTHORIZED_DBA_APPROVERS`.
   5. `keyId`: Key identifier bound to the approver's pinned key in the trust store.
   6. `approvalId`: Cryptographically random UUID v4 / unique token nonce ($\ge 16$ chars).
   7. `issuedAt`: Issuance timestamp.
   8. `expiresAt`: Expiration timestamp ($\le 5$ minutes TTL).
   9. `purpose` & `auditRef`: Operational rationale and change-management RFC/ticket reference.

5. **Durable Anti-Replay Ledger & Lock Recovery TOCTOU Elimination (DEF-02, DEF-06, DEF-07, DEF-08, DEF-09, DEF-10):**
   - **Filesystem Assumptions & Hard-Link Support:** The durable ledger, lockfile (`.lock`), claim coordinator (`.claim`), supervisor coordinator (`.claim.recovery_supervisor`), and temporary staging files (`.recovering.*`, `.releasing.*`) strictly assume a standard POSIX filesystem (e.g. ext4, XFS, APFS) supporting atomic hard links (`link(2)`) and atomic renames (`rename(2)`). All lock, claim, supervisor, and disposal paths reside in the exact same directory on the same filesystem/mount point to prevent cross-device link errors (`EXDEV`).
   - **Atomic Lock Publication:** Exclusive locks are acquired using POSIX exclusive open (`O_CREAT | O_EXCL` via flag `wx`) with owner-only permissions (`0o600`), atomic metadata writing, recording of file inode (`ino`) and device (`dev`), and synchronous `fsyncSync()`.
   - **Unforgeable Ownership Tokens:** Every lock record contains an unforgeable UUID `ownerToken`, process PID, start time, hostname, and timestamp: `{ ownerToken, pid, processStartTime, hostname, createdAt }`.
   - **Delayed Release Protection:** `_releaseLock()` verifies both inode (`stat.ino === currentLockIno`) and owner token. It renames the lock to a private disposal path before unlinking. If an inode mismatch occurs, it restores via atomic no-clobber `linkSync` and never deletes a competitor's replacement lock.
   - **Lock Ownership Assertion:** Before reading or appending to the ledger (`isApprovalConsumed`, `recordConsumedApproval`), `_assertLockOwnership()` verifies exclusive ownership, active lock existence, matching inode, and matching owner token. If superseded or stolen, it halts with `SECURITY FATAL`.
   - **Live Process Protection:** Locks held by live processes (`process.kill(pid, 0)` succeeds and start time matches) are NEVER broken, regardless of elapsed time (>15s). Competing workers back off and wait.
   - **Claim Coordinator Ownership & Stale Claim Recovery (DEF-08):**
     - Stale lock recovery requires acquiring an exclusive claim coordinator (`${this.lockPath}.claim`) via POSIX exclusive create (`openSync(claimPath, 'wx')`), serializing concurrent recovery workers.
     - Claims are **NEVER** removed solely because their mtime exceeds `staleTimeoutMs`.
     - The coordinator validates claim owner PID, hostname, and actual process start time. If the claim owner is alive, the claim is preserved regardless of age.
     - If claim owner identity cannot be established with certainty, the system fails closed (assumes alive and yields).
     - **Atomic Claim Recovery Protocol:**
       - To prevent races where canonical claim rename leaves a temporary void allowing concurrent replacement claims, dead-claim recovery requires acquiring an exclusive claim recovery coordinator (`${this.claimPath}.recovery_lock`).
       - Normal claim acquisition and lock acquisition check `_isClaimRecoveryActive()` and `_isClaimActive()`, ensuring normal workers never enter the protected recovery interval.
       - A recovery worker retains an independently verifiable `recoveryToken` in the recovery lock throughout recovery.
       - If a replacement claim was created prior to rename, exact-instance verification detects the mismatch and restores the replacement claim via atomic no-clobber `linkSync(claimRecoveryPath, this.claimPath)`.
       - Unexpected filesystem errors strictly preserve diagnostic artifacts and fail closed.
       - Crash resilience: If a recovery worker crashes after rename, the dead recovery lock records `claimRecoveryPath`; subsequent workers inspect the in-flight claim, restore it if live, or clean it up if dead, before releasing the stale recovery lock.
     - **Claim Release Error Propagation:**
       - `_releaseClaim(claimToken)` validates exact claim token and PID. Delayed recovery workers cannot delete or supersede newer claims.
       - Expected `ENOENT` is handled safely; all unexpected stat, read, rename, link, or unlink errors throw sanitized `SECURITY FATAL` exceptions and fail closed.
       - Replacement claims are never removed, and diagnostic artifacts are strictly preserved on disk.
   - **Atomic Stale Recovery Coordinator Recovery & Zero Temporal Void (DEF-10.1):**
     - **Four-Tier Exclusive Coordinator Hierarchy:** `lockPath` -> `claimPath` -> `claimRecoveryLockPath` -> `claimRecoverySupervisorPath`.
     - **Supervisor Coordinator (`${this.claimPath}.recovery_supervisor`):** Before a recovery worker touches `claimRecoveryLockPath`, it must acquire exclusive ownership of the recovery supervisor coordinator via POSIX `openSync(..., 'wx', 0o600)`, verified byte count write, and synchronous `fsyncSync()`.
     - **Zero Temporal Void Invariant:** Closes the interval where renaming `claimRecoveryLockPath` to a staging path caused both canonical coordinator and claim files to be absent. Under DEF-10.1, `_isClaimActive()` evaluates in strict order:
       1. `_isClaimRecoverySupervisorActive()`: Held by live supervisor worker.
       2. `_isClaimRecoveryActive()`: Held by live claim recovery coordinator.
       3. `_hasActiveInFlightRecovery()`: Scans directory entries for active `.recovering.` and `.releasing.` staging artifacts.
       4. Canonical `this.claimPath` active check.
     - **In-Flight Recovery Scanning (`_hasActiveInFlightRecovery()`):** Inspects the directory for staging artifacts matching `*.recovering.*` and `*.releasing.*`. Extracts the recovering/releasing process PID from the filename (`match(/\.(?:recovering|releasing)\.(\d+)/)`) and validates whether that process is currently alive and active on the host. If active, normal acquisition and lock breaking are strictly blocked.
     - **Safe Replacement Restoration:** If a competitor publishes a replacement coordinator between inspection and rename, exact-instance inode/token verification detects the mismatch and restores the replacement coordinator using atomic no-clobber `fs.linkSync()`.
   - **Durable Recovery Metadata Persistence (DEF-10.2):**
     - **Pre-Generation of Recovery Staging Paths:** `claimRecoveryPath` is generated *prior* to opening `claimRecoveryLockPath`. The initial atomic file creation writes complete metadata including `claimRecoveryPath`, verified byte count, and synchronous `fsyncSync()`, completely eliminating intermediate unpersisted windows and swallowed write errors.
     - **Atomic Fail-Closed Assertion:** If metadata persistence fails at any point, the recovery worker throws a sanitized `SECURITY FATAL` error and aborts immediately without touching or renaming the target claim.
     - **Atomic Durable Writer (`_writeDurableMetadata`):** Employs isolated temporary files (`.tmp.<pid>.<time>.<uuid>`), mode `0600`, synchronous flush (`fsyncSync`), byte length validation, and atomic POSIX `renameSync` for all durable metadata updates.
   - **Exact-Instance Inode Inspection & Rename (DEF-06):** Prior to renaming a dead lock, the recovery worker inspects `{ ino, dev, ownerToken, pid }`. The lock is renamed to a unique recovery file (`${this.lockPath}.recovering.${process.pid}.${Date.now()}.${uuid}`).
   - **Correct No-Clobber Error Handling & Artifact Safety (DEF-07):**
     - After renaming, the worker verifies that the renamed file matches the inspected inode and ownerToken. If a replacement lock was created between inspection and rename, the worker NEVER uses `renameSync` (which would clobber active locks). Instead, it uses `fs.linkSync(recoveryPath, this.lockPath)`.
     - `EEXIST` is treated strictly and separately from every other filesystem error as a "destination already exists" condition (an active replacement lock is already published and safe at destination, so unlinking the redundant staging link is permitted).
     - On unexpected errors (`EPERM`, `EIO`, `EXDEV`, `ENOSPC`), the migration runner **NEVER unlinks the only remaining copy of the lock**. It preserves the recovery/release artifact on disk for forensic inspection, fails closed, and emits a sanitized actionable error: `[MIGRATION-004] SECURITY FATAL: Unexpected filesystem error (<CODE>) during no-clobber lock restoration. Lock artifact preserved at <PATH>. Fail closed.`
     - Failure of `fs.unlinkSync` on the staging link after a successful `fs.linkSync` leaves both hard links pointing to the identical inode, ensuring destination lock integrity is never compromised.
   - **Accurate Process Start Time & Reliable CLK_TCK (DEF-09):**
     - Linux: Reads field 22 (`starttimeTicks`) from `/proc/<pid>/stat` and system boot time `btime` from `/proc/stat`. Determines kernel clock tick rate reliably via `getconf CLK_TCK`. **Never assumes 100 Hz** if the actual rate cannot be established; returns `null` and fails closed if `CLK_TCK`, `btime`, or stat data cannot be determined reliably. Formula: `(btime * 1000) + Math.floor((starttimeTicks / clkTck) * 1000)`.
     - macOS / POSIX: Parses `ps -p <pid> -o lstart=` into epoch milliseconds. Enforces strict format validation, verifies timestamp is after year 2000 and not in the future, and fails closed on ambiguity.
     - PID Reuse Detection: Compares process start times with a 3000ms threshold to reliably distinguish dead lock owners from new processes reusing the same PID.
   - **Remote Host Ownership (DEF-06):** If a lock record originates from a different hostname (`lockData.hostname !== os.hostname()`), local processes cannot reliably evaluate process lifecycle; the lock fails closed and is never broken locally.
   - **Initialization Grace Period:** An empty or partially written lockfile within its `initGracePeriodMs` (500ms) is never disturbed by competing workers.
   - **Fail-Closed on Corruption:** Any malformed or corrupted record in the ledger file causes immediate fatal termination.

6. **Approval Token Input Protection & Zero Leakage (DEF-03):**
   - **Strict Production CLI Argument Rejection:** Raw approval tokens passed via `--confirm-dba-approval=<token>` are strictly rejected in production with `SECURITY FATAL` (to prevent exposure in `ps aux`, `/proc/<pid>/cmdline`, and shell history). In non-production, a clear security warning is emitted.
   - **Protected Input Channels:** Operators must provide approval tokens via:
     - `--confirm-dba-approval-file=<path>`: Reading from a file with strict `0600` permissions.
     - `--confirm-dba-approval-stdin`: Piping the token via standard input (`echo "$TOKEN" | node ...`).
     - `--confirm-dba-approval-fd=<fd>`: Reading from an open file descriptor.
   - **Symbolic Link Prohibition:** Symlinks to token files are strictly prohibited (`fs.lstatSync(resolvedPath).isSymbolicLink()` fails closed to prevent redirection attacks).
   - **Zero Token Leakage:** Verification errors, ledger records, and migration return objects NEVER log, print, or leak raw tokens, base64 payloads, or cryptographic signatures.

7. **Safe Handling of Non-Production Clusters with Production Database Name:**
   - When connected to a local test host (`127.0.0.1`, `localhost`, `::1`) with database name `bharatproperties1`, the migration classifies the target as `NON_PROD_CLUSTER_WITH_PROD_DB_NAME`.
   - Execution is halted unless explicitly authorized for local simulation via `ALLOW_NON_PROD_SIMULATED_PROD=true` or `--allow-non-prod-simulated-prod`.

8. **Credential Masking in Logs & Errors:**
   - All connection URIs, hosts, and error messages are sanitized with `sanitizeMongoUri()`.

9. **Zero Mutation on Preflight & Dry-Run:**
   - Preflight duplicate scans are read-only.
   - Stored contact phones are NEVER mutated, normalized, or deleted by this migration.

10. **Legacy Index Protection:**
    - The existing non-unique index `phones.number_1` is preserved during execution and rollback to ensure zero query regressions.

11. **Concurrent Collision & Controlled Abort:**
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
   # Save directly to a protected temporary file with strict 0600 permissions
   umask 077
   vault write -field=token dba/sign/migration-004 operation=EXECUTE ... > /tmp/dba_execute_token.jwt
   chmod 0600 /tmp/dba_execute_token.jwt
   ```

2. **Supply Trusted Public Verification Key (Optional if using compiled trust store):**
   If supplying an external public key file for fingerprint verification:
   Store the DBA authority public key (Ed25519 SPKI PEM) in a protected location (e.g. `/etc/ssl/dba_keys/dba_lead.pub` with mode `0644`).
   The runner will verify that the candidate key's computed SPKI SHA-256 fingerprint exactly matches the pinned fingerprint in `PINNED_DBA_TRUST_STORE`.

3. **Execute Production Migration via Protected Input Channel:**
   ```bash
   NODE_ENV=production \
   ALLOW_PRODUCTION_MIGRATION=true \
   DBA_APPROVED_INDEX_MIGRATION=true \
   node backend/migrations/004-contact-phone-unique-index-migration.js \
     --execute \
     --confirm-dba-approval-file="/tmp/dba_execute_token.jwt" \
     --dba-public-key-file="/etc/ssl/dba_keys/dba_lead.pub" \
     --approval-ledger-path="/var/log/bharat-crm/.dba_approval_ledger.jsonl"

   # Securely erase the token file immediately after execution
   rm -f /tmp/dba_execute_token.jwt
   ```

   *Alternatively, pipe the token via standard input:*
   ```bash
   cat /tmp/dba_execute_token.jwt | NODE_ENV=production \
   ALLOW_PRODUCTION_MIGRATION=true \
   DBA_APPROVED_INDEX_MIGRATION=true \
   node backend/migrations/004-contact-phone-unique-index-migration.js \
     --execute \
     --confirm-dba-approval-stdin \
     --dba-public-key-file="/etc/ssl/dba_keys/dba_lead.pub"
   ```

> [!WARNING]
> Do NOT pass approval tokens via CLI argument `--confirm-dba-approval=<token>`. Passing tokens directly in process arguments exposes them in `ps aux`, `/proc/<pid>/cmdline`, and shell history. Always use `--confirm-dba-approval-file` (mode `0600`) or `--confirm-dba-approval-stdin`.

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
umask 077
vault write -field=token dba/sign/migration-004 operation=ROLLBACK ... > /tmp/dba_rollback_token.jwt
chmod 0600 /tmp/dba_rollback_token.jwt

NODE_ENV=production \
ALLOW_PRODUCTION_MIGRATION=true \
DBA_APPROVED_INDEX_MIGRATION=true \
node backend/migrations/004-contact-phone-unique-index-migration.js \
  --rollback \
  --confirm-dba-approval-file="/tmp/dba_rollback_token.jwt" \
  --dba-public-key-file="/etc/ssl/dba_keys/chief_architect.pub" \
  --approval-ledger-path="/var/log/bharat-crm/.dba_approval_ledger.jsonl"

rm -f /tmp/dba_rollback_token.jwt
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

---

## 5. Key Rotation & Revocation Protocol (DEF-01)

### Authorized Approver Trust Store & Pinned Fingerprints
The migration runner maintains a pinned registry of SubjectPublicKeyInfo (SPKI) SHA-256 fingerprints for each authorized approver:

| Approver Email | Pinned Key ID | SPKI SHA-256 Fingerprint | Status |
| :--- | :--- | :--- | :--- |
| `dba.lead@bharatproperties.in` | `kid-dba-lead-2026-v1` | `SHA256:d8b2e1f4a9c6e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495` | `ACTIVE` |
| `chief.architect@bharatproperties.in` | `kid-chief-arch-2026-v1` | `SHA256:a4f891b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abc` | `ACTIVE` |
| `security.admin@bharatproperties.in` | `kid-sec-admin-2026-v1` | `SHA256:bc3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0123` | `ACTIVE` |

### Key Rotation Procedure
1. The DBA generates a new Ed25519 asymmetric key pair inside KMS/Vault with a new key ID (e.g. `kid-dba-lead-2027-v1`).
2. The public key is exported, and its SPKI SHA-256 fingerprint is computed:
   ```bash
   node -e '
     const crypto = require("crypto");
     const fs = require("fs");
     const key = crypto.createPublicKey(fs.readFileSync(process.argv[1], "utf8"));
     const der = key.export({ type: "spki", format: "der" });
     console.log("SHA256:" + crypto.createHash("sha256").update(der).digest("hex"));
   ' /path/to/new_public_key.pem
   ```
3. A pull request is submitted updating `PINNED_DBA_TRUST_STORE` in `backend/migrations/004-contact-phone-unique-index-migration.js` with the new key ID, fingerprint, and validity window.
4. Alternatively, operators configure an external protected trust store file (`--dba-trust-store=/etc/ssl/dba_keys/trust_store.json` with permissions `0600`/`0644`).

### Emergency Key Revocation Procedure
1. In the event of suspected signing credential compromise, the security admin marks the compromised key's status as `REVOKED` in the trust store:
   ```json
   {
     "dba.lead@bharatproperties.in": {
       "keyId": "kid-dba-lead-2026-v1",
       "approver": "dba.lead@bharatproperties.in",
       "fingerprint": "SHA256:d8b2e1f4a9c6e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495",
       "status": "REVOKED",
       "revocationReason": "Incident INC-2026-KEY-COMPROMISE",
       "revokedAt": 1735689600000
     }
   }
   ```
2. When `status === 'REVOKED'`, the migration runner immediately aborts with:
   `[MIGRATION-004] FATAL: Pinned signing key for approver "..." has been REVOKED. Revocation reason: ... Fail closed.`
3. Any approval token signed by the revoked key is permanently rejected.

---

## 6. Durable Coordination, Concurrency & Crash Consistency (DEF-06 – DEF-11)

### Four-Tier Coordinator Hierarchy
To guarantee mutual exclusion, zero-void recovery, and crash consistency across concurrent migration processes without relying on external locking servers, Migration 004 implements a four-tier filesystem coordinator hierarchy:

```
Tier 1: Canonical Lockfile (004-contact-phone-unique-index-migration.ledger.lock)
   ▲ Holds exclusive execution right for active migration worker.
   │
Tier 2: Dead-Lock Recovery Claim (.lock.claim)
   ▲ Serializes workers attempting to recover an abandoned Tier 1 lock.
   │
Tier 3: Claim-Recovery Coordinator Lock (.lock.claim.recovery)
   ▲ Serializes recovery workers attempting to recover an abandoned Tier 2 claim.
   │
Tier 4: Claim-Recovery Supervisor Coordinator (.lock.claim.recovery.supervisor)
   ▲ Serializes workers attempting to recover an abandoned Tier 3 coordinator.
```

### Zero-Void Invariant
At no point during normal acquisition, dead-lock recovery, or stale coordinator recovery does a void exist where a dead coordinator can disappear without an active higher-tier coordinator or in-flight staging marker being visible to concurrent workers:
1. Before recovering any coordinator at Tier $N$, the recovering worker must acquire exclusive ownership of Tier $N+1$.
2. In-flight recovery moves the target file to a private `.recovering.<pid>.<timestamp>.<uuid>` staging path.
3. Concurrent workers scan for active in-flight staging markers (`_hasActiveInFlightRecovery()`) and fail closed (block/wait) if a live worker is actively recovering or releasing artifacts.

### DEF-11.1: Durable Directory-Entry Persistence (`_fsyncDirectory`)
On POSIX filesystems (ext4, XFS, APFS), writing data and calling `fsync()` on a file descriptor ensures that file data and metadata blocks are flushed to physical media. However, directory entries (directory blocks pointing inode numbers to filenames created by `linkSync`, `openSync(O_CREAT)`, or `renameSync`) reside in the parent directory's block.
- **Directory Fsync:** After creating or renaming coordinators, `_fsyncDirectory(dirPath)` opens the parent directory with `O_RDONLY` and issues `fsync()` on the directory descriptor.
- **Platform Compatibility Guarantees:**
  - **POSIX:** Directory `fsync()` flushes directory entry allocations to disk. If a filesystem or sandbox returns `EISDIR`, `ENOTSUP`, `EINVAL`, `EBADF`, or `EPERM` on directory descriptors, `_fsyncDirectory` handles the code explicitly without crashing.
  - **Windows (NTFS):** Opening directories as POSIX descriptors is unsupported (`EISDIR`/`EINVAL`). `_fsyncDirectory` detects `process.platform === 'win32'` and safely bypasses directory `fsync`, as NTFS transactions journal directory metadata automatically.
  - **Diagnostic Temp File Preservation:** On write or fsync failure during `_writeDurableMetadata()`, the diagnostic temporary file is preserved on disk for forensic inspection, and an actionable `[MIGRATION-004] SECURITY FATAL` error is thrown.

### DEF-11.2: No-Clobber Metadata Replacement Protocol
To prevent a delayed or desynchronized worker from overwriting a newly acquired coordinator created by a competing worker:
- **Create Mode (`options.mode === 'create'` / `options.noClobber: true`):** Employs atomic hard linking (`fs.linkSync(tempPath, destPath)`). If the destination file already exists, the kernel atomically rejects the link with `EEXIST`. The temporary file is cleaned up, and the operation fails closed without clobbering the destination.
- **Exact-Owner Update Mode (`options.mode === 'update'`):** Validates that the destination file matches the caller's expected ownership token, inode number (`ino`), device ID (`dev`), and process PID. If another worker has acquired or superseded the coordinator in the interim, the update is rejected, the temporary staging file is cleaned up, and the active replacement is preserved.

### DEF-11.3: Safe Unlink Semantics (`_safeUnlink`)
Previous implementations caught and silently swallowed unlink errors with `try { fs.unlinkSync(...); } catch (_) {}`.
- **Fail Closed on Unexpected Errors:** `_safeUnlink(filePath, contextDesc)` treats `ENOENT` as the only idempotent success case (file already removed).
- Any unexpected filesystem error (`EPERM`, `EIO`, `ENOSPC`, `EROFS`) halts execution immediately with `[MIGRATION-004] SECURITY FATAL`, preserves the artifact on disk, and fails closed.
- Before unlinking any recovery or release staging artifact, exact device, inode, and token matches are confirmed.

