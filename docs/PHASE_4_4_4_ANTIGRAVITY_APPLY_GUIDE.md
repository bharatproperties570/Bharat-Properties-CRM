# Antigravity apply guide — Phase 4.4.4

Target repo: `bharatproperties570/Bharat-Properties-CRM`
Baseline PR: #41
Baseline HEAD when this handoff was prepared: `649d0c779596a5588e625cc11b6bdea5109bf3c5`

## Apply current files

From the repository root, apply `phase-4.4.4-authority-portal-enterprise.patch` with:

```bash
git apply --check phase-4.4.4-authority-portal-enterprise.patch
git apply phase-4.4.4-authority-portal-enterprise.patch
```

Alternatively, copy the package's `backend/services/authority/portal/`, `backend/tests/authority_portal_*.test.js`, and new `docs/` files into the corresponding repository locations. Inspect `git status` before committing.

## Verify boundary tests

```bash
cd backend
node --test tests/authority_portal_contract.test.js tests/authority_portal_approval_gate.test.js tests/authority_portal_runtime.test.js
npm run test:authority
npm run test:phase4-authority
```

The first suite was independently run in this package: 42 tests passed, 0 failed. This is not a live portal connectivity test.

## Next required production task

Read `docs/ANTIGRAVITY_PRODUCTION_EXECUTION_PROMPT.md` and follow Phases A–D. Do not call the boundary production complete until the production acceptance checklist is passed with source-specific portal samples, actual adapters/parsers, durable queue/quota/lock/circuit integrations, and live pilot evidence.

## HSVP authorization

`docs/HSVP_VERBAL_PERMISSION_RECORD.md` records the user's report that the Chief Administrator allowed read-only public portal access. The official HSVP Terms of Use still contain a written-approval condition for commercial copying. Do not fabricate a written reference. Review the actual approval artifact or official communication and retain the evidence before source activation. GMADA and Chandigarh remain separately gated.

## GitHub write status

The available GitHub integration was read-only for this task: new branch creation returned `403 Resource not accessible by integration`. No GitHub branch, commit, PR, merge or deployment has been created. Apply and push from the authorized local Antigravity Git workspace, then independently verify the remote SHA and PR.
