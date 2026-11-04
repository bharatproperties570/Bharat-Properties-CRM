# Phase 4.4.4 — Production Gap Assessment

## Verified facts from portal inspection

| Authority | Verified public search contract | Current blocker |
|---|---|---|
| HSVP | Urban Estate, Sector, Plot Number | Portal markup, dependent dropdown options, exact form submit names, result markup and written approval artifact are not present in the development workspace. |
| GMADA | User-supplied URL: `https://gmadaipms.in/UserExternalPages/Property_Ledger_Report_2.aspx` | Exact URL returned HTTP 502 during inspection. Do not substitute a different URL or guess WebForms payloads. |
| Chandigarh Estate Office | Plot No + Sector No OR File Type + File Number. Portal says data is provisional and office record takes precedence. | Exact input names, anti-forgery handling, result markup and any applicable automation terms need verified samples. |

## Required implementation tasks (in the Antigravity repository workspace)

1. Apply the files in this package and reconcile PR #41's current branch state.
2. From an authorized operator/network environment, inspect actual portal forms and capture sanitized HTML for initial form, dependent dropdown states, no-result response, one valid result, malformed input, expired session, CAPTCHA/challenge and rate-limit response. Do not save cookies, tokens, credentials, raw personal data or raw production HTML in Git.
3. Build one source adapter per authority. Select fields by verified `name`/`id`/label mapping; preserve CSRF/ASP.NET hidden fields and same-origin cookies only for that individual read-only request. Refuse unknown controls, unknown form actions, JavaScript-only dependencies that cannot be safely understood, unapproved redirects, and ambiguous result pages.
4. Implement deterministic parsers using redacted golden fixtures. Require unique property identity; reject ambiguous/multiple records, mismatched plot/sector/phase, unexpected status labels, unknown field names and parser-version drift.
5. Wire the runtime into existing `AuthoritySourceSettings`, `AuthorityBulkProcessor`, run/item leases and fence tokens, tenant scoping, durable audit, Redis-backed distributed lock/quota/circuit breaker and scheduler. Do not create a second uncoordinated worker system.
6. Extend approval schema and migration to store the user-reported HSVP confirmation as a pending evidence record; do not set it to reviewed/approved until the official approval artifact/reference and policy details are reviewed. GMADA and Chandigarh remain separate source approvals.
7. Implement bounded concurrency (initially one worker/source), durable per-source request spacing, daily quota, idempotency on `(authority, search criteria, parser version)`, cache freshness and resume semantics. Values must come from authority conditions or conservative operator-approved limits, not guesses presented as authority rules.
8. Persist sanitized immutable snapshots only. Keep `provenance=LIVE`, `isSynthetic=false`, candidate review required and `isApplied=false`. Use existing maker-checker to apply approved changes; never create/update Contact from allottee/owner PII.
9. Add canary mode, source kill switch, alerting, metrics and rollback. Start with a tenant-scoped pilot of a small inventory subset; expand to 5,000+ only after reliability, match precision and allowed throughput are measured.
10. Run existing authority tests, new adapter golden tests, multi-tenant tests, worker lease/fencing tests, full backend integration tests and production build. Attach evidence to the PR.

## Acceptance criteria for production

- [ ] Official authorization evidence reviewed and expiry recorded for each source.
- [ ] Exact live form request and response contracts verified; no guessed selectors or postback fields.
- [ ] Golden tests for success, no-result, partial result, malformed response, challenge, login, redirect, 403, 429, 5xx and parser drift.
- [ ] Same-origin only; redirects disabled; no credential login, CAPTCHA bypass or evasion.
- [ ] Every physical HTTP request consumes an authority quota reservation and is audit-correlated.
- [ ] Distributed lock and quotas are shared across all app instances.
- [ ] Source-level circuit breaker and operator kill switch survive restarts.
- [ ] Inventory identity and property authority link match exactly before candidate creation.
- [ ] Snapshots are append-only, sanitized, hashed and provenance-tagged.
- [ ] No automatic Inventory or Contact mutation; human review and maker-checker remain mandatory.
- [ ] Tenant isolation, worker fencing, resume/replay and duplicate suppression tests pass.
- [ ] A controlled pilot demonstrates measured match precision, error rate and throughput before bulk expansion.
- [ ] Deployment and post-deploy smoke checks complete; rollback is verified.
