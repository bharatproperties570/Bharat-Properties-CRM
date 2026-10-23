# Bharat Properties CRM — Enterprise Site Visit Lifecycle Gap Closure & Verification Report (Pass 2)

**Date:** 2026-10-23<br/>
**Repository:** `bharatproperties570/Bharat-Properties-CRM`<br/>
**Dedicated Worktree:** `/Users/bharatproperties/.gemini/antigravity/scratch/bharat-crm-sitevisit-marketing`<br/>
**Dedicated Branch:** `enterprise/sitevisit-marketing-os`<br/>
**Baseline Commit (Pass 1 Reviewed):** `a9ad5e9d4e8ce15255c8f81f0c6303064b813937`<br/>
**Status:** REMEDIATION IMPLEMENTED & VERIFIED IN MOCK/UNIT TEST ENVIRONMENT (Real DB Integration & Real Carrier Receipts Blocked)

---

## 1. Executive Summary

This remediation pass (Pass 2) closed all outstanding architecture, ordering, contract, and concurrency defects identified in the Pass 1 review of the Enterprise Site Visit & Closed-Loop Marketing architecture.

The canonical Site Visit lifecycle:
$$\text{Schedule} \longrightarrow \text{Reschedule} \longleftrightarrow \text{Cancel} \longrightarrow \text{Complete}$$

and its closed-loop revenue workflow:
$$\text{Site Visit} \longrightarrow \text{Customer Feedback} \longrightarrow \text{Lead Score / Stage} \longrightarrow \text{Follow-up} \longrightarrow \text{Deal / Booking} \longrightarrow \text{Marketing Attribution}$$

have been remediated and verified with:

1. **Ordering & Validation Invariants (GAP B):** `complete()` now performs all validations (`activityId`, `outcome`, `dealId` format, deal existence, mandatory deal lead, and `deal.lead === activity.entityId`) *before* executing the conditional atomic transition. Rejected completions produce zero status mutations, zero deal updates, zero notifications, and zero stage changes, eliminating the unsafe post-completion rollback pattern.
2. **Atomic Lifecycle Transitions & Fail-Closed Guard (GAP A):** In production paths, `reschedule()`, `cancel()`, and `complete()` fail closed if MongoDB is disconnected. In-memory read-modify-write fallbacks have been removed from production execution paths, ensuring production transitions rely strictly on conditional atomic CAS updates (`Activity.findOneAndUpdate({ status: { $in: ['Pending', 'Scheduled'] } }, ...)`). Unit-test adapters are isolated explicitly.
3. **Service Return Contract Sanitization (GAP C):** `feedbackToken` and raw token-bearing `feedbackLink` have been stripped from `SiteVisitService.complete()`'s return object and persistent `activity.details` record. The service returns only `{ activity, stageTransition, feedbackDispatch, message }`. Persistent storage retains only `feedbackTokenHash` (SHA-256) and `feedbackTokenJti`. Customer delivery consumes the raw URL strictly through an internal, unlogged delivery path.
4. **Durable Idempotency & Concurrency Lock (GAP D):** Added `activity` and `idempotencyKey` (sparse, unique) to `FeedbackSubmission` schema. In `feedbackForm.controller.js`, atomic lock acquisition enforces multi-field submission checks (`details.feedbackSubmitted: { $ne: true }`, missing `submissionId`) and requires matching `feedbackLockId` for finalization. Concurrently overlapping requests catch duplicate key errors (code 11000) and return idempotent 200 responses without duplicating lead score increments, manager escalation tasks, or analytics counts.
5. **Honest Delivery Semantics & Staging Guard Classification (GAP E):** `evaluateProviderDispatch()` detects staging environment blocks (`staging-blocked`) and mock modes, classifying them accurately as `BLOCKED_BY_GUARD` or `SIMULATED` with `success: false` and `retryable: true`. Provider acceptance is classified as `ACCEPTED`, not `DELIVERED`, unless an explicit delivery receipt confirms receipt. Reminder flags (`h24`, `h2`) remain false for simulated or blocked dispatches to preserve retryability.
6. **Real Overlapping Concurrency Testing (GAP F):** Replaced sequential tests with genuine `Promise.all` / `Promise.allSettled` overlapping race conditions (complete vs complete, complete vs cancel, complete vs reschedule, and concurrent feedback submission). All 10 suites passed cleanly with **76 passing tests (0 failures)**. Real MongoDB replica-set testing and real carrier delivery testing are explicitly declared as `BLOCKED`.

---

## 2. Remediation Gap Evaluation Matrix (Pass 2)

| Gap ID | Objective | Implementation Status | Evidence / Verification | Test Classification |
| :--- | :--- | :---: | :--- | :---: |
| **GAP A** | Remove non-atomic lifecycle fallbacks; fail-closed in production if DB is disconnected. | **FIXED** | In `siteVisit.service.js`, `reschedule()`, `cancel()`, and `complete()` fail closed in production when DB is disconnected (`readyState !== 1`). Read-modify-write fallbacks removed from production execution. | Unit test / Mock CAS simulator (`test_sitevisit_security_delivery.js` Test 25) |
| **GAP B** | Fix deal validation & completion ordering; eliminate unsafe post-completion rollback. | **FIXED** | `complete()` validates `dealDoc.lead === existingActivity.entityId` *before* transitioning `Activity`. Rejected completions produce zero downstream side effects and require zero status rollbacks. | Unit test / Mock CAS simulator (`test_sitevisit_security_delivery.js` Test 19, 26) |
| **GAP C** | Remove raw feedback credentials (`feedbackToken`, raw `feedbackLink`) from `SiteVisitService.complete()` return object and persistence. | **FIXED** | Service returns only `{ activity, stageTransition, feedbackDispatch, message }`. `activity.details` persists only `feedbackTokenHash`, `feedbackTokenJti`, and `feedbackFormSlug`. Raw link delivered internally to customer. | Unit test (`test_sitevisit_security_delivery.js` Test 20; `test_sitevisit_domain.js` Step 4; `test_e2e_sitevisit_marketing.js` Step 6) |
| **GAP D** | Strengthen feedback lock and replay protection; add durable idempotency key and prevent duplicate side effects under concurrent takeover. | **FIXED** | Added `idempotencyKey: { type: String, sparse: true, unique: true }` to `FeedbackSubmission`. Finalization update matches `details.feedbackLockId: lockId`. Loser of lock or duplicate key returns 200 duplicate with zero scoring increments. | Unit test / Overlapping `Promise.all` (`test_sitevisit_security_delivery.js` Test 6, 21, 24) |
| **GAP E** | Honest messaging and retry semantics; detect staging-blocked/mock dispatches; preserve retryability. | **FIXED** | `evaluateProviderDispatch` checks for `staging-blocked` and mock modes, returning `status: 'BLOCKED_BY_GUARD'` / `'SIMULATED'` with `success: false` and `retryable: true`. Provider API acceptance marked `ACCEPTED`, never `DELIVERED` without carrier receipt. | Unit test (`test_sitevisit_security_delivery.js` Test 17; `test_sitevisit_automation.js` Steps 1-3) |
| **GAP F** | Run overlapping `Promise.all` concurrency tests; distinguish unit mocks from real DB integration; report blocked tests. | **PARTIALLY VERIFIED** | Implemented `Promise.all` overlapping tests for complete vs complete, complete vs cancel, complete vs reschedule, and concurrent feedback submission. Real replica-set tests and real carrier tests marked `BLOCKED`. | Overlapping simulation in unit test runtime. Live DB test: **BLOCKED**. |
| **GAP G** | Correct verification report to reflect actual evidence, remove blanket claims, and document residual risks. | **FIXED** | Generated this comprehensive, honest report detailing verified tests, blocked environments, and pre-production gates. | This document (`SITE_VISIT_LIFECYCLE_GAP_CLOSURE_REPORT.md`). |

---

## 3. Files Modified & Technical Explanation

```
 backend/controllers/feedbackForm.controller.js     | 104 ++++--
 backend/models/FeedbackSubmission.js               |   2 +
 backend/src/modules/siteVisit/siteVisit.service.js | 361 +++++++++++----------
 backend/src/modules/siteVisit/siteVisitAutomation.service.js |  26 +-
 backend/tests/test_e2e_sitevisit_marketing.js      |  21 +-
 backend/tests/test_sitevisit_domain.js             |  18 +-
 backend/tests/test_sitevisit_security_delivery.js  | 257 ++++++++++++++-
 7 files changed, 564 insertions(+), 225 deletions(-)
```

### 1. `backend/models/FeedbackSubmission.js`
- Added `activity: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity', index: true }`.
- Added `idempotencyKey: { type: String, sparse: true, unique: true }` for database-level replay prevention.

### 2. `backend/src/modules/siteVisit/siteVisit.service.js`
- **Fail-Closed on Disconnected DB:** Added `if (process.env.NODE_ENV === 'production' && mongoose.connection?.readyState !== 1) throw new Error('Database connection unavailable: Cannot execute atomic lifecycle transition');` to `reschedule()`, `cancel()`, and `complete()`.
- **Pre-Validation Ordering in `complete()`:** Fetches existing activity and validates terminal status (`Completed`, `Cancelled`). If `dealId` is present, validates ObjectId format, confirms Deal existence, validates mandatory Deal Lead relationship, and verifies `deal.lead === existingActivity.entityId` *before* attempting the atomic transition.
- **Removed Unsafe Rollback:** Because all validations precede the atomic CAS update, the unsafe `Activity.findByIdAndUpdate(..., { status: 'Pending' })` rollback pattern has been completely eliminated.
- **Service Contract Sanitization:** Removed `feedbackToken` and raw `feedbackLink` from `complete()` return object. In `activity.details`, raw credentials are never persisted; only `feedbackTokenHash`, `feedbackTokenJti`, and `feedbackFormSlug` are stored. Raw URL is passed only to `SiteVisitAutomationService.dispatchPostVisitFeedback(activity, { feedbackUrl: rawFeedbackUrl })`.

### 3. `backend/src/modules/siteVisit/siteVisitAutomation.service.js`
- **Staging Guard & Mock Detection:** `evaluateProviderDispatch()` inspects `staging-blocked` message IDs and mock flags, classifying them as `BLOCKED_BY_GUARD` or `SIMULATED` with `success: false` and `retryable: true`.
- **Accepted vs Delivered:** Confirms that API acceptance without confirmed carrier delivery is recorded as `ACCEPTED` (`delivered: false`).
- **Internal Delivery Path:** `dispatchPostVisitFeedback()` accepts `deliveryOptions.feedbackUrl` from caller without persisting raw URL in logs or returning it in general service contracts.

### 4. `backend/controllers/feedbackForm.controller.js`
- **Conditional Finalization:** Replaced unconditional update with lock-bound finalization: `Activity.findOneAndUpdate({ _id: authoritativeActivityId, 'details.feedbackLockId': lockId, 'details.feedbackSubmitted': { $ne: true } }, ...)`.
- **Duplicate Key Recovery:** Catches MongoDB error code 11000 on `FeedbackSubmission.create()` and returns idempotent 200 responses with the existing submission, preventing duplicate downstream lead score increments, manager escalations, or analytics increments.

### 5. `backend/tests/test_sitevisit_security_delivery.js`
- Added Test 18 (Concurrent `complete` vs `complete` via `Promise.allSettled`).
- Added Test 22 (Concurrent `complete` vs `cancel` via `Promise.allSettled`).
- Added Test 23 (Concurrent `complete` vs `reschedule`).
- Added Test 24 (Concurrent `submitFeedback` via `Promise.all`).
- Added Test 25 (Fail-closed on disconnected DB in production).
- Added Test 26 (Zero downstream mutations on rejected completion).

### 6. `backend/tests/test_sitevisit_domain.js` & `backend/tests/test_e2e_sitevisit_marketing.js`
- Updated test assertions on `SiteVisitService.complete()` to verify `feedbackToken === undefined` and `feedbackLink === undefined` in service contract, asserting presence of `activity.details.feedbackTokenHash`.

---

## 4. Test Execution & Evidence Log

All 10 regression test suites were executed sequentially in the dedicated worktree environment. **76 total tests executed, 76 passed, 0 failed (100% passing rate in test runtime)**.

| Suite | Command | Tests Run | Result | Evidence / Highlights |
| :--- | :--- | :---: | :---: | :--- |
| **1. P0 Security Suite** | `node tests/test_p0_security.js` | 13 | **PASS (13/13)** | Route auth, webhook HMAC, NoSQL injection guards, fail-closed secrets. |
| **2. Site Visit Contracts** | `node tests/test_sitevisit_contracts.js` | 5 | **PASS (5/5)** | Polymorphic `autoTriggerStageChange`, WhatsApp site visit idempotency. |
| **3. Site Visit Domain** | `node tests/test_sitevisit_domain.js` | 6 | **PASS (6/6)** | Scheduling, rescheduling history, cancellation, completion with sanitized contract. |
| **4. Customer Feedback Closed Loop** | `node tests/test_feedback_closed_loop.js` | 3 | **PASS (3/3)** | Token resolution, 5-star lead intent boost, negative feedback manager escalation. |
| **5. Deal Closed-Loop Attribution** | `node tests/test_deal_attribution.js` | 4 | **PASS (4/4)** | Deal UTM inheritance, completed visit unit linkage, booking attribution back-links. |
| **6. Marketing OS Attribution** | `node tests/test_marketing_attribution.js` | 3 | **PASS (3/3)** | UTM tracked links, variable resolution with lead token, direct dispatch attribution. |
| **7. Analytics Aggregation** | `node tests/test_analytics_aggregation.js` | 2 | **PASS (2/2)** | Funnel aggregation, campaign ROI aggregation across leads, visits, and deals. |
| **8. Site Visit Automation Triggers** | `node tests/test_sitevisit_automation.js` | 4 | **PASS (4/4)** | 24h reminders, 2h reminders, post-visit feedback dispatch, negative escalation task. |
| **9. End-to-End Lifecycle Suite** | `node tests/test_e2e_sitevisit_marketing.js` | 10 | **PASS (10/10)** | All 10 phases from campaign tracked link to completed booking and analytics. |
| **10. Security & Delivery Suite** | `node tests/test_sitevisit_security_delivery.js` | 26 | **PASS (26/26)** | Atomic CAS races (`Promise.all`), deal mismatch zero mutation, disconnected DB fail-closed. |
| **TOTAL** | — | **76** | **PASS (76/76)** | Zero failures in local test execution. |

---

## 5. Explicit Testing Environment Reality Declaration

In compliance with enterprise architecture and testing standards:

1. **Real MongoDB Concurrency Tests: BLOCKED**
   - **Reason:** Local MongoDB service is not running (`port 27017 refused`, `MONGODB_URI` unset).
   - **Policy:** Production database writes or unauthorized external databases are strictly prohibited.
   - **Status:** Database-backed multi-threaded replica-set tests could not be run against a physical MongoDB server and are marked `BLOCKED (No isolated test database provisioned)`.
   - **Mitigation:** The atomic CAS queries (`Activity.findOneAndUpdate({ status: { $in: [...] } })`) were validated using microtask-delayed concurrency simulators (`Promise.allSettled`).
2. **Real Messaging Provider Deliveries: BLOCKED / SIMULATED**
   - **Reason:** Live provider API credentials (Meta Cloud API, Twilio, SMSGatewayHub) were not connected in this test run; `IntegrationGuard` blocked live sends to prevent staging contamination.
   - **Status:** Carrier receipts (`DELIVERED`) could not be verified against live mobile networks and are marked `SIMULATED / BLOCKED_BY_GUARD`.
   - **Mitigation:** Provider response contracts and state evaluation (`evaluateProviderDispatch`) were validated against mocked responses, verifying that mock dispatches are never reported as real deliveries and do not kill retryability.

---

## 6. Residual Risks & Pre-Production Acceptance Gates

Before merging `enterprise/sitevisit-marketing-os` to `main` and deploying to production, the following gates must be completed:

1. **Database Schema Index Migration:**
   - Execute unique sparse index creation on `feedbacksubmissions`:
     ```javascript
     db.feedbacksubmissions.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
     ```
2. **Isolated Staging Replica-Set Validation:**
   - Run the 76 tests against a physical MongoDB 6.0+ replica set to verify wiredTiger document-level locking under 50+ concurrent requests.
3. **Carrier Webhook Handshake Verification:**
   - Test inbound WhatsApp and SMS delivery receipt webhooks in an authorized staging environment to verify transition from `ACCEPTED` to `DELIVERED`.
4. **Multi-Document Consistency Boundary:**
   - Because MongoDB multi-document transactions across `Activity`, `Deal`, and `Lead` require an active replica set, non-replica-set single-node MongoDB setups operate under document-level CAS atomicity with fail-closed validation ordering.

---

## 7. Workspace & Git Isolation Audit

- **Dedicated Worktree:** `/Users/bharatproperties/.gemini/antigravity/scratch/bharat-crm-sitevisit-marketing`
- **Branch:** `enterprise/sitevisit-marketing-os`
- **Untouched Workspaces:**
  - Primary CRM workspace (`/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm`) is 100% untouched.
  - Feedback release workspace (`/Users/bharatproperties/.gemini/antigravity/scratch/bharat-crm-feedback-release`) is 100% untouched.
- **Production Systems:** Zero production database writes, zero Redis writes, zero PM2 restarts, zero deployments executed.
