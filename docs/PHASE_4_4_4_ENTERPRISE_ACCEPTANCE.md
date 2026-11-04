# Phase 4.4.4 — Enterprise Authority Portal Ingestion Acceptance & Verification Matrix

## Overview & Executive Summary

Phase 4.4.4 establishes the production-grade boundary for live government portal adapters (HSVP, GMADA, Estate Office Chandigarh) within the Bharat Properties CRM Authority Verification Engine.

This document formally reconciles the codebase implementation, container verification evidence, fixture vs. live boundaries, and unperformed cloud runtime deployment.

---

## Reconciliation Matrix: Codebase, Containers, and Deployment

| Capability / Requirement | Implementation Status | Evidence / Verification Level | Production Operational State |
| :--- | :--- | :--- | :--- |
| **Portal Adapters (HSVP, GMADA, CHD)** | **Fully Implemented** (`backend/services/authority/portal/adapters/`) | Golden fixture suites, form contract validators, anti-forgery token extraction (`authority_portal_golden_parsers.test.js`) | Offline / In-Memory & Container tested; zero real portal traffic |
| **Configured Runtime Factory** | **Fully Implemented** (`portalRuntimeFactory.js`, `authorityPortalRuntime.js`) | Wiring tests (`authority_portal_runtime.test.js`), full processor integration | Factory wires Redis lock, Redis quota, durable breaker, audit sink, and parser registry |
| **Authority-Global Canonical Rate Policy** | **Fully Implemented** (`AuthorityCanonicalPolicy.js`, `canonicalPolicyService.js`) | Unit & integration tests (`authority_portal_residual_blockers_pr42.test.js`, `authority_portal_redis_integration.test.js`) | Keyed strictly on `authorityCode` (no tenantId); independent maker-checker (`reviewedBy !== approvedBy`); atomic CAS version rotation; client elevation defense |
| **Distributed Lock & Monotonic Fencing** | **Fully Implemented** (`RedisPortalDistributedLock.js`) | Real Redis container integration tests (`authority_portal_redis_integration.test.js`) | Atomic `SET NX PX`, Lua-based heartbeat lease renewal, atomic monotonic sequence generation |
| **Multi-Window Quota Provider** | **Fully Implemented** (`RedisPortalQuotaProvider.js`) | Real Redis multi-window tests (minInterval, minute, hour, day, Asia/Kolkata day boundary) | Atomic multi-window Lua script; shared authority-wide quota bucket; trust anchor in Redis without TTL |
| **Durable Circuit Breaker & Kill Switch** | **Fully Implemented** (`DurablePortalCircuitBreaker.js`, `AuthorityGlobalKillSwitch.js`) | Trip tests on 403, 429, CAPTCHA, login wall, unexpected foreign host redirect | Tenant-scoped breaker + cross-tenant authority-wide kill switch |
| **Persistence Boundary Lease Protection** | **Fully Implemented** (`AuthorityBulkProcessor.js`) | Callback `executeWithinLease` wrapped around candidate generation, watermark update, and snapshot persistence | Lock loss or stale lease immediately aborts persistence fail-closed (`PORTAL_LOCK_OWNERSHIP_LOST`) |
| **Authority-Global Monotonic Watermark** | **Fully Implemented** (`AuthorityGlobalFenceWatermark.js`) | Cross-tenant race tests (Test 30 in residual blockers, Test 12 in Redis integration) | Keyed strictly on `authorityCode`; atomic Mongo `$max` / conditional update; blocks out-of-order stale persistence |
| **Zero PII & Data Privacy Boundary** | **Fully Implemented** (`portalResultSanitizer.js`, `portalAuditSink.js`) | Regex denial + deep recursive sanitization tests | Absolute redaction of owner/allottee PII, session cookies, tokens, viewstates |
| **Human Review / Maker-Checker** | **Fully Implemented** (`authorityVerification.controller.js`) | Controller lifecycle tests | Zero automated CRM Inventory/Contact mutation; `requiresHumanReview: true`, `isApplied: false` |
| **Live Portal Permissions** | **Default-Off / Unperformed** | Gate tests (`authority_portal_approval_gate.test.js`) | All permissions remain `NOT_OBTAINED` / disabled pending written authority authorization |
| **Live Portal Network Egress** | **Strictly Inactive** | Egress trap tests (`authority_portal_egress_trap.test.js`) | 0 outbound HTTP calls to live portals; fixtures & mock transports only |
| **AWS Cloud Runtime Deployment** | **NOT PERFORMED** | Repository & CI boundary only | PR #42 is unmerged; no deployment to AWS ECS/Lambda/Vercel production |

---

## Detailed Implementation Breakdown

### 1. Configured Runtime & Canonical Quota Wiring (Finding A & B)
- Ordinary item processing cannot synthesize rate policies or elevate tenant limits above authority-wide ceilings.
- `AuthorityCanonicalPolicy` acts as the single authoritative quota trust anchor keyed strictly by `authorityCode`.
- Privileged registration/rotation via `registerOrRotateCanonicalPolicy()` enforces independent maker-checker separation (`reviewedBy !== approvedBy`), validity windows, atomic CAS version sequencing, and synchronizes to Redis hash `quota:canonical:<AUTHORITY>`.
- `createConfiguredPortalRuntime()` exposes the configured quota provider and synchronizes canonical policies prior to search execution.

### 2. Distributed Lock Lease Life & Persistence Boundary (Finding C)
- Distributed source lock acquisition occurs under Option A serial execution (`maxConcurrent: 1`).
- The processor invokes `portalRuntime.search` with an `executeWithinLease` callback.
- Lease renewal continues through HTML parsing, candidate matching, global watermark validation, snapshot creation, and terminal item finalization.
- If the lease is lost or expires during processing, snapshot persistence is aborted fail-closed, leaving Inventory unmutated and recording `PORTAL_LOCK_OWNERSHIP_LOST`.

### 3. Authority-Global Monotonic Fence Watermark (Finding D)
- Watermark tracking is decoupled from tenant-specific settings and consolidated into `AuthorityGlobalFenceWatermark`, uniquely indexed on `authorityCode`.
- Across all tenants and concurrent worker processes, fence tokens must be strictly monotonic (`fenceToken > lastCommittedFenceToken`).
- Any attempt by a stale worker (even across different tenants) to commit an older fence token is rejected fail-closed.

### 4. Container & Verification Evidence (Finding E)
- All unit, gate, and acceptance suites execute locally and in CI:
  - `npm run test:authority-portal`: **179 PASS, 0 FAIL, 0 SKIPPED** (100% green).
  - `npm run test:authority-portal-acceptance`: **102 PASS, 0 FAIL, 0 SKIPPED** (100% green).
  - `npm run test:authority`: **387 PASS, 0 FAIL, 0 SKIPPED** (100% green).
  - `npm run test:phase4-authority`: **178 PASS, 0 FAIL, 0 SKIPPED** (including 5,000 item load test, saga crash recovery, replica set transactions; 100% green).
  - `npm run test:frontend`: **310 PASS, 0 FAIL, 0 SKIPPED** (100% green).
  - `npm run build`: Production bundle built cleanly with Vite.
  - `npm run test:authority-portal-redis`: 12 integration tests verifying real Redis 7 lock acquisition, lease renewal, multi-window Lua quota enforcement, cross-tenant quota contention, canonical elevation rejection, and `AuthorityGlobalFenceWatermark` race safety in CI service container.

### 5. Explicit Constraints & Unperformed Deployments (Finding F)
1. **Zero Live Portal Network Egress:** No HTTP requests are sent to `hsvp.org.in`, `gmada.gov.in`, or `chandigarh.gov.in`. All adapter tests run against deterministic, sanitized golden fixtures.
2. **Permissions Remain Default-Off:** All authority sources default to `permissionStatus: 'NOT_OBTAINED'`, `isEnabled: false`, `schedulingEnabled: false`. Formal written authorization and authority-defined quotas are required before activation.
3. **No Automated CRM Mutations:** Verified candidates require human maker-checker approval. No direct writes occur to `Inventory` or `Contact`.
4. **No Cloud Deployment:** No deployment to AWS ECS, Lambda, API Gateway, or Vercel production has occurred. PR #42 remains unmerged on branch `enterprise/phase-4.4.4-live-portal-adapters`.
