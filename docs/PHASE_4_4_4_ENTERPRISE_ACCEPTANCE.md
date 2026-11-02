# Phase 4.4.4 — Enterprise Authority Portal Ingestion Acceptance

## Current deliverable scope

This package adds an offline, dependency-injected runtime boundary around the existing authority portal definitions and CRM-to-portal search mapper. It deliberately does not send a network request by itself.

### Controls implemented

- Approval is checked before acquiring a source lock, reserving quota, writing an outbound request, or invoking transport.
- Written authority reference, explicit automated portal access, read-only purpose, commercial/internal CRM purpose, terms review, expiry, permitted field scope, independent maker-checker identities and authority-defined rate limits are mandatory.
- The request path requires injected distributed lock, shared quota reservation, durable circuit-breaker state, transport, verified parser and mandatory audit writer. There is no in-memory production fallback.
- HSVP, GMADA and Chandigarh hosts are exact allow-list entries.
- Redirect following is disabled. Unexpected redirects and host changes pause the source.
- 403, 429, CAPTCHA/challenge, login/authentication walls and policy-block responses pause the source. No automated retry, proxy rotation, CAPTCHA bypass, identity masking or login attempt is implemented.
- Only authority-approved canonical fields can pass the result sanitizer. Owner/allottee/contact/identity fields, unapproved fields, nested object values and unsafe control characters are not persisted.
- Raw HTML is not returned in the candidate or recorded in audit metadata.
- Results are always `provenance=LIVE`, `isSynthetic=false`, `requiresHumanReview=true`, `isApplied=false`; automatic Inventory mutation is not part of this runtime.
- Request criteria are represented in audit by SHA-256 hash, not raw property identifiers.

## Not yet implemented / cannot be asserted

- No production HTML/DOM selectors for any authority portal have been guessed.
- No site-specific HTTP/browser submit implementation is included.
- No production parser is registered. Each parser requires a sanitized, representative, manually obtained response sample and golden tests.
- No Redis/BullMQ lock, shared quota or durable circuit-breaker adapter is wired in. Existing CRM run/item lease and fencing controls must be reused when integrating this boundary.
- No live portal request has been sent by this package.
- No new changes have been committed or pushed to GitHub by this package.

## Integration prerequisites

1. Obtain and retain HSVP written clarification that resolves the current Terms of Use language for automated commercial CRM use.
2. Obtain equivalent source-specific approval/terms review for GMADA and Estate Office Chandigarh.
3. Confirm portal field scope, request quota, min interval, concurrency, result retention and cache policy per source. Never use guessed limits.
4. Capture redacted HTML samples from authorized manual searches for each portal, including dropdown options, request contract, no-result state, result state, error state and any dynamic tokens (tokens must not be persisted).
5. Implement parser golden tests for each distinct portal response version.
6. Wire the runtime to the existing AuthoritySourceSettings, AuthorityBulkProcessor, lease/fencing, run-item audit and maker-checker review lifecycle.
7. Add a tenant-scoped pilot and source-level kill switch before any broad inventory run.
8. Only after review, enable one source and a small pilot. Scale only within the written rate policy and validated operational envelope.

## Acceptance gates for a 5,000+ inventory refresh

- [ ] Approval record reviewed and unexpired for the exact source and use.
- [ ] Source fields and data-retention rules reviewed.
- [ ] Exact portal form mapping and dropdown option mapping verified.
- [ ] Parser golden fixtures cover success, no result, partial result, malformed page, challenge, login, redirect and portal error.
- [ ] Distributed source lock prevents parallel requests across CRM instances.
- [ ] Shared quota enforces authority-approved min interval and request/day limits.
- [ ] Idempotency prevents repeat requests for unchanged `(authority, search criteria, source version)`.
- [ ] Source circuit breaker pauses on 403/429/CAPTCHA/login/redirect/policy error.
- [ ] Mandatory audit persistence is available before request dispatch.
- [ ] Tenant isolation and worker fencing tests pass.
- [ ] Results create immutable snapshots/candidates only; no direct Inventory overwrite.
- [ ] Preview/approve and maker-checker are mandatory before application.
- [ ] Rollback and per-source kill switch tested.
- [ ] Pilot metrics and false-match review approved before expansion.
