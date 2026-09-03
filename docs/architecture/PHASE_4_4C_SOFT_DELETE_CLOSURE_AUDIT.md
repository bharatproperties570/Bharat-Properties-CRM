# PHASE 4.4C — SOFT DELETE CLOSURE AUDIT

## 1. GIT STATE & INTEGRITY
- **HEAD SHA**: e4a3f3a
- **Branch**: enterprise/phase-2.0-A-safety
- **Validation**: Phase 4.4B files (`hardDelete.service.js`, `softDelete.plugin.js`, `verify44b.js`) are physically present and accurately match the committed state.

## 2. PHYSICAL DELETE FORENSIC INVENTORY
A deep scan reveals the following surviving physical delete methods:

| Entity / File | Method | Category | Notes |
|---|---|---|---|
| `activity.controller.remote.js` | `findOneAndDelete` | **E. UNSAFE PHYSICAL DELETE** | This rogue remote controller physically deletes historical CRM logs. It was missed in 4.4B. |
| `team.controller.js` | `deleteOne` | **F. REVIEW REQUIRED** | Deleting a Team physically may leave users without team assignments. |
| `companyGroup.controller.js` | `deleteOne` | **F. REVIEW REQUIRED** | May leave orphan references on Contacts/Companies. |
| `contactGroup.controller.js` | `deleteOne` | **F. REVIEW REQUIRED** | May leave orphan references. |
| `Role` | `findByIdAndDelete` | **F. REVIEW REQUIRED** | Referenced by Users. Physical deletion creates dangling permissions and breaks `hasPermission()`. |
| `Lookup` | `findByIdAndDelete` | **A. SOFT DELETE REQUIRED** | Master data referenced throughout `Lead` and `Deal`. Physical deletion breaks historical lookup references. |
| `Intake` | `findOneAndDelete` | **C. TEMPORARY DATA** | Legitimate cleanup of processed webhook payloads. |
| `SystemSetting` | `findOneAndDelete` | **B. AUTHORIZED HARD DELETE** | Admin config, safe to physically drop. |

## 3. HARD-DELETE SECURITY AUDIT
**Status: BLOCKED**
- **RBAC Mismatch**: The current `HardDeleteService` hardcodes `user.role === 'Admin' || 'SUPER_ADMIN'`. The forensic scan of `backend/models/Role.js` and `User.js` reveals the application uses a dynamic RBAC model with populated roles, departments, and specific module permissions (`user.hasPermission(module, 'delete')`). The hardcoded string check will fail in production because `user.role` is an `ObjectId` (or populated object) and bypasses the actual enterprise permission model.

## 4. TRANSACTION AUDIT CONSISTENCY
**Status: CRITICAL BLOCKER**
- **Architecture**: The `softDeleteEventBus` in `softDelete.plugin.js` uses standard Node.js event emitters. It emits `SOFT_DELETE` the moment `updateOne` resolves. 
- **The Bug**: When executed inside a MongoDB transaction, the event is fired into the application layer BEFORE the transaction commits. If the transaction rolls back, the database state remains active, but the event has already caused downstream services (e.g. Activity logging) to process a soft-delete.
- **Proof**: A local simulation script `backend/tests/test_audit_abort.js` demonstrated that forced transaction aborts still emit the `SOFT_DELETE` event. The audit trail is inconsistent with the database.

## 5. BULKWRITE & REPLACEONE FORENSICS
**Status: PASS**
- **BulkWrite**: `bulkWrite` overrides inside `softDelete.plugin.js` strictly block `deleteOne` and `deleteMany`. Scanning the codebase confirmed no unsafe `deleteOne:` ops inside `bulkOps` payloads.
- **ReplaceOne/Update**: `preventUpdateOnDeleted` successfully blocks updates on deleted records without explicit intent. All `findByIdAndUpdate` calls across controllers are safely guarded.

## 6. CASCADE VERIFICATION
**Status: PASS**
- Forensics confirm cross-entity physical cascades have been completely removed.
- `Lead` delete does not delete `Contact`.
- `Deal` delete does not delete `Inventory`.
- `User` delete does not delete assigned leads/deals.

## 7. USER DELETE SEMANTICS
**Status: HIGH FINDING (COMPETING SYSTEMS)**
- The `User` model currently uses `isActive: { type: Boolean }` and `status: { type: String, enum: ['active', 'inactive', 'suspended'] }`.
- Introducing `isDeleted: { type: Boolean }` via the plugin creates a competing status paradigm. User "deletion" in the CRM is actually a deactivation logic flow. Soft delete plugin creates ambiguity without harmonizing with the existing `status` architecture.

## 8. TEST QUALITY AUDIT
**Status: HIGH FINDING**
- Tests in `verify44b.js` use the real database and mock actual scenarios, but they missed the transaction rollback audit-consistency test.
- The `Activity` validation error during hard-delete was bypassed by dropping to the Native Driver, which was a good workaround but masks the lack of proper transaction integration in the Event Bus.

## 9. PHASE 4.4 CLOSURE CRITERIA

| Criterion | Status |
|---|---|
| No unsafe normal physical deletes | ❌ FAIL (`activity.controller.remote.js`) |
| Hard delete is RBAC protected | ❌ FAIL (Mismatched with real RBAC) |
| Hard delete requires explicit service | ✅ PASS |
| Hard delete is audited transactionally | ✅ PASS |
| bulkWrite delete bypass is blocked | ✅ PASS |
| replaceOne resurrection is blocked | ✅ PASS |
| update resurrection is blocked | ✅ PASS |
| soft-delete audit is transactionally consistent | ❌ CRITICAL FAIL |
| cross-entity cascades are removed | ✅ PASS |
| User deletion is safe | ⚠️ WARNING (Competing paradigms) |
| Activity deletion is safe | ❌ FAIL (Remote controller physical delete) |
| Tests cover all critical paths | ❌ FAIL (Missed abort consistency) |

## 10. FINAL DECISION

**STATUS = BLOCKED**

Phase 4.4 cannot be closed. Proceeding to Phase 4.5 is strictly prohibited until the Transaction Audit Consistency bug is fixed, the `Activity` remote controller is patched, and the Hard Delete RBAC accurately reflects the application's true Role model.
