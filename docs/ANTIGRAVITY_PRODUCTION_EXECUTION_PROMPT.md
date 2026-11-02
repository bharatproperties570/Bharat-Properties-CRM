# Antigravity — Production Execution Prompt

You are working in `bharatproperties570/Bharat-Properties-CRM`. Treat this as a senior enterprise engineering task, not a prototype. Work in a new feature branch from the latest verified authority branch. Do not merge or deploy automatically.

## Phase A — Apply and reconcile

1. Verify current branch, HEAD, working tree and PR #41 status. Do not overwrite unrelated changes.
2. Apply the Phase 4.4.4 package files from this ZIP to matching repository paths.
3. Run the 42 focused tests. Then run `npm run test:authority` and `npm run test:phase4-authority` from repository root. Record exact commands and outputs.
4. Inspect `AuthoritySourceSettings`, `sourcePolicy`, `adapterRegistry`, `AuthorityBulkProcessor`, scheduler, run/item/snapshot schemas and controllers before editing them. Preserve the existing lease ownership, fencing, tenant isolation, mandatory audit and maker-checker flow.

## Phase B — Live portal contract discovery

5. From the authorized development environment, inspect the exact HSVP URL supplied by the user, the exact GMADA URL supplied by the user, and the exact Chandigarh URL already in `authorityPortalDefinitions.js`.
6. Capture only sanitized structural metadata: form method/action, named controls, select option labels/values, hidden anti-forgery fields by presence (never token values), submit control name/value, response content type and result table headers. Do not commit cookies, tokens, credentials, raw owner/allottee PII or raw response HTML.
7. The user reports Chief Administrator permission for HSVP public read-only access. Record that as user-provided evidence metadata, but do not fabricate an approval number/date or claim a written letter has been reviewed. Review the actual approval artifact/reference against the current HSVP Terms of Use before setting `permissionStatus=GRANTED` and activating live collection. GMADA and Chandigarh each need their own access/terms review.
8. If a host is unreachable, GMADA returns 502, a page is dynamically loaded, an unknown form action/control appears, or a page shows login/CAPTCHA/403/429/policy block, stop that authority and report the exact blocker. Do not guess endpoints, switch URLs without approval, bypass challenges, rotate proxies, spoof identity, or raise request rates to get through.

## Phase C — Implement actual adapters and pipeline integration

9. Implement source-specific form adapters and parsers only from verified markup. Use the existing dependencies and package style. Require exact host/origin allow-list, manual redirect handling, response-size/time limits, CSRF token preservation where applicable, same-request cookie scope, and strict form action validation.
10. Make quota reservation apply to every physical HTTP request, not merely one CRM lookup. Use durable shared per-authority rate/quota policy, single-worker default and distributed lock across all instances. Reuse existing Redis/BullMQ services where available; do not add an in-memory production fallback.
11. Add durable circuit-breaker pause state for 403, 429, CAPTCHA/challenge, login/authentication, policy errors, unexpected redirect, parser drift and repeated malformed/empty results. No automated retries for hard blocks.
12. Add idempotency for repeated unchanged authority/criteria/parser version; persist only sanitized immutable snapshots. Preserve `provenance=LIVE`, `isSynthetic=false`, `requiresHumanReview=true`, `isApplied=false` until existing reviewer/apply endpoints succeed.
13. Connect inventory source fields: HSVP Urban Estate/Sector/Plot Number; GMADA Location/Sectors/Usage Type/Property Type/Property No or Form No; Chandigarh Plot No/Sector No or File Type/File Number. Do not infer authority identity from weak city/address matches. Require exact plot + sector/phase and authority identity.
14. Ensure PII fields remain excluded; never create/update Contact from allottee/owner values. Do not overwrite Inventory business status, price, owner or CRM fields outside the existing approved field contract.
15. Integrate bounded bulk selection, progress, pause/resume, retry-only-transient behavior, source-specific cache, per-run audit and maker-checker apply. Keep the weekly scheduler disabled until source-level pilot approval.

## Phase D — Production acceptance

16. Add golden parser tests per source for success, no result, multiple results, wrong property, malformed data, no area, unknown statuses, challenge/login/redirect/403/429/5xx and parser version drift.
17. Add egress-trap tests proving fixture tests make zero network calls and live tests are isolated. Add tenant-isolation, lease expiry/fencing, crash recovery, idempotency, quota contention and kill-switch tests.
18. Run all relevant authority suites, full backend integration, frontend tests and production build. Inspect diff for unrelated files, secrets, credentials and raw portal data.
19. Open a PR with exact branch SHA, files changed, test outputs, portal-by-portal capability matrix, approval evidence status, unresolved gaps and rollback plan. Do not merge or deploy without a separate review/approval.

## Completion rule

Do not label the work production-ready just because unit tests pass. Production-ready requires verified live form contracts, working source-specific adapters from the authorized network, persistence/queue integration, a controlled pilot with measured outcomes, all acceptance tests passing, and an independently verified deploy/smoke test after approval.
