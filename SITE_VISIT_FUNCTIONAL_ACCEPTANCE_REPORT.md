# Bharat Properties CRM — Site Visit Marketing OS
## Functional Acceptance & Regression Audit Report

**Date (UTC):** 2026-10-24T04:30:00Z  
**Repository:** `bharatproperties570/Bharat-Properties-CRM`  
**Branch:** `enterprise/sitevisit-marketing-os`  
**Commit SHA:** `daad2f0f2ce748fff73da743580ae6274111c17e`  
**Primary Worktree:** `/Users/bharatproperties/.gemini/antigravity/scratch/bharat-crm-sitevisit-marketing`  
**Overall Verdict:** **`PASS WITH GAPS — NON-BLOCKING ITEMS REMAIN`**  

---

## 1. Executive Baseline & Worktree Safety (Phase 1)

### 1.1 Git Status & Commit Identity
- **Worktree Root:** `/Users/bharatproperties/.gemini/antigravity/scratch/bharat-crm-sitevisit-marketing`
- **Active Branch:** `enterprise/sitevisit-marketing-os`
- **HEAD Commit SHA:** `daad2f0f2ce748fff73da743580ae6274111c17e`
- **Commit Subject:** `feat(sitevisit): finalize site visit marketing journey`
- **Remote Branch SHA (`origin/enterprise/sitevisit-marketing-os`):** `daad2f0f2ce748fff73da743580ae6274111c17e` (In exact sync, 0 drift)
- **Working Tree Cleanliness:** Clean (`nothing to commit, working tree clean`)
- **Runtime Tooling:** Node.js `v24.13.0` / NPM `11.6.2`

### 1.2 Preservation of Related Worktrees
- `/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm` (100% untouched, existing uncommitted changes preserved)
- `/Users/bharatproperties/.gemini/antigravity/scratch/bharat-crm-feedback-release` (100% untouched, existing uncommitted changes preserved)

---

## 2. Implementation Code Review (Phase 2)

An end-to-end trace was performed across the 13 feature files:

1. **Route Mount & Contract Parity (`backend/app.js`):**
   - Canonical mount: `/api/public/site-visit/journey` -> `siteVisitJourney.routes.js`.
   - Backward-compatibility aliases maintained for `/property/:propertyId/navigate` and `/property/:propertyId/feedback`.
2. **Cryptographic Token Verification (`siteVisitJourney.service.js`):**
   - Fails closed if `FEEDBACK_JWT_SECRET` / `JWT_SECRET` is missing.
   - Enforces 72h expiry, SHA-256 hash match against `activity.details.journeyTokenHash`, and cancellation/revocation checks.
   - Implements tilde replacement (`~` for `.`) to preserve link integrity across WhatsApp link previews.
3. **Sequential Unlocking & Unit Masking (`siteVisitJourney.service.js`):**
   - Property `k` is unlocked only when Property `k-1` feedback is submitted.
   - Locked properties have unit details masked (`"Unit Details Locked"`), navigation URLs set to `null`, and owner contacts/commissions/notes completely stripped.
4. **Feedback CAS Atomicity & Lock Cleanup (`feedbackForm.controller.js`):**
   - Implements atomic `findOneAndUpdate` with `feedbackLockId` and 60-second lease recovery.
   - Scoped `releaseOwnedLock` helper releases locks strictly matching the current request's UUID.
   - Duplicate requests release lock safely and return idempotent HTTP 200 without duplicate lead scoring or escalation tasks.
5. **Client UI & CRM Activity Integration:**
   - `ClientSiteVisitJourneyPage.jsx`: Mobile-first React interface with loading skeletons, error boundaries, navigation triggers, and per-property star rating forms.
   - `SiteVisitActivitySection.jsx`: Integrated WhatsApp itinerary sharing, link copying, and live property journey status badges.

---

## 3. Automated Test Execution Evidence (Phase 3)

All 11 backend test suites and the frontend production build were executed:

| Test Suite File | Focus Area | Tests Run | Passed | Failed | Exit Code | Environment |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `test_sitevisit_journey.js` | Express HTTP boundaries, sequential gate, tokens | 10 | 10 | 0 | 0 | Mock queues / Isolated DB |
| `test_sitevisit_security_delivery.js` | CAS locks, lease recovery, PII guards, duplicates | 32 | 32 | 0 | 0 | Mock queues / Isolated DB |
| `test_sitevisit_domain.js` | Scheduling, rescheduling, cancellation, completion | 6 | 6 | 0 | 0 | Mock queues / Isolated DB |
| `test_sitevisit_contracts.js` | Stage transitions, deal sync, polymorphism | 5 | 5 | 0 | 0 | Mock queues / Isolated DB |
| `test_sitevisit_automation.js` | Reminders, feedback dispatch, escalation | 4 | 4 | 0 | 0 | Mock queues / Isolated DB |
| `test_e2e_sitevisit_marketing.js` | Full marketing OS funnel E2E integration | 10 | 10 | 0 | 0 | Mock queues / Isolated DB |
| `test_feedback_closed_loop.js` | Feedback scoring, manager escalation tasks | 3 | 3 | 0 | 0 | Mock queues / Isolated DB |
| `test_marketing_attribution.js` | UTM campaign tracking, first/last-touch attribution | 3 | 3 | 0 | 0 | Mock queues / Isolated DB |
| `test_deal_attribution.js` | Deal & booking attribution linkage | 4 | 4 | 0 | 0 | Mock queues / Isolated DB |
| `test_analytics_aggregation.js` | Funnel analytics, campaign ROI aggregation | 2 | 2 | 0 | 0 | Mock queues / Isolated DB |
| `test_p0_security.js` | NoSQL injection, JWT secret precedence, webhooks | 13 | 13 | 0 | 0 | Mock queues / Isolated DB |
| **Total Backend Tests** | — | **92** | **92** | **0** | **0** | — |

### Frontend Build Execution
- **Command:** `npm run build` (`vite build`)
- **Modules Transformed:** 3,636
- **Compilation Time:** 14.76s
- **Exit Code:** 0 (Zero syntax, JSX, or type import errors)
- **Artifacts:** `ClientSiteVisitJourneyPage-0xTwDLnD.js` (26.42 kB) generated cleanly. Temporary `dist/` cleaned up.

---

## 4. Functional Acceptance Matrix (Phase 4)

| Test ID | Category | Expected Behavior | Actual Result | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **TC-CJ-01** | Client Journey | Return sanitized itinerary with ordered properties | Returns 200 OK with masked locked units | `test_sitevisit_journey.js` #1, #9 | `PASS` |
| **TC-CJ-02** | Client Journey | Reject expired, tampered, superseded, or cancelled token | Returns 403 / 410 with safe error message | `test_sitevisit_journey.js` #2; live HTTPS check | `PASS` |
| **TC-CJ-03** | Client Journey | Mask inaccessible/locked properties | Locked units show `"Unit Details Locked"`, zero notes/contacts | `test_sitevisit_journey.js` #3 | `PASS` |
| **TC-CJ-04** | Client Journey | Universal Google Maps navigation intent URL generation | Generates driving intent with coords / address fallback | `test_sitevisit_journey.js` #4 | `PASS` |
| **TC-CJ-05** | Client Journey | Prevent premature feedback on locked property | Returns 403 Forbidden on out-of-order submission | `test_sitevisit_journey.js` #5 | `PASS` |
| **TC-FB-01** | Feedback | Accept valid property rating and notes | Persists `FeedbackSubmission`, updates property status | `test_sitevisit_journey.js` #6 | `PASS` |
| **TC-FB-02** | Feedback | Idempotent submission on already completed property | Returns HTTP 200 without duplicate database records | `test_sitevisit_journey.js` #7 | `PASS` |
| **TC-FB-03** | Feedback | Negative rating (<= 2 stars) triggers manager escalation | Creates single high-priority escalation task | `test_sitevisit_journey.js` #8 | `PASS` |
| **TC-FB-04** | Feedback | Atomic CAS lock acquisition with 60s lease expiry | Recovers stale lock; returns 409 on active concurrent lock | `test_sitevisit_security_delivery.js` #21 | `PASS` |
| **TC-FB-05** | Feedback | Scoped lock release on error or completion | Only clears lock matching request's UUID; preserves third-party lock | `test_sitevisit_security_delivery.js` #27, #29 | `PASS` |
| **TC-FB-06** | Feedback | Interrupted submission reconciliation | Recovers persisted submission and finalizes activity | `test_sitevisit_security_delivery.js` #28 | `PASS` |
| **TC-SEC-01**| Security | Raw leadId/activityId query rejection | Cannot access private data without valid JWT | `test_sitevisit_security_delivery.js` #1, #2 | `PASS` |
| **TC-SEC-02**| Security | Sensitive token stripping from controller responses | `completeSiteVisit` excludes token/link from HTTP response | `test_sitevisit_security_delivery.js` #20 | `PASS` |
| **TC-SEC-03**| Security | Fail-closed security on missing JWT secret | Operations fail closed (HTTP 500 / Error) | `test_sitevisit_security_delivery.js` #11; `test_p0_security.js` #6 | `PASS` |
| **TC-SEC-04**| Security | NoSQL injection prevention on public endpoints | Operator injection in project, block, slug rejected | `test_p0_security.js` #5 | `PASS` |
| **TC-UI-01** | CRM UI | Render Site Visit section with WhatsApp action | Activity section displays itinerary and share buttons | Component review & Vite build pass | `PASS` |
| **TC-UI-02** | CRM UI | Loading, error, and empty states in Client Journey | Renders skeleton loaders, retry cards, completion banner | `ClientSiteVisitJourneyPage.jsx` review | `PASS` |
| **TC-UI-03** | CRM UI | In-flight submission disablement | Prevents repeated clicks during active network calls | `ClientSiteVisitJourneyPage.jsx` review | `PASS` |
| **TC-EXT-01**| External Delivery | Payload formation and provider adapter with mocks | Correctly constructs WhatsApp template message | `test_sitevisit_security_delivery.js` #9, #10 | `PASS` |
| **TC-EXT-02**| External Delivery | Retryable failure states without false delivery flags | Provider failure leaves retryable status; never sets false sent | `test_sitevisit_security_delivery.js` #17 | `PASS` |
| **TC-EXT-03**| External Delivery | Live WhatsApp/SMS dispatch to real phone numbers | Real dispatch omitted per Safety Rule 3 (No real customer contact) | Safety Rule 3 | `NOT RUN` |
| **TC-DB-01** | Database | Multi-document transaction on live production MongoDB | Evaluated in offline test replica set; production writes skipped | Safety Rule 2 | `NOT RUN` |
| **TC-CI-01** | CI / Automation | GitHub Actions automated workflow run | No `.github/workflows` configured in repository | Repository file inspection | `NOT VERIFIED` |

---

## 5. TDD & Test Coverage Assessment (Phase 5)

1. **Development Methodology:** Git history shows tests were authored, executed against bugs, and committed in conjunction with implementation and remediation passes (`daad2f0f`, `2c15f99b`, `a9ad5e9d`). Formal isolated Red-commit git history was not maintained; development followed a test-verified gap-closure model.
2. **Identified Coverage Gaps (Non-Blocking):**
   - **Frontend Unit DOM Testing:** Frontend pages are verified via TypeScript/JSX compilation (`vite build`) and route boundary tests. A dedicated DOM test runner (Jest/Vitest + React Testing Library) is not currently installed in `package.json`.
   - **Live External Delivery Testing:** Live WhatsApp/SMS API round-trips to real mobile carriers are mocked to avoid customer spam.
   - **Production Replica-Set Transactions:** Multi-document ACID rollback is verified in mock environments; production cluster was only queried via read-only metadata calls.

---

## 6. CI Pipeline Evidence (Phase 6)

- **Workflow Directory:** `.github/workflows` does not exist in `bharatproperties570/Bharat-Properties-CRM`.
- **Tooling:** GitHub CLI (`gh`) is not installed on the local system.
- **Status:** **`NOT VERIFIED`** (No GitHub Actions CI workflow exists for this repository; automated validation is executed via local and server-side test harnesses).

---

## 7. Prioritized Next Actions

1. **(Optional / Post-Release)** Add `.github/workflows/ci.yml` to automatically execute the 11 backend test suites and `vite build` on pull requests to `main` and `enterprise/*`.
2. **(Optional)** Add Vitest and `@testing-library/react` to `devDependencies` to enable component-level DOM assertion testing for `ClientSiteVisitJourneyPage.jsx`.
3. **(Ongoing)** Maintain the non-unique `{ activity: 1, inventory: 1 }` index and sparse unique `{ idempotencyKey: 1 }` index verified in production.

---

## 8. Final Acceptance Verdict

# `PASS WITH GAPS — NON-BLOCKING ITEMS REMAIN`

**Reasoning:**
- All 92 automated backend functional, security, and contract tests passed with zero failures.
- Frontend production build compiled cleanly with zero errors.
- Live read-only route smoke tests confirm route mounting and cryptographic token gating on production.
- Gaps are explicitly non-blocking: live customer SMS/WhatsApp dispatch was intentionally withheld per safety rules, no repository CI pipeline is configured, and frontend testing relies on build verification rather than component-level RTL tests.
