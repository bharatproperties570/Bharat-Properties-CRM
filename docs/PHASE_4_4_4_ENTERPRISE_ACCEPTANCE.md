# Phase 4.4.4 — Enterprise Authority Portal Ingestion Acceptance & Verification Matrix

## Overview & Executive Summary

Phase 4.4.4 establishes the production-grade boundary for live government portal adapters (HSVP, GMADA, Estate Office Chandigarh) within the Bharat Properties CRM Authority Verification Engine.

This document formally reconciles the codebase implementation, container verification evidence, fixture vs. live boundaries, authenticated privileged administrative routes, and unperformed cloud runtime deployment.

---

## Reconciliation Matrix: Codebase, Containers, and Deployment

| Capability / Requirement | Implementation Status | Evidence / Verification Level | Production Operational State |
| :--- | :--- | :--- | :--- |
| **Portal Adapters (HSVP, GMADA, CHD)** | **Fully Implemented** (`backend/services/authority/portal/adapters/`) | Golden fixture suites, form contract validators, anti-forgery token extraction (`authority_portal_golden_parsers.test.js`) | Offline / In-Memory & Container tested; zero real portal traffic |
| **Configured Runtime Factory** | **Fully Implemented** (`portalRuntimeFactory.js`, `authorityPortalRuntime.js`) | Wiring tests (`authority_portal_runtime.test.js`), full processor integration | Factory wires Redis lock, Redis quota, durable breaker, audit sink, and parser registry |
| **Authority-Global Canonical Rate Policy** | **Fully Implemented** (`AuthorityCanonicalPolicy.js`, `canonicalPolicyService.js`) | Unit & integration tests (`authority_portal_residual_blockers_pr42.test.js`, `authority_portal_redis_integration.test.js`) | Keyed strictly on `authorityCode` (no tenantId); independent maker-checker (`reviewedBy !== approvedBy`); atomic CAS version rotation; client elevation defense |
| **Distributed Lock & Monotonic Fencing** | **Fully Implemented** (`RedisPortalDistributedLock.js`) | Real Redis container integration tests (`authority_portal_redis_integration.test.js`, Tests 14 & 15) | Atomic `SET NX PX`, Lua-based heartbeat lease renewal, atomic monotonic sequence generation |
| **Multi-Window Quota Provider** | **Fully Implemented** (`RedisPortalQuotaProvider.js`) | Real Redis multi-window tests (minInterval, minute, hour, day, Asia/Kolkata day boundary) | Atomic multi-window Lua script; shared authority-wide quota bucket; trust anchor in Redis without TTL |
| **Durable Circuit Breaker & Kill Switch** | **Fully Implemented** (`DurablePortalCircuitBreaker.js`, `AuthorityGlobalKillSwitch.js`) | Trip tests on 403, 429, CAPTCHA, login wall, unexpected foreign host redirect | Tenant-scoped breaker + cross-tenant authority-wide kill switch |
| **Persistence Boundary Lease Protection** | **Fully Implemented** (`AuthorityBulkProcessor.js`) | Callback `executeWithinLease` wrapped around candidate generation, watermark update, and snapshot persistence | Lock loss or stale lease immediately aborts persistence fail-closed (`PORTAL_LOCK_OWNERSHIP_LOST`); transactional rollback or standalone orphan purge |
| **Authority-Global Monotonic Watermark & Issued Window Guard** | **Fully Implemented** (`AuthorityGlobalFenceWatermark.js`) | Cross-tenant race tests (Tests 30, 31, 35 in residual blockers, Test 12 in Redis integration) | Keyed strictly on `authorityCode`; tracking `highestIssuedFenceToken` and `lastCommittedFenceToken`; fail-closed on issued token persistence failure (zero transport egress); supersedes stale worker in issued-but-uncommitted window |
| **Redis Monotonic Policy CAS** | **Fully Implemented** (`redisPortalQuotaProvider.js`) | Real Redis Lua compare-and-set and in-memory unit tests (Test 34 in blockers, Test 13 in Redis integration) | Rejects stale versions (`STALE_POLICY_VERSION`), rejects hash tampering (`POLICY_HASH_MISMATCH`), permits idempotent re-assertion, maintains key without TTL |
| **Privileged Canonical Policy Routes & Audit** | **Fully Implemented** (`authorityVerification.routes.js`, `authorityVerification.controller.js`) | Controller & route tests (Test 32 in residual blockers) | Privileged admin endpoints (`GET/POST /canonical-policy/:authorityCode/*`); verified active User check; reviewer authorization validation via User/Role `approveAuthorityChanges` right; immediate cache invalidation; strict maker-checker (`approverId !== reviewerId`); mandatory `canonical_policy_rotated` and `canonical_policy_synced` AuditLog; fail-closed HTTP 500 `AUDIT_PERSISTENCE_FAILED` on audit write failure |
| **Policy Validity Window & Version Boundaries** | **Fully Implemented** (`AuthorityCanonicalPolicy.js`, `canonicalPolicyService.js`) | Domain boundary tests (Test 33 in residual blockers) | Enforces `effectiveFrom <= now < expiresAt`; requires initial version to be a positive integer `>= 1` |
| **Offline E2E Configured Runtime Verification & Real Redis Renewal** | **Fully Implemented** (`authority_portal_redis_integration.test.js`) | Tests 14 & 15 in Redis integration test suite | Exercises `createConfiguredPortalRuntime().search()`, real Redis lock renewal, fake offline transport, delayed persistence across renewal interval, competing lease preemption fail-closed abort (Test 14), and legitimate heartbeat keeping lock alive across intervals blocking competing workers (Test 15) |
| **Zero PII & Data Privacy Boundary** | **Fully Implemented** (`portalResultSanitizer.js`, `portalAuditSink.js`) | Regex denial + deep recursive sanitization tests | Absolute redaction of owner/allottee PII, session cookies, tokens, viewstates |
| **Human Review / Maker-Checker** | **Fully Implemented** (`authorityVerification.controller.js`) | Controller lifecycle tests | Zero automated CRM Inventory/Contact mutation; `requiresHumanReview: true`, `isApplied: false` |
| **Live Portal Permissions** | **Default-Off / Unperformed** | Gate tests (`authority_portal_approval_gate.test.js`) | All permissions remain `NOT_OBTAINED` / disabled pending written authority authorization |
| **Live Portal Network Egress** | **Strictly Inactive** | Egress trap tests (`authority_portal_egress_trap.test.js`) | 0 outbound HTTP calls to live portals; fixtures & mock transports only |
| **AWS Cloud Runtime Deployment** | **NOT PERFORMED** | Repository & CI boundary only | PR #42 is unmerged; no deployment to AWS ECS/Lambda/Vercel production |

---

## Detailed Implementation Breakdown

### 1. Configured Runtime & Canonical Quota Wiring
- Ordinary item processing cannot synthesize rate policies or elevate tenant limits above authority-wide ceilings.
- `AuthorityCanonicalPolicy` acts as the single authoritative quota trust anchor keyed strictly by `authorityCode`.
- Privileged registration/rotation via `registerOrRotateCanonicalPolicy()` enforces independent maker-checker separation (`reviewedBy !== approvedBy`), validity windows (`effectiveFrom <= now < expiresAt`), atomic CAS version sequencing (`version >= 1`), and synchronizes to Redis hash `quota:canonical:<AUTHORITY>`.
- `createConfiguredPortalRuntime()` exposes the configured quota provider and synchronizes canonical policies prior to search execution.

### 2. Distributed Lock Lease Life & Persistence Boundary
- Distributed source lock acquisition occurs under Option A serial execution (`maxConcurrent: 1`).
- The processor invokes `portalRuntime.search` with an `executeWithinLease` callback.
- Lease renewal continues through HTML parsing, candidate matching, global watermark validation, snapshot creation, and terminal item finalization.
- Re-verification of portal lease validity and fence token occurs immediately prior to database transaction commit. If the lease is lost or superseded during persistence:
  - If replica set transactions are active: the transaction is aborted fail-closed, leaving Inventory unmutated and recording `PORTAL_LOCK_OWNERSHIP_LOST`.
  - If standalone mode: newly inserted snapshots are immediately purged via `purgeOrphanedSnapshot`, leaving zero orphaned snapshots in MongoDB.

### 3. Authority-Global Monotonic Fence Watermark & Issued Window Protection
- Watermark tracking is decoupled from tenant-specific settings and consolidated into `AuthorityGlobalFenceWatermark`, uniquely indexed on `authorityCode`.
- The watermark tracks both `highestIssuedFenceToken` (acquired at lock creation) and `lastCommittedFenceToken` (finalized at persistence commit).
- A worker holding an earlier fence token that attempts to persist while another worker has been issued a newer fence token is detected via `isFenceTokenSuperseded()` and rejected fail-closed before transaction commit.

### 4. Authenticated Privileged Routes & Mandatory Audit Logging
- Privileged administrative routes registered under `authorityVerification.routes.js`:
  - `GET /canonical-policy/:authorityCode`: Retrieves current canonical policy and sync status.
  - `POST /canonical-policy/:authorityCode/rotate`: Rotates policy with reviewer and approver attribution.
  - `POST /canonical-policy/:authorityCode/sync`: Forces synchronization of canonical policy to Redis.
- Authenticated approver context is required (`req.user`).
- Reviewer is verified against active `User` records.
- Independent maker-checker separation is enforced (`approverId !== reviewerId`).
- Mandatory audit event `canonical_policy_rotated` is logged via `logMandatoryAuditEvent`.
- **Audit-Gated Policy Visibility (Finding P1-A):** Policies are created with `isAudited: false`, `auditStatus: 'PENDING'`, `isActive: false`. `getCanonicalPolicy` returns `null` until the audit record is durably committed in MongoDB.
- **Reviewer Role Revocation (Finding P1-B):** Reviewer authorization is evaluated with `skipCache: true` on fresh User/Role state, ensuring immediate revocation without cache races. In `role.controller.js`, permission cache invalidation is executed after `session.commitTransaction()`.
- **Decoupled Redis Publication (Finding P2-C):** `registerOrRotateCanonicalPolicy` is fully decoupled from Redis mutation. `publishCanonicalPolicyToRedis` executes only after MongoDB transaction/audit commit. If audit persistence fails, MongoDB and Redis remain strictly at V1.
- **Manual Sync Audit Ordering (Finding P2-D):** `syncCanonicalPolicy` writes a durable audit intent record before attempting Redis synchronization. If post-sync DB status update fails, the document is marked `redisSyncStatus: 'PENDING_RECONCILIATION'` and returns HTTP 500.

### 5. Redis Atomic Lua CAS Monotonicity
- Redis canonical policy key `quota:canonical:<AUTHORITY>` is maintained persistently without TTL (`ttl === -1`).
- Atomic Lua script compare-and-set enforces:
  - Rejection with `STALE_POLICY_VERSION` when incoming version is less than current Redis version.
  - Rejection with `POLICY_HASH_MISMATCH` when version matches but content hash differs.
  - Idempotent re-assertion when version and hash match.
  - Clean update when incoming version is greater than current version.
- In-memory mock quota provider implements identical monotonic CAS logic.
- **Natural Expiration & Renewal Tracking (Finding P2-E):** `RedisPortalDistributedLock` tracks `renewalTicks`. Test 14 verifies natural expiration by sleeping past TTL without manual deletion (`del`). Test 15 exercises genuine configured runtime heartbeat renewals across 2 TTL windows, keeping the lock active and verifying competing worker exclusion with `renewalTicks >= 2`.

### 6. Container & Verification Evidence
- All unit, gate, and acceptance suites execute locally and in CI:
  - `npm run test:authority-portal`: **184 PASS, 0 FAIL, 0 SKIPPED** (100% green, including Test 35 covering fail-closed watermark and pre-commit invariants).
  - `npm run test:authority-portal-acceptance`: **107 PASS, 0 FAIL, 0 SKIPPED** (100% green).
  - `npm run test:authority`: **387 PASS, 0 FAIL, 0 SKIPPED** (100% green).
  - `npm run test:phase4-authority`: **178 PASS, 0 FAIL, 0 SKIPPED** (including 5,000 item load test, saga crash recovery, replica set transactions; 100% green).
  - `npm run test:frontend`: **310 PASS, 0 FAIL, 0 SKIPPED** (100% green).
  - `npm run build`: Production bundle built cleanly with Vite.
  - `npm run test:authority-portal-redis`: **15 integration tests** (100% green, verifying real Redis 7 lock acquisition, lease renewal, multi-window Lua quota enforcement, cross-tenant quota contention, canonical elevation rejection, `AuthorityGlobalFenceWatermark` race safety, Lua CAS monotonicity, Test 14 offline E2E delayed persistence competing lease preemption, and Test 15 legitimate heartbeat renewal keeping lock alive across intervals and blocking competing workers in CI service container).

### 7. Explicit Constraints & Unperformed Deployments
1. **Zero Live Portal Network Egress:** No HTTP requests are sent to `hsvphry.org.in`, `gmada.gov.in`, or `chandigarh.gov.in`. All adapter tests run against deterministic, sanitized golden fixtures.
2. **Permissions Remain Default-Off:** All authority sources default to `permissionStatus: 'NOT_OBTAINED'`, `isEnabled: false`, `schedulingEnabled: false`. Formal written authorization and authority-defined quotas are required before activation.
3. **No Automated CRM Mutations:** Verified candidates require human maker-checker approval. No direct writes occur to `Inventory` or `Contact`.
4. **No Cloud Deployment:** No deployment to AWS ECS, Lambda, API Gateway, or Vercel production has occurred. PR #42 remains unmerged on branch `enterprise/phase-4.4.4-live-portal-adapters`.
