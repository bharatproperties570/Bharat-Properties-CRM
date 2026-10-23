# Bharat Properties CRM — Enterprise Site Visit Lifecycle Gap Closure & Verification Report

**Date:** 2026-10-23
**Repository:** `bharatproperties570/Bharat-Properties-CRM`
**Dedicated Worktree:** `/Users/bharatproperties/.gemini/antigravity/scratch/bharat-crm-sitevisit-marketing`
**Dedicated Branch:** `enterprise/sitevisit-marketing-os`
**Baseline Commit:** `3b2cf3683ceaba425b607fa3661cee01728e4a87`
**Starting HEAD:** `3f1e5ef47abb8d6c0be815e31a4655c8fd8dee83`
**Status:** READY FOR INDEPENDENT REVIEW

---

## 1. Executive Summary

This engineering engagement closed all outstanding functional, architectural, and security gaps across the Enterprise Site Visit & Closed-Loop Marketing architecture in Bharat Properties CRM. The canonical lifecycle state machine:

$$\text{Schedule} \longrightarrow \text{Reschedule} \longleftrightarrow \text{Cancel} \longrightarrow \text{Complete}$$

connected to the closed-loop revenue workflow:

$$\text{Site Visit} \longrightarrow \text{Customer Feedback} \longrightarrow \text{Lead Score / Stage} \longrightarrow \text{Follow-up} \longrightarrow \text{Deal / Booking} \longrightarrow \text{Marketing Attribution}$$

has been fully hardened with fail-closed cryptographic token verification, atomic concurrency locks, lifecycle state invariants, honest provider acknowledgement tracking, and complete regression test coverage across 10 suites totaling 66 passing tests (0 failures).

---

## 2. Requirement Matrix & Verification Status

| Req ID | Requirement Description | Implementation Files | Status | Verification Evidence / Test Suite |
| :--- | :--- | :--- | :---: | :--- |
| **REQ-LC-01** | **State Transition: Cancelled cannot be completed**<br>Reject completion on cancelled visits. | `siteVisit.service.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 13) rejects `/Cancelled site visits cannot be completed/`. |
| **REQ-LC-02** | **State Transition: Completed cannot be cancelled or rescheduled**<br>Enforce terminal completed state. | `siteVisit.service.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 14) rejects with terminal state errors. |
| **REQ-LC-03** | **Cancellation Idempotency**<br>Repeated cancellation returns safe idempotent contract without corruption. | `siteVisit.service.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 15) asserts `alreadyCancelled: true`. |
| **REQ-LC-04** | **Reschedule Reminder Reconcile**<br>Reset reminder eligibility for new date while preserving history. | `siteVisit.service.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 16) confirms `remindersSent.h24: false` and `previousSchedule` archived. |
| **REQ-LC-05** | **Reminder Suppression on Cancelled Visits**<br>Workers must not dispatch messages for cancelled/completed visits. | `siteVisitAutomation.service.js` | **PASS** | Query filters `status: { $in: ['Scheduled', 'Pending'] }` + atomic claim condition + runtime status guard. |
| **REQ-SEC-01** | **Public Feedback Authorization Guard**<br>Raw `leadId` / `activityId` query params cannot retrieve PII. | `feedbackForm.controller.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 1) asserts `leadInfo === null` on raw query. |
| **REQ-SEC-02** | **Activity Mutation Guard**<br>Untrusted `activityId` in body cannot mutate Site Visit records. | `feedbackForm.controller.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 2) rejects with 403 Forbidden. |
| **REQ-SEC-03** | **Cryptographic Token Verification**<br>Fail-closed on expired, malformed, tampered, or wrong-purpose tokens. | `feedbackForm.controller.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 3) rejects tampered and wrong-purpose tokens. |
| **REQ-SEC-04** | **Scope Binding (Form Slug & Activity)**<br>Token must strictly match target form slug and valid activity. | `feedbackForm.controller.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 4) rejects slug/activity mismatches. |
| **REQ-SEC-05** | **Single-Use / Idempotent Feedback CAS Lock**<br>Atomic locking prevents duplicate feedback operations and races. | `feedbackForm.controller.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 6) returns 200 with `duplicate: true`, exactly 1 record. |
| **REQ-SEC-06** | **Single Escalation Task Invariant**<br>Negative feedback triggers at most one manager escalation task. | `siteVisitAutomation.service.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 7) verifies `alreadyEscalated: true` on retry. |
| **REQ-SEC-07** | **Single Intent Score Increment**<br>Positive rating triggers single 10-point boost, duplicate submissions ignored. | `feedbackForm.controller.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 8) verifies single `$inc: { intent_index: 10 }`. |
| **REQ-SEC-08** | **Fail-Closed on Missing Secrets**<br>Unconfigured secrets must reject all token resolution. | `feedbackForm.controller.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 11) returns null on missing secret. |
| **REQ-SEC-09** | **Anonymous Feedback Compatibility**<br>General feedback forms remain operational without mutating activities. | `feedbackForm.controller.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 12) creates 201 submission without activity mutation. |
| **REQ-MSG-01** | **Honest Notification Delivery Tracking**<br>Provider acknowledgement (`DELIVERED`, `FAILED`, `UNCONFIGURED`). | `siteVisitAutomation.service.js` | **PASS** | `test_sitevisit_security_delivery.js` (Test 9, 10) records provider status honestly. |
| **REQ-MSG-02** | **PII & Credential Masking in Logs**<br>Zero customer phone numbers, secrets, or bearer tokens in logs. | `siteVisitAutomation.service.js`, `siteVisit.service.js` | **PASS** | Phone masked (`+91******3210`), token hash stored (`feedbackTokenHash`), URLs suppressed. |
| **REQ-ATT-01** | **Deal & Booking Attribution Linkage**<br>Validate deal existence, lead ownership, and backlink to Site Visit. | `siteVisit.service.js`, `deal.service.js` | **PASS** | `test_deal_attribution.js` (4/4 passed) + `test_e2e_sitevisit_marketing.js` (Step 8, 9). |

---

## 3. Files Modified & Technical Rationale

1. **`backend/controllers/feedbackForm.controller.js`**
   - Implemented `verifyFeedbackToken(rawToken, slug)` with fail-closed secret validation, dual-key rotation (`FEEDBACK_JWT_SECRET` / `JWT_SECRET`), Meta tilde (`~`) normalization, purpose validation (`customer_feedback`, `feedback_submission`), and form slug matching.
   - Refactored `getFormBySlug`: completely ignores untrusted `req.query.leadId` / `req.query.activityId`; returns 403 on invalid/expired tokens; resolves `leadInfo` and `activityInfo` only via verified cryptographic tokens; returns anonymous form cleanly if no token is provided.
   - Refactored `submitFeedback`: discards client-supplied `req.body.leadId` / `req.body.activityId`; enforces atomic CAS lock (`details.feedbackLock`) to eliminate submission race conditions; ensures exactly one lead score increment and one manager escalation task; supports anonymous general feedback submissions without activity mutation.

2. **`backend/src/modules/siteVisit/siteVisit.service.js`**
   - Enforced canonical lifecycle invariants:
     - `complete`: throws `'Cancelled site visits cannot be completed'` and `'Site visit is already completed'`.
     - `cancel`: throws `'Completed site visits cannot be cancelled'`; returns idempotent `{ alreadyCancelled: true }` on duplicate cancellation.
     - `reschedule`: throws `'Completed site visits cannot be rescheduled'` and `'Cancelled site visits cannot be rescheduled'`; reconciles reminder eligibility by resetting `remindersSent.h24: false`, `remindersSent.h2: false` while archiving `previousSchedule` and recording immutable audit history.
   - Validates deal linkage before linking `dealId`: checks deal existence in DB and verifies that `deal.lead` matches the visit's `entityId`.
   - Persists minimal sensitive data: stores `feedbackTokenHash` (SHA-256) and `feedbackTokenJti` in `activity.details` rather than persisting raw bearer tokens.

3. **`backend/src/modules/siteVisit/siteVisitAutomation.service.js`**
   - Integrated `WhatsAppService.sendMessage` and `SmsService.sendSms` with `IntegrationGuard` validation.
   - Dispatches 24h & 2h reminders with provider acknowledgement tracking (`DELIVERED`, `FAILED`, `UNCONFIGURED`).
   - Added runtime and atomic query exclusion for `Cancelled` and `Completed` visits during reminder scanning.
   - Implemented idempotency in `escalateNegativeFeedback` using `details.sourceActivityId` to ensure at most one escalation task per activity.
   - Enforced PII masking in logs (phone numbers masked as `+91******3210`) and full token URLs suppressed.

4. **`backend/services/WhatsAppService.js`**
   - Guarded database lookups in `_getMetaConfig` and `_getBaileysConfig` when `mongoose.connection.readyState !== 1` to prevent 10-second Mongoose operation buffering in offline/test environments.

5. **`backend/tests/test_sitevisit_security_delivery.js`**
   - Dedicated 16-test suite verifying the complete security, notification delivery, and lifecycle state invariants.

---

## 4. Test Suites Run & Verification Evidence

All 10 test suites were executed sequentially in the dedicated worktree with **100% pass rate (66 tests passed, 0 failed)**:

```bash
# 1. P0 Security Suite (13 tests)
node backend/tests/test_p0_security.js
# Output: Results: 13 passed, 0 failed

# 2. Site Visit Contracts Suite (5 tests)
node backend/tests/test_sitevisit_contracts.js
# Output: Results: 5 passed, 0 failed

# 3. Canonical Site Visit Domain Suite (6 tests)
node backend/tests/test_sitevisit_domain.js
# Output: Results: 6 passed, 0 failed

# 4. Customer Feedback Closed-Loop Suite (3 tests)
node backend/tests/test_feedback_closed_loop.js
# Output: Results: 3 passed, 0 failed

# 5. Deal Attribution Suite (4 tests)
node backend/tests/test_deal_attribution.js
# Output: Results: 4 passed, 0 failed

# 6. Marketing Attribution Suite (3 tests)
node backend/tests/test_marketing_attribution.js
# Output: Results: 3 passed, 0 failed

# 7. Analytics Aggregation Suite (2 tests)
node backend/tests/test_analytics_aggregation.js
# Output: Results: 2 passed, 0 failed

# 8. Site Visit Automation & Notification Suite (4 tests)
node backend/tests/test_sitevisit_automation.js
# Output: Results: 4 passed, 0 failed

# 9. End-to-End Enterprise Integration Suite (10 tests)
node backend/tests/test_e2e_sitevisit_marketing.js
# Output: All 10 E2E Lifecycle Stages Verified! Results: 10 passed, 0 failed

# 10. Site Visit Security, Authorization & Notification Delivery Suite (16 tests)
node backend/tests/test_sitevisit_security_delivery.js
# Output: CRITICAL-SV-11 Security Suite Results: Passed: 16, Failed: 0
```

**Total Pass Count:** 66 / 66 tests passing (100%).

---

## 5. Security & Isolation Audit

- **Public Endpoint Injection:** All public routes (`getAvailableUnits`, `getForms`, `getFormBySlug`) enforce strict string type-checks, rejecting MongoDB object/operator injection (`$gt`, `$ne`, etc.).
- **Fail-Closed Secrets:** If `JWT_SECRET` or `FEEDBACK_JWT_SECRET` is unset, `verifyFeedbackToken`, `LeadTokenGenerator`, and `VariableResolutionService` fail closed immediately.
- **Tenant & Lead Isolation:** Deals linked during completion must belong to the same lead as the site visit; mismatched or non-existent deals throw 400 Bad Request.
- **Zero Raw Bearer Tokens in Logs:** Full feedback URLs and raw tokens are omitted from server console logs and audit entries.
- **Workspace Isolation:** All work was completed strictly inside `/Users/bharatproperties/.gemini/antigravity/scratch/bharat-crm-sitevisit-marketing`. Main CRM workspace and feedback release workspace were completely untouched.

---

## 6. Messaging Provider Status & Staging Limitations

- **Provider Integration:** Automated tests mock external providers (`IntegrationGuard.canSendWhatsapp()`, `IntegrationGuard.canSendSms()`), returning simulated outcomes without dispatching real SMS or WhatsApp messages.
- **Live Dispatch:** In production, `WhatsAppService.sendMessage` and `SmsService.sendSms` will deliver real messages when Meta Cloud API or Twilio/Exotel credentials are configured in `.env`. When unconfigured, the system reports `UNCONFIGURED` or `FAILED` honestly rather than falsely claiming delivery.

---

## 7. Residual Risks & Operational Recommendations

1. **Production Secret Provisioning:** Ensure `FEEDBACK_JWT_SECRET` (or `JWT_SECRET`) is defined with a high-entropy string in production PM2 environment configurations before deploying.
2. **Database Migration:** No schema alterations or destructive migrations were required; existing Mongoose models (`Activity`, `Lead`, `Deal`, `Booking`, `FeedbackForm`, `FeedbackSubmission`) are 100% forward and backward compatible.

---

## 8. Final Recommendation

**READY FOR INDEPENDENT REVIEW**
The branch `enterprise/sitevisit-marketing-os` satisfies all Enterprise Architecture Plan requirements, passes all 66 regression tests, preserves all existing work, and maintains production safety.
