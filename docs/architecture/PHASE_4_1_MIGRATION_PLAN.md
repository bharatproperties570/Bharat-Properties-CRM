# PHASE 4.1 MIGRATION PLAN

## 1. Objective
Apply the Canonical Ownership Model and Canonical Soft Delete Model to the 54 existing database collections safely, without disrupting legacy application code.

## 2. 54-Model Compatibility Matrix (Summary)
| Model | Ownership Present | Canonical Possible | Soft-Delete Tier | Risk Level |
|---|---|---|---|---|
| **Contact** | Yes (Legacy mixed) | Yes | Tier 1 (Yes) | High |
| **Lead** | Yes (Legacy mixed) | Yes | Tier 1 (Yes) | High |
| **Inventory** | Yes (Legacy mixed) | Yes | Tier 1 (Yes) | High |
| **Deal** | Yes (Legacy mixed) | Yes | Tier 1 (Yes) | High |
| **Booking** | Yes (Teams only) | Yes | Tier 1 (Yes) | High |
| **Activity** | Yes (assignedTo) | Yes | Tier 3 (No) | Medium |
| **Project** | Yes (owner, team) | Yes | Tier 1 (Yes) | Medium |
| **User / Team** | Yes | Yes | Tier 1 (Yes) | Critical |
| **Lookup** | No | Optional | Tier 4 (No) | Low |
| **AuditLog** | Implicit (user) | No | Tier 3 (No) | Low |
| **Conversation**| Implicit (participants)| Yes | Tier 2 (Yes) | Low |

## 3. Safe Migration Design
All migration scripts must adhere to the newly established scaffolding (`backend/migrations/README.md`):
- **Idempotent**: Can be run multiple times safely.
- **Batched**: Uses `bulkWrite` in chunks (e.g., 500 docs).
- **Environment Guarded**: Production execution aborts unless `ALLOW_PRODUCTION_MIGRATION=true` is passed.
- **Dry-Run Capable**: Supports `--dry-run` flag to output stats without mutating DB.
- **Explicit DB Checking**: Will check `mongoose.connection.name` instead of parsing URI.

## 4. Phase 5 Dependencies Identified (Transaction Foundation)
Phase 5 backend refactoring MUST implement standard `withTransaction()` boundaries around:
- `Lead` insertion/update.
- `Deal` creation + associated `Activity` logging.
- `Booking` state transitions.
- `Inventory` owner reassignment.
*No refactoring of these routes will occur in Phase 4.1.*

## 5. Execution Steps
1. Deploy schema updates (Mongoose plugins attached to models).
2. Run migration script in `--dry-run` against staging.
3. Run migration script against staging.
4. Run migration script in `--dry-run` against production (`bharatproperties1`).
5. Execute production migration with explicit safety flags.
