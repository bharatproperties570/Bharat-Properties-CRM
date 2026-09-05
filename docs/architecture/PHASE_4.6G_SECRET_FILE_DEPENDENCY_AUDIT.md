# PHASE 4.6G SECRET FILE DEPENDENCY AUDIT

## A. Executive Summary
A comprehensive read-only dependency audit was performed on the 46 remaining files containing hardcoded historical production MongoDB credentials. The audit verified Git tracking, runtime dependencies, CI/CD references, and deployment script usage (`scripts/update-live.sh`, `package.json`, etc.). 

The audit conclusively determined that none of these 46 files are imported, invoked, or referenced by the active production application, frontend build process, backend startup routines, or automated deployment workflows. The majority (40 files) are definitively obsolete one-off debug and query scripts (`SAFE_TO_REMOVE`). Six (6) files have been flagged for `MANUAL_REVIEW` out of an abundance of caution, as their naming conventions suggest they may have been used as manual diagnostic or repair utilities.

## B. Complete List of Audited Files
The following files were audited for dependencies:
(See Section D for full list)

## C. Dependency Evidence for Each File
- **Git Tracked:** Yes, all 46 files are currently tracked in the Git repository.
- **package.json References:** None. Searched root and `backend/package.json`.
- **PM2 / Ecosystem Configuration:** None. No ecosystem files are present or reference these scripts.
- **Deployment Scripts:** None. `scripts/update-live.sh` was audited and contains no references to these files.
- **CI/CD Workflows:** None. No `.github` workflows exist that invoke these scripts.
- **Codebase Imports:** None. A repository-wide `grep -rl` confirmed that zero application source files (`routes/`, `controllers/`, `services/`, `models/`, `src/`) import, require, or execute these scripts.
- **Production Credential Presence:** Verified. Every file contains either `mongodb://<REDACTED>` or `mongodb+srv://<REDACTED>` containing historical production credentials.

## D. Classification of Each File

### SAFE_TO_REMOVE
These files are definitively obsolete, unreferenced, one-off query, dumping, or check scripts. Removing them will have zero impact on runtime or deployment.
- `backend/add_dormant_lookup.js`
- `backend/check_a1_full.js`
- `backend/check_a1_time.js`
- `backend/check_bm.js`
- `backend/check_c120.js`
- `backend/check_deals.js`
- `backend/check_deals2.js`
- `backend/check_duplicate_projects.js`
- `backend/check_id_v2.js`
- `backend/check_inv.js`
- `backend/check_lookup.js`
- `backend/check_lookup_time.js`
- `backend/check_meta_orientation.js`
- `backend/check_project_data.js`
- `backend/check_rates_v2.js`
- `backend/check_raw_inventory.js`
- `backend/check_recent_inv.js`
- `backend/check_recent_inventory.js`
- `backend/check_scores.js`
- `backend/check_scores_2.js`
- `backend/check_scores_3.js`
- `backend/check_scores_5.js`
- `backend/check_settings_orientation.js`
- `backend/check_suraj_id.js`
- `backend/check_user_id.js`
- `backend/db_lookup.js`
- `backend/deep_search.js`
- `backend/dump_all.js`
- `backend/fields_check.js`
- `backend/find_data.js`
- `backend/find_data_v2.js`
- `backend/find_id_in_inventory.js`
- `backend/find_inventory.js`
- `backend/find_recent.js`
- `backend/list_all_counts.js`
- `backend/list_orientations.js`
- `backend/lookup_query.js`
- `backend/reproduce_500.js`
- `backend/search_all.js`
- `backend/search_project_refs.js`

### MANUAL_REVIEW
These files are also completely unreferenced by the runtime application, but their naming or contents suggest they may be manual diagnostic, simulation, or repair utilities. They should be reviewed manually before deletion to ensure no operational runbook relies on executing them manually.
- `backend/scripts/activate_user.js` (Manually activates a hardcoded test user)
- `backend/scripts/backfill_orientation.js` (References a hardcoded local developer path)
- `backend/scripts/repair_visibility_data.js` (Contains repair logic across core collections)
- `backend/simulate_import.js` (Import simulation utility)
- `backend/diagnose_activities_v2.js` (Diagnostic utility)
- `backend/run_full_diagnostic.js` (Diagnostic utility)

## E. Files that are definitely part of CRM runtime
- **None.** The audit confirms 0 of the 46 files are part of the active CRM runtime.

## F. Files that are definitely obsolete
- **40 files** (See `SAFE_TO_REMOVE` list above).

## G. Files requiring manual review
- **6 files** (See `MANUAL_REVIEW` list above).

## H. Explicit Confirmation Statement
- **No files deleted.**
- **No files modified except the creation of this audit report.**
- **No MongoDB mutations performed.**
- **No credential rotation performed.**
- **No deployment executed.**
- **No PM2 restart executed.**

## I. Recommended Next Step
Proceed with the safe deletion of the 40 `SAFE_TO_REMOVE` files, followed by a manual review of the remaining 6 files to either securely rewrite them to use `process.env.MONGODB_URI` or delete them if no longer operationally required.
